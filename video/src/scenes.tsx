import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import {
  Atmosphere,
  B,
  BAR,
  Check,
  Count,
  Flow,
  H,
  Scramble,
  Sphere,
  Words,
  c,
  expo,
  font,
  inOut,
  mix,
  prog,
  pulse,
  useF,
} from './kit';

const Dark = ({
  children,
  tint,
  beat,
}: {
  children: React.ReactNode;
  tint?: string;
  beat?: number;
}) => (
  <AbsoluteFill style={{ background: c.void, overflow: 'hidden' }}>
    <Atmosphere tint={tint} beat={beat} />
    {children}
  </AbsoluteFill>
);

const Light = ({ children }: { children: React.ReactNode }) => {
  const f = useF();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${30 + Math.sin(f / 120) * 8}% 20%, ${c.surface} 0%, ${c.pearl} 52%, #e2e9f0 100%)`,
        overflow: 'hidden',
        color: c.ink,
      }}
    >
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        {Array.from({ length: 13 }, (_, i) => (
          <line
            key={i}
            x1={i * 160}
            x2={i * 160}
            y1={0}
            y2={1080}
            stroke={c.rule}
            strokeWidth={1}
          />
        ))}
      </svg>
      {children}
    </AbsoluteFill>
  );
};

/* 01 · A single drop of USDC lands. */
export function Open() {
  const f = useF();
  const fall = interpolate(f, [8, 60], [-60, 600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const line = prog(f, 60, 50, inOut);
  const landed = f >= 60;
  return (
    <Dark tint="#0f2744">
      <div
        style={{
          position: 'absolute',
          left: 959,
          top: fall - 260,
          width: 2,
          height: 260,
          background: `linear-gradient(transparent, ${c.sky})`,
          opacity: landed ? Math.max(0, 1 - (f - 60) / 10) : 0.7,
        }}
      />
      {[0, 9, 18].map((d) => {
        const p = prog(f, 60 + d, 70, Easing.out(Easing.cubic));
        return (
          <div
            key={d}
            style={{
              position: 'absolute',
              left: 960 - p * 520,
              top: 600 - p * 70,
              width: p * 1040,
              height: p * 140,
              borderRadius: '50%',
              border: `1.5px solid ${c.sky}`,
              opacity: landed ? (1 - p) * 0.7 : 0,
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          top: 600,
          left: 960 - line * 800,
          width: line * 1600,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${c.sky}, transparent)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 960 - 9,
          top: fall - 9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: c.glow,
          boxShadow: `0 0 ${30 + (landed ? 30 * pulse(f, 0.08) : 0)}px ${c.sky}`,
        }}
      />
      <H
        style={{
          top: 340,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          fontSize: 150,
          color: c.glow,
        }}
      >
        <Words text="A client paid part." start={8 * B} stagger={B} serif={['part.']} />
      </H>
      <div
        style={{
          position: 'absolute',
          top: 660,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: font.body,
          fontSize: 38,
          color: c.ice,
          opacity: 0.85,
        }}
      >
        <Words text="The work still has to move." start={12 * B} stagger={2} />
      </div>
    </Dark>
  );
}

/* 02 · The invoice, the cash that arrived, and the reserve that stays put. */
export function Problem() {
  const f = useF();
  const x0 = 160,
    w = 1600,
    y = 470,
    h = 116;
  const fill = prog(f, 3 * B + 4, 44, inOut) * 0.6;
  const lockP = prog(f, 10 * B, 18);
  const lift = Math.sin(Math.min(1, Math.max(0, (f - 10 * B) / 16)) * Math.PI) * -16;
  const people = [
    { name: 'Amara', role: 'Design lead', owed: 700, at: 16 * B },
    { name: 'Tobi', role: 'Developer', owed: 500, at: 17 * B },
  ];
  return (
    <Light>
      <H style={{ left: 160, top: 150, fontSize: 76, color: c.ink }}>
        <Words text="An invoice for 2,000 USDC." start={4} serif={['2,000']} />
      </H>
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y - 52,
          width: w,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: font.body,
          fontSize: 24,
          color: c.muted,
          opacity: prog(f, 14, 20),
        }}
      >
        <span>Northstar · brand launch</span>
        <span>
          Received{' '}
          <b style={{ color: c.ink, fontFamily: font.head, fontWeight: 500 }}>
            <Count to={1200} start={3 * B + 4} dur={44} />
          </b>{' '}
          of 2,000
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y,
          width: w,
          height: h,
          borderRadius: h / 2,
          border: `2px dashed ${c.rule}`,
          opacity: prog(f, 10, 20),
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y,
          width: w * fill,
          height: h,
          borderRadius: h / 2,
          overflow: 'hidden',
          background: `linear-gradient(90deg, ${c.deep}, ${c.accent})`,
          boxShadow: `0 24px 60px rgba(24,58,96,.25)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(100deg, transparent ${((f * 1.4) % 160) - 40}%, rgba(255,255,255,.28) ${((f * 1.4) % 160) - 25}%, transparent ${((f * 1.4) % 160) - 10}%)`,
          }}
        />
      </div>
      {/* reserve: the first 300 lifts, hatches and locks */}
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y + lift,
          width: w * 0.15,
          height: h,
          borderRadius: `${h / 2}px 0 0 ${h / 2}px`,
          background: `repeating-linear-gradient(-45deg, ${c.ink} 0 10px, ${c.deep} 10px 20px)`,
          opacity: lockP,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: c.glow,
          fontFamily: font.head,
          fontSize: 30,
          gap: 12,
        }}
      >
        <svg width={26} height={30} viewBox="0 0 26 30">
          <rect x={2} y={13} width={22} height={16} rx={3} fill={c.glow} />
          <path
            d={`M7 13 V9 a6 6 0 0 1 12 0 V${mix(4, 13, prog(f, 10 * B + 4, 10))}`}
            fill="none"
            stroke={c.glow}
            strokeWidth={3}
          />
        </svg>
        300
      </div>
      <div
        style={{
          position: 'absolute',
          left: x0 + w * 0.15 + 30,
          top: y + 34,
          fontFamily: font.head,
          fontSize: 40,
          color: c.glow,
          opacity: prog(f, 11 * B, 16),
        }}
      >
        900 available
      </div>
      <div
        style={{
          position: 'absolute',
          left: x0 + w * 0.6 + 34,
          top: y + 36,
          fontFamily: font.body,
          fontSize: 28,
          color: c.muted,
          opacity: prog(f, 12 * B, 16),
        }}
      >
        800 still owed by the client
      </div>
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y + h + 22,
          fontFamily: font.body,
          fontSize: 24,
          color: c.deep,
          opacity: prog(f, 10 * B + 8, 16),
        }}
      >
        Reserve · stays in the vault
      </div>
      {people.map((p, i) => {
        const s = prog(f, p.at, 22);
        const waiting = 0.4 + 0.6 * pulse(f, 0.12);
        return (
          <div
            key={p.name}
            style={{
              position: 'absolute',
              left: x0 + i * 520,
              top: 760 + (1 - s) * 40,
              opacity: s,
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              fontFamily: font.body,
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                background: c.surface,
                border: `2px solid ${c.rule}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.head,
                fontSize: 34,
                color: c.deep,
              }}
            >
              {p.name[0]}
            </div>
            <div>
              <div style={{ fontFamily: font.head, fontSize: 38, color: c.ink }}>
                {p.name} · owed {p.owed}
              </div>
              <div
                style={{
                  fontSize: 24,
                  color: c.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <i
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: c.accent,
                    opacity: waiting,
                  }}
                />
                {p.role} · waiting
              </div>
            </div>
          </div>
        );
      })}
      <H style={{ right: 160, top: 900, fontSize: 64, color: c.deep }}>
        <Words
          text="Who gets paid, and how much?"
          start={20 * B}
          stagger={2}
          serif={['how', 'much?']}
        />
      </H>
    </Light>
  );
}

/* 03 · Title drop: the wordmark literally splits and snaps back together. */
export function Title() {
  const f = useF();
  const snap = prog(f, 0, 26);
  const sphere = prog(f, 0, 50);
  const halves = [
    { clip: 'inset(0 0 50% 0)', dx: -140 },
    { clip: 'inset(50% 0 0 0)', dx: 140 },
  ];
  return (
    <Dark tint="#123a63" beat={1}>
      <Sphere
        size={mix(380, 640, sphere)}
        x={960}
        y={520}
        spin={f * 1.4}
        glow={0.6 + 0.4 * pulse(f)}
        style={{ opacity: sphere * 0.9 }}
      />
      {halves.map((h, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 345,
            width: 1920,
            textAlign: 'center',
            fontFamily: font.head,
            fontWeight: 700,
            fontSize: 290,
            letterSpacing: '-0.06em',
            color: c.glow,
            clipPath: h.clip,
            transform: `translateX(${h.dx * (1 - snap)}px)`,
            textShadow: '0 20px 80px rgba(6,13,24,.6)',
          }}
        >
          splitt<span style={{ color: c.sky }}>.</span>
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          top: 519,
          left: 960 - 900 * (1 - snap),
          width: 1800 * (1 - snap) + 1,
          height: 2,
          background: c.glow,
          opacity: 1 - snap,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 760,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: font.body,
          fontSize: 42,
          color: c.ice,
        }}
      >
        <Words
          text="Payment plans with a reason behind every amount."
          start={2 * B}
          stagger={2}
          serif={['reason']}
        />
      </div>
    </Dark>
  );
}

/* 04 · The agent drafts the split; deterministic checks tick on the beat. */
export function Draft() {
  const f = useF();
  const src: [number, number] = [420, 560];
  const toA: [number, number] = [1330, 400];
  const toT: [number, number] = [1330, 720];
  const flowStart = 2 * B;
  const flowEnd = 10 * B;
  const checks = [
    'Reserve held',
    'Recipients eligible',
    'Within caps',
    'Evidence attached',
    'Current state',
  ];
  const stamp = prog(f, 24 * B, 10, Easing.out(Easing.back(2)));
  const nodes = [
    { at: toA, name: 'Amara', amount: 700, note: 'Paid in full' },
    { at: toT, name: 'Tobi', amount: 200, note: 'Partial · permitted by terms' },
  ];
  return (
    <Dark tint="#123a63" beat={1}>
      <H style={{ left: 140, top: 110, fontSize: 74, color: c.glow }}>
        <Words text="The agent drafts the split." start={0} serif={['split.']} />
      </H>
      <Flow
        pts={[
          [src[0] + 120, src[1]],
          [800, src[1]],
          [960, toA[1]],
          [toA[0] - 84, toA[1]],
        ]}
        draw={B}
        flowFrom={flowStart}
        flowTo={flowEnd}
        count={22}
      />
      <Flow
        pts={[
          [src[0] + 120, src[1]],
          [800, src[1]],
          [960, toT[1]],
          [toT[0] - 84, toT[1]],
        ]}
        draw={B + 6}
        flowFrom={flowStart + 10}
        flowTo={flowEnd - 30}
        count={8}
      />
      <Sphere size={240} x={src[0]} y={src[1]} spin={f * 1.2} glow={0.4 + 0.6 * pulse(f)}>
        <div style={{ fontFamily: font.head, fontSize: 62, color: c.glow, fontWeight: 500 }}>
          <Count from={900} to={0} start={flowStart + 6} dur={flowEnd - flowStart - 10} />
        </div>
        <div style={{ fontFamily: font.body, fontSize: 20, color: c.ice }}>available</div>
      </Sphere>
      {nodes.map((n, i) => {
        const s = prog(f, B * (1 + i), 24);
        const got = f > flowStart + 40;
        return (
          <div
            key={n.name}
            style={{
              position: 'absolute',
              left: n.at[0] - 80,
              top: n.at[1] - 80,
              display: 'flex',
              alignItems: 'center',
              gap: 34,
              opacity: s,
            }}
          >
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: '50%',
                border: `2px solid ${got ? c.sky : 'rgba(143,179,220,.35)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.head,
                fontSize: 56,
                color: c.glow,
                boxShadow: got ? `0 0 ${40 + 40 * pulse(f)}px rgba(143,179,220,.35)` : 'none',
              }}
            >
              {n.name[0]}
            </div>
            <div>
              <div style={{ fontFamily: font.body, fontSize: 26, color: c.ice }}>{n.name}</div>
              <div style={{ fontFamily: font.head, fontSize: 76, color: c.glow, lineHeight: 1.05 }}>
                <Count
                  to={n.amount}
                  start={flowStart + 30 + i * 10}
                  dur={flowEnd - flowStart - 40}
                />
              </div>
              <div
                style={{
                  fontFamily: font.body,
                  fontSize: 22,
                  color: c.sky,
                  opacity: prog(f, 8 * B + i * 6, 16),
                }}
              >
                {n.note}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 140, top: 900, display: 'flex', gap: 22 }}>
        {checks.map((label, i) => {
          const on = (12 + 2 * i) * B;
          const lit = f >= on;
          return (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 26px 14px 16px',
                borderRadius: 999,
                border: `1.5px solid ${lit ? c.sky : 'rgba(143,179,220,.25)'}`,
                background: lit ? 'rgba(143,179,220,.12)' : 'transparent',
                fontFamily: font.body,
                fontSize: 24,
                color: lit ? c.glow : 'rgba(207,224,242,.5)',
                opacity: prog(f, 10 * B + i * 4, 16),
              }}
            >
              <Check on={on} />
              {label}
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 860,
          fontFamily: font.body,
          fontSize: 22,
          color: c.sky,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: prog(f, 10 * B, 16),
        }}
      >
        Deterministic validator · independent of the model
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1180,
          top: 120,
          padding: '20px 34px',
          border: `3px solid ${c.glow}`,
          borderRadius: 14,
          fontFamily: font.head,
          fontSize: 40,
          color: c.glow,
          transform: `rotate(-5deg) scale(${mix(1.8, 1, stamp)})`,
          opacity: Math.min(1, stamp * 1.4),
          background: 'rgba(6,13,24,.55)',
        }}
      >
        Ready for owner review
      </div>
    </Dark>
  );
}

