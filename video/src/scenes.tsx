import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import {
  Abs,
  B,
  Camera,
  Confetti,
  Count,
  Marquee,
  Rise,
  Shapes,
  Slam,
  backOut,
  c,
  display,
  expo,
  font,
  inOut,
  mix,
  pop,
  prog,
  pulse,
  shake,
  useCue,
  useF,
} from './kit';

const Bg = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <AbsoluteFill style={{ background: color, overflow: 'hidden' }}>{children}</AbsoluteFill>
);

const Avatar = ({
  letter,
  color,
  size = 120,
}: {
  letter: string;
  color: string;
  size?: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      color: c.white,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...display,
      fontSize: size * 0.48,
      border: `5px solid ${c.ink}`,
    }}
  >
    {letter}
  </div>
);

/* 01 · Hook: the client paid, then the invoice tears in two. */
export function Hook() {
  const f = useF();
  const q = useCue();
  const out = prog(f, q.at('hook2') - 4, 14, inOut);
  const tear = q.word('hook2', 'part');
  const card = pop(f, q.at('hook2'), 140);
  const fall = Math.max(0, f - tear) / 30;
  const zig = Array.from(
    { length: 9 },
    (_, i) => `${62 + (i % 2 ? 2.5 : -2.5)}% ${i * 12.5}%`,
  ).join(',');
  return (
    <Bg color={c.ink}>
      <Shapes seed={1} colors={[c.volt, c.coral, c.violet]} count={9} opacity={0.5} />
      <Camera
        keys={[
          [0, 1.02, 0, 0],
          [q.at('hook2'), 1, 0, 0],
          [q.length, 1.06, 0, 0],
        ]}
      >
        <Abs
          style={{
            top: 330,
            width: 1920,
            display: 'flex',
            justifyContent: 'center',
            transform: `translateY(${-out * 700}px)`,
            opacity: 1 - out,
          }}
        >
          <Slam
            text="Your client just paid."
            start={q.at('hook1')}
            stagger={6}
            colors={{ 'paid.': c.volt }}
            style={{ ...display, fontSize: 190, color: c.white }}
          />
        </Abs>
        <Abs
          style={{
            left: 960 - 520,
            top: 240,
            width: 1040,
            height: 520,
            transform: `translateY(${(1 - card) * 900}px) rotate(${mix(-14, -4, card)}deg)`,
          }}
        >
          {[0, 1].map((half) => (
            <div
              key={half}
              style={{
                position: 'absolute',
                inset: 0,
                background: half ? c.paper : c.volt,
                borderRadius: 26,
                padding: '54px 64px',
                color: c.ink,
                clipPath: half
                  ? `polygon(${zig}, 100% 100%, 100% 0)`
                  : `polygon(0 0, ${zig}, 0 100%)`,
                transform:
                  half && f > tear
                    ? `translate(${fall * 220}px, ${fall * fall * 900}px) rotate(${fall * 40}deg)`
                    : 'none',
              }}
            >
              <div style={{ fontFamily: font.body, fontSize: 30, letterSpacing: '0.18em' }}>
                INVOICE · NORTHSTAR
              </div>
              <div style={{ ...display, fontSize: 210, marginTop: 30 }}>2,000</div>
              <div style={{ fontFamily: font.body, fontSize: 30, marginTop: 10 }}>
                USDC due · brand launch
              </div>
            </div>
          ))}
        </Abs>
        <Abs
          style={{
            top: 800,
            width: 1920,
            display: 'flex',
            justifyContent: 'center',
            transform: shake(f, tear, 10),
          }}
        >
          <div
            style={{
              ...display,
              fontSize: 120,
              color: c.coral,
              transform: `scale(${pop(f, tear, 260)}) rotate(-3deg)`,
            }}
          >
            only part.
          </div>
        </Abs>
      </Camera>
    </Bg>
  );
}

