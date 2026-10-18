"""Synthesises the Splitt film score from video/public/timeline.json.

Every cue, drum section and sound effect is generated here from sine waves and
noise, so the soundtrack carries no third-party licence. Run with:

    python3 scripts/generate-video-score.py
"""

import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TIMELINE = json.loads((ROOT / "video/public/timeline.json").read_text())
OUT = ROOT / "video/public/score.wav"

SR = 48_000
BEAT = 60 / TIMELINE["bpm"]
BAR = 4 * BEAT
LENGTH = TIMELINE["bars"] * BAR
N = int(LENGTH * SR)
rng = np.random.default_rng(7)

left = np.zeros(N)
right = np.zeros(N)
send = np.zeros(N)  # mono reverb send


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def add(signal, start, gain=1.0, pan=0.0, verb=0.0):
    i = int(start * SR)
    if i >= N:
        return
    signal = signal[: N - i] * gain
    left[i : i + len(signal)] += signal * np.sqrt((1 - pan) / 2)
    right[i : i + len(signal)] += signal * np.sqrt((1 + pan) / 2)
    send[i : i + len(signal)] += signal * verb


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def in_bars(bar, ranges):
    return any(a <= bar < b for a, b in ranges)


# ---- harmony: a four-bar loop, voiced around D minor ----
CHORDS = [
    [50, 57, 60, 64, 65, 69],  # Dm9
    [46, 53, 57, 60, 62, 69],  # Bbmaj9
    [41, 57, 60, 64, 67, 72],  # Fmaj9
    [48, 55, 62, 64, 67, 69],  # C6/9
]
ROOTS = [38, 34, 41, 36]


def pad_note(freq, seconds, brightness):
    t = t_axis(seconds)
    out = np.zeros_like(t)
    for detune in (-0.0025, 0.0025):
        f = freq * (1 + detune)
        for h in range(1, 7):
            out += np.sin(2 * np.pi * f * h * t + h) / h ** (2.4 - brightness)
    attack = np.minimum(t / 0.7, 1)
    release = np.clip((seconds - t) / 0.9, 0, 1)
    return out * attack * release


PAD_LEVEL = {
    "open": (0.55, 0.3), "problem": (0.75, 0.5), "title": (0.9, 0.9),
    "draft": (0.7, 0.8), "sign": (0.7, 0.7), "remainder": (0.75, 0.8),
    "isolation": (1.0, 0.4), "proof": (0.75, 1.0), "end": (1.3, 0.7),
}


def section_at(bar):
    for s in TIMELINE["sections"]:
        if s["from"] <= bar < s["to"]:
            return s["id"]
    return "end"


for bar in range(TIMELINE["bars"]):
    level, bright = PAD_LEVEL[section_at(bar)]
    chord = CHORDS[bar % 4]
    hold = BAR + 0.9 if bar < TIMELINE["bars"] - 2 else 2 * BAR
    if bar == TIMELINE["bars"] - 1:
        continue  # the penultimate bar rings out through the last
    for k, note in enumerate(chord[1:]):
        add(pad_note(midi(note), hold, bright), bar * BAR, 0.016 * level,
            pan=(k - 2) * 0.28, verb=0.5)

# ---- rhythm sections ----
KICK_BARS = [(6, 10), (13, 31), (35, 46)]
HALF_KICK_BARS = [(4, 6)]
GROOVE_BARS = [(13, 31), (35, 46)]
ARP_BARS = [(13, 20), (26, 31), (35, 46)]

kick_t = t_axis(0.45)
kick = np.sin(2 * np.pi * (45 * kick_t + 90 / 28 * (1 - np.exp(-kick_t * 28))))
kick *= np.exp(-kick_t * 7.5)
kick += np.exp(-kick_t * 300) * rng.standard_normal(len(kick_t)) * 0.15

hat_t = t_axis(0.05)
hat_noise = np.diff(np.diff(rng.standard_normal(len(hat_t) + 2)))
hat = hat_noise * np.exp(-hat_t * 90)

clap_t = t_axis(0.3)
clap_noise = rng.standard_normal(len(clap_t))
clap_noise -= np.convolve(clap_noise, np.ones(12) / 12, mode="same")
clap_env = sum(np.exp(-np.maximum(clap_t - d, 0) * 60) * (clap_t >= d) for d in (0, 0.012, 0.024))
clap = clap_noise * clap_env * np.exp(-clap_t * 9)

duck = np.ones(N)
total_beats = int(TIMELINE["bars"] * 4)
for beat in range(total_beats):
    bar = beat / 4
    start = beat * BEAT
    full = in_bars(bar, KICK_BARS)
    half = in_bars(bar, HALF_KICK_BARS) and beat % 2 == 0
    if full or half:
        add(kick, start, (0.5 if bar < 10 else 0.85) if full else 0.4)
        i = int(start * SR)
        span = min(int(BEAT * SR), N - i)
        duck[i : i + span] *= 1 - 0.55 * np.exp(-np.arange(span) / SR * 9)
    if in_bars(bar, GROOVE_BARS):
        add(hat, start + BEAT / 2, 0.18, pan=0.35)
        if section_at(int(bar)) == "proof":
            add(hat, start + BEAT / 4, 0.07, pan=-0.35)
            add(hat, start + 3 * BEAT / 4, 0.07, pan=-0.35)
        if beat % 4 in (1, 3):
            add(clap, start, 0.32, verb=0.35)

