import os
from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Stand-in for one booking's real output from shap_explain.py
booking = {
    "name": "the Silva family",
    "age": 13,
    "appointment_date": "Thursday, March 12",
    "lead_days": 57,
    "risk_score": 0.86,
    "top_reasons": ["long lead time (57 days)", "received an SMS reminder already"],
}

prompt = f"""Write a short, friendly appointment reminder text (under 40 words) for
{booking['name']}, guardian of a {booking['age']}-year-old patient. The appointment is
on {booking['appointment_date']}, booked {booking['lead_days']} days ago. Our model
predicts a {booking['risk_score']:.0%} chance of a no-show, mainly because of:
{', '.join(booking['top_reasons'])}. Make the message specific to why they might forget
(long lead time), not generic. Do not use placeholder brackets like [Date] — use the
actual date and name given above."""

resp = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=prompt,
)
print(resp.text)
