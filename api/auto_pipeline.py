"""Train-on-upload pipeline: works on any CSV that has a no-show label column."""
import re
import warnings

import numpy as np
import pandas as pd
import shap
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from xgboost import XGBClassifier

MAX_ROWS = 5000
MIN_ROWS = 200
MIN_CLASS = 20

EXACT_NORM = {
    "noshow", "noshows", "missed", "dna", "didnotattend", "attended",
    "attendance", "status", "outcome", "show", "appointmentstatus", "noshowflag",
}
HINT = re.compile(r"no.?show|missed|attend|dna|status|outcome|^show", re.I)
NOSHOW_LIKE = {
    "yes", "y", "true", "1", "1.0", "no-show", "noshow", "no show", "no_show",
    "missed", "dna", "absent", "cancelled", "canceled", "did not attend",
    "did_not_attend", "not attended", "no_shows",
}
ATTEND_LIKE = {
    "no", "n", "false", "0", "0.0", "show", "showed", "attended", "present",
    "completed", "kept", "arrived", "fulfilled",
}
YES_LIKE = {"yes", "y", "true", "1", "1.0", "attended", "present", "showed",
            "show", "kept", "arrived", "completed"}
NOSHOW_NAME = re.compile(r"no.?show|missed|dna|not.?attend", re.I)
ATTEND_NAME = re.compile(r"attend|present|showed|kept|arrived|completed", re.I)
ID_NAME = re.compile(
    r"^unnamed|(^|[_\s-])(id|uuid|index)$|^id[_\s-]|patient.?id|appointment.?id", re.I)
PRIVATE_NAME = re.compile(r"name|phone|mobile|email|e-mail|address|contact", re.I)


class NeedsTarget(Exception):
    def __init__(self, candidates):
        super().__init__("target column needed")
        self.candidates = candidates


def _norm(c):
    return re.sub(r"[^a-z0-9]", "", str(c).lower())


def find_target(df):
    """Return (target_column or None, candidate list)."""
    binary = [c for c in df.columns if df[c].nunique(dropna=True) == 2]
    exact = [c for c in binary if _norm(c) in EXACT_NORM]
    if len(exact) == 1:
        return exact[0], exact
    if len(exact) > 1:
        return None, exact
    hinted = [c for c in binary if HINT.search(str(c))]
    if len(hinted) == 1:
        return hinted[0], hinted
    return None, hinted or binary


def to_binary(s, name):
    """Convert a 2-valued column to 1 = no-show, 0 = showed up."""
    t = s.astype(str).str.strip().str.lower().where(s.notna())
    vals = sorted(t.dropna().unique())
    if len(vals) != 2:
        raise ValueError(f"Column '{name}' must have exactly 2 distinct values (it has {len(vals)}).")
    a, b = vals
    pos = None
    if ATTEND_NAME.search(str(name)) and not NOSHOW_NAME.search(str(name)):
        # "attended"-style column: the yes-like value means the client came
        for v, other in ((a, b), (b, a)):
            if v in YES_LIKE and other not in YES_LIKE:
                pos = other
    else:
        for v, other in ((a, b), (b, a)):
            if v in NOSHOW_LIKE and other not in NOSHOW_LIKE:
                pos = v
        if pos is None:
            for v, other in ((a, b), (b, a)):
                if v in ATTEND_LIKE and other not in ATTEND_LIKE:
                    pos = other
    if pos is None:
        pos = a if (t == a).sum() <= (t == b).sum() else b  # minority = no-show
    neg = b if pos == a else a
    y = (t == pos).astype(float).where(t.notna())
    return y, f"'{pos}' = no-show, '{neg}' = showed up"


