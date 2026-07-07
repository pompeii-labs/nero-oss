#!/usr/bin/env python3
"""Score hey_nero.onnx on held-out clips (new speaking rates + hard negatives)."""
import os
import subprocess
import numpy as np
import onnxruntime as ort
from train import stream_embeddings, pad_front, windows16, MODELS

HERE = os.path.dirname(os.path.abspath(__file__))
ww = ort.InferenceSession(os.path.join(MODELS, "hey_nero.onnx"))
WW_IN = ww.get_inputs()[0].name


def say_wav(text, voice, rate):
    aiff = "/tmp/vw.aiff"
    wav = "/tmp/vw.wav"
    subprocess.run(["say", "-v", voice, "-r", str(rate), text, "-o", aiff], capture_output=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav],
                   capture_output=True)
    import soundfile as sf
    x, _ = sf.read(wav, dtype="int16")
    return x.astype(np.float32)


def score(samples):
    embs = stream_embeddings(pad_front(samples))
    best = 0.0
    for w in windows16(embs):
        out = ww.run(None, {WW_IN: w[None].astype(np.float32)})[0]
        best = max(best, float(np.squeeze(out)))
    return best


# Held-out rates (trained on 150/180/210) + a voice mix.
tests = [
    ("hey nero", "Samantha", 165, "POS"),
    ("hey nero", "Daniel", 195, "POS"),
    ("hey nero", "Karen", 165, "POS"),
    ("hey nero", "Alex", 200, "POS"),
    ("hey jarvis", "Samantha", 180, "neg"),
    ("hey neo", "Daniel", 180, "neg"),
    ("hey there", "Karen", 180, "neg"),
    ("hey narrow", "Alex", 180, "neg"),
    ("what time is it", "Samantha", 180, "neg"),
]
print("phrase                 voice     rate  kind  score")
for text, v, r, kind in tests:
    s = score(say_wav(text, v, r))
    flag = " <-- FIRES" if s > 0.5 else ""
    print(f"{text:22} {v:9} {r:4}  {kind:4}  {s:.3f}{flag}")