/* 05 · The owner signs exactly what will move, then Circle and Arc carry it out. */
export function Sign() {
  const f = useF();
  const rows: [string, string][] = [
    ['vault', '0x724c…c6c6'],
    ['plan', 'northstar · draft 1'],
    ['pay[0]', 'Amara · 700 USDC'],
    ['pay[1]', 'Tobi · 200 USDC'],
    ['expiry', '30 minutes'],
  ];
  const compress = prog(f, 8 * B, 24, inOut);
  const sig = prog(f, 9 * B, 36, inOut);
  const steps = ['Signature checked', 'Circle executes', 'Arc settles', 'Reconciled from chain'];
  const rail = prog(f, 16 * B, 6 * B, (x) => x);
  return (
    <Light>
      <H style={{ left: 140, top: 110, fontSize: 74, color: c.ink }}>
        <Words text="The owner signs the exact batch." start={0} serif={['exact']} />
      </H>
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 270,
          width: 820,
          height: 600,
          background: c.surface,
          border: `1px solid ${c.rule}`,
          borderRadius: 12,
          boxShadow: '0 30px 80px rgba(24,58,96,.12)',
          opacity: prog(f, 4, 20),
          transform: `translateY(${(1 - prog(f, 4, 26)) * 30}px)`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '30px 40px',
            borderBottom: `1px solid ${c.rule}`,
            fontFamily: font.body,
            fontSize: 22,
            color: c.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          EIP-712 typed data · ProjectVault
        </div>
        <div
          style={{
            padding: '26px 40px',
            transform: `scaleY(${1 - compress * 0.85})`,
            transformOrigin: 'top',
            opacity: 1 - compress,
            filter: `blur(${compress * 6}px)`,
          }}
        >
          {rows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: 'flex',
                fontFamily: font.head,
                fontSize: 34,
                lineHeight: '62px',
                opacity: prog(f, B + i * 6, 12),
              }}
            >
              <span style={{ width: 170, color: c.accent }}>{k}</span>
              <span style={{ color: c.ink }}>
                <Scramble text={v} start={B + i * 6} dur={14} />
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 170,
            fontFamily: font.head,
            fontSize: 30,
            color: c.deep,
            opacity: compress,
          }}
        >
          <Scramble text="digest 0x5e1d…9b07 · signature 0x3f9a…e21c" start={8 * B + 10} dur={20} />
        </div>
        <svg width={740} height={200} style={{ position: 'absolute', left: 40, top: 280 }}>
          <path
            d="M10 130 C 60 40, 90 40, 110 120 S 160 170, 190 90 S 240 30, 260 120 S 320 150, 350 80 C 370 40, 400 60, 410 110 S 470 150, 520 90 S 600 70, 720 110"
            fill="none"
            stroke={c.deep}
            strokeWidth={4}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${sig} 1`}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 40,
            bottom: 34,
            fontFamily: font.body,
            fontSize: 26,
            color: c.muted,
            opacity: prog(f, 12 * B, 16),
          }}
        >
          Signed in the owner’s own wallet
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1180,
          top: 300,
          width: 3,
          height: 3 * 150,
          background: c.rule,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1180,
          top: 300,
          width: 3,
          height: 3 * 150 * rail,
          background: c.deep,
        }}
      />
      {steps.map((s, i) => {
        const on = (16 + 2 * i) * B;
        const lit = f >= on;
        const ring = lit ? Math.max(0, 1 - (f - on) / 20) : 0;
        return (
          <div
            key={s}
            style={{
              position: 'absolute',
              left: 1160,
              top: 280 + i * 150,
              display: 'flex',
              alignItems: 'center',
              gap: 36,
              opacity: prog(f, 14 * B + i * 4, 16),
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: lit ? c.deep : c.surface,
                border: `3px solid ${lit ? c.deep : c.rule}`,
                boxShadow: `0 0 0 ${ring * 22}px rgba(69,108,152,${ring * 0.25})`,
              }}
            />
            <div>
              <div style={{ fontFamily: font.head, fontSize: 42, color: lit ? c.ink : c.muted }}>
                {s}
              </div>
              <div style={{ fontFamily: font.body, fontSize: 22, color: c.muted }}>
                {
                  [
                    'Vault, plan, order and expiry must match',
                    'Developer-controlled operator wallet',
                    'Deterministic finality, no confirmations',
                    'Durable job, checked before any retry',
                  ][i]
                }
              </div>
            </div>
          </div>
        );
      })}
    </Light>
  );
}

/* 06 · New cash, fresh plan; the first authorization can't count twice. */
export function Remainder() {
  const f = useF();
  const fall = interpolate(f, [0, 2 * B], [-40, 300], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const landed = f >= 2 * B;
  const topUp = prog(f, 8 * B, 30, inOut);
  const stamp = prog(f, 12 * B, 10, Easing.out(Easing.back(2)));
  const balance = f < 8 * B ? mix(300, 1100, prog(f, 2 * B, 26, inOut)) : mix(1100, 800, topUp);
  const rows = [
    { name: 'Amara', paid: 700, owed: 700, note: 'Complete · skipped', dim: true },
    {
      name: 'Tobi',
      paid: mix(200, 500, topUp),
      owed: 500,
      note: f >= 8 * B ? '+300 · now complete' : 'Owed 300 more',
      dim: false,
    },
  ];
  return (
    <Dark tint="#0f2744" beat={1}>
      <H style={{ left: 140, top: 110, fontSize: 74, color: c.glow }}>
        <Words text="Then the rest arrives." start={0} serif={['rest']} />
      </H>
      <div
        style={{
          position: 'absolute',
          left: 1530 - 9,
          top: fall - 9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: c.glow,
          boxShadow: `0 0 40px ${c.sky}`,
          opacity: 1 - prog(f, 2 * B, 12),
        }}
      />
      {[0, 8].map((d) => {
        const p = prog(f, 2 * B + d, 50, Easing.out(Easing.cubic));
        return (
          <div
            key={d}
            style={{
              position: 'absolute',
              left: 1530 - p * 220,
              top: 300 - p * 40,
              width: p * 440,
              height: p * 80,
              borderRadius: '50%',
              border: `1.5px solid ${c.sky}`,
              opacity: landed ? 1 - p : 0,
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 1330,
          top: 340,
          width: 400,
          textAlign: 'center',
          fontFamily: font.head,
          fontSize: 58,
          color: c.glow,
          opacity: prog(f, 2 * B, 14),
        }}
      >
        +800 USDC
      </div>
      {rows.map((r, i) => (
        <div
          key={r.name}
          style={{
            position: 'absolute',
            left: 140,
            top: 330 + i * 170,
            width: 1000,
            opacity: prog(f, 6 + i * 6, 18) * (r.dim ? 0.55 : 1),
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontFamily: font.head,
              color: c.glow,
            }}
          >
            <span style={{ fontSize: 46 }}>{r.name}</span>
            <span style={{ fontSize: 46, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(r.paid)} / {r.owed}
            </span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 5,
              background: 'rgba(143,179,220,.18)',
              marginTop: 16,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(100 * r.paid) / r.owed}%`,
                background: `linear-gradient(90deg, ${c.accent}, ${c.sky})`,
              }}
            />
          </div>
          <div style={{ fontFamily: font.body, fontSize: 24, color: c.sky, marginTop: 14 }}>
            {r.note}
          </div>
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 720,
          width: 1000,
          borderTop: '1px solid rgba(143,179,220,.3)',
          paddingTop: 30,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          opacity: prog(f, 20, 18),
        }}
      >
        <span style={{ fontFamily: font.body, fontSize: 28, color: c.ice }}>
          Northstar vault balance
        </span>
        <span
          style={{
            fontFamily: font.head,
            fontSize: 84,
            color: c.glow,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(balance).toLocaleString('en-US')}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1320,
          top: 520,
          width: 420,
          padding: '30px 34px',
          borderRadius: 12,
          border: '1px solid rgba(143,179,220,.35)',
          background: 'rgba(11,24,41,.7)',
          fontFamily: font.body,
          color: c.ice,
          opacity: prog(f, 4 * B, 18),
        }}
      >
        <div
          style={{
            fontSize: 20,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: c.sky,
          }}
        >
          Authorization 1
        </div>
        <div
          style={{
            fontFamily: font.head,
            fontSize: 32,
            marginTop: 14,
            color: c.glow,
            textDecoration: f >= 12 * B ? 'line-through' : 'none',
          }}
        >
          Amara 700 · Tobi 200
        </div>
        <div
          style={{
            position: 'absolute',
            right: -18,
            top: -26,
            padding: '8px 18px',
            border: `3px solid ${c.glow}`,
            borderRadius: 10,
            fontFamily: font.head,
            fontSize: 30,
            color: c.glow,
            transform: `rotate(-8deg) scale(${mix(2, 1, stamp)})`,
            opacity: Math.min(1, stamp * 1.4),
            background: c.void,
          }}
        >
          Used
        </div>
        <div style={{ fontSize: 24, marginTop: 18, opacity: prog(f, 13 * B, 16) }}>
          It can’t count twice.
        </div>
      </div>
    </Dark>
  );
}

