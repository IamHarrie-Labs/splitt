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
import { BAR, SceneClock, TOTAL, c, font, inOut, prog } from './kit';
import { SCENES } from './scenes';

type Reveal = { kind: 'iris'; x: number; y: number } | { kind: 'split' } | { kind: 'cut' };
// How each section enters. Cuts land on the two impacts; iris and split ride the downbeat.
const REVEALS: Record<string, Reveal> = {
  open: { kind: 'cut' },
  problem: { kind: 'iris', x: 960, y: 600 },
  title: { kind: 'cut' },
  draft: { kind: 'iris', x: 1112, y: 520 },
  sign: { kind: 'split' },
  remainder: { kind: 'split' },
  isolation: { kind: 'split' },
  proof: { kind: 'cut' },
  end: { kind: 'iris', x: 960, y: 540 },
};
const LEAD = 20; // frames the incoming section spends opening over the outgoing one
const LIGHT = new Set(['problem', 'sign', 'end']);

function RevealFrame({ reveal, children }: { reveal: Reveal; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  if (reveal.kind === 'cut') return <>{children}</>;
  const p = prog(frame, 0, LEAD, inOut);
  if (p >= 1) return <>{children}</>;
  if (reveal.kind === 'iris') {
    return (
      <AbsoluteFill style={{ clipPath: `circle(${p * 150}% at ${reveal.x}px ${reveal.y}px)` }}>
        {children}
      </AbsoluteFill>
    );
  }
  const half = 50 * (1 - p);
  return (
    <>
      <AbsoluteFill style={{ clipPath: `inset(0 ${half}% 0 ${half}%)` }}>{children}</AbsoluteFill>
      {[50 - (50 - half), 50 + (50 - half)].map((x, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${x}%`,
            width: 2,
            background: c.glow,
            boxShadow: `0 0 30px ${c.sky}`,
            opacity: 1 - p,
          }}
        />
      ))}
    </>
  );
}

function Overlay() {
  const frame = useCurrentFrame();
  const bar = frame / BAR;
  const index = timeline.sections.findIndex((s) => bar >= s.from && bar < s.to);
  const section = timeline.sections[Math.max(0, index)];
  const light = LIGHT.has(section.id);
  const local = frame - section.from * BAR;
  const real = section.label.startsWith('Real');
  const ink = light ? c.ink : c.glow;
  const flashAt = timeline.sections
    .filter((s) => REVEALS[s.id].kind === 'cut' && s.from > 0)
    .map((s) => s.from * BAR);
  const flash = Math.max(0, ...flashAt.map((f) => (frame >= f ? 1 - (frame - f) / 14 : 0)));
  const hudIn = prog(frame, 50, 30);
  return (
    <>
      <AbsoluteFill style={{ background: c.glow, opacity: flash * 0.85, pointerEvents: 'none' }} />
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile('grain.png')})`,
          // Grain steps every other frame: still reads as film, and halves what the encoder must carry.
          backgroundPosition: `${(Math.floor(frame / 2) * 137) % 384}px ${(Math.floor(frame / 2) * 251) % 384}px`,
          opacity: light ? 0.035 : 0.05,
          mixBlendMode: light ? 'multiply' : 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(6,13,24,.42) 100%)',
          opacity: light ? 0.35 : 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 46,
          fontFamily: font.head,
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: '-0.04em',
          color: ink,
          opacity: section.id === 'title' || section.id === 'end' ? 0 : hudIn,
        }}
      >
        splitt.
      </div>
      {section.label && (
        <div
          style={{
            position: 'absolute',
            right: 140,
            top: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 20px',
            borderRadius: 999,
            border: `1.5px solid ${real ? c.sky : light ? c.rule : 'rgba(143,179,220,.4)'}`,
            background: real ? 'rgba(143,179,220,.16)' : 'transparent',
            fontFamily: font.body,
            fontSize: 20,
            color: light ? c.muted : c.ice,
            opacity: hudIn * prog(local, 0, 12),
          }}
        >
          <i
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: real ? c.sky : light ? c.accent : c.ice,
              opacity: real ? 0.5 + 0.5 * Math.abs(Math.sin(frame / 9)) : 0.7,
            }}
          />
          {section.label}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 140,
          right: 140,
          bottom: 40,
          display: 'flex',
          gap: 8,
          opacity: hudIn * 0.9,
        }}
      >
        {timeline.sections.map((s, i) => {
          const fill = Math.min(1, Math.max(0, (bar - s.from) / (s.to - s.from)));
          return (
            <div
              key={s.id}
              style={{
                flex: s.to - s.from,
                height: 3,
                borderRadius: 2,
                background: light ? 'rgba(22,35,55,.12)' : 'rgba(207,224,242,.14)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${fill * 100}%`,
                  height: '100%',
                  background: i === index ? (light ? c.accent : c.sky) : light ? c.muted : c.ice,
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

const FONTS: [string, string, string, string][] = [
  ['Grotesk', 'grotesk-500.woff2', '500', 'normal'],
  ['Grotesk', 'grotesk-700.woff2', '700', 'normal'],
  ['Poppins', 'poppins.woff2', '400', 'normal'],
  ['Serif', 'serif-italic.woff2', '400', 'italic'],
];

function Film() {
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
  return (
    <AbsoluteFill style={{ background: c.void, fontFamily: font.body }}>
      <Audio src={staticFile('score.wav')} />
      {timeline.sections.map((s) => {
        const Scene = SCENES[s.id as keyof typeof SCENES];
        const reveal = REVEALS[s.id];
        const lead = reveal.kind === 'cut' ? 0 : LEAD;
        return (
          <Sequence
            key={s.id}
            from={s.from * BAR - lead}
            durationInFrames={(s.to - s.from) * BAR + lead}
            premountFor={30}
          >
            <SceneClock value={lead}>
              <RevealFrame reveal={reveal}>
                <Scene />
              </RevealFrame>
            </SceneClock>
          </Sequence>
        );
      })}
      <Overlay />
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
