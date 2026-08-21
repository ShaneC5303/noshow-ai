import pandas as pd
import shap
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split

df = pd.read_csv("../data/KaggleV2-May-2016.csv")
df.columns = df.columns.str.strip()

df["ScheduledDay"] = pd.to_datetime(df["ScheduledDay"])
df["AppointmentDay"] = pd.to_datetime(df["AppointmentDay"])
df["LeadDays"] = (df["AppointmentDay"] - df["ScheduledDay"]).dt.days
df["LeadDays"] = df["LeadDays"].clip(lower=0)
df = df[df["Age"] >= 0]
df["y"] = (df["No-show"] == "Yes").astype(int)

features = ["Age", "LeadDays", "Scholarship", "Hipertension", "Diabetes", "SMS_received"]
X = df[features]
y = df["y"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

neg, pos = (y_train == 0).sum(), (y_train == 1).sum()
model = XGBClassifier(
    n_estimators=300, max_depth=4, learning_rate=0.05,
    scale_pos_weight=neg / pos, eval_metric="auc", random_state=42,
)
model.fit(X_train, y_train)

explainer = shap.TreeExplainer(model)
shap_values = explainer(X_test)

# Global summary plot: which features matter most, saved as an image
shap.summary_plot(shap_values, X_test, show=False)
import matplotlib.pyplot as plt
plt.savefig("shap_summary.png", bbox_inches="tight")
print("Saved shap_summary.png")

# Explain one specific high-risk booking (for your dashboard's "why" text)
probs = model.predict_proba(X_test)[:, 1]
idx = probs.argmax()
print(f"\nHighest-risk booking in test set (predicted risk: {probs[idx]:.2f}):")
print(X_test.iloc[idx])
print("\nSHAP contribution per feature (positive = pushes risk up):")
for feat, val in zip(features, shap_values.values[idx]):
    print(f"  {feat}: {val:+.3f}")
