# "Hey Nero" wakeword training

Trains the small classifier head that turns openWakeWord's frozen melspectrogram +
speech-embedding models into a "Hey Nero" detector. Positives/negatives are synthesized
with macOS `say` (184 voices), features come from the same ONNX models the browser runs,
and the head exports to `hey_nero.onnx` with the exact runtime I/O (`[1,16,96] -> [1,1]`).

## Pipeline

```
gen_data.py   say -> data/positives/*.wav, data/negatives/*.wav (16 kHz mono)   [macOS only]
train.py      wav -> streaming melspec+embedding (onnx) -> 16x96 windows -> head -> hey_nero.onnx
validate.py   score held-out clips with the streaming featurizer                 [macOS only]
```

- **Positives**: "hey nero" across every English voice x rates, augmented (noise/gain).
- **Negatives**: near-phonetic hard negatives ("hey neo", "hey narrow", ...) across every
  voice + rate (the fine boundary), varied everyday speech, and noise/silence.
- **Head**: `Flatten -> 1536->128 (LN,ReLU,dropout) -> 64 -> 1 -> sigmoid`, BCE with positive
  weighting. Only the head trains; the melspec + embedding models are frozen and shared.

## Critical: featurize the way the runtime does

Features MUST be computed with the **streaming** method (melspec on 1280-sample chunks over
the last 1280+480 samples, one embedding per chunk), the same as `web/src/lib/wakeword/detector.ts`.
Training on a batch melspec (whole clip at once) produced a model that validated at ~0.99 in
Python but scored **0.000** in the browser, the features didn't match. Positives are also
labelled with **trailing tolerance** (windows ending 0-384ms after the phrase) so detection
fires as the word finishes and for a few chunks after, not only at the exact final frame.

## Run

Data gen is macOS-only (`say`). Training is heavy, so run it on a GPU box, not a laptop and
not CI (macOS Actions runners bill 10x and this pipeline is ~20 min):

```bash
# on macOS: generate the corpus
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python gen_data.py

# train on a box (e.g. `ssh rig`): copy data/ + the two frozen onnx models, then
WW_MODELS=/path/to/models WW_DATA=/path/to/data python train.py   # writes hey_nero.onnx to WW_MODELS

# back on macOS: sanity-check with the streaming featurizer
.venv/bin/python validate.py
```

`data/` and `.venv/` are gitignored; the trained `hey_nero.onnx` is committed as the shipped
model. The real test is the browser: `/wake?autotest` (streaming runtime), not Python.

## Notes

- `say` is macOS-only. To generate data on Linux, swap `say` for Piper TTS in `gen_data.py`;
  the rest is unchanged. (The trained model runs anywhere, it's the data-gen that needs macOS.)