/* 07 · Breakdown: two vaults, and a line between them that never opens. */
export function Isolation() {
  const f = useF();
  const reach = prog(f, 3 * B, 5 * B, inOut);
  const hit = f >= 8 * B;
  const retract = prog(f, 8 * B, 24, inOut);
  const flash = hit ? Math.max(0, 1 - (f - 8 * B) / 24) : 0;
  const tip = mix(1260, 980, reach) + retract * 280;
  return (
    <Dark tint="#0c2340">
      <H
        style={{
          top: 120,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          fontSize: 74,
          color: c.glow,
        }}
      >
        <Words text="Each project keeps its own cash." start={4} serif={['own']} />
      </H>
      <Sphere
        size={380}
        x={560}
        y={570}
        spin={f * 0.8}
        glow={0.5}
        style={{ opacity: prog(f, 10, 30) }}
      >
        <div style={{ fontFamily: font.head, fontSize: 70, color: c.glow }}>800</div>
        <div style={{ fontFamily: font.body, fontSize: 24, color: c.ice }}>Northstar</div>
      </Sphere>
      <Sphere
        size={380}
        x={1360}
        y={570}
        spin={-f * 0.8}
        glow={0.5}
        style={{ opacity: prog(f, 18, 30) }}
      >
        <div style={{ fontFamily: font.head, fontSize: 70, color: c.glow }}>1,000</div>
        <div style={{ fontFamily: font.body, fontSize: 24, color: c.ice }}>Fieldwork</div>
      </Sphere>
      <div
        style={{
          position: 'absolute',
          left: 958,
          top: 400,
          width: 4,
          height: 340,
          borderRadius: 2,
          background: c.glow,
          boxShadow: `0 0 ${20 + flash * 80}px ${c.sky}`,
          opacity: 0.35 + flash * 0.65,
        }}
      />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line
          x1={1180}
          y1={570}
          x2={Math.max(1180, tip)}
          y2={570}
          stroke={c.sky}
          strokeWidth={3}
          strokeDasharray="10 12"
          opacity={reach * (1 - retract)}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 860,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: font.serif,
          fontStyle: 'italic',
          fontSize: 58,
          color: c.ice,
        }}
      >
        <Words text="Never borrowed. Never mixed." start={9 * B} stagger={3} />
      </div>
    </Dark>
  );
}

