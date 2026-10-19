"""Narrates video/public/script.json with Kokoro and lays out the film's timeline.

Writes video/public/voice.mp3 (the narration, already placed in time),
video/public/timeline.json (scene and line timings in frames, with estimated
word timings for captions) and video/public/captions.srt for video hosts.

    pip install kokoro-onnx soundfile
    python3 scripts/generate-video-voice.py

The Kokoro model (Apache-2.0) is downloaded once into ~/.cache/splitt-kokoro.
"""

import json
import math
import subprocess
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "video/public"
SCRIPT = json.loads((PUBLIC / "script.json").read_text())
CACHE = Path.home() / ".cache/splitt-kokoro"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"

FPS = 30
BPM = 120
SNAP = 2 * 60 / BPM  # scenes end on every second beat, so cuts land on the grid
LEAD, TAIL, GAP = 0.55, 0.75, 0.32


def model():
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        if not (CACHE / name).exists():
            print(f"Downloading {name}…")
            urllib.request.urlretrieve(RELEASE + name, CACHE / name)
    from kokoro_onnx import Kokoro

    return Kokoro(str(CACHE / "kokoro-v1.0.onnx"), str(CACHE / "voices-v1.0.bin"))


def trim(audio, sr, floor=0.01):
    loud = np.flatnonzero(np.abs(audio) > floor)
    if not len(loud):
        return audio
    pad = int(0.03 * sr)
    return audio[max(0, loud[0] - pad) : loud[-1] + pad]


def word_times(text, start, end):
    """Spread words across the line by length; good enough to light captions word by word."""
    words = text.split()
    weights = np.array([len(w.strip(".,?!:;")) + 2.5 for w in words], dtype=float)
    edges = start + (end - start) * np.concatenate([[0], np.cumsum(weights) / weights.sum()])
    return [{"w": w, "from": round(edges[i] * FPS), "to": round(edges[i + 1] * FPS)} for i, w in enumerate(words)]


def srt_time(seconds):
    ms = round(seconds * 1000)
    return f"{ms // 3_600_000:02}:{ms // 60_000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


kokoro = model()
clips, sections, lines = [], [], {}
cursor = 0.0
for scene in SCRIPT["scenes"]:
    start = cursor
    t = start + LEAD
    for line in scene["lines"]:
        audio, sr = kokoro.create(line["text"], voice=SCRIPT["voice"], speed=SCRIPT["speed"], lang="en-us")
        audio = trim(np.asarray(audio, dtype=np.float32), sr)
        duration = len(audio) / sr
        caption = line.get("caption", line["text"])
        clips.append((t, audio, sr))
        lines[line["id"]] = {
            "scene": scene["id"],
            "from": round(t * FPS),
            "to": round((t + duration) * FPS),
            "caption": caption,
            "words": word_times(caption, t, t + duration),
        }
        t += duration + line.get("gap", GAP)
    end = start + math.ceil((t - start + TAIL) / SNAP) * SNAP
    sections.append({"id": scene["id"], "label": scene["label"], "from": round(start * FPS), "to": round(end * FPS)})
    cursor = end

total = cursor
sr = clips[0][2]
track = np.zeros(int(total * sr) + sr)
for t, audio, _ in clips:
    i = int(t * sr)
    track[i : i + len(audio)] += audio
track = track[: int(total * sr)]
track *= 0.92 / np.max(np.abs(track))

wav = CACHE / "voice.wav"
import soundfile

soundfile.write(wav, track, sr)
subprocess.run(
    ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-b:a", "128k", str(PUBLIC / "voice.mp3")],
    check=True,
)

timeline = {"fps": FPS, "bpm": BPM, "totalFrames": round(total * FPS), "sections": sections, "lines": lines}
(PUBLIC / "timeline.json").write_text(json.dumps(timeline, indent=1) + "\n")

srt = []
for n, line in enumerate(lines.values(), 1):
    srt += [str(n), f"{srt_time(line['from'] / FPS)} --> {srt_time(line['to'] / FPS)}", line["caption"], ""]
(PUBLIC / "captions.srt").write_text("\n".join(srt))
print(f"Narration {total:.1f}s across {len(sections)} scenes and {len(lines)} lines.")