def prepare(df, target, y):
    """Turn a raw table into numeric features. Returns X, dropped notes, display frame."""
    X = df.drop(columns=[target]).copy()
    dropped = []

    for c in list(X.columns):
        if ID_NAME.search(str(c)):
            dropped.append(f"{c} (identifier)")
            X = X.drop(columns=[c])
        elif PRIVATE_NAME.search(str(c)):
            dropped.append(f"{c} (personal data)")
            X = X.drop(columns=[c])

    display = X.copy()

    # --- dates -> lead time, weekday, hour, month
    parsed = {}
    for c in list(X.columns):
        s = X[c]
        if pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s):
            continue
        if pd.api.types.is_datetime64_any_dtype(s):
            parsed[c] = s
            continue
        sample = s.dropna().astype(str).head(300)
        if len(sample) == 0 or sample.str.contains(r"\d{1,4}[-/.:]\d{1,2}").mean() < 0.8:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            p = pd.to_datetime(s, errors="coerce")
        if p.notna().sum() / max(s.notna().sum(), 1) > 0.8:
            parsed[c] = p
    for c, p in parsed.items():
        X[f"{c}_weekday"] = p.dt.dayofweek
        X[f"{c}_month"] = p.dt.month
        if p.dt.hour.nunique() > 1:
            X[f"{c}_hour"] = p.dt.hour
        X = X.drop(columns=[c])
    if len(parsed) >= 2:
        order = sorted(parsed, key=lambda k: parsed[k].median())
        early, late = parsed[order[0]], parsed[order[-1]]
        X["lead_days"] = (late.dt.normalize() - early.dt.normalize()).dt.days

    # --- too many distinct text values -> drop
    for c in list(X.columns):
        s = X[c]
        if not (pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s)):
            if s.nunique(dropna=True) > 20:
                dropped.append(f"{c} (too many distinct values)")
                X = X.drop(columns=[c])

    # --- missingness that predicts the label = likely leakage
    for c in list(X.columns):
        nf = X[c].isna().mean()
        if 0.03 <= nf < 0.97:
            r_null = y[X[c].isna()].mean()
            r_rest = y[X[c].notna()].mean()
            lo, hi = sorted([r_null, r_rest])
            if abs(r_null - r_rest) >= 0.25 or (lo > 0 and hi / lo >= 3 and abs(r_null - r_rest) >= 0.10):
                dropped.append(f"{c} (missing values predict the outcome, likely data leakage)")
                X = X.drop(columns=[c])

    # --- fill + encode
    for c in list(X.columns):
        s = X[c]
        if pd.api.types.is_bool_dtype(s):
            X[c] = s.astype(int)
        elif pd.api.types.is_numeric_dtype(s):
            X[c] = pd.to_numeric(s, errors="coerce")
            X[c] = X[c].fillna(X[c].median() if X[c].notna().any() else 0)
        else:
            X[c] = s.astype(object).where(s.notna(), "missing").astype(str)
    cat = [c for c in X.columns if X[c].dtype == object or str(X[c].dtype) in ("str", "string", "category")]
    if cat:
        X = pd.get_dummies(X, columns=cat, dtype=int)
    X.columns = [re.sub(r"[\[\]<>,]", "_", str(c)).replace(" ", "_") for c in X.columns]
    X = X.loc[:, ~X.columns.duplicated()].astype(float)

    # --- constant + single-feature leakage guard
    for c in list(X.columns):
        if X[c].nunique() <= 1:
            X = X.drop(columns=[c])
            continue
        try:
            auc = roc_auc_score(y, X[c])
        except Exception:
            continue
        if max(auc, 1 - auc) > 0.95:
            dropped.append(f"{c} (alone predicts the outcome almost perfectly, likely data leakage)")
            X = X.drop(columns=[c])
    return X, dropped, display


def _contacts(df):
    """Find an email column and a phone column. Used only for the send buttons."""
    em = ph = None
    for c in df.columns:
        n = str(c).lower()
        v = df[c].dropna().astype(str).head(50)
        if len(v) == 0:
            continue
        if em is None and (re.search(r"e.?mail", n) or v.str.contains("@").mean() > 0.8):
            em = c
            continue
        if ph is None and re.search(r"phone|mobile|whatsapp|cell|contact|tel", n):
            d = v.str.replace(r"\.0$", "", regex=True).str.replace(r"\D", "", regex=True).str.len()
            if d.between(8, 15).mean() > 0.6:
                ph = c
    return em, ph


