import pandas as pd
import numpy as np
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier

df = pd.read_csv("../data/KaggleV2-May-2016.csv")
df.columns = df.columns.str.strip()
df["ScheduledDay"] = pd.to_datetime(df["ScheduledDay"])
df["AppointmentDay"] = pd.to_datetime(df["AppointmentDay"])
df["LeadDays"] = (df["AppointmentDay"] - df["ScheduledDay"]).dt.days.clip(lower=0)
df = df[df["Age"] >= 0].reset_index(drop=True)
df["y"] = (df["No-show"] == "Yes").astype(int)

features = ["Age", "LeadDays", "Scholarship", "Hipertension", "Diabetes", "SMS_received"]
X = df[features]
y = df["y"]

neg, pos = (y == 0).sum(), (y == 1).sum()
scale_pos_weight = neg / pos

models = {
    "Logistic Regression": Pipeline([
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000)),
    ]),
    "XGBoost": XGBClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05,
        scale_pos_weight=scale_pos_weight, eval_metric="auc", random_state=42,
    ),
    "LightGBM": LGBMClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05,
        scale_pos_weight=scale_pos_weight, random_state=42, verbose=-1,
    ),
}

scoring = ["roc_auc", "precision", "recall", "f1"]
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

print(f"{'Model':<22}{'ROC-AUC':<18}{'Precision':<18}{'Recall':<18}{'F1':<18}")
print("-" * 94)

results = {}
for name, model in models.items():
    scores = cross_validate(model, X, y, cv=cv, scoring=scoring, n_jobs=-1)
    row = []
    for metric in scoring:
        vals = scores[f"test_{metric}"]
        row.append(f"{vals.mean():.3f} \u00b1 {vals.std():.3f}")
    results[name] = row
    print(f"{name:<22}" + "".join(f"{v:<18}" for v in row))

print("\nSaved for the deck:")
for name, row in results.items():
    print(f"{name}: ROC-AUC {row[0]}, Precision {row[1]}, Recall {row[2]}, F1 {row[3]}")