/* 08 · Proof: real Arc Testnet transactions, labelled for what they are. */
export function Proof() {
  const f = useF();
  const stats = [
    { n: 3, d: 0, label: 'controlled vaults' },
    { n: 4, d: 0, label: 'Circle-executed batches' },
    { n: 2.4, d: 1, label: 'test USDC paid out' },
  ];
  const txs = [
    ['Batch 1 payout', '0x938ea7d6370c06d25daf6c73493e5c43f304abf9938563b7bd934325edaebdc5'],
    ['Batch 2 payout', '0x098fa70efda77e5f22396521bce7d5ccdeb3bbbaab8997e9ae8551a0ceb32881'],
    ['Remainder payout', '0xde2ce4f47108ab118ef30b7dd835b7da7dae60ed7b83504ead5011acddd35c6d'],
    ['Circle receipt', '0x39d42d99caea9eeb2e7ab39db2464139bb7e8a42639caf5902a19c0356bbba4f'],
  ];
  return (
    <Dark tint="#123a63" beat={1}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 0.18 }}>
        {Array.from({ length: 25 }, (_, i) => (
          <line
            key={i}
            x1={i * 80 - ((f * 0.6) % 80)}
            x2={i * 80 - ((f * 0.6) % 80)}
            y1={0}
            y2={1080}
            stroke={c.sky}
            strokeWidth={1}
          />
        ))}
      </svg>
      <H style={{ left: 140, top: 110, fontSize: 74, color: c.glow }}>
        <Words text="Live on Arc Testnet." start={0} serif={['Live']} />
      </H>
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 200,
          fontFamily: font.body,
          fontSize: 26,
          color: c.ice,
          opacity: prog(f, 12, 16),
        }}
      >
        Controlled tests run by the team · recorded 14–18 October 2026
      </div>
      <div style={{ position: 'absolute', left: 140, top: 300, display: 'flex', gap: 120 }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ opacity: prog(f, B + i * 6, 16) }}>
            <div
              style={{
                fontFamily: font.head,
                fontSize: 150,
                color: c.glow,
                lineHeight: 1,
                letterSpacing: '-0.04em',
              }}
            >
              <Count to={s.n} start={B + i * 6} dur={40} decimals={s.d} />
            </div>
            <div style={{ fontFamily: font.body, fontSize: 26, color: c.sky, marginTop: 10 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 140, top: 590, width: 1640 }}>
        {txs.map(([label, hash], i) => {
          const at = (12 + 2 * i) * B;
          return (
            <div
              key={hash}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 40,
                padding: '16px 0',
                borderTop: '1px solid rgba(143,179,220,.22)',
                opacity: prog(f, at - 4, 12),
              }}
            >
              <span style={{ width: 260, fontFamily: font.body, fontSize: 24, color: c.sky }}>
                {label}
              </span>
              <span
                style={{
                  fontFamily: font.head,
                  fontSize: 27,
                  color: c.glow,
                  letterSpacing: '0.01em',
                }}
              >
                <Scramble text={hash} start={at} dur={20} />
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 940,
          fontFamily: font.body,
          fontSize: 24,
          color: c.ice,
          opacity: prog(f, 21 * B, 16),
        }}
      >
        Verified contract 0x724c12be…c6c6 · Sourcify exact match · controlled test wallets, not
        customers · verified business pilots: 0
      </div>
    </Dark>
  );
}

