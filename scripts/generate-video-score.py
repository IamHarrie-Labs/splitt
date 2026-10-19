"""Builds the film's soundtrack: an original pop track, sound effects and the narration.

Reads video/public/timeline.json and video/public/voice.mp3 (both written by
generate-video-voice.py) and writes video/public/soundtrack.mp3. Every
instrument is synthesised here, so the music carries no third-party licence.
The music ducks under the voice automatically.

    pip install numpy scipy
    python3 scripts/generate-video-score.py
"""

import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "video/public"
TL = json.loads((PUBLIC / "timeline.json").read_text())

SR = 48_000
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]
BAR = 4 * BEAT
LENGTH = TL["totalFrames"] / FPS
N = int(LENGTH * SR)
rng = np.random.default_rng(11)
L, R = np.zeros(N), np.zeros(N)
SECTIONS = [(s["id"], s["from"] / FPS, s["to"] / FPS) for s in TL["sections"]]
CUE = {k: v["from"] / FPS for k, v in TL["lines"].items()}


def section_at(t):
    for sid, a, b in SECTIONS:
        if a <= t < b:
            return sid
    return SECTIONS[-1][0]


# How much of the band plays in each scene. The title and proof scenes are the drops.
ENERGY = {
    "hook": {"kick": 0, "clap": 0, "hat": 0, "bass": 0, "chords": 0.6, "lead": 0, "arp": 1},
    "problem": {"kick": 1, "clap": 0, "hat": 0.6, "bass": 1, "chords": 0.7, "lead": 0, "arp": 0},
    "title": {"kick": 1, "clap": 1, "hat": 1, "bass": 1, "chords": 1, "lead": 1, "arp": 0},
    "draft": {"kick": 1, "clap": 1, "hat": 1, "bass": 1, "chords": 0.8, "lead": 0, "arp": 1},
    "sign": {"kick": 1, "clap": 1, "hat": 1, "bass": 1, "chords": 0.8, "lead": 0, "arp": 0},
    "remainder": {"kick": 1, "clap": 1, "hat": 0.6, "bass": 1, "chords": 0.8, "lead": 0, "arp": 1},
    "isolation": {"kick": 0, "clap": 0, "hat": 0, "bass": 0, "chords": 1, "lead": 0, "arp": 0},
    "proof": {"kick": 1, "clap": 1, "hat": 1, "bass": 1, "chords": 1, "lead": 1, "arp": 1},
    "end": {"kick": 1, "clap": 1, "hat": 1, "bass": 1, "chords": 1, "lead": 1, "arp": 0},
}


def lvl(t, part):
    return ENERGY[section_at(t)][part]


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def taxis(sec):
    return np.arange(int(sec * SR)) / SR


