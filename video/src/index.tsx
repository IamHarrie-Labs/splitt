import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Sequence,
  continueRender,
  delayRender,
  registerRoot,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import timeline from '../public/timeline.json';
import { B, SceneProvider, TOTAL, c, display, font, inOut, mix, pop, prog, pulse } from './kit';
import { SCENES } from './scenes';

const WIPE = 9; // frames the colour bars take to cover, and again to uncover, each cut
const BARS = [
  [c.volt, c.coral, c.violet],
  [c.ink, c.volt, c.coral],
  [c.violet, c.ink, c.volt],
  [c.coral, c.violet, c.ink],
];
const QUIET = new Set(['hook', 'isolation']); // no kick, so no beat punch
const DARK = new Set(['hook', 'sign', 'remainder', 'proof', 'isolation']);

/** Three skewed colour bars sweep across every cut, hiding it. */
function Wipes() {
  const frame = useCurrentFrame();
  return (
    <>
      {timeline.sections.slice(1).map((s, k) => {
        const local = frame - s.from;
        if (local < -WIPE - 6 || local > WIPE + 6) return null;
        const dir = k % 2 ? -1 : 1;
        return BARS[k % BARS.length].map((color, i) => {
          const cover = prog(local, -WIPE - 6 + i * 3, WIPE, inOut);
          const leave = prog(local, i * 3, WIPE, inOut);
          const x = mix(-1.3, 0, cover) + mix(0, 1.3, leave);
          return (
            <div
              key={`${s.id}-${i}`}
              style={{
                position: 'absolute',
                top: -200,
                height: 1480,
                left: -300,
                width: 2520,
                background: color,
                transform: `translateX(${dir * x * 2520}px) skewX(-14deg)`,
                zIndex: 50 + i,
              }}
            />
          );
        });
      })}
    </>
  );
}

type Line = { from: number; to: number; words: { w: string; from: number; to: number }[] };

/** Captions that light up word by word, broken into short chunks. */
function Captions() {
  const frame = useCurrentFrame();
  const lines = Object.values(timeline.lines as Record<string, Line>);
  const line = lines.find((l) => frame >= l.from - 4 && frame <= l.to + 10);
  if (!line) return null;
  const chunks: Line['words'][] = [];
  for (const w of line.words) {
    const last = chunks[chunks.length - 1];
    if (!last || last.length >= 6 || last.map((x) => x.w).join(' ').length + w.w.length > 32)
      chunks.push([w]);
    else last.push(w);
  }
  const chunk = [...chunks].reverse().find((ch) => frame >= ch[0].from - 4) ?? chunks[0];
  const enter = pop(frame, chunk[0].from - 4, 300);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 64,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: '14px 30px',
          borderRadius: 20,
          background: 'rgba(11,11,15,.88)',
          ...display,
          letterSpacing: '-0.01em',
          fontSize: 50,
          transform: `scale(${mix(0.85, 1, enter)})`,
        }}
      >
        {chunk.map((w, i) => {
          const active = frame >= w.from && frame < w.to + 2;
          const spoken = frame >= w.from;
          return (
            <span
              key={i}
              style={{
                color: active ? c.volt : spoken ? c.white : 'rgba(255,255,255,.45)',
                transform: `scale(${active ? 1.08 : 1})`,
                display: 'inline-block',
              }}
            >
              {w.w}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Hud() {
  const frame = useCurrentFrame();
  const s =
    timeline.sections.find((x) => frame >= x.from && frame < x.to) ??
    timeline.sections[timeline.sections.length - 1];
  const dark = DARK.has(s.id);
  const real = s.label.startsWith('Real');
  return (
    <>
      {s.id !== 'title' && s.id !== 'end' && (
        <div
          style={{
            position: 'absolute',
            left: 60,
            top: 40,
            ...display,
            fontSize: 40,
            color: dark ? c.white : c.ink,
            zIndex: 30,
          }}
        >
          splitt<span style={{ color: dark ? c.volt : c.coral }}>.</span>
        </div>
      )}
      {s.label && (
        <div
          style={{
            position: 'absolute',
            right: 60,
            top: 42,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 20px',
            borderRadius: 999,
            fontFamily: font.body,
            fontSize: 22,
            background: real ? c.volt : dark ? 'rgba(255,255,255,.12)' : 'rgba(11,11,15,.08)',
            color: real ? c.ink : dark ? c.white : c.ink,
            border: real
              ? 'none'
              : `2px solid ${dark ? 'rgba(255,255,255,.3)' : 'rgba(11,11,15,.25)'}`,
          }}
        >
          <i
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: real ? c.coral : 'currentColor',
              opacity: real ? 0.5 + 0.5 * Math.abs(Math.sin(frame / 8)) : 0.6,
            }}
          />
          {s.label}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 8,
          width: `${(100 * frame) / TOTAL}%`,
          background: c.coral,
          zIndex: 30,
        }}
      />
    </>
  );
}

const FONTS: [string, string, string, string][] = [
  ['Grotesk', 'grotesk-700.woff2', '700', 'normal'],
  ['Grotesk', 'grotesk-500.woff2', '500', 'normal'],
  ['Poppins', 'poppins.woff2', '400', 'normal'],
  ['Serif', 'serif-italic.woff2', '400', 'italic'],
];

function Film() {
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender('Loading Splitt fonts'));
  useEffect(() => {
    Promise.all(
      FONTS.map(([family, file, weight, style]) =>
        new FontFace(family, `url(${staticFile(file)})`, { weight, style })
          .load()
          .then((face) => document.fonts.add(face)),
      ),
    ).then(() => continueRender(handle));
  }, [handle]);
  const s = timeline.sections.find((x) => frame >= x.from && frame < x.to);
  const punch = s && !QUIET.has(s.id) ? 1 + 0.012 * pulse(frame, 0.3) : 1;
  return (
    <AbsoluteFill style={{ background: c.ink, fontFamily: font.body }}>
      <Audio src={staticFile('soundtrack.mp3')} />
      <AbsoluteFill style={{ transform: `scale(${punch})` }}>
        {timeline.sections.map((sec) => {
          const Scene = SCENES[sec.id as keyof typeof SCENES];
          return (
            <Sequence
              key={sec.id}
              from={sec.from}
              durationInFrames={sec.to - sec.from}
              premountFor={30}
            >
              <SceneProvider value={sec}>
                <Scene />
              </SceneProvider>
            </Sequence>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile('grain.png')})`,
          backgroundPosition: `${(Math.floor(frame / 2) * 137) % 384}px ${(Math.floor(frame / 2) * 251) % 384}px`,
          opacity: 0.045,
          mixBlendMode: 'overlay',
          zIndex: 20,
        }}
      />
      <Hud />
      <Captions />
      <Wipes />
    </AbsoluteFill>
  );
}

registerRoot(() => (
  <Composition
    id="SplittFilm"
    component={Film}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={TOTAL}
  />
));
export { B };
