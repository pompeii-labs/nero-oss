#!/usr/bin/env python3
"""
Generate the training corpus for the "Hey Nero" wakeword using macOS `say` (184 free
voices), fully local. Positives are the phrase across many voices + speaking rates;
negatives are phonetically-near phrases, varied random speech, and noise/silence.

Output: data/positives/*.wav, data/negatives/*.wav (16 kHz mono s16).
"""
import os
import subprocess
import shutil
import random
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
POS = os.path.join(DATA, "positives")
NEG = os.path.join(DATA, "negatives")

WAKE = "hey nero"

# The near-homophones that most confuse the model (nero vs neo/nemo/narrow). Generated
# heavily across every voice + rate so it learns the fine boundary.
VERY_HARD = [
    "hey neo", "hey nemo", "hey narrow", "hey neon", "hey nearo", "hey neuro",
    "hey new row", "hey miro", "hey nero's", "hey narrow oh", "hey neo oh",
]

# Standalone words that share nero's vowels/consonants but are NOT the wakeword (no
# "hey nero"). These stop the model firing on the "-ero/-eer/-ear" sound alone.
CONFUSABLES = [
    "hero", "spear", "zero", "nero", "near", "hear", "here", "ear", "deer", "dear",
    "career", "sincere", "narrow", "arrow", "borrow", "sorrow", "neo", "nemo", "neon",
    "gyro", "mirror", "error", "terror", "spero", "nearo", "we're here", "nero's",
    "the hero saved the day", "throw the spear", "zero to sixty", "come over here",
    "he's my hero", "a broken mirror", "we're almost there",
]

# Other phonetically-close phrases to reject.
HARD_NEGATIVES = [
    "hey neo", "hey nemo", "hey narrow", "hey hero", "hey nero's",
    "hey neil", "hey miro", "hey zero", "hey nair", "a narrow road",
    "the hero", "nero", "hey there", "hey now", "hey siri", "hey google",
    "okay nero later", "hey no", "hey Nina", "hey Noah",
]

# Varied everyday speech as general negatives.
RANDOM_NEGATIVES = [
    "what time is it", "turn off the lights", "play some music", "how's the weather today",
    "set a timer for five minutes", "what's on my calendar", "send a message to mom",
    "the quick brown fox jumps over the lazy dog", "I need to buy groceries later",
    "let's meet at noon tomorrow", "can you help me with this", "the meeting is at three",
    "remind me to call the dentist", "it's a beautiful day outside", "where did I put my keys",
    "the flight leaves at seven", "add milk to the shopping list", "what's the score",
    "turn up the volume please", "good morning everyone", "see you later", "thanks so much",
    "that sounds great to me", "I'll be there in ten minutes", "close the garage door",
    "how much does it cost", "open the front door", "start the coffee maker",
    "read me the news", "call an uber", "what's for dinner", "lock the back door",
    "he ran a narrow race", "the emperor was named after him", "zero to sixty",
]


def voices():
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    en = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        name, locale = parts[0], parts[1]
        if locale.startswith("en_"):
            en.append(name)
    return en


def synth(text, voice, rate, path):
    aiff = path + ".aiff"
    r = subprocess.run(["say", "-v", voice, "-r", str(rate), text, "-o", aiff],
                       capture_output=True)
    if r.returncode != 0 or not os.path.exists(aiff):
        return False
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, path],
                   capture_output=True)
    os.remove(aiff)
    return os.path.exists(path)


def noise_clip(path, kind, seconds=1.6):
    n = int(16000 * seconds)
    if kind == "silence":
        x = np.random.randn(n).astype(np.float32) * 0.0008  # near-silent room tone
    elif kind == "white":
        x = np.random.randn(n).astype(np.float32) * 0.05
    else:  # pink-ish
        w = np.random.randn(n).astype(np.float32)
        x = np.convolve(w, np.ones(64) / 64, mode="same") * 0.08
    x = np.clip(x, -1, 1)
    sf.write(path, (x * 32767).astype(np.int16), 16000, subtype="PCM_16")


def main():
    for d in (POS, NEG):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)

    vs = voices()
    print(f"{len(vs)} English voices")
    rates = [140, 160, 180, 200, 220]  # more rates -> better recall across speaking speeds
    random.seed(7)

    npos = 0
    for v in vs:
        for r in rates:
            if synth(WAKE, v, r, os.path.join(POS, f"pos_{v}_{r}.wav")):
                npos += 1
    print(f"positives: {npos}")

    nneg = 0
    for v in vs:
        # The near-homophones, heavily (every voice x 3 rates) so the fine boundary is learned.
        for text in VERY_HARD:
            for r in (150, 180, 210):
                slug = "".join(c for c in text if c.isalnum())[:16]
                if synth(text, v, r, os.path.join(NEG, f"hard_{v}_{slug}_{r}.wav")):
                    nneg += 1
        # Standalone confusables (hero/spear/zero/...) so the vowel sound alone won't fire.
        for text in CONFUSABLES:
            for r in (150, 190):
                slug = "".join(c for c in text if c.isalnum())[:16]
                if synth(text, v, r, os.path.join(NEG, f"hard_{v}_{slug}_{r}.wav")):
                    nneg += 1
        # Other hard negatives across every voice + rate.
        for text in HARD_NEGATIVES:
            for r in (160, 200):
                slug = "".join(c for c in text if c.isalnum())[:16]
                if synth(text, v, r, os.path.join(NEG, f"hard_{v}_{slug}_{r}.wav")):
                    nneg += 1
        # a sample of everyday speech as easy negatives
        for text in random.sample(RANDOM_NEGATIVES, 5):
            slug = "".join(c for c in text if c.isalnum())[:16]
            if synth(text, v, random.choice(rates), os.path.join(NEG, f"neg_{v}_{slug}.wav")):
                nneg += 1
    for i in range(60):
        noise_clip(os.path.join(NEG, f"noise_{i}.wav"), ["silence", "white", "pink"][i % 3])
        nneg += 1
    print(f"negatives: {nneg}")


if __name__ == "__main__":
    main()