def place(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or gain == 0:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    R[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


def lp(x, hz, order=2):
    return signal.sosfilt(signal.butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return signal.sosfilt(signal.butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi):
    return signal.sosfilt(signal.butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


def saw(f, t, phase=0.0):
    return signal.sawtooth(2 * np.pi * f * t + phase)


# Am – F – C – G, the four chords half of pop is built on.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]


def supersaw(notes, sec, bright):
    t = taxis(sec)
    out = np.zeros_like(t)
    for n in notes:
        for d in (-0.011, -0.005, 0, 0.005, 0.011):
            out += saw(midi(n + 12) * (1 + d), t, rng.uniform(0, 6.28))
    out = lp(out, 1800 + 3500 * bright)
    env = np.minimum(t / 0.01, 1) * np.exp(-t * 2.2) * 0.6 + 0.4 * np.exp(-t * 0.6)
    return out * env / len(notes) / 5


def pluck(n, sec=0.4):
    t = taxis(sec)
    tone = saw(midi(n), t) + 0.5 * saw(midi(n) * 2.003, t)
    return lp(tone, 4200) * np.exp(-t * 11)


bars = int(np.ceil(LENGTH / BAR))
for bar in range(bars):
    t0 = bar * BAR
    chord, root = CHORDS[bar % 4], ROOTS[bar % 4]
    # chords: off-beat stabs in the grooves, long swells in the hook and breakdown
    c = lvl(t0, "chords")
    sid = section_at(t0)
    if sid in ("hook", "isolation"):
        place(supersaw(chord, BAR + 0.3, 0.2), t0, 0.5 * c, pan=-0.2)
        place(supersaw(chord, BAR + 0.3, 0.2), t0 + 0.004, 0.5 * c, pan=0.2)
    else:
        for b in range(4):
            stab = supersaw(chord, 0.32, 0.9)
            place(stab, t0 + b * BEAT + BEAT / 2, 0.75 * c, pan=-0.25)
            place(stab, t0 + b * BEAT + BEAT / 2 + 0.006, 0.75 * c, pan=0.25)
    # bass: octave-bouncing eighths
    if lvl(t0, "bass"):
        for e in range(8):
            n = root - 12 + (12 if e % 2 else 0)
            tt = taxis(BEAT / 2)
            note = lp(saw(midi(n), tt) + np.sin(2 * np.pi * midi(n) * tt), 520)
            place(note * np.minimum(tt / 0.004, 1) * np.exp(-tt * 3), t0 + e * BEAT / 2, 0.32)
    # arpeggio sparkle
    if lvl(t0, "arp"):
        for s in range(16):
            n = chord[[0, 1, 2, 1][s % 4]] + 24
            place(pluck(n, 0.25), t0 + s * BEAT / 4, 0.05 * (1.3 if s % 4 == 0 else 1), pan=0.6 if s % 2 else -0.6)

# lead hook: a two-bar motif in A minor pentatonic, answered on the second pass
MOTIF = [(0, 69, 0.5), (0.5, 72, 0.5), (1, 76, 0.75), (2, 74, 0.5), (2.5, 72, 0.5), (3, 69, 1),
         (4, 67, 0.5), (4.5, 69, 0.5), (5, 72, 0.75), (6, 76, 0.5), (6.5, 79, 0.5), (7, 76, 1)]
for bar in range(0, bars, 2):
    t0 = bar * BAR
    if not lvl(t0, "lead"):
        continue
    for beat, n, dur in MOTIF:
        tt = taxis(dur * BEAT + 0.15)
        f = midi(n + 12)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * tt) * np.minimum(tt / 0.2, 1)
        phase = 2 * np.pi * np.cumsum(f * vib) / SR
        tone = signal.square(phase, 0.3) * 0.5 + np.sin(phase)
        tone = lp(tone, 3800) * np.minimum(tt / 0.008, 1) * np.clip((dur * BEAT + 0.15 - tt) / 0.12, 0, 1)
        place(tone, t0 + beat * BEAT, 0.07, pan=0.1)

# drums
kt = taxis(0.4)
kick = np.sin(2 * np.pi * (48 * kt + 110 / 30 * (1 - np.exp(-kt * 30)))) * np.exp(-kt * 8)
kick += hp(rng.standard_normal(len(kt)), 3000) * np.exp(-kt * 250) * 0.3
ct = taxis(0.25)
clap_env = sum(np.exp(-np.maximum(ct - d, 0) * 70) * (ct >= d) for d in (0, 0.011, 0.022))
clap = bp(rng.standard_normal(len(ct)), 900, 3200) * clap_env * np.exp(-ct * 12) * 1.6
ht = taxis(0.06)
hat = hp(rng.standard_normal(len(ht)), 7500) * np.exp(-ht * 70)
ohat = hp(rng.standard_normal(int(0.2 * SR)), 7000) * np.exp(-taxis(0.2) * 18)

duck = np.ones(N)
for beat in range(int(LENGTH / BEAT)):
    t = beat * BEAT
    if lvl(t, "kick"):
        place(kick, t, 0.9)
        i = int(t * SR)
        span = min(int(BEAT * SR), N - i)
        duck[i : i + span] *= 1 - 0.5 * np.exp(-np.arange(span) / SR * 10)
    if lvl(t, "clap") and beat % 2 == 1:
        place(clap, t, 0.45)
    if lvl(t, "hat"):
        place(ohat, t + BEAT / 2, 0.12 * lvl(t, "hat"), pan=0.3)
        place(hat, t + BEAT / 4, 0.06, pan=-0.3)
        place(hat, t + 3 * BEAT / 4, 0.06, pan=-0.3)

# risers into each drop, and a downlifter into the breakdown
for sid, a, _ in SECTIONS:
    if sid in ("title", "proof"):
        n = int(2 * BAR * SR)
        tt = np.arange(n) / SR
        sweep = hp(rng.standard_normal(n), 400) * (tt / tt[-1]) ** 2.5
        place(sweep, a - 2 * BAR, 0.18)
        tone = np.sin(2 * np.pi * np.cumsum(220 + 1600 * (tt / tt[-1]) ** 2) / SR) * (tt / tt[-1]) ** 2
        place(tone, a - 2 * BAR, 0.05)

# ---- sound effects, cued from the narration and the cuts ----
def fx(kind):
    if kind == "whoosh":
        t = taxis(0.7)
        return bp(rng.standard_normal(len(t)), 500, 6000) * np.sin(np.pi * t / 0.7) ** 2
    if kind == "impact":
        t = taxis(2.2)
        boom = np.sin(2 * np.pi * np.cumsum(32 + 70 * np.exp(-t * 7)) / SR) * np.exp(-t * 2)
        return boom + lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 5) * 0.5
    if kind == "pop":
        t = taxis(0.12)
        return np.sin(2 * np.pi * np.cumsum(300 + 900 * np.exp(-t * 60)) / SR) * np.exp(-t * 40)
    if kind == "ding":
        t = taxis(1.2)
        f = midi(88)
        return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 4)
    if kind == "coin":
        t = taxis(0.5)
        return (np.sin(2 * np.pi * midi(95) * t) * (t < 0.07) + np.sin(2 * np.pi * midi(100) * t) * (t >= 0.07)) * np.exp(-t * 7)
    if kind == "stamp":
        t = taxis(0.6)
        return np.sin(2 * np.pi * 65 * t) * np.exp(-t * 12) + lp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 30)
    raise ValueError(kind)


