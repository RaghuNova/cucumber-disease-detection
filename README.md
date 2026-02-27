# 🥒 CucumberGuard AI — Cucumber Leaf Disease Detection

An AI-powered full-stack web application that detects cucumber leaf diseases using a trained CNN model and provides intelligent treatment recommendations via Google Gemini.

## Features

- **Image Upload** — Drag & drop or browse to upload cucumber leaf images
- **Disease Detection** — CNN model classifies: Downy Mildew, Powdery Mildew, Healthy
- **AI Insights** — Google Gemini generates root cause, prevention, treatment, and more
- **Visual Analytics** — Confidence charts, dataset distribution, model performance graphs
- **PDF Reports** — Download detailed disease analysis reports

## Architecture

```
Frontend (React + Vite + Tailwind)  →  Backend (Express)  →  ML API (FastAPI + TensorFlow)
        :5174                              :5000                      :8000
```

## Quick Start

### 1. Set your Gemini API key

Open the `.env` file in the `cucumber-ai/` root folder and paste your API key:

```
GEMINI_API_KEY=your_actual_api_key_here
```

> Get a free API key at: https://aistudio.google.com/app/apikey

### 2. Start the ML API (Python)

```bash
cd cucumber-ai/ml-api
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

### 3. Start the Backend (Node.js)

```bash
cd cucumber-ai/backend
npm install
node server.js
```

### 4. Start the Frontend (React)

```bash
cd cucumber-ai/frontend
npm install
npm run dev
```

### 5. Open the app

Visit **http://localhost:5174** in your browser.

## Folder Structure

```
cucumber-ai/
├── .env                  ← Paste your GEMINI_API_KEY here
├── README.md
├── frontend/             ← React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx       ← Main application
│   │   ├── App.css       ← Custom styles & animations
│   │   └── index.css     ← Tailwind import
│   └── package.json
├── backend/              ← Express server
│   ├── server.js         ← API routes, Gemini, PDF generation
│   ├── uploads/          ← Temporary image storage
│   └── package.json
└── ml-api/               ← FastAPI + TensorFlow
    ├── app.py            ← Model loading & prediction endpoint
    ├── cucumber_model.keras
    └── requirements.txt
```

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | `cucumber-ai/.env` | Your Google Gemini API key |

**⚠️ The API key is NOT hardcoded anywhere. You must add it to the `.env` file.**

## Disease Classes

| Class | Description |
|-------|-------------|
| Downy Mildew | Fungal disease causing yellow patches on leaves |
| Powdery Mildew | White powdery coating on leaf surfaces |
| Healthy Leaves | No disease detected |

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Recharts, React Dropzone
- **Backend**: Node.js, Express, PDFKit, Google Generative AI SDK
- **ML API**: Python, FastAPI, TensorFlow, Pillow
- **AI**: Google Gemini 1.5 Flash
