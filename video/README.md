# Splitt film

A 96-second, 1920×1080 motion-design film, cut to an original 120 BPM score. Every scene, transition and sound cue is placed on the beat grid in `public/timeline.json`. The visuals and the score generator both read that file, so a change there moves picture and sound together.

The story follows one drop of USDC. A client pays part of an invoice, the reserve locks, the agent drafts a split and deterministic checks tick on the beat. The owner signs the exact batch, Circle and Arc carry it out, and the remainder arrives and is replanned without counting twice. Two vaults stay separate. The closing drop loops back into the opening frame.

Labelling is strict. Every scene showing the Northstar example carries an **Illustrative example** badge. Only the proof scene is badged **Real · Arc Testnet**. It shows the actual transaction hashes from `docs/testnet-payout-proof.json` and `docs/circle-execution-proof.json`, and says plainly that they come from controlled test wallets and that there are zero verified business pilots.

```sh
npm ci --prefix video
npm run score --prefix video      # regenerates public/score.wav from the timeline (Python 3 + NumPy)
npm run render --prefix video     # writes out/splitt-film.mp4
```

The score is synthesised from sine waves and noise in `scripts/generate-video-score.py`, so it carries no third-party licence. Fonts are Space Grotesk, Poppins and Source Serif 4, all under the SIL Open Font License (licence files are alongside them in `public/`). In a container without Remotion's browser, add `--browser-executable=<path to chrome-headless-shell>` to the render command.