/* 02 · The donut: 1,200 of 2,000 landed, 300 locks as reserve; two people wait. */
export function Problem() {
  const f = useF();
  const q = useCue();
  const R = 250,
    cx = 600,
    cy = 470,
    C = 2 * Math.PI * R;
  const filled = prog(f, q.at('p1') + 10, q.end('p1') - q.at('p1'), inOut) * 0.6;
  const lockP = pop(f, q.word('p2', 'reserve'), 160);
  const qMark = pop(f, q.at('p4'), 120);
  const people = [
    { n: 'Maya', role: 'Designer', owed: 700, col: c.coral, at: q.word('p3', 'Maya') },
    { n: 'Leo', role: 'Developer', owed: 500, col: c.violet, at: q.word('p3', 'Leo') },
  ];
  return (
    <Bg color={c.volt}>
      <Shapes seed={2} colors={[c.ink]} count={8} opacity={0.12} />
      <Camera
        keys={[
          [0, 1, 0, 0],
          [q.end('p4') - 6, 1, 0, 0],
          [q.length, 1.04, 0, 0],
        ]}
      >
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={c.ink}
              strokeOpacity={0.12}
              strokeWidth={84}
            />
            <circle
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={c.ink}
              strokeWidth={84}
              strokeDasharray={`${filled * C} ${C}`}
            />
            <g
              transform={`translate(${Math.cos(0.15 * Math.PI) * 34 * lockP} ${Math.sin(0.15 * Math.PI) * 34 * lockP})`}
            >
              <circle
                cx={cx}
                cy={cy}
                r={R}
                fill="none"
                stroke={c.coral}
                strokeWidth={84 * lockP}
                strokeDasharray={`${0.15 * C} ${C}`}
              />
            </g>
          </g>
        </svg>
        <Abs
          style={{ left: cx - 200, top: cy - 90, width: 400, textAlign: 'center', color: c.ink }}
        >
          <div style={{ ...display, fontSize: 120 }}>
            <Count to={1200} start={q.at('p1') + 10} dur={q.end('p1') - q.at('p1')} />
          </div>
          <div style={{ fontFamily: font.body, fontSize: 30 }}>of 2,000 USDC</div>
        </Abs>
        <Abs
          style={{
            left: cx + 160,
            top: cy - 330,
            padding: '14px 26px',
            borderRadius: 999,
            background: c.coral,
            color: c.white,
            fontFamily: font.head,
            fontWeight: 700,
            fontSize: 38,
            transform: `scale(${lockP})`,
          }}
        >
          300 locked as reserve
        </Abs>
        <Abs
          style={{
            left: cx - 380,
            top: cy + 300,
            fontFamily: font.head,
            fontWeight: 700,
            fontSize: 40,
            color: c.ink,
            opacity: prog(f, q.word('p2', 'reserve') + 10, 12),
          }}
        >
          900 free to pay out
        </Abs>
        {people.map((p, i) => {
          const s = pop(f, p.at, 150);
          return (
            <Abs
              key={p.n}
              style={{
                left: 1130,
                top: 240 + i * 240,
                display: 'flex',
                alignItems: 'center',
                gap: 30,
                transform: `translateX(${(1 - s) * 900}px) rotate(${(1 - s) * 10}deg)`,
                opacity: f >= p.at ? 1 : 0,
              }}
            >
              <Avatar letter={p.n[0]} color={p.col} size={150} />
              <div style={{ color: c.ink }}>
                <div style={{ ...display, fontSize: 72 }}>{p.n}</div>
                <div style={{ fontFamily: font.body, fontSize: 30 }}>
                  {p.role} · owed {p.owed}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {[0, 1, 2].map((d) => (
                    <i
                      key={d}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        background: c.ink,
                        opacity: 0.25 + 0.75 * Math.max(0, Math.sin((f - d * 5) / 6)),
                      }}
                    />
                  ))}
                </div>
              </div>
            </Abs>
          );
        })}
        <Abs
          style={{
            left: 1580,
            top: 120,
            ...display,
            fontSize: 420,
            color: c.ink,
            transform: `scale(${qMark}) rotate(${(1 - qMark) * 180 + Math.sin(f / 10) * 4}deg)`,
            opacity: qMark > 0.01 ? 1 : 0,
          }}
        >
          ?
        </Abs>
      </Camera>
    </Bg>
  );
}

