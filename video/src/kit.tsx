import React, { createContext, useContext } from 'react';
import { Easing, interpolate, spring, useCurrentFrame } from 'remotion';
import timeline from '../public/timeline.json';

export const FPS = timeline.fps;
export const B = (60 / timeline.bpm) * FPS; // frames per beat
export const TOTAL = timeline.totalFrames;

export const c = {
  ink: '#0b0b0f',
  paper: '#f3efe6',
  volt: '#d7ff3b',
  coral: '#ff5533',
  violet: '#6a4cff',
  white: '#ffffff',
};

export const font = {
  head: 'Grotesk, sans-serif',
  body: 'Poppins, sans-serif',
  serif: 'Serif, serif',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const expo = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
// Settles without overshoot: motion arrives and stays still.
export const backOut = Easing.out(Easing.cubic);

/** 0→1 over `dur` frames from `start`, eased. */
export const prog = (f: number, start: number, dur: number, easing = expo) =>
  interpolate(f, [start, start + dur], [0, 1], { ...clamp, easing });
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const pop = (f: number, start: number, stiffness = 180) =>
  spring({ frame: f - start, fps: FPS, config: { damping: 30, stiffness, mass: 0.9 } });

type Section = (typeof timeline.sections)[number];
const SceneCtx = createContext<Section>(timeline.sections[0]);
export const SceneProvider = SceneCtx.Provider;
/** The scene's own clock: 0 on its first frame. */
export const useF = () => useCurrentFrame();
/** Local frame at which a narration line starts (or ends), so motion lands on the words. */
export function useCue() {
  const s = useContext(SceneCtx);
  const lines = timeline.lines as Record<
    string,
    { from: number; to: number; words: { w: string; from: number }[] }
  >;
  return {
    at: (id: string) => lines[id].from - s.from,
    end: (id: string) => lines[id].to - s.from,
    word: (id: string, w: string) =>
      (lines[id].words.find((x) => x.w.toLowerCase().startsWith(w.toLowerCase()))?.from ??
        lines[id].from) - s.from,
    length: s.to - s.from,
  };
}

/** Decays from 1 on every beat. */
export const pulse = (frame: number, rate = 0.2) => Math.exp(-((((frame % B) + B) % B) * rate));

/** Words slam in one at a time: scale down from big, unblur, slight spin. */
export function Slam({
  text,
  start,
  stagger = 4,
  style,
  colors = {},
  serif = [],
}: {
  text: string;
  start: number;
  stagger?: number;
  style?: React.CSSProperties;
  colors?: Record<string, string>;
  serif?: string[];
}) {
  const f = useF();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.22em', ...style }}>
      {text.split(' ').map((word, i) => {
        const p = pop(f, start + i * stagger, 220);
        const shown = f >= start + i * stagger;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: shown ? Math.min(1, p * 2) : 0,
              transform: `translateY(${(1 - p) * 40}px)`,
              filter: `blur(${Math.max(0, (1 - p) * 6)}px)`,
              color: colors[word] ?? undefined,
              ...(serif.includes(word)
                ? { fontFamily: font.serif, fontStyle: 'italic', fontWeight: 400 }
                : {}),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/** Characters rise out of a mask one by one. */
export function Rise({
  text,
  start,
  stagger = 1.5,
  style,
}: {
  text: string;
  start: number;
  stagger?: number;
  style?: React.CSSProperties;
}) {
  const f = useF();
  return (
    <div style={{ display: 'flex', ...style }}>
      {text.split('').map((ch, i) => {
        const p = prog(f, start + i * stagger, 18, backOut);
        return (
          <span
            key={i}
            style={{ display: 'inline-block', overflow: 'hidden', padding: '0.05em 0 0.12em' }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - p) * 110}%)`,
                whiteSpace: 'pre',
              }}
            >
              {ch}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function Count({
  from = 0,
  to,
  start,
  dur = 30,
  decimals = 0,
}: {
  from?: number;
  to: number;
  start: number;
  dur?: number;
  decimals?: number;
}) {
  const f = useF();
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {fmt(mix(from, to, prog(f, start, dur, inOut)), decimals)}
    </span>
  );
}

/** Camera: zoom and pan through keyframes [frame, scale, x, y]. */
export function Camera({
  keys,
  children,
}: {
  keys: [number, number, number, number][];
  children: React.ReactNode;
}) {
  const f = useF();
  const fr = keys.map((k) => k[0]);
  const at = (i: number) =>
    fr.length === 1
      ? keys[0][i]
      : interpolate(
          f,
          fr,
          keys.map((k) => k[i]),
          { ...clamp, easing: inOut },
        );
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translate(${at(2)}px, ${at(3)}px) scale(${at(1)})`,
        transformOrigin: '50% 50%',
      }}
    >
      {children}
    </div>
  );
}

/** Decaying random shake after `at`. */
export const shake = (f: number, at: number, amount = 18) => {
  const k = 0; // shakes are off: the cut stays still
  return `translate(${Math.sin(f * 2.7) * amount * k}px, ${Math.cos(f * 3.1) * amount * k}px)`;
};

/** Drifting geometric confetti for backgrounds: rings, dots, squiggles and stars. */
export function Shapes({
  seed = 1,
  colors,
  count = 10,
  opacity = 1,
}: {
  seed?: number;
  colors: string[];
  count?: number;
  opacity?: number;
}) {
  const f = useCurrentFrame();
  const r = (i: number, k: number) => {
    const x = Math.sin(seed * 97.13 + i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity }}>
      {Array.from({ length: count }, (_, i) => {
        const x = r(i, 1) * 1920 + Math.sin(f / (40 + r(i, 2) * 40) + i) * 30;
        const y = r(i, 3) * 1080 + Math.cos(f / (50 + r(i, 4) * 30) + i) * 30;
        const rot = f * (r(i, 5) - 0.5) * 2;
        const color = colors[i % colors.length];
        const s = 18 + r(i, 6) * 40;
        const kind = i % 4;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
            {kind === 0 && <circle r={s} fill="none" stroke={color} strokeWidth={6} />}
            {kind === 1 && <circle r={s / 3} fill={color} />}
            {kind === 2 && (
              <path
                d={`M${-s} 0 q ${s / 2} ${-s / 2} ${s} 0 t ${s} 0`}
                fill="none"
                stroke={color}
                strokeWidth={6}
                strokeLinecap="round"
              />
            )}
            {kind === 3 && (
              <path
                d={`M0 ${-s / 2} L${s / 7} ${-s / 7} L${s / 2} 0 L${s / 7} ${s / 7} L0 ${s / 2} L${-s / 7} ${s / 7} L${-s / 2} 0 L${-s / 7} ${-s / 7} Z`}
                fill={color}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A confetti burst from (x, y) at frame `at`, with gravity. */
export function Confetti({
  x,
  y,
  at,
  colors,
  count = 70,
}: {
  x: number;
  y: number;
  at: number;
  colors: string[];
  count?: number;
}) {
  const f = useF();
  const t = (f - at) / FPS;
  if (t < 0 || t > 3) return null;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + i;
        const v = 500 + ((i * 37) % 11) * 90;
        const px = x + Math.cos(a) * v * t;
        const py = y + Math.sin(a) * v * t * 0.9 + 900 * t * t;
        return (
          <rect
            key={i}
            x={px}
            y={py}
            width={14}
            height={8 + (i % 3) * 6}
            fill={colors[i % colors.length]}
            transform={`rotate(${f * (8 + (i % 7)) + i * 40} ${px} ${py})`}
            opacity={1 - t / 3}
          />
        );
      })}
    </svg>
  );
}

/** A scrolling strip of repeated text. */
export function Marquee({
  text,
  y,
  speed,
  bg,
  color,
  rotate = 0,
  size = 46,
}: {
  text: string;
  y: number;
  speed: number;
  bg: string;
  color: string;
  rotate?: number;
  size?: number;
}) {
  const f = useCurrentFrame();
  const unit = `${text}  ·  `;
  return (
    <div
      style={{
        position: 'absolute',
        left: -200,
        width: 2320,
        top: y,
        background: bg,
        color,
        transform: `rotate(${rotate}deg)`,
        overflow: 'hidden',
        padding: '14px 0',
        fontFamily: font.head,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ transform: `translateX(${(-(f * speed) % 1400) - 1400}px)` }}>
        {unit.repeat(12)}
      </div>
    </div>
  );
}

export const Abs = ({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) => <div style={{ position: 'absolute', ...style }}>{children}</div>;

export const display: React.CSSProperties = {
  fontFamily: font.head,
  fontWeight: 700,
  letterSpacing: '-0.045em',
  lineHeight: 0.95,
};
