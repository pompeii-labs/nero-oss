"""Diagnose batch (training) vs streaming (runtime) feature mismatch."""
import os
import numpy as np
import soundfile as sf
import onnxruntime as ort
from train import MODELS, MEL_IN, EMB_IN, mel_sess, emb_sess

ww = ort.InferenceSession(os.path.join(MODELS, "hey_nero.onnx"))
WN = ww.get_inputs()[0].name


def melspec(samples):
    out = mel_sess.run(None, {MEL_IN: samples[None, :].astype(np.float32)})[0]
    return np.squeeze(out) / 10 + 2  # [F,32]


# 1) frames per input length
for L in (1280, 1760, 2560, 16000):
    print(f"melspec({L}) -> {melspec(np.zeros(L, np.float32)).shape[0]} frames")


def emb_of_mel(m76):
    return np.squeeze(emb_sess.run(None, {EMB_IN: m76[None, :, :, None].astype(np.float32)})[0])


# 2) STREAMING featurization, exactly like detector.ts
def stream_embeddings(samples):
    raw = np.zeros(0, np.float32)
    melbuf = []
    feats = []
    CHUNK, CTX = 1280, 480
    for i in range(0, len(samples) - CHUNK + 1, CHUNK):
        raw = np.concatenate([raw, samples[i:i + CHUNK]])[-16000:]
        mel_in = raw[-(CHUNK + CTX):]
        m = melspec(mel_in)
        for row in m:
            melbuf.append(row)
        if len(melbuf) >= 76:
            feats.append(emb_of_mel(np.asarray(melbuf[-76:], np.float32)))
    return np.asarray(feats, np.float32)


# 3) BATCH featurization, like train.py
def batch_embeddings(samples):
    m = melspec(samples)
    return np.asarray([emb_of_mel(m[i:i + 76]) for i in range(0, m.shape[0] - 76 + 1, 8)], np.float32)


def score_windows(feats):
    best = 0.0
    for j in range(0, len(feats) - 15):
        best = max(best, float(np.squeeze(ww.run(None, {WN: feats[j:j + 16][None].astype(np.float32)})[0])))
    return best


x, _ = sf.read(os.path.join(MODELS, "test-heynero.wav"), dtype="int16")
x = x.astype(np.float32)
pad = np.concatenate([np.zeros(16000, np.float32), x, np.zeros(16000, np.float32)])
be = batch_embeddings(pad)
se = stream_embeddings(pad)
print(f"batch embeddings {be.shape}  streaming embeddings {se.shape}")
print(f"batch score  {score_windows(be):.3f}")
print(f"stream score {score_windows(se):.3f}")
