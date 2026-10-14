# Splitt walkthrough draft

`out/splitt-walkthrough-draft.mp4`: 160 seconds (2:40), 1920×1080 H.264 with AAC narration. Rendered locally with Remotion 4.0.535. Allocation and proof frames were visually inspected; narration files all fit their 20-second scenes. Audio uses local Windows speech, not a paid voice service.

This is a captured-UI and motion-graphics walkthrough, not a continuous screen recording or final submission video. It labels the deterministic synthetic simulation and pending chain/model/pilot evidence. Replace the pending segment after confirmed contractor payouts and actual pilot use, add public URLs, and record the live review/signing flow before submission.

```sh
npm ci --prefix video
npm run render --prefix video
```

Run scripts/prepare-video-audio.ps1 on Windows to regenerate narration after editing public/scenes.json. Then run `node scripts/generate-video-captions.mjs` for the companion SRT. Caption word timing is approximate. Fonts and captured assets are local; private keys and account screens are absent.
