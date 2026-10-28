# No-Show AI

**Live demo:** https://noshow-ai.vercel.app

Predicts appointment no-show risk, explains the risk drivers, and generates a personalized
reminder message for high-risk bookings — built for our AI & DS capstone (PRC-I).

## What it does

1. **Risk model** — XGBoost classifier trained on booking/behavioral data (ROC-AUC 0.72)
2. **Explainability** — SHAP breaks down *why* each booking is flagged
3. **Personalization** — Gemini drafts a reminder message tailored to each booking's risk factors
4. **Dashboard** — React frontend + Express backend showing it all end-to-end, deployed live

## Project structure

## Running it locally

**1. Python pipeline** (from `notebooks/`)
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r ../requirements.txt
python eda.py              # explore the data
python xgboost_model.py    # train + evaluate the risk model
python shap_explain.py     # explainability
export GEMINI_API_KEY="your-key-here"
python pipeline.py         # full pipeline -> writes backend/bookings.json
```

**2. Backend** (from `backend/`)
```bash
npm install
node server.js   # http://localhost:4000
```

**3. Frontend** (from `frontend/`)
```bash
npm install
npm run dev       # http://localhost:5173
```

## Deployment

- Backend: Render (free tier — spins down after 15 min idle, first request after that takes ~30-50s to wake up)
- Frontend: Vercel

## Dataset

[Medical Appointment No Shows](https://www.kaggle.com/datasets/joniarroba/noshowappointments) (Kaggle)

## Team

G. Sai Mahin, Y. Shane, Varun Paleru — guided by R. Navyatha, KLH University

## Results (5-fold stratified CV, mean ± std)

| Model | ROC-AUC | Precision | Recall | F1 |
|---|---|---|---|---|
| Logistic Regression | 0.661 ± 0.003 | 0.317 ± 0.001 | 0.559 ± 0.005 | 0.405 ± 0.002 |
| XGBoost | 0.720 ± 0.002 | 0.308 ± 0.001 | 0.792 ± 0.008 | 0.443 ± 0.002 |
| LightGBM | 0.720 ± 0.002 | 0.308 ± 0.002 | 0.790 ± 0.009 | 0.443 ± 0.003 |

XGBoost and LightGBM are statistically tied. SHAP shows lead time is the dominant risk driver, followed by age.

## Run the pieces

- `python notebooks/cross_validation_comparison.py` for the 3-model CV comparison
- `python notebooks/shap_explain.py` for the SHAP summary plot
- `python notebooks/train_and_save_model.py` to create `model.pkl`
- `cd api && gunicorn app:app --workers 1 --timeout 120` for the Flask API
- `cd backend && node server.js` for the Node API
- `cd frontend && npm run dev` for the dashboard

## Live

- Dashboard: https://noshow-ai.vercel.app
- Upload any CSV and the app scores it, explains the top 10 with SHAP, and drafts reminders. Only 5,000 rows are scored per upload.
- The free Render tier sleeps, so the first request can take about 40 seconds.
