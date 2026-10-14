'use client';

import { motion, useInView, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';
import { ArrowDownLeft, Check, ShieldCheck } from '@phosphor-icons/react';
import { AnimatedValue } from './landing-motion';

// Scroll storyboard: arrival [0–33%] → allocation [33–66%] → remainder [66–100%].
// Cards spring into the foreground; the browser keeps its native scrolling.
const CARD_SPRING = { type: 'spring' as const, stiffness: 180, damping: 25 };
const STORIES = [
  {
    name: 'The arrival',
    title: 'Less came in. The work still moves.',
    body: 'A 2,000 USDC invoice. A 1,200 USDC payment. Start with the money actually available to this project.',
    amount: '1,200',
    label: 'Received into Northstar',
    note: '60% of the invoice received',
    icon: ArrowDownLeft,
  },
  {
    name: 'The allocation',
    title: 'Make room for the right payments.',
    body: 'Pay Amara in full, agree a partial payment with Tobi, and keep 300 USDC protected. Every amount has a reason.',
    amount: '900',
    label: 'Proposed contractor payments',
    note: '700 to Amara · 200 to Tobi',
    icon: ShieldCheck,
  },
  {
    name: 'The remainder',
    title: 'Finish the balance. Keep the history.',
    body: 'When the remaining 800 USDC arrives, Tobi needs just 300 more. Amara is already paid. The project keeps 800 after the batch.',
    amount: '300',
    label: 'Remaining contractor payment',
    note: 'Amara stays paid · Tobi’s final balance',
    icon: Check,
  },
];

export function DotField({ enabled }: { enabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const visible = useInView(root);
  return (
    <div
      ref={root}
      className={`landing-dot-field ${enabled && visible ? 'dots-running' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 520 320">
        {Array.from({ length: 187 }, (_, index) => {
          const column = index % 17;
          const row = Math.floor(index / 17);
          return (
            <circle
              key={index}
              cx={12 + column * 30}
              cy={12 + row * 28}
              r={column > 10 && row < 5 ? 2.8 : 1.7}
              style={{ animationDelay: `${-(row + column) * 0.22}s` }}
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function ScrollStory({ enabled }: { enabled: boolean }) {
  const root = useRef<HTMLElement>(null);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: root, offset: ['start start', 'end end'] });
  const dotY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const orbitRotate = useTransform(scrollYProgress, [0, 1], [-15, 70]);
  useMotionValueEvent(scrollYProgress, 'change', (value) =>
    setActive(Math.min(2, Math.floor(Math.max(0, value) * 3))),
  );
  return (
    <section
      ref={root}
      className={`scroll-story ${enabled ? '' : 'story-static'}`}
      aria-labelledby="story-title"
    >
      <div className="story-sticky landing-width">
        <div className="story-copy">
          <p className="landing-kicker">One project. Three moments.</p>
          <h2 id="story-title">
            Watch a payment
            <br /> find its <em>purpose.</em>
          </h2>
          <div className="story-description" aria-live="polite">
            <motion.div
              key={active}
              initial={enabled ? { opacity: 0, y: 16 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={enabled ? CARD_SPRING : { duration: 0 }}
            >
              <span className="story-step">
                0{active + 1} / {STORIES[active].name}
              </span>
              <h3>{STORIES[active].title}</h3>
              <p>{STORIES[active].body}</p>
            </motion.div>
          </div>
          <div className="story-navigation" role="group" aria-label="Payment story stages">
            {STORIES.map((story, index) => (
              <button
                key={story.name}
                aria-label={`Show ${story.name.toLowerCase()}`}
                aria-pressed={active === index}
                onClick={() =>
                  markers.current[index]?.scrollIntoView({
                    behavior: enabled ? 'smooth' : 'instant',
                    block: 'start',
                  })
                }
              >
                <span className="story-nav-dot" /> <span>{story.name}</span>
              </button>
            ))}
          </div>
          <p className="story-scroll-hint">
            Scroll to follow the money <span aria-hidden="true">↓</span>
          </p>
        </div>
        <div className="story-stage">
          <motion.div
            className="story-orbit"
            aria-hidden="true"
            style={enabled ? { rotate: orbitRotate, y: dotY } : {}}
          >
            <svg viewBox="0 0 500 500">
              <circle cx="250" cy="250" r="210" />
              <circle cx="250" cy="250" r="160" />
              {Array.from({ length: 36 }, (_, i) => (
                <circle
                  key={i}
                  cx={(250 + 210 * Math.cos((i * Math.PI) / 18)).toFixed(2)}
                  cy={(250 + 210 * Math.sin((i * Math.PI) / 18)).toFixed(2)}
                  r={i % 3 === 0 ? 4 : 2}
                  className="orbit-dot"
                />
              ))}
            </svg>
          </motion.div>
          <div className="story-deck">
            {STORIES.map((story, index) => {
              const Icon = story.icon;
              const distance = (index - active + 3) % 3;
              return (
                <motion.article
                  key={story.name}
                  className={`story-card story-card-${index}`}
                  aria-hidden={active !== index}
                  animate={{
                    x: distance * 22,
                    y: distance * -18,
                    rotate: distance === 0 ? 0 : distance === 1 ? 5 : -7,
                    scale: 1 - distance * 0.045,
                    opacity: distance === 0 ? 1 : 0.7,
                  }}
                  style={{ zIndex: 3 - distance }}
                  transition={enabled ? CARD_SPRING : { duration: 0 }}
                >
                  <div className="story-card-top">
                    <span>Northstar / 0{index + 1}</span>
                    <span>Illustrative example</span>
                  </div>
                  <span className="story-card-icon">
                    <Icon size={28} />
                  </span>
                  <p className="story-card-label">{story.label}</p>
                  <strong className="story-card-money">
                    <AnimatedValue enabled={enabled}>{story.amount}</AnimatedValue>
                    <small> USDC</small>
                  </strong>
                  <div className="story-card-visual" aria-hidden="true">
                    {index === 0 ? (
                      <div className="story-receipt-dots">
                        {Array.from({ length: 20 }, (_, i) => (
                          <motion.i
                            key={i}
                            animate={{
                              scale: active === index ? 1 : 0.5,
                              opacity: i < 12 ? 1 : 0.2,
                            }}
                            transition={
                              enabled ? { ...CARD_SPRING, delay: i * 0.025 } : { duration: 0 }
                            }
                          />
                        ))}
                      </div>
                    ) : index === 1 ? (
                      <div className="story-allocation-bars">
                        {[700, 200, 300].map((amount, i) => (
                          <div key={amount}>
                            <span>{['Amara', 'Tobi', 'Reserve'][i]}</span>
                            <div>
                              <motion.i
                                animate={{ scaleX: active === index ? amount / 700 : 0 }}
                                style={{ transformOrigin: 'left' }}
                                transition={
                                  enabled ? { ...CARD_SPRING, delay: i * 0.08 } : { duration: 0 }
                                }
                              />
                            </div>
                            <b>{amount}</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="story-complete">
                        <Check size={22} />
                        <span>Earlier payments accounted for</span>
                      </div>
                    )}
                  </div>
                  <div className="story-card-note">
                    <span className="story-note-dot" />
                    {story.note}
                  </div>
                  <p className="story-card-footer">A proposed plan. You approve the payments.</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
      {STORIES.map((story, index) => (
        <div
          key={story.name}
          className="story-marker"
          ref={(node) => {
            markers.current[index] = node;
          }}
        />
      ))}
    </section>
  );
}
