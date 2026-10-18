# Splitt hackathon walkthrough

The prepared source renders `out/splitt-hackathon-demo-final.mp4`, a 160-second, 1920×1080 H.264 walkthrough with AAC narration. It reflects the public website/API, confirmed Circle-executed Arc Testnet payouts, the hosted Haiku draft and the honest zero-business-pilot status as of 18 October 2026.

This is a captured-UI and motion-graphics walkthrough. Synthetic allocation screens are labelled. Public transaction figures are controlled test evidence and are never presented as customer traction. The video contains no keys, personal account screens or private wallet data.

```powershell
npm ci --prefix video
powershell -ExecutionPolicy Bypass -File scripts/prepare-video-audio.ps1
node scripts/generate-video-captions.mjs
npm run render --prefix video
```

The companion `public/captions.srt` uses approximate word timing. Narration length is checked against each 20-second scene. The current environment could bundle the composition but could not open Remotion's browser over its local debugging socket, so the final MP4 and frame review remain pending.