/* 03 · Title drop: the wordmark pops letter by letter, splits, snaps; ribbons cross. */
export function Title() {
  const f = useF();
  const q = useCue();
  const name = q.word('t1', 'Splitt');
  const snap = prog(f, name + 26, 14, backOut);
  const apart = prog(f, name + 12, 10, expo) * (1 - snap);
  return (
    <Bg color={c.coral}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {[0, 1, 2, 3].map((i) => {
          const r = ((f * 6 + i * 220) % 880) + 40;
          return (
            <circle
              key={i}
              cx={960}
              cy={540}
              r={r}
              fill="none"
              stroke={c.ink}
              strokeOpacity={0.18 * (1 - r / 920)}
              strokeWidth={30}
            />
          );
        })}
      </svg>
      <Marquee
        text="SPLITT · PAYMENT PLANS · USDC · ARC · CIRCLE"
        y={110}
        speed={9}
        bg={c.ink}
        color={c.volt}
        rotate={-4}
      />
      <Marquee
        text="A REASON BEHIND EVERY AMOUNT"
        y={860}
        speed={-9}
        bg={c.volt}
        color={c.ink}
        rotate={3}
      />
      <Abs
        style={{
          top: 300,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {[0, 1].map((half) => (
          <div
            key={half}
            style={{
              position: half ? 'absolute' : 'relative',
              clipPath: half ? 'inset(50% 0 0 0)' : 'inset(0 0 50% 0)',
              transform: `translateX(${(half ? 1 : -1) * apart * 160}px)`,
            }}
          >
            {'splitt.'.split('').map((ch, i) => {
              const p = pop(f, q.at('t1') + i * 3, 240);
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    ...display,
                    fontSize: 330,
                    color: ch === '.' ? c.volt : c.ink,
                    transform: `translateY(${(1 - p) * 300}px) scale(${p})`,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </Abs>
      <Abs style={{ top: 690, width: 1920, display: 'flex', justifyContent: 'center' }}>
        <Slam
          text="a reason behind every amount"
          start={q.at('t2')}
          stagger={4}
          serif={['reason']}
          style={{ ...display, fontSize: 70, color: c.white, letterSpacing: '-0.02em' }}
        />
      </Abs>
    </Bg>
  );
}

/* 04 · The agent reads, drafts the split, then the rule engine checks each line. */
export function Draft() {
  const f = useF();
  const q = useCue();
  const docs = [
    { t: 'Invoice', d: '2,000 · 1,200 received', col: c.volt },
    { t: 'Terms', d: 'Maya 700 · Leo up to 500', col: c.coral },
    { t: 'Cash', d: '900 free · 300 reserve', col: c.violet },
  ];
  const scan = prog(f, q.at('d1') + 20, q.end('d1') - q.at('d1') - 20, inOut);
  const collapse = prog(f, q.at('d2') - 10, 18, inOut);
  const pay = (at: number) => prog(f, at, 26, inOut);
  const toMaya = pay(q.word('d2', 'Maya'));
  const toLeo = pay(q.word('d2', 'Leo'));
  const checks = ['Reserve', 'Eligibility', 'Caps', 'Evidence', 'Current state'];
  const stamp = pop(f, q.end('c5') + 8, 200);
  return (
    <Bg color={c.paper}>
      <Shapes seed={4} colors={[c.violet, c.coral]} count={8} opacity={0.18} />
      <Camera
        keys={[
          [0, 1.08, 0, 60],
          [q.at('d2') - 10, 1.05, 0, 60],
          [q.at('d3'), 1, 0, 0],
          [q.length, 1.04, 0, -10],
        ]}
      >
        <Abs
          style={{
            left: 120,
            top: 120,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '12px 26px',
            borderRadius: 999,
            background: c.ink,
            color: c.white,
            fontFamily: font.body,
            fontSize: 30,
            transform: `scale(${pop(f, 4)})`,
          }}
        >
          <i
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: c.volt,
              opacity: 0.4 + 0.6 * pulse(f, 0.12),
            }}
          />
          AI agent drafting
        </Abs>
        {docs.map((d, i) => {
          const s = pop(f, q.at('d1') + i * 8, 140);
          const x = mix(250 + i * 480, 860, collapse);
          const y = mix(220, 330, collapse);
          return (
            <Abs
              key={d.t}
              style={{
                left: x,
                top: y,
                width: 400,
                height: 300,
                borderRadius: 24,
                background: c.white,
                border: `5px solid ${c.ink}`,
                padding: 34,
                transform: `translateY(${(1 - s) * 600}px) rotate(${(i - 1) * 5 * (1 - collapse)}deg) scale(${1 - collapse * 0.6})`,
                opacity: 1 - prog(f, q.at('d2'), 8),
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: d.col,
                  color: d.col === c.volt ? c.ink : c.white,
                  fontFamily: font.head,
                  fontWeight: 700,
                  fontSize: 30,
                }}
              >
                {d.t}
              </div>
              {[0, 1, 2].map((l) => (
                <div
                  key={l}
                  style={{
                    height: 14,
                    borderRadius: 7,
                    marginTop: 26,
                    width: `${[90, 70, 80][l]}%`,
                    background: scan > (i + l / 3) / 3 ? c.ink : '#d8d3c8',
                  }}
                />
              ))}
              <div style={{ fontFamily: font.body, fontSize: 24, marginTop: 26, color: c.ink }}>
                {d.d}
              </div>
            </Abs>
          );
        })}
        <Abs
          style={{
            left: 200 + scan * 1500,
            top: 180,
            width: 10,
            height: 420,
            background: c.volt,
            boxShadow: `0 0 40px ${c.volt}`,
            opacity: scan > 0 && scan < 1 ? 1 : 0,
          }}
        />
        {/* the split */}
        <Abs style={{ left: 380, top: 250, opacity: prog(f, q.at('d2') - 4, 10) }}>
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: c.ink,
              color: c.volt,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${pop(f, q.at('d2') - 4)})`,
            }}
          >
            <div style={{ ...display, fontSize: 110 }}>
              <Count
                from={900}
                to={0}
                start={q.word('d2', 'Maya')}
                dur={q.end('d2') - q.word('d2', 'Maya')}
              />
            </div>
            <div style={{ fontFamily: font.body, fontSize: 26, color: c.white }}>to allocate</div>
          </div>
        </Abs>
        {[
          { n: 'Maya', col: c.coral, amt: 700, p: toMaya, y: 170, note: 'paid in full' },
          {
            n: 'Leo',
            col: c.violet,
            amt: 200,
            p: toLeo,
            y: 470,
            note: 'partial · allowed by terms',
          },
        ].map((r, i) => (
          <React.Fragment key={r.n}>
            {Array.from({ length: 6 }, (_, k) => {
              const t = Math.min(1, Math.max(0, r.p * 1.6 - k * 0.12));
              const x = mix(680, 1240, t);
              const y = mix(400, r.y + 70, t) - Math.sin(t * Math.PI) * 160;
              return t > 0 && t < 1 ? (
                <Abs
                  key={k}
                  style={{
                    left: x,
                    top: y,
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: c.volt,
                    border: `4px solid ${c.ink}`,
                  }}
                />
              ) : null;
            })}
            <Abs
              style={{
                left: 1260,
                top: r.y,
                display: 'flex',
                alignItems: 'center',
                gap: 30,
                opacity: prog(f, q.at('d2') - 4 + i * 6, 12),
              }}
            >
              <Avatar letter={r.n[0]} color={r.col} size={140} />
              <div style={{ color: c.ink }}>
                <div style={{ fontFamily: font.body, fontSize: 30 }}>{r.n}</div>
                <div style={{ ...display, fontSize: 110 }}>
                  <Count to={r.amt} start={q.word('d2', r.n)} dur={26} />
                </div>
                <div style={{ fontFamily: font.body, fontSize: 24 }}>{r.note}</div>
              </div>
            </Abs>
          </React.Fragment>
        ))}
        {/* the rule engine */}
        <Abs
          style={{
            left: 120,
            top: 700,
            width: 1680,
            display: 'flex',
            gap: 22,
            opacity: prog(f, q.at('d3'), 12),
            transform: `translateY(${(1 - prog(f, q.at('d3'), 20)) * 120}px)`,
          }}
        >
          {checks.map((label, i) => {
            const on = q.at(`c${i + 1}`);
            const lit = f >= on;
            const s = pop(f, on, 260);
            return (
              <div
                key={label}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '24px 22px',
                  borderRadius: 22,
                  border: `5px solid ${c.ink}`,
                  background: lit ? c.volt : c.white,
                  fontFamily: font.head,
                  fontWeight: 700,
                  fontSize: 34,
                  color: c.ink,
                  transform: `scale(${lit ? mix(1.04, 1, s) : 1})`,
                }}
              >
                <svg width={46} height={46} viewBox="0 0 46 46">
                  <circle
                    cx={23}
                    cy={23}
                    r={20}
                    fill={lit ? c.ink : 'none'}
                    stroke={c.ink}
                    strokeWidth={4}
                  />
                  <path
                    d="M13 24 l7 7 l13 -15"
                    fill="none"
                    stroke={c.volt}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray={`${lit ? prog(f, on + 2, 10) : 0} 1`}
                  />
                </svg>
                {label}
              </div>
            );
          })}
        </Abs>
        <Abs
          style={{
            left: 1150,
            top: 560,
            padding: '18px 34px',
            border: `7px solid ${c.coral}`,
            borderRadius: 18,
            color: c.coral,
            ...display,
            fontSize: 54,
            transform: `rotate(-7deg) scale(${mix(1.3, 1, stamp)})`,
            opacity: f >= q.end('c5') + 8 ? 1 : 0,
            background: c.paper,
          }}
        >
          READY FOR YOUR SIGNATURE
        </Abs>
      </Camera>
    </Bg>
  );
}

/* 05 · Nothing moves until you sign; then three bands slam in. */
export function Sign() {
  const f = useF();
  const q = useCue();
  const phone = pop(f, q.at('s1'), 120);
  const rows = [
    ['Vault', 'Northstar', 'vault'],
    ['Maya', '700 USDC', 'payments'],
    ['Leo', '200 USDC', 'payments'],
    ['Expires', 'in 30 min', 'deadline'],
  ];
  const press = q.end('s2') - 6;
  const pressed = f >= press;
  const ripple = prog(f, press, 22);
  const sig = prog(f, press + 4, 26, inOut);
  const bands = [
    { id: 's3', t: 'Circle executes', bg: c.white, fg: c.ink },
    { id: 's4', t: 'Arc settles', bg: c.volt, fg: c.ink },
    { id: 's5', t: 'Splitt reconciles', bg: c.coral, fg: c.white },
  ];
  const headOut = prog(f, q.at('s3') - 8, 12, inOut);
  return (
    <Bg color={c.violet}>
      <Shapes seed={5} colors={[c.volt, c.white]} count={10} opacity={0.35} />
      <Camera
        keys={[
          [0, 1.03, 0, 0],
          [q.at('s2'), 1, 0, 0],
          [q.at('s3'), 1.04, -20, 0],
          [q.length, 1, 0, 0],
        ]}
      >
        <Abs
          style={{
            left: 170,
            top: 90,
            width: 520,
            height: 900,
            borderRadius: 64,
            background: c.ink,
            border: `10px solid ${c.ink}`,
            boxShadow: '0 40px 0 rgba(0,0,0,.25)',
            transform: `translateY(${(1 - phone) * 1000}px) rotate(${(1 - phone) * -12}deg)`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 8,
              borderRadius: 54,
              background: c.paper,
              padding: '70px 40px',
              color: c.ink,
            }}
          >
            <div style={{ fontFamily: font.body, fontSize: 24, letterSpacing: '0.14em' }}>
              APPROVE BATCH
            </div>
            <div style={{ ...display, fontSize: 64, marginTop: 10 }}>900 USDC</div>
            {rows.map(([k, v, word], i) => {
              const hl = prog(f, q.word('s2', word) - 2 + (k === 'Leo' ? 6 : 0), 10);
              return (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 26,
                    paddingBottom: 14,
                    borderBottom: `4px solid ${hl > 0 ? c.volt : '#d8d3c8'}`,
                    fontFamily: font.body,
                    fontSize: 28,
                    transform: `scale(${1 + 0.06 * hl * (1 - prog(f, q.word('s2', word) + 12, 12))})`,
                    opacity: prog(f, q.at('s1') + 10 + i * 4, 10),
                  }}
                >
                  <span>{k}</span>
                  <b style={{ fontFamily: font.head }}>{v}</b>
                </div>
              );
            })}
            <svg width={420} height={130} style={{ marginTop: 20 }}>
              <path
                d="M10 90 C 40 20, 70 20, 80 80 S 120 120, 140 60 S 180 20, 200 85 S 250 110, 280 50 C 300 20, 330 40, 410 70"
                fill="none"
                stroke={c.ink}
                strokeWidth={5}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${sig} 1`}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                left: 40,
                right: 40,
                bottom: 50,
                height: 104,
                borderRadius: 52,
                background: pressed ? c.volt : c.ink,
                color: pressed ? c.ink : c.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...display,
                fontSize: 44,
                transform: `scale(${pressed ? mix(0.9, 1, prog(f, press, 10, backOut)) : 1})`,
              }}
            >
              {pressed ? 'Signed' : 'Sign'}
              <div
                style={{
                  position: 'absolute',
                  width: 600 * ripple,
                  height: 600 * ripple,
                  borderRadius: '50%',
                  border: `6px solid ${c.volt}`,
                  opacity: 1 - ripple,
                }}
              />
            </div>
          </div>
        </Abs>
        <Abs
          style={{
            left: 800,
            top: 260,
            width: 1000,
            opacity: 1 - headOut,
            transform: `translateX(${headOut * 300}px)`,
          }}
        >
          <Slam
            text="Nothing moves until you sign."
            start={q.at('s1')}
            stagger={5}
            colors={{ 'sign.': c.volt }}
            style={{ ...display, fontSize: 130, color: c.white }}
          />
        </Abs>
        {bands.map((b, i) => {
          const s = prog(f, q.at(b.id), 16, backOut);
          return (
            <Abs
              key={b.id}
              style={{
                left: 760,
                top: 230 + i * 200,
                width: 1220,
                height: 160,
                background: b.bg,
                color: b.fg,
                borderRadius: '80px 0 0 80px',
                display: 'flex',
                alignItems: 'center',
                gap: 36,
                paddingLeft: 60,
                ...display,
                fontSize: 96,
                transform: `translateX(${(1 - s) * 1300}px)`,
              }}
            >
              <span
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: '50%',
                  background: b.fg,
                  display: 'inline-block',
                  transform: `scale(${pop(f, q.at(b.id) + 8)})`,
                }}
              />
              {b.t}
            </Abs>
          );
        })}
      </Camera>
    </Bg>
  );
}