# ---- sub bass, ducked by the kick ----
bass = np.zeros(N)
for bar in range(4, TIMELINE["bars"] - 2):
    if section_at(bar) == "isolation":
        continue
    f = midi(ROOTS[bar % 4])
    for off, length in ((0, 1.4), (2.5, 1.3)):
        t = t_axis(length * BEAT)
        note = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
        note *= np.minimum(t / 0.01, 1) * np.clip((length * BEAT - t) / 0.05, 0, 1)
        i = int((bar * BAR + off * BEAT) * SR)
        bass[i : i + len(t)] += note[: N - i] * 0.2
left += bass
right += bass

# ---- arpeggio plucks (sixteenths through the chord) ----
pluck_t = t_axis(0.35)
for bar in range(TIMELINE["bars"]):
    if not in_bars(bar, ARP_BARS):
        continue
    chord = CHORDS[bar % 4][2:]
    for step in range(16):
        note = chord[[0, 1, 2, 3, 2, 1, 3, 2][step % 8] % len(chord)] + 12
        f = midi(note)
        tone = (np.sin(2 * np.pi * f * pluck_t) + 0.3 * np.sin(6 * np.pi * f * pluck_t))
        tone *= np.exp(-pluck_t * (14 if step % 4 else 9))
        accent = 1.0 if step % 4 == 0 else 0.6
        add(tone, bar * BAR + step * BEAT / 4, 0.045 * accent,
            pan=0.5 if step % 2 else -0.5, verb=0.6)

# ---- risers into the two drops ----
for drop_bar, length in ((10, 2 * BAR), (35, BAR)):
    t = t_axis(length)
    swell = (t / length) ** 2.2
    noise = np.diff(rng.standard_normal(len(t) + 1)) * 0.35
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1800 * (t / length) ** 2) / SR) * 0.2
    add((noise + sweep) * swell, drop_bar * BAR - length, 0.3, verb=0.7)

# ---- downlifter into the breakdown ----
t = t_axis(BAR)
down = np.sin(2 * np.pi * np.cumsum(900 * np.exp(-t * 2) + 60) / SR) * np.exp(-t * 1.5)
add(down, 31 * BAR, 0.12, verb=0.8)


# ---- sound design cues ----
def sfx(kind, note=None):
    if kind == "tick":
        t = t_axis(0.06)
        return (np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120)
                + rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.3), 0.18, 0.2
    if kind == "drop":
        t = t_axis(1.2)
        f = 880 * np.exp(-t * 1.2) + 440
        tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
        thump = np.sin(2 * np.pi * 55 * t) * np.exp(-t * 9)
        return tone * 0.6 + thump, 0.32, 0.6
    if kind == "chime":
        t = t_axis(2.4)
        f = midi(note)
        mod = np.sin(2 * np.pi * f * 1.4 * t) * 2.2 * np.exp(-t * 3)
        return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.2), 0.13, 0.8
    if kind == "lock":
        t = t_axis(0.25)
        click = lambda d, f: np.sin(2 * np.pi * f * (t - d)) * np.exp(-np.maximum(t - d, 0) * 70) * (t >= d)
        return click(0, 1200) + click(0.07, 700), 0.3, 0.3
    if kind == "stamp":
        t = t_axis(0.8)
        body = np.sin(2 * np.pi * 70 * t) * np.exp(-t * 10)
        crack = rng.standard_normal(len(t)) * np.exp(-t * 45) * 0.6
        return body + crack, 0.45, 0.5
    if kind == "whoosh":
        t = t_axis(1.0)
        noise = np.diff(rng.standard_normal(len(t) + 1))
        env = np.sin(np.pi * np.clip(t / 1.0, 0, 1)) ** 3
        return noise * env, 0.16, 0.6
    if kind == "impact":
        t = t_axis(3.0)
        boom = np.sin(2 * np.pi * np.cumsum(30 + 50 * np.exp(-t * 6)) / SR) * np.exp(-t * 1.6)
        air = rng.standard_normal(len(t)) * np.exp(-t * 4) * 0.25
        return boom + air, 0.75, 0.9
    raise ValueError(kind)


for cue in TIMELINE["sfx"]:
    signal, gain, verb = sfx(cue["type"], cue.get("note"))
    add(signal, cue["beat"] * BEAT, gain, verb=verb)

# ---- mix: duck the sustained layers, add a long hall, master ----
left *= duck
right *= duck
ir_t = t_axis(2.8)
decay = np.exp(-ir_t * 2.4)
size = 1 << int(np.ceil(np.log2(N + len(ir_t))))
spectrum = np.fft.rfft(send, size)
for channel in (left, right):
    ir = rng.standard_normal(len(ir_t)) * decay
    ir[: int(0.02 * SR)] = 0  # pre-delay
    wet = np.fft.irfft(spectrum * np.fft.rfft(ir, size), size)[:N]
    channel += wet / np.max(np.abs(ir)) * 0.012

mix = np.stack([left, right], axis=1)
mix = np.tanh(mix * 1.1)
fade = np.clip((LENGTH - np.arange(N) / SR) / 2.0, 0, 1)[:, None]
fade_in = np.clip(np.arange(N) / SR / 0.05, 0, 1)[:, None]
mix *= fade * fade_in
mix /= np.max(np.abs(mix)) / 0.89

with wave.open(str(OUT), "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"Wrote {OUT.relative_to(ROOT)} · {LENGTH:.0f}s")
