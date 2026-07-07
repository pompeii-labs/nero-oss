#!/usr/bin/env python3
"""
Train the "Hey Nero" classifier head on top of openWakeWord's frozen melspectrogram +
speech-embedding models, then export hey_nero.onnx with the exact runtime I/O
([1,16,96] -> [1,1]).

Critical: features are computed with the SAME streaming method the browser runtime uses
(melspec on 1280-sample chunks over the last 1280+480 samples), NOT a batch melspec over
the whole clip. Training on batch features produced a model that scored ~0 in the streaming
runtime. Positives are labelled with trailing tolerance so detection fires as the phrase
completes and for a few chunks after, not only at the exact final frame.

    featurize (streaming onnx) -> augment -> train head (torch) -> export onnx -> validate

Paths are overridable for running on a remote box:
    WW_MODELS  dir with melspectrogram.onnx + embedding_model.onnx (output hey_nero.onnx here)
    WW_DATA    dir with positives/ + negatives/
"""
import os
import glob
import numpy as np
import soundfile as sf
import onnxruntime as ort
import torch
import torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.environ.get("WW_MODELS", os.path.join(HERE, "../../web/static/wakeword"))
DATA = os.environ.get("WW_DATA", os.path.join(HERE, "data"))
OUT = os.path.join(MODELS, "hey_nero.onnx")
SR = 16000
RNG = np.random.default_rng(7)

mel_sess = ort.InferenceSession(os.path.join(MODELS, "melspectrogram.onnx"))
emb_sess = ort.InferenceSession(os.path.join(MODELS, "embedding_model.onnx"))
MEL_IN = mel_sess.get_inputs()[0].name
EMB_IN = emb_sess.get_inputs()[0].name


def load_wav(path):
    x, _ = sf.read(path, dtype="int16")
    if x.ndim > 1:
        x = x[:, 0]
    return x.astype(np.float32)


def _melspec(samples):
    out = mel_sess.run(None, {MEL_IN: samples[None, :].astype(np.float32)})[0]
    return np.squeeze(out) / 10 + 2


def _embed(m76):
    return np.squeeze(emb_sess.run(None, {EMB_IN: m76[None, :, :, None].astype(np.float32)})[0])


def stream_embeddings(samples):
    """Mirror detector.ts exactly: 1280-sample chunks, melspec on the last 1280+480,
    one embedding per chunk from the last 76 mel frames."""
    raw = np.zeros(0, np.float32)
    melbuf = []
    feats = []
    for i in range(0, len(samples) - 1280 + 1, 1280):
        raw = np.concatenate([raw, samples[i:i + 1280]])[-SR:]
        for row in _melspec(raw[-(1280 + 480):]):
            melbuf.append(row)
        melbuf = melbuf[-970:]
        if len(melbuf) >= 76:
            feats.append(_embed(np.asarray(melbuf[-76:], np.float32)))
    return np.asarray(feats, np.float32)


def pad_front(samples, target=int(2.4 * SR)):
    if len(samples) >= target:
        return samples
    return np.concatenate([np.zeros(target - len(samples), np.float32), samples])


def windows16(embs):
    return [embs[i:i + 16] for i in range(0, len(embs) - 15)]


def augment(samples):
    outs = [samples]
    for _ in range(4):
        s = samples.copy()
        snr = RNG.uniform(5, 25)
        rms = np.sqrt(np.mean(s ** 2)) + 1e-6
        noise = RNG.standard_normal(len(s)).astype(np.float32) * rms / (10 ** (snr / 20))
        s = (s + noise) * RNG.uniform(0.6, 1.2)
        outs.append(np.clip(s, -32768, 32767))
    return outs


def positive_windows(samples):
    """The window ending on the completed phrase, at several trailing offsets so the model
    fires as the word finishes and for a few chunks after (not only the exact last frame)."""
    wins = []
    base = pad_front(samples)
    for trail in (0, 2048, 4096, 6144):  # 0 / 128 / 256 / 384 ms
        clip = np.concatenate([base, np.zeros(trail, np.float32)]) if trail else base
        se = stream_embeddings(clip)
        if len(se) >= 16:
            wins.append(se[-16:])
    return wins


def build_dataset():
    X, y = [], []
    for p in sorted(glob.glob(os.path.join(DATA, "positives", "*.wav"))):
        for s in augment(load_wav(p)):
            for win in positive_windows(s):
                X.append(win)
                y.append(1.0)
    for p in sorted(glob.glob(os.path.join(DATA, "negatives", "*.wav"))):
        base = os.path.basename(p)
        variants = augment(load_wav(p))[:3] if base.startswith("hard_") else [load_wav(p)]
        for s in variants:
            for win in windows16(stream_embeddings(pad_front(s))):
                X.append(win)
                y.append(0.0)
    return np.asarray(X, np.float32), np.asarray(y, np.float32)


class Head(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(),
            nn.Linear(16 * 96, 128), nn.LayerNorm(128), nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 64), nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(self, x):
        return torch.sigmoid(self.net(x))


def main():
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    X, y = build_dataset()
    print(f"dataset: {X.shape}  pos={int(y.sum())} neg={int((1 - y).sum())}  device={dev}")

    idx = RNG.permutation(len(X))
    X, y = X[idx], y[idx]
    n_val = len(X) // 6
    Xtr = torch.tensor(X[n_val:], device=dev)
    ytr = torch.tensor(y[n_val:], device=dev)[:, None]
    Xva = torch.tensor(X[:n_val], device=dev)
    yva = torch.tensor(y[:n_val], device=dev)[:, None]

    model = Head().to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    pos_w = torch.tensor([(ytr == 0).sum() / max((ytr == 1).sum(), 1)], device=dev)
    lossf = nn.BCELoss(reduction="none")

    for epoch in range(80):
        model.train()
        perm = torch.randperm(len(Xtr), device=dev)
        for i in range(0, len(perm), 256):
            b = perm[i:i + 256]
            opt.zero_grad()
            out = model(Xtr[b])
            w = torch.where(ytr[b] > 0.5, pos_w, torch.ones(1, device=dev))
            (lossf(out, ytr[b]) * w).mean().backward()
            opt.step()
        if epoch % 10 == 9:
            model.eval()
            with torch.no_grad():
                pv = model(Xva)
                pos = yva.squeeze() > 0.5
                rec = (pv.squeeze()[pos] > 0.5).float().mean().item() if pos.any() else 0
                fa = (pv.squeeze()[~pos] > 0.5).float().mean().item() if (~pos).any() else 0
                print(f"epoch {epoch + 1}: recall={rec:.3f} false_accept={fa:.3f}")

    model.eval().cpu()
    torch.onnx.export(
        model, torch.randn(1, 16, 96), OUT,
        input_names=["x"], output_names=["score"], opset_version=17,  # native LayerNorm
    )
    import onnx
    onnx.save_model(onnx.load(OUT), OUT, save_as_external_data=False)
    print(f"exported {OUT}")


if __name__ == "__main__":
    main()
