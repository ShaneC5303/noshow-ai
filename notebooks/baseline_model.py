import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, roc_auc_score

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

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

model = LogisticRegression(class_weight="balanced", max_iter=1000, solver="saga")
model.fit(X_train_s, y_train)

preds = model.predict(X_test_s)
probs = model.predict_proba(X_test_s)[:, 1]

print(classification_report(y_test, preds))
print("ROC-AUC:", roc_auc_score(y_test, probs))
