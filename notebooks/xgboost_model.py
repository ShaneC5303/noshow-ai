import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from xgboost import XGBClassifier

df = pd.read_csv("../data/KaggleV2-May-2016.csv")
df.columns = df.columns.str.strip()

df["ScheduledDay"] = pd.to_datetime(df["ScheduledDay"])
df["AppointmentDay"] = pd.to_datetime(df["AppointmentDay"])
df["LeadDays"] = (df["AppointmentDay"] - df["ScheduledDay"]).dt.days
df["LeadDays"] = df["LeadDays"].clip(lower=0)

df = df[df["Age"] >= 0]  # drop the bad -1 age row(s)

df["y"] = (df["No-show"] == "Yes").astype(int)

features = ["Age", "LeadDays", "Scholarship", "Hipertension", "Diabetes", "SMS_received"]
X = df[features]
y = df["y"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# class imbalance handling for XGBoost: weight the minority class
neg, pos = (y_train == 0).sum(), (y_train == 1).sum()
scale_pos_weight = neg / pos

model = XGBClassifier(
    n_estimators=300,
    max_depth=4,
    learning_rate=0.05,
    scale_pos_weight=scale_pos_weight,
    eval_metric="auc",
    random_state=42,
)
model.fit(X_train, y_train)

preds = model.predict(X_test)
probs = model.predict_proba(X_test)[:, 1]

print(classification_report(y_test, preds))
print("ROC-AUC:", roc_auc_score(y_test, probs))

print("\nFeature importance:")
for feat, imp in sorted(zip(features, model.feature_importances_), key=lambda x: -x[1]):
    print(f"  {feat}: {imp:.3f}")