cues = [("whoosh", a - 0.25, 0.25) for sid, a, _ in SECTIONS[1:]]
cues += [("impact", a, 0.7) for sid, a, _ in SECTIONS if sid in ("title", "proof")]
cues += [("pop", CUE["hook1"], 0.3), ("pop", CUE["hook2"] + 0.5, 0.3), ("pop", CUE["p4"], 0.3)]
cues += [("ding", CUE[f"c{i}"], 0.22) for i in range(1, 6)]
cues += [("coin", CUE["d2"] + 0.1, 0.18), ("coin", CUE["d2"] + 1.4, 0.18), ("coin", CUE["r2"] + 1.5, 0.18)]
cues += [("stamp", CUE["r3"] + 0.9, 0.5), ("stamp", CUE["i2"] + 0.4, 0.45), ("ding", CUE["s3"], 0.15),
         ("ding", CUE["s4"], 0.15), ("ding", CUE["s5"], 0.15), ("pop", CUE["e1"], 0.35)]
sfx_L, sfx_R = np.zeros(N), np.zeros(N)
L_music, R_music = L.copy(), R.copy()
L[:], R[:] = 0, 0
for kind, t, g in cues:
    place(fx(kind), t, g)
sfx_L, sfx_R = L.copy(), R.copy()

# ---- narration, and the music ducking under it ----
with tempfile.TemporaryDirectory() as tmp:
    raw = Path(tmp) / "voice.raw"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(PUBLIC / "voice.mp3"), "-f", "f32le", "-ac", "1",
                    "-ar", str(SR), str(raw)], check=True)
    voice = np.fromfile(raw, dtype="<f4").astype(float)
voice = np.pad(voice, (0, max(0, N - len(voice))))[:N]
env = signal.sosfiltfilt(signal.butter(2, 6, "low", fs=SR, output="sos"), np.abs(voice))
under = 1 - 0.62 * np.clip(env / 0.05, 0, 1)

music_L, music_R = L_music * duck * under, R_music * duck * under
# a short room on the music so the stabs bloom
ir = rng.standard_normal(int(1.2 * SR)) * np.exp(-taxis(1.2) * 4)
size = 1 << int(np.ceil(np.log2(N + len(ir))))
for ch in (music_L, music_R):
    wet = np.fft.irfft(np.fft.rfft(ch, size) * np.fft.rfft(ir, size), size)[:N]
    ch += wet / np.max(np.abs(wet)) * np.max(np.abs(ch)) * 0.12

music_peak = max(np.max(np.abs(music_L)), np.max(np.abs(music_R)))
mix_L = music_L / music_peak * 0.45 + sfx_L * 0.8 + voice * 0.95
mix_R = music_R / music_peak * 0.45 + sfx_R * 0.8 + voice * 0.95
mix = np.tanh(np.stack([mix_L, mix_R], 1) * 1.05)
fade = np.clip((LENGTH - np.arange(N) / SR) / 1.2, 0, 1)[:, None]
mix = mix * fade / np.max(np.abs(mix)) * 0.94

with tempfile.TemporaryDirectory() as tmp:
    wav_path = Path(tmp) / "mix.wav"
    with wave.open(str(wav_path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((mix * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav_path), "-b:a", "256k",
                    str(PUBLIC / "soundtrack.mp3")], check=True)
print(f"Wrote video/public/soundtrack.mp3 · {LENGTH:.1f}s")
