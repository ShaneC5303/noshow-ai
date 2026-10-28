import os
import numpy as np
import pandas as pd
import shap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier

path = os.path.expanduser("~/Downloads/archive (2)/hair_salon_no_show_wrangled_df.csv")
df = pd.read_csv(path, index_col=0)
y = df["noshow"].astype(int)
X = df.drop(columns=["noshow"])
X = X.drop(columns=["book_tod"])  # LEAKAGE: missing time = row came from the no-show report

cat_cols = X.select_dtypes(include="object").columns
X[cat_cols] = X[cat_cols].fillna("none")
X = pd.get_dummies(X, columns=list(cat_cols), dtype=int)
X.columns = [c.replace(" ", "_").replace("[", "").replace("]", "").replace("<", "") for c in X.columns]

pos = int(y.sum()); neg = len(y) - pos
print(f"Rows: {len(df)}, features: {X.shape[1]}, no-show rate: {y.mean():.1%}")

models = {
    "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)),
    "XGBoost": XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                             scale_pos_weight=neg / pos, eval_metric="logloss", verbosity=0),
    "LightGBM": LGBMClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                               scale_pos_weight=neg / pos, verbose=-1),
}
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scoring = {"auc": "roc_auc", "p": "precision", "r": "recall", "f1": "f1"}

print("\nModel | ROC-AUC | Precision | Recall | F1  (mean +/- std, 5-fold)")
for name, m in models.items():
    s = cross_validate(m, X, y, cv=cv, scoring=scoring)
    f = lambda k: f"{s['test_' + k].mean():.3f} +/- {s['test_' + k].std():.3f}"
    print(f"{name} | {f('auc')} | {f('p')} | {f('r')} | {f('f1')}")

xgb = models["XGBoost"].fit(X, y)
sv = shap.TreeExplainer(xgb)(X)
imp = pd.Series(np.abs(sv.values).mean(axis=0), index=X.columns).sort_values(ascending=False)
print("\nTop SHAP features:")
print(imp.head(8).round(3).to_string())
shap.summary_plot(sv, X, show=False, max_display=8)
plt.tight_layout()
plt.savefig("salon_shap_summary.png", dpi=150)
print("\nSaved salon_shap_summary.png")