/* 06 · The remainder lands; Leo is topped up; the old approval gets stamped. */
export function Remainder() {
  const f = useF();
  const q = useCue();
  const drop = interpolate(f, [q.at('r1'), q.at('r1') + 18], [-300, 200], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const bounce = pop(f, q.at('r1') + 18, 200);
  const leo = prog(f, q.word('r2', 'Leo') + 6, 30, inOut);
  const stampAt = q.at('r3') + 27;
  const stamped = f >= stampAt;
  return (
    <Bg color={c.ink}>
      <Shapes seed={6} colors={[c.volt, c.coral, c.violet]} count={10} opacity={0.4} />
      <Abs style={{ inset: 0, transform: shake(f, stampAt, 22) }}>
        <Abs
          style={{
            left: 120,
            top: 130,
            ...display,
            fontSize: 60,
            color: c.white,
            opacity: prog(f, q.at('r1'), 12),
          }}
        >
          The rest arrives. <span style={{ color: c.volt }}>Splitt plans again.</span>
        </Abs>
        <Abs
          style={{
            left: 1380,
            top: drop,
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: c.volt,
            border: `8px solid ${c.white}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.ink,
            transform: `rotate(-4deg)`,
          }}
        >
          <div style={{ ...display, fontSize: 130 }}>+800</div>
          <div style={{ fontFamily: font.body, fontSize: 30 }}>USDC received</div>
        </Abs>
        {[
          {
            n: 'Maya',
            col: c.coral,
            have: 700,
            owe: 700,
            p: 1,
            note: 'Already paid · skipped',
            at: q.word('r2', 'Maya'),
          },
          {
            n: 'Leo',
            col: c.violet,
            have: mix(200, 500, leo),
            owe: 500,
            p: mix(0.4, 1, leo),
            note: leo > 0 ? '+300 · now complete' : 'Owed 300 more',
            at: q.word('r2', 'Leo'),
          },
        ].map((r, i) => (
          <Abs
            key={r.n}
            style={{
              left: 120,
              top: 260 + i * 210,
              width: 1100,
              opacity: prog(f, q.at('r2') - 10 + i * 6, 10),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              <Avatar letter={r.n[0]} color={r.col} size={100} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    ...display,
                    fontSize: 56,
                    color: c.white,
                  }}
                >
                  <span>{r.n}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(r.have)} / {r.owe}
                  </span>
                </div>
                <div
                  style={{
                    height: 26,
                    borderRadius: 13,
                    background: 'rgba(255,255,255,.14)',
                    marginTop: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '100%', width: `${r.p * 100}%`, background: r.col }} />
                </div>
                <div
                  style={{
                    fontFamily: font.body,
                    fontSize: 26,
                    color: r.p >= 1 ? c.volt : c.white,
                    marginTop: 10,
                  }}
                >
                  {r.note}
                </div>
              </div>
            </div>
          </Abs>
        ))}
        <Abs
          style={{
            left: 120,
            top: 720,
            width: 760,
            padding: '30px 40px',
            borderRadius: 26,
            background: c.paper,
            color: c.ink,
            transform: `rotate(-2deg) scale(${pop(f, q.at('r3'))})`,
            filter: stamped ? 'grayscale(1)' : 'none',
          }}
        >
          <div style={{ fontFamily: font.body, fontSize: 24, letterSpacing: '0.14em' }}>
            APPROVAL #1
          </div>
          <div
            style={{
              ...display,
              fontSize: 56,
              marginTop: 8,
              textDecoration: stamped ? 'line-through' : 'none',
            }}
          >
            Maya 700 · Leo 200
          </div>
          <div
            style={{
              position: 'absolute',
              right: -40,
              top: -50,
              padding: '12px 30px',
              border: `9px solid ${c.coral}`,
              borderRadius: 16,
              color: c.coral,
              background: c.paper,
              ...display,
              fontSize: 84,
              transform: `rotate(12deg) scale(${stamped ? mix(1.3, 1, pop(f, stampAt, 300)) : 0})`,
            }}
          >
            USED
          </div>
        </Abs>
        <Abs
          style={{
            left: 960,
            top: 760,
            ...display,
            fontSize: 64,
            color: c.white,
            opacity: prog(f, stampAt + 8, 10),
          }}
        >
          Can’t count <span style={{ color: c.coral }}>twice.</span>
        </Abs>
      </Abs>
    </Bg>
  );
}

/* 07 · Two vaults, two colours; a coin tries to cross and a wall slams down. */
export function Isolation() {
  const f = useF();
  const q = useCue();
  const inL = prog(f, 0, 18, expo);
  const inR = prog(f, 4, 18, expo);
  const wallAt = q.at('i2') + 12;
  const wall = prog(f, wallAt, 8, Easing.in(Easing.quad));
  const tryX =
    f < wallAt + 8
      ? mix(
          1500,
          1010,
          prog(f, q.at('i1') + 30, wallAt + 8 - q.at('i1') - 30, Easing.in(Easing.quad)),
        )
      : mix(1010, 1500, prog(f, wallAt + 8, 24, backOut));
  return (
    <Bg color={c.ink}>
      <Abs
        style={{
          left: 0,
          top: 0,
          width: 960,
          height: 1080,
          background: c.coral,
          transform: `translateY(${(1 - inL) * -1080}px)`,
        }}
      />
      <Abs
        style={{
          left: 960,
          top: 0,
          width: 960,
          height: 1080,
          background: c.violet,
          transform: `translateY(${(1 - inR) * 1080}px)`,
        }}
      />
      <Abs style={{ inset: 0, transform: shake(f, wallAt + 8, 20) }}>
        {[
          { n: 'Northstar', v: 800, x: 480 },
          { n: 'Fieldwork', v: 1000, x: 1440 },
        ].map((p, i) => (
          <Abs
            key={p.n}
            style={{
              left: p.x - 380,
              top: 230,
              width: 760,
              textAlign: 'center',
              color: c.white,
              transform: `scale(${pop(f, 10 + i * 6)})`,
            }}
          >
            <div style={{ fontFamily: font.body, fontSize: 40 }}>{p.n}</div>
            <div style={{ ...display, fontSize: 230 }}>
              <Count to={p.v} start={10 + i * 6} dur={24} />
            </div>
            <div style={{ fontFamily: font.body, fontSize: 30 }}>USDC in its own vault</div>
          </Abs>
        ))}
        <Abs
          style={{
            left: tryX - 50,
            top: 640,
            width: 100,
            height: 100,
            borderRadius: 50,
            background: c.volt,
            border: `6px solid ${c.ink}`,
            opacity: prog(f, q.at('i1') + 24, 8),
          }}
        />
        <Abs
          style={{
            left: 930,
            top: mix(-1080, 0, wall),
            width: 60,
            height: 1080,
            background: c.white,
            boxShadow: '0 0 0 10px rgba(11,11,15,.9)',
          }}
        />
        <Abs style={{ top: 720, width: 1920, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              padding: '18px 44px',
              background: c.ink,
              color: c.volt,
              borderRadius: 18,
              ...display,
              fontSize: 80,
              transform: `scale(${pop(f, wallAt + 10, 260)}) rotate(-2deg)`,
            }}
          >
            Never mixed.
          </div>
        </Abs>
      </Abs>
    </Bg>
  );
}

/* 08 · Proof: what every payout runs on, then the mainnet launch. */
export function Proof() {
  const f = useF();
  const q = useCue();
  const tiles = [
    {
      t: 'Signed',
      d: 'by you, in your own wallet or multisig',
      w: 'signed',
      bg: c.volt,
      fg: c.ink,
    },
    { t: 'Executed', d: 'through Circle, batch by batch', w: 'executed', bg: c.coral, fg: c.white },
    {
      t: 'Verifiable',
      d: 'on chain, every single payout',
      w: 'verifiable',
      bg: c.violet,
      fg: c.white,
    },
  ];
  const launch = prog(f, q.word('pr3', 'launching'), 22);
  return (
    <Bg color={c.ink}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1 }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div
            key={row}
            style={{
              position: 'absolute',
              top: 60 + row * 170,
              left: 0,
              whiteSpace: 'nowrap',
              ...display,
              fontSize: 64,
              color: c.white,
              transform: `translateX(${(((row % 2 ? 1 : -1) * f * 2) % 1800) - 900}px)`,
            }}
          >
            {'OWNER-SIGNED · RESERVE-PROTECTED · MULTISIG-READY · VERIFIED CONTRACT · '.repeat(3)}
          </div>
        ))}
      </div>
      <Camera
        keys={[
          [0, 1.03, 0, 0],
          [q.length, 1, 0, 0],
        ]}
      >
        <Abs style={{ left: 120, top: 130, display: 'flex', gap: 30 }}>
          <Slam
            text="Built on Arc."
            start={q.at('pr1')}
            stagger={4}
            style={{ ...display, fontSize: 110, color: c.white }}
          />
          <Slam
            text="Settled in USDC."
            start={q.word('pr1', 'Settled')}
            stagger={4}
            style={{ ...display, fontSize: 110, color: c.volt }}
          />
        </Abs>
        <Abs style={{ left: 120, top: 320, width: 1680, display: 'flex', gap: 36 }}>
          {tiles.map((t) => {
            const at = q.word('pr2', t.w);
            const p = prog(f, at, 20);
            return (
              <div
                key={t.t}
                style={{
                  flex: 1,
                  height: 300,
                  borderRadius: 34,
                  background: t.bg,
                  color: t.fg,
                  padding: '44px 44px',
                  transform: `translateY(${(1 - p) * 80}px)`,
                  opacity: p,
                }}
              >
                <div style={{ ...display, fontSize: 108 }}>{t.t}</div>
                <div style={{ fontFamily: font.body, fontSize: 32, marginTop: 24 }}>{t.d}</div>
              </div>
            );
          })}
        </Abs>
        <Abs
          style={{
            left: 0,
            top: 690,
            width: 1920 * launch,
            height: 150,
            background: c.volt,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              ...display,
              fontSize: 92,
              color: c.ink,
              paddingLeft: 120,
              whiteSpace: 'nowrap',
            }}
          >
            Now launching on Arc mainnet.
          </div>
        </Abs>
      </Camera>
    </Bg>
  );
}

/* 09 · End card: wordmark, confetti, URL; fades to black to loop into the opening. */
export function End() {
  const f = useF();
  const q = useCue();
  const out = prog(f, q.length - 18, 18, inOut);
  return (
    <Bg color={c.volt}>
      <Shapes seed={9} colors={[c.ink, c.coral, c.violet]} count={14} opacity={0.6} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={960}
            cy={420}
            r={260 + i * 90}
            fill="none"
            stroke={c.ink}
            strokeWidth={10 - i * 3}
            strokeDasharray="30 22"
            transform={`rotate(${f * (i % 2 ? -1 : 1) * 0.8} 960 420)`}
            opacity={prog(f, 4 + i * 4, 12)}
          />
        ))}
      </svg>
      <Abs style={{ top: 250, width: 1920, display: 'flex', justifyContent: 'center' }}>
        {'splitt.'.split('').map((ch, i) => {
          const p = pop(f, q.at('e1') + i * 3, 260);
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                ...display,
                fontSize: 300,
                color: ch === '.' ? c.coral : c.ink,
                transform: `translateY(${(1 - p) * -260}px) scale(${p})`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </Abs>
      <Confetti x={960} y={420} at={q.at('e1') + 10} colors={[c.ink, c.coral, c.violet, c.white]} />
      <Abs style={{ top: 600, width: 1920, display: 'flex', justifyContent: 'center' }}>
        <Slam
          text="Every amount has a reason."
          start={q.at('e2')}
          stagger={4}
          serif={['reason.']}
          style={{ ...display, fontSize: 84, color: c.ink, letterSpacing: '-0.02em' }}
        />
      </Abs>
      <Abs style={{ top: 730, width: 1920, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            padding: '20px 56px',
            borderRadius: 999,
            background: c.ink,
            color: c.volt,
            ...display,
            fontSize: 64,
            transform: `scale(${pop(f, q.word('e3', 'usesplitt'), 200)})`,
          }}
        >
          usesplitt.xyz
        </div>
      </Abs>
      <AbsoluteFill style={{ background: c.ink, opacity: out }} />
    </Bg>
  );
}

export const SCENES = {
  hook: Hook,
  problem: Problem,
  title: Title,
  draft: Draft,
  sign: Sign,
  remainder: Remainder,
  isolation: Isolation,
  proof: Proof,
  end: End,
};
export { B };
