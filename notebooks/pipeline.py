import os
import json
import pandas as pd
import shap
from google import genai
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

df = pd.read_csv("../data/KaggleV2-May-2016.csv")
df.columns = df.columns.str.strip()
df["ScheduledDay"] = pd.to_datetime(df["ScheduledDay"])
df["AppointmentDay"] = pd.to_datetime(df["AppointmentDay"])
df["LeadDays"] = (df["AppointmentDay"] - df["ScheduledDay"]).dt.days.clip(lower=0)
df = df[df["Age"] >= 0]
df["y"] = (df["No-show"] == "Yes").astype(int)

features = ["Age", "LeadDays", "Scholarship", "Hipertension", "Diabetes", "SMS_received"]
X, y = df[features], df["y"]
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
probs = model.predict_proba(X_test)[:, 1]

# Take the 10 highest-risk bookings in the test set for the demo dashboard
top_idx = probs.argsort()[::-1][:10]
sample = X_test.iloc[top_idx].reset_index(drop=True)
sample_shap = explainer(X_test.iloc[top_idx])

results = []
for i in range(len(sample)):
    row = sample.iloc[i]
    risk = float(probs[top_idx[i]])

    # top 2 SHAP contributors, positive = pushes risk up
    contribs = sorted(zip(features, sample_shap.values[i]), key=lambda x: -x[1])[:2]
    reasons = [f"{feat} ({'+' if val > 0 else ''}{val:.2f})" for feat, val in contribs]

    prompt = f"""Write a short, friendly appointment reminder text (under 40 words) for
a patient's guardian. The patient is {int(row['Age'])} years old, booked
{int(row['LeadDays'])} days ago. Predicted no-show risk: {risk:.0%}, mainly because of:
{', '.join(reasons)}. Be specific to the reason, not generic. No placeholder brackets."""

    resp = client.models.generate_content(model="gemini-3.6-flash", contents=prompt)

    results.append({
        "id": i + 1,
        "age": int(row["Age"]),
        "leadDays": int(row["LeadDays"]),
        "riskScore": round(risk, 2),
        "reasons": reasons,
        "reminderMessage": resp.text.strip(),
    })
    print(f"Processed booking {i+1}/10 — risk {risk:.0%}")

with open("../backend/bookings.json", "w") as f:
    json.dump(results, f, indent=2)

print("\nWrote ../backend/bookings.json")
