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

# Rejection thresholds for out-of-distribution / non-cucumber images
MIN_ACCEPTED_CONFIDENCE = 0.80
MIN_MARGIN = 0.25
MAX_NORMALIZED_ENTROPY = 0.70

model = None
model_expects_unit_scale = True


def _softmax(x: np.ndarray) -> np.ndarray:
    z = x - np.max(x)
    exp_z = np.exp(z)
    return exp_z / np.sum(exp_z)


def _ensure_probabilities(raw_output: np.ndarray) -> np.ndarray:
    probs = np.asarray(raw_output, dtype=np.float32)
    if probs.ndim != 1:
        probs = probs.reshape(-1)

    total = float(np.sum(probs))
    is_prob_like = bool(
        np.all(probs >= 0.0)
        and np.all(probs <= 1.0)
        and np.isfinite(total)
        and abs(total - 1.0) < 1e-3
    )

    return probs if is_prob_like else _softmax(probs)


def _should_reject_as_non_cucumber_leaf(probs: np.ndarray) -> bool:
    sorted_probs = np.sort(probs)[::-1]
    top1 = float(sorted_probs[0])
    top2 = float(sorted_probs[1]) if len(sorted_probs) > 1 else 0.0
    margin = top1 - top2

    entropy = -np.sum(probs * np.log(np.clip(probs, 1e-10, 1.0)))
    normalized_entropy = float(entropy / np.log(len(probs))) if len(probs) > 1 else 0.0

    low_confidence = top1 < MIN_ACCEPTED_CONFIDENCE
    ambiguous = margin < MIN_MARGIN
    high_uncertainty = normalized_entropy > MAX_NORMALIZED_ENTROPY

    return low_confidence or ambiguous or high_uncertainty


def _detect_input_scale_expectation(loaded_model: tf.keras.Model) -> bool:
    # If model already includes Rescaling(1./255), keep image in [0,255].
    has_rescaling_layer = any(
        layer.__class__.__name__ == "Rescaling" for layer in loaded_model.layers
    )
    return not has_rescaling_layer

@app.on_event("startup")
async def load_model():
    global model, model_expects_unit_scale
    try:
        model = tf.keras.models.load_model("cucumber_model.keras")
        model_expects_unit_scale = _detect_input_scale_expectation(model)
        logger.info("Model loaded successfully")
        logger.info(f"Model input shape: {model.input_shape}")
        logger.info(f"Model output shape: {model.output_shape}")
        logger.info(
            "Input normalization enabled: %s",
            "yes ([0,1])" if model_expects_unit_scale else "no (model handles scaling)",
        )
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
        if model_expects_unit_scale:
            img_array = img_array / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        predictions = model.predict(img_array, verbose=0)
        probabilities = _ensure_probabilities(predictions[0])

        predicted_index = int(np.argmax(probabilities))
        confidence = float(probabilities[predicted_index])
        disease = CLASS_NAMES[predicted_index]

        all_predictions = [
            {"class": CLASS_NAMES[i], "confidence": round(float(probabilities[i]) * 100, 2)}
            for i in range(len(CLASS_NAMES))
        ]

        is_cucumber_leaf = not _should_reject_as_non_cucumber_leaf(probabilities)

        if not is_cucumber_leaf:
            return {
                "disease": "Not_Cucumber_Leaf",
                "confidence": round(confidence * 100, 2),
                "all_predictions": all_predictions,
                "is_cucumber_leaf": False,
                "message": "This image does not look like a cucumber leaf from the trained dataset.",
            }

        return {
            "disease": disease,
            "confidence": round(confidence * 100, 2),
            "all_predictions": all_predictions,
            "is_cucumber_leaf": True,
        }

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
