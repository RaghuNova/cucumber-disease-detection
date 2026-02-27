from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import tensorflow as tf
from PIL import Image
import io
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Cucumber Leaf Disease ML API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLASS_NAMES = ["Downy_mildew", "Healthy_leaves", "Powdery_mildew"]
IMG_SIZE = (224, 224)

model = None

@app.on_event("startup")
async def load_model():
    global model
    try:
        model = tf.keras.models.load_model("cucumber_model.keras")
        logger.info("Model loaded successfully")
        logger.info(f"Model input shape: {model.input_shape}")
        logger.info(f"Model output shape: {model.output_shape}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Model loading failed: {e}")

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        image = image.resize(IMG_SIZE)
        img_array = np.array(image, dtype=np.float32)
        img_array = np.expand_dims(img_array, axis=0)

        predictions = model.predict(img_array, verbose=0)
        predicted_index = int(np.argmax(predictions[0]))
        confidence = float(predictions[0][predicted_index])
        disease = CLASS_NAMES[predicted_index]

        all_predictions = [
            {"class": CLASS_NAMES[i], "confidence": round(float(predictions[0][i]) * 100, 2)}
            for i in range(len(CLASS_NAMES))
        ]

        return {
            "disease": disease,
            "confidence": round(confidence * 100, 2),
            "all_predictions": all_predictions
        }

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
