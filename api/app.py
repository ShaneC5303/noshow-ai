import os
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import joblib
import shap
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
import auto_pipeline

try:
    from groq import Groq
except Exception:
    Groq = None

app = Flask(__name__)
CORS(app)

MAX_ROWS = 5000

bundle = joblib.load("../notebooks/model.pkl")
model = bundle["model"]
features = bundle["features"]
explainer = shap.TreeExplainer(model)

gemini_client = None
if os.environ.get("GEMINI_API_KEY"):
    gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

groq_client = None
if Groq and os.environ.get("GROQ_API_KEY"):
    groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])


def make_message(rank, age, lead, risk, reasons):
    fallback = "Reminder message unavailable right now - please contact the patient directly."
    if not gemini_client and not groq_client:
        return ""
    prompt = (
        f"Write a short, friendly appointment reminder text (under 40 words) for a "
        f"{'patient' if age >= 18 else 'patient' + chr(39) + 's parent or guardian'}. The patient is {age} years old, booked "
        f"{lead} days ago. Predicted no-show risk: {risk:.0%}, mainly "
        f"because of: {', '.join(reasons)}. Be specific to the reason, not generic. "
        f"No placeholder brackets. Address the reader directly as 'you'."
    )
    if gemini_client:
        try:
            resp = gemini_client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=8000)
                ),
            )
            return resp.text.strip()
        except Exception as e:
            print(f"Gemini failed for row {rank}: {e}")
    if groq_client:
        try:
            r = groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                timeout=8,
            )
            return r.choices[0].message.content.strip()
        except Exception as e:
            print(f"Groq failed for row {rank}: {e}")
    return fallback


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

    df = df[df["Age"] >= 0]
    if len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=42)
    df = df.reset_index(drop=True)
    X = df[features]

    probs = model.predict_proba(X)[:, 1]
    top_idx = probs.argsort()[::-1][:10]

    X_top = X.iloc[top_idx].reset_index(drop=True)
    shap_values = explainer(X_top)

    rows = []
    for rank, i in enumerate(top_idx):
        row = X.iloc[i]
        risk = float(probs[i])
        contribs = sorted(zip(features, shap_values.values[rank]), key=lambda x: -x[1])[:2]
        reasons = [f"{feat} ({'+' if val > 0 else ''}{val:.2f})" for feat, val in contribs]
        rows.append((rank, int(row["Age"]), int(row["LeadDays"]), risk, reasons))

    with ThreadPoolExecutor(max_workers=10) as pool:
        messages = list(pool.map(lambda r: make_message(*r), rows))

    results = []
    for (rank, age, lead, risk, reasons), msg in zip(rows, messages):
        results.append({
            "id": rank + 1,
            "age": age,
            "leadDays": lead,
            "riskScore": round(risk, 2),
            "reasons": reasons,
            "reminderMessage": msg,
        })

    return jsonify(results)


@app.route("/predict_one", methods=["POST"])
def predict_one():
    d = request.get_json(silent=True) or {}
    try:
        row = {
            "Age": int(d["age"]),
            "LeadDays": int(d["leadDays"]),
            "Scholarship": int(d.get("scholarship", 0)),
            "Hipertension": int(d.get("hipertension", 0)),
            "Diabetes": int(d.get("diabetes", 0)),
            "SMS_received": int(d.get("sms", 0)),
        }
    except Exception:
        return jsonify({"error": "age and leadDays are required numbers"}), 400
    if row["Age"] < 0 or row["LeadDays"] < 0:
        return jsonify({"error": "age and leadDays must be 0 or more"}), 400

    X = pd.DataFrame([{f: row.get(f, 0) for f in features}])
    risk = float(model.predict_proba(X)[:, 1][0])
    sv = explainer(X)
    contribs = sorted(zip(features, sv.values[0]), key=lambda x: -x[1])[:2]
    reasons = [f"{f} ({'+' if v > 0 else ''}{v:.2f})" for f, v in contribs]
    msg = make_message(0, row["Age"], row["LeadDays"], risk, reasons)
    return jsonify({
        "age": row["Age"],
        "leadDays": row["LeadDays"],
        "riskScore": round(risk, 2),
        "reasons": reasons,
        "reminderMessage": msg,
    })


def llm_text(prompt, rank):
    if gemini_client:
        try:
            resp = gemini_client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
                config=types.GenerateContentConfig(http_options=types.HttpOptions(timeout=8000)),
            )
            return resp.text.strip()
        except Exception as e:
            print(f"Gemini failed for row {rank}: {e}")
    if groq_client:
        try:
            r = groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                timeout=8,
            )
            return r.choices[0].message.content.strip()
        except Exception as e:
            print(f"Groq failed for row {rank}: {e}")
    if gemini_client or groq_client:
        return "Reminder message unavailable right now - please contact the client directly."
    return ""


def clinic_compatible(df):
    need = [f for f in features if f != "LeadDays"]
    has_lead = "LeadDays" in df.columns or ("ScheduledDay" in df.columns and "AppointmentDay" in df.columns)
    return all(f in df.columns for f in need) and has_lead


@app.route("/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    try:
        df = pd.read_csv(f)
    except Exception:
        return jsonify({"error": "Could not read that as a CSV"}), 400
    df.columns = df.columns.astype(str).str.strip()
    if df.shape[1] < 2 or len(df) < 2:
        return jsonify({"error": "That file does not look like a table with several columns."}), 400
    target = (request.form.get("target") or "").strip() or None

    # Fast path: the original clinic format uses the pre-trained model
    if target is None and clinic_compatible(df):
        f.stream.seek(0)
        resp = predict()
        if isinstance(resp, tuple):
            return resp
        return jsonify({"mode": "clinic", "results": resp.get_json()})

    try:
        res = auto_pipeline.run(df, target)
    except auto_pipeline.NeedsTarget as e:
        return jsonify({"needs_target": True, "candidates": e.candidates, "columns": list(df.columns)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print("analyze failed:", repr(e))
        return jsonify({"error": "Could not analyse this file. Check that it is a normal CSV with a no-show column."}), 400

    prompts = []
    for r in res["results"]:
        prompts.append(
            "Write a short, friendly appointment reminder text (under 40 words) for a client. "
            f"Use only these booking details: {r['details']}. "
            "Ask them to confirm or reschedule. Do NOT mention spending, purchases, past visits, "
            "missed appointments, risk, scores, models or AI. Do not invent names, times or dates "
            "that are not in the details. Address the reader directly as 'you'. No placeholder brackets."
        )
    with ThreadPoolExecutor(max_workers=10) as pool:
        msgs = list(pool.map(lambda a: llm_text(a[1], a[0]), enumerate(prompts)))
    for r, m in zip(res["results"], msgs):
        r["reminderMessage"] = m
    return jsonify(res)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
