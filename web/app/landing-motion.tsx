'use client';

import { AnimatePresence, motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Entrance storyboard: copy 0ms → card 140ms → flow 380ms → branches 620ms.
// Navigation and primary actions remain available throughout the entrance.
export const TIMING = { card: 140, flow: 380, branches: 620 };
const SPRING = { stiffness: 300, damping: 30 };

export function AnimatedValue({ children, enabled }: { children: string; enabled: boolean }) {
  return (
    <span className="animated-value" aria-label={children}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={children}
          aria-hidden="true"
          initial={enabled ? { opacity: 0, y: 8, filter: 'blur(2px)' } : false}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={enabled ? { opacity: 0, y: -8 } : { opacity: 0 }}
          transition={{ duration: enabled ? 0.2 : 0 }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function PaymentScene({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(x, SPRING);
  const rotateY = useSpring(y, SPRING);
  useEffect(() => {
    if (!enabled) {
      x.set(0);
      y.set(0);
    }
  }, [enabled, x, y]);
  return (
    <div className="payment-scene">
      <div className="payment-scene-sheet sheet-back" aria-hidden="true" />
      <div className="payment-scene-sheet sheet-front" aria-hidden="true" />
      <motion.div
        className="payment-scene-card"
        style={{ rotateX, rotateY, transformPerspective: 1000 }}
        onPointerMove={(event) => {
          if (!enabled || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
          const rect = event.currentTarget.getBoundingClientRect();
          x.set(-((event.clientY - rect.top) / rect.height - 0.5) * 4);
          y.set(((event.clientX - rect.left) / rect.width - 0.5) * 5);
        }}
        onPointerLeave={() => {
          x.set(0);
          y.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function PaymentFlow({
  enabled,
  remainder,
  stage,
}: {
  enabled: boolean;
  remainder: boolean;
  stage: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const paths = [
    'M 58 56 H 218',
    'M 244 56 C 315 56 300 18 390 18',
    'M 244 56 H 390',
    'M 244 56 C 315 56 300 94 390 94',
  ];
  return (
    <div
      ref={ref}
      className={`payment-flow ${enabled && inView && visible ? 'flow-running' : ''}`}
      role="img"
      aria-label="Illustration: an incoming payment enters the project, then a proposed plan separates contractor payments and the protected reserve."
    >
      <svg viewBox="0 0 490 112" aria-hidden="true">
        {paths.map((d, index) => (
          <g key={d} className={remainder && index === 1 ? 'flow-settled' : ''}>
            <path d={d} className="flow-track" />
            <motion.path
              d={d}
              className="flow-line"
              initial={false}
              animate={{ pathLength: !enabled || stage >= (index === 0 ? 2 : 3) ? 1 : 0 }}
              transition={{ duration: enabled ? 0.55 : 0, delay: index * 0.06 }}
            />
            <path d={d} className={`flow-particles flow-particles-${index}`} />
          </g>
        ))}
        <circle cx="52" cy="56" r="17" className="flow-source" />
        <text x="52" y="60" textAnchor="middle" className="flow-currency">
          $
        </text>
        <rect x="212" y="35" width="42" height="42" rx="12" className="flow-project" />
        <path d="M226 45v14m0 0-5-5m5 5 5-5m9-8v20" className="flow-mark" />
        {[18, 56, 94].map((cy, index) => (
          <circle key={cy} cx="396" cy={cy} r="5" className={`flow-end flow-end-${index}`} />
        ))}
        <text x="410" y="22">
          {remainder ? 'Paid earlier' : 'Amara'}
        </text>
        <text x="410" y="60">
          Tobi
        </text>
        <text x="410" y="98">
          Reserve
        </text>
        <text x="52" y="91" textAnchor="middle" className="flow-caption">
          Client
        </text>
        <text x="233" y="99" textAnchor="middle" className="flow-caption">
          Project
        </text>
      </svg>
    </div>
  );
}