/* 09 · Resolve on the wordmark; the closing drop loops back to the opening frame. */
export function End() {
  const f = useF();
  const s = prog(f, 0, 60);
  const out = prog(f, 22 * B, 2 * B, inOut);
  const fall = interpolate(f, [20 * B, 23 * B], [-60, 600], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  return (
    <Light>
      <Sphere
        size={mix(420, 560, s)}
        x={960}
        y={440}
        light
        spin={f * 0.9}
        glow={0.5}
        style={{ opacity: s }}
      />
      <div
        style={{
          position: 'absolute',
          top: 330,
          width: 1920,
          textAlign: 'center',
          fontFamily: font.head,
          fontWeight: 700,
          fontSize: 230,
          letterSpacing: '-0.06em',
          color: c.ink,
          opacity: prog(f, 4, 20),
          transform: `scale(${mix(1.08, 1, prog(f, 4, 40))})`,
        }}
      >
        splitt<span style={{ color: c.accent }}>.</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 700,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: font.serif,
          fontStyle: 'italic',
          fontSize: 66,
          color: c.deep,
        }}
      >
        <Words text="Every amount has a reason." start={2 * B} stagger={3} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 840,
          width: 1920,
          textAlign: 'center',
          fontFamily: font.head,
          fontSize: 44,
          color: c.accent,
          opacity: prog(f, 5 * B, 20),
        }}
      >
        usesplitt.xyz
      </div>
      <div
        style={{
          position: 'absolute',
          top: 910,
          width: 1920,
          textAlign: 'center',
          fontFamily: font.body,
          fontSize: 26,
          color: c.muted,
          opacity: prog(f, 6 * B, 20),
        }}
      >
        Live on Arc Testnet · USDC · Circle developer-controlled wallets
      </div>
      <AbsoluteFill style={{ background: c.void, opacity: out }} />
      <div
        style={{
          position: 'absolute',
          left: 951,
          top: fall - 9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: c.glow,
          boxShadow: `0 0 30px ${c.sky}`,
          opacity: f >= 20 * B && f < 23 * B ? 1 : 0,
        }}
      />
    </Light>
  );
}

export const SCENES = {
  open: Open,
  problem: Problem,
  title: Title,
  draft: Draft,
  sign: Sign,
  remainder: Remainder,
  isolation: Isolation,
  proof: Proof,
  end: End,
};
export { BAR, expo };
