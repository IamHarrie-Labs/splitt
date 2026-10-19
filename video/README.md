# Splitt film

A 91-second motion-design film with narration, an original pop track and word-by-word captions. It uses bold flat colour (black, electric lime, coral, violet, off-white), slamming kinetic type, camera zooms, colour-bar wipes on every cut and confetti.

The narration drives everything. `public/script.json` holds the lines. `scripts/generate-video-voice.py` narrates them with Kokoro, a local neural text-to-speech model (Apache-2.0, voice `af_heart`), and lays the scenes out on a 120 BPM beat grid in `public/timeline.json`. It also writes `public/captions.srt` for video hosts. Every animation that matters is cued from the timing of a line or a word, so the motion lands on what is being said. `scripts/generate-video-score.py` then synthesises the pop track, adds sound effects and mixes it with the voice into `public/soundtrack.mp3`. The music ducks under the voice by about 7 dB.

Labelling is strict. The Maya, Leo and Northstar scenes are badged **Illustrative example**. Only the proof scene is badged **Real · Arc Testnet**: its numbers and scrolling transaction hashes come from `docs/testnet-payout-proof.json` and `docs/circle-execution-proof.json`, and it states that there are no paying customers yet.

```sh
npm ci --prefix video
pip install kokoro-onnx soundfile numpy scipy
npm run voice --prefix video      # narration, timeline, captions (downloads Kokoro once)
npm run score --prefix video      # pop track, sound effects and final mix
npm run render --prefix video     # writes out/splitt-film.mp4
```

To change the voice, set `"voice"` in `public/script.json` (for example `am_michael` or `bf_emma`) and rerun `voice` and `score`. The fonts are Space Grotesk, Poppins and Source Serif 4, all under the SIL Open Font License. In a container without Remotion's browser, add `--browser-executable=<path to chrome-headless-shell>` to the render command.
