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