def run(df, target=None):
    """Train on the uploaded file and return metrics + the 10 riskiest rows."""
    df = df.reset_index(drop=True)
    candidates = []
    if target is None:
        target, candidates = find_target(df)
        if target is None:
            raise NeedsTarget(candidates or list(df.columns))
    if target not in df.columns:
        raise ValueError(f"Column '{target}' not found.")

    y_all, mapping = to_binary(df[target], target)
    keep = y_all.notna()
    df, y_all = df[keep].reset_index(drop=True), y_all[keep].reset_index(drop=True).astype(int)
    total_rows = len(df)
    if len(df) > MAX_ROWS:
        idx, _ = train_test_split(np.arange(len(df)), train_size=MAX_ROWS,
                                  stratify=y_all, random_state=42)
        idx = np.sort(idx)
        df, y_all = df.iloc[idx].reset_index(drop=True), y_all.iloc[idx].reset_index(drop=True)
    pos = int(y_all.sum())
    neg = len(y_all) - pos
    if len(y_all) < MIN_ROWS or pos < MIN_CLASS or neg < MIN_CLASS:
        raise ValueError(
            f"Not enough data to train: need at least {MIN_ROWS} rows with {MIN_CLASS}+ no-shows "
            f"and {MIN_CLASS}+ attended (found {len(y_all)} rows, {pos} no-shows).")

    X, dropped, display = prepare(df, target, y_all)
    if X.shape[1] == 0:
        raise ValueError("No usable feature columns were left after cleaning.")

    params = dict(n_estimators=150, max_depth=4, learning_rate=0.08, n_jobs=1,
                  tree_method="hist", eval_metric="logloss", verbosity=0)
    skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    oof = np.zeros(len(y_all))
    aucs = []
    for tr, te in skf.split(X, y_all):
        m = XGBClassifier(**params).fit(X.iloc[tr], y_all.iloc[tr])
        p = m.predict_proba(X.iloc[te])[:, 1]
        oof[te] = p
        aucs.append(roc_auc_score(y_all.iloc[te], p))
    auc_mean, auc_std = float(np.mean(aucs)), float(np.std(aucs))
    cut = float(np.quantile(oof, 0.9))
    top_mask = oof >= cut
    lift = float(y_all[top_mask].mean() / y_all.mean()) if y_all.mean() > 0 else 0.0

    warns = []
    if auc_mean > 0.95:
        warns.append("AUC is suspiciously high. Check whether a column leaks the outcome.")
    elif auc_mean < 0.55:
        warns.append("Weak signal: the model is barely better than guessing on this file.")
    if len(y_all) < 1000:
        warns.append("Small file: results are noisy (fewer than 1,000 rows).")
    if total_rows > MAX_ROWS:
        warns.append(f"Used a stratified sample of {MAX_ROWS:,} of {total_rows:,} rows.")

    final = XGBClassifier(**params).fit(X, y_all)
    explainer = shap.TreeExplainer(final)
    sample = X.sample(min(400, len(X)), random_state=1)
    imp = pd.Series(np.abs(explainer(sample).values).mean(axis=0), index=X.columns)
    top_features = [{"feature": f, "importance": round(float(v), 3)}
                    for f, v in imp.sort_values(ascending=False).head(6).items()]

    top_idx = np.argsort(-oof)[:10]
    sv = explainer(X.iloc[top_idx])
    show_cols = [c for c in display.columns if c != target][:5]
    em_c, ph_c = _contacts(df)
    rows = []
    for rank, i in enumerate(top_idx):
        contribs = sorted(zip(X.columns, sv.values[rank]), key=lambda t: -t[1])[:2]
        reasons = [f"{f} ({'+' if v > 0 else ''}{v:.2f})" for f, v in contribs]
        details = " · ".join(f"{c}: {display.iloc[i][c]}" for c in show_cols
                             if pd.notna(display.iloc[i][c]))
        contact = {}
        if em_c is not None and pd.notna(df.iloc[i][em_c]):
            contact["email"] = str(df.iloc[i][em_c]).strip()
        if ph_c is not None and pd.notna(df.iloc[i][ph_c]):
            contact["phone"] = re.sub(r"\.0$", "", str(df.iloc[i][ph_c]).strip())
        rows.append({"id": rank + 1, "details": details, "riskScore": round(float(oof[i]), 2),
                     "level": "high", "reasons": reasons, "contact": contact})

    return {
        "mode": "trained",
        "target": target,
        "mapping": mapping,
        "rowsUsed": int(len(y_all)),
        "noShowRate": round(float(y_all.mean()), 3),
        "cv": {"aucMean": round(auc_mean, 3), "aucStd": round(auc_std, 3),
               "liftTop10": round(lift, 2), "folds": 3},
        "warnings": warns,
        "dropped": dropped,
        "topFeatures": top_features,
        "summary": {"scored": int(len(y_all)), "highRisk": int(top_mask.sum()),
                    "avgRisk": round(float(oof.mean()), 3)},
        "results": rows,
    }
