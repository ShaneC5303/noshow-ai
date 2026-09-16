import os
import pandas as pd
import joblib
import shap
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from groq import Groq

app = Flask(__name__)
CORS(app)

bundle = joblib.load("../notebooks/model.pkl")
model = bundle["model"]
features = bundle["features"]
explainer = shap.TreeExplainer(model)

gemini_client = None
if os.environ.get("GEMINI_API_KEY"):
    gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

groq_client = None
if os.environ.get("GROQ_API_KEY"):
    groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])


@app.route("/predict", methods=["POST"])
def predict():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_csv(request.files["file"])
    except Exception:
        return jsonify({"error": "Could not read that as a CSV"}), 400

    df.columns = df.columns.str.strip()

    if "LeadDays" not in df.columns:
        if "ScheduledDay" in df.columns and "AppointmentDay" in df.columns:
            df["ScheduledDay"] = pd.to_datetime(df["ScheduledDay"])
            df["AppointmentDay"] = pd.to_datetime(df["AppointmentDay"])
            df["LeadDays"] = (df["AppointmentDay"] - df["ScheduledDay"]).dt.days.clip(lower=0)
        else:
            return jsonify({
                "error": f"CSV needs these columns: {features} "
                         f"(or ScheduledDay + AppointmentDay instead of LeadDays)"
            }), 400

    missing = [f for f in features if f not in df.columns]
    if missing:
        return jsonify({"error": f"Missing columns: {missing}"}), 400

    df = df[df["Age"] >= 0].reset_index(drop=True)
    X = df[features]

    probs = model.predict_proba(X)[:, 1]
    top_idx = probs.argsort()[::-1][:10]

    X_top = X.iloc[top_idx].reset_index(drop=True)
    shap_values = explainer(X_top)

    results = []
    for rank, i in enumerate(top_idx):
        row = X.iloc[i]
        risk = float(probs[i])
        contribs = sorted(zip(features, shap_values.values[rank]), key=lambda x: -x[1])[:2]
        reasons = [f"{feat} ({'+' if val > 0 else ''}{val:.2f})" for feat, val in contribs]

        message = ""
        if gemini_client:
            prompt = (
                f"Write a short, friendly appointment reminder text (under 40 words) for a "
                f"patient's guardian. The patient is {int(row['Age'])} years old, booked "
                f"{int(row['LeadDays'])} days ago. Predicted no-show risk: {risk:.0%}, mainly "
                f"because of: {', '.join(reasons)}. Be specific to the reason, not generic. "
                f"No placeholder brackets."
            )
            try:
                resp = gemini_client.models.generate_content(model="gemini-3.6-flash", contents=prompt)
                message = resp.text.strip()
            except Exception as e:
                print(f"Gemini call failed for row {rank}: {e}")
                message = "Reminder message unavailable right now — please contact the patient directly."
                if groq_client:
                    try:
                        groq_resp = groq_client.chat.completions.create(
                            model="openai/gpt-oss-120b",
                            messages=[{"role": "user", "content": prompt}],
                        )
                        message = groq_resp.choices[0].message.content.strip()
                    except Exception as e2:
                        print(f"Groq fallback also failed for row {rank}: {e2}")

        results.append({
            "id": rank + 1,
            "age": int(row["Age"]),
            "leadDays": int(row["LeadDays"]),
            "riskScore": round(risk, 2),
            "reasons": reasons,
            "reminderMessage": message,
        })

    return jsonify(results)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
