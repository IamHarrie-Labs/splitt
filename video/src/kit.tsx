import React, { createContext, useContext } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import timeline from '../public/timeline.json';

export const FPS = timeline.fps;
export const B = (60 / timeline.bpm) * FPS; // frames per beat
export const BAR = 4 * B;
export const TOTAL = timeline.bars * BAR;

export const c = {
  void: '#060d18',
  night: '#0b1829',
  deep: '#183a60',
  accent: '#456c98',
  sky: '#8fb3dc',
  ice: '#cfe0f2',
  glow: '#e4f1ff',
  pearl: '#f0f3f6',
  surface: '#fbfcfe',
  ink: '#162337',
  muted: '#526176',
  rule: '#d4dce5',
};

export const font = {
  head: 'Grotesk, sans-serif',
  body: 'Poppins, sans-serif',
  serif: 'Serif, serif',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const expo = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 over `dur` frames from `start`, eased. */
export const prog = (f: number, start: number, dur: number, easing = expo) =>
  interpolate(f, [start, start + dur], [0, 1], { ...clamp, easing });
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Each scene reads its own clock, offset so beat 0 lands on its section boundary. */
const Offset = createContext(0);
export const SceneClock = Offset.Provider;
export const useF = () => useCurrentFrame() - useContext(Offset);

/** Decays from 1 on every beat; drives glow pulses that ride the kick. */
export const pulse = (f: number, rate = 0.18) => Math.exp(-((((f % B) + B) % B) * rate));

export function Words({
  text,
  start,
  stagger = 3,
  style,
  serif = [],
}: {
  text: string;
  start: number;
  stagger?: number;
  style?: React.CSSProperties;
  serif?: string[];
}) {
  const f = useF();
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.24em', ...style }}>
      {text.split(' ').map((word, i) => {
        const p = prog(f, start + i * stagger, 26);
        const isSerif = serif.includes(word);
        return (
          <span
            key={i}
            style={{ display: 'inline-block', overflow: 'hidden', padding: '0.06em 0 0.14em' }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - p) * 105}%) rotate(${(1 - p) * 7}deg)`,
                transformOrigin: 'left bottom',
                filter: `blur(${(1 - p) * 8}px)`,
                opacity: p > 0.001 ? 1 : 0,
                ...(isSerif
                  ? { fontFamily: font.serif, fontStyle: 'italic', fontWeight: 400 }
                  : {}),
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function Count({
  from = 0,
  to,
  start,
  dur = 40,
  decimals = 0,
}: {
  from?: number;
  to: number;
  start: number;
  dur?: number;
  decimals?: number;
}) {
  const f = useF();
  const v = mix(from, to, prog(f, start, dur, inOut));
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v, decimals)}</span>;
}

const HEX = '0123456789abcdef';
/** Text that resolves left-to-right out of hex noise. */
export function Scramble({ text, start, dur = 24 }: { text: string; start: number; dur?: number }) {
  const f = useF();
  if (f < start) return <span style={{ opacity: 0 }}>{text}</span>;
  const settled = Math.floor(prog(f, start, dur, (x) => x) * text.length);
  const out = text
    .split('')
    .map((ch, i) =>
      i < settled || ch === ' ' || ch === '·' || ch === '…' ? ch : HEX[(i * 7 + f * 3) % 16],
    )
    .join('');
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{out}</span>;
}

/** The brand's glass sphere, built from layered gradients with a slow travelling highlight. */
export function Sphere({
  size,
  x,
  y,
  light = false,
  spin = 0,
  glow = 0.5,
  children,
  style,
}: {
  size: number;
  x: number;
  y: number;
  light?: boolean;
  spin?: number;
  glow?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const body = light
    ? 'radial-gradient(circle at 34% 28%, #ffffff 0%, #eef5fc 18%, #c9dbee 46%, #8fb3dc 78%, #5e86b3 100%)'
    : 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.92) 0%, rgba(207,224,242,.55) 10%, rgba(143,179,220,.28) 32%, rgba(24,58,96,.62) 68%, rgba(6,13,24,.96) 100%)';
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: body,
        boxShadow: light
          ? `inset -18px -26px 60px rgba(24,58,96,.35), inset 10px 12px 30px rgba(255,255,255,.9), 0 40px 120px rgba(69,108,152,${0.25 + glow * 0.2})`
          : `inset -20px -30px 70px rgba(0,0,0,.55), inset 8px 10px 30px rgba(228,241,255,.35), 0 0 ${80 + glow * 140}px rgba(143,179,220,${0.18 + glow * 0.22})`,
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,.28) 40deg, transparent 90deg, transparent 200deg, rgba(143,179,220,.25) 250deg, transparent 300deg)',
          transform: `rotate(${spin}deg)`,
          mixBlendMode: 'screen',
          filter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '18%',
          top: '12%',
          width: '30%',
          height: '18%',
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,.85), transparent)',
          transform: 'rotate(-28deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export type Pt = [number, number];
export const bezier = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};

/** A path that draws itself, then carries a stream of glowing USDC drops along it. */
export function Flow({
  pts,
  draw,
  flowFrom,
  flowTo,
  count = 18,
  color = c.sky,
  dashed = false,
}: {
  pts: [Pt, Pt, Pt, Pt];
  draw: number;
  flowFrom: number;
  flowTo: number;
  count?: number;
  color?: string;
  dashed?: boolean;
}) {
  const f = useF();
  const [p0, p1, p2, p3] = pts;
  const d = `M${p0} C${p1} ${p2} ${p3}`;
  const drawn = prog(f, draw, 30, inOut);
  const span = flowTo - flowFrom;
  const drops = [];
  for (let i = 0; i < count; i++) {
    const t = (f - flowFrom - (i * span * 0.6) / count) / (span * 0.4);
    if (t <= 0 || t >= 1) continue;
    const [x, y] = bezier(p0, p1, p2, p3, inOut(t));
    const size = 5 + (i % 3) * 2;
    drops.push(
      <g key={i}>
        <circle cx={x} cy={y} r={size * 3.2} fill={color} opacity={0.12} />
        <circle cx={x} cy={y} r={size} fill={c.glow} />
      </g>,
    );
  }
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={2}
        pathLength={1}
        strokeDasharray={dashed ? '0.012 0.012' : `${drawn} 1`}
        strokeDashoffset={dashed ? -f * 0.002 : 0}
        opacity={dashed ? drawn : 1}
      />
      {drops}
    </svg>
  );
}

export function Check({
  on,
  size = 44,
  dark = true,
}: {
  on: number;
  size?: number;
  dark?: boolean;
}) {
  const f = useF();
  const p = prog(f, on, 14);
  const flash = Math.max(0, 1 - (f - on) / 18) * (f >= on ? 1 : 0);
  return (
    <svg width={size} height={size} viewBox="0 0 44 44">
      <circle
        cx={22}
        cy={22}
        r={20}
        fill={p > 0 ? (dark ? c.sky : c.deep) : 'none'}
        fillOpacity={p}
        stroke={dark ? c.sky : c.accent}
        strokeOpacity={0.6}
        strokeWidth={2}
      />
      <circle
        cx={22}
        cy={22}
        r={20 + flash * 14}
        fill="none"
        stroke={c.glow}
        strokeOpacity={flash * 0.8}
        strokeWidth={2}
      />
      <path
        d="M13 22.5 l6 6 l12 -13"
        fill="none"
        stroke={dark ? c.void : c.surface}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={`${prog(f, on + 3, 12)} 1`}
      />
    </svg>
  );
}

/** Soft drifting light for dark scenes; brightens on each kick. */
export function Atmosphere({ tint = c.deep, beat = 0 }: { tint?: string; beat?: number }) {
  const f = useCurrentFrame();
  const k = beat * pulse(f);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          width: 1400,
          height: 1400,
          left: 200 + Math.sin(f / 90) * 160,
          top: -500 + Math.cos(f / 110) * 90,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, ${tint}, transparent)`,
          opacity: 0.55 + k * 0.18,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1100,
          height: 1100,
          right: -300 + Math.cos(f / 80) * 120,
          bottom: -560 + Math.sin(f / 130) * 80,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, rgba(69,108,152,.55), transparent)`,
          opacity: 0.5 + k * 0.12,
        }}
      />
    </>
  );
}

export const H = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      position: 'absolute',
      fontFamily: font.head,
      fontWeight: 500,
      letterSpacing: '-0.035em',
      lineHeight: 1,
      ...style,
    }}
  >
    {children}
  </div>
);
