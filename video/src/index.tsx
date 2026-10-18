import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  registerRoot,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import scenes from '../public/scenes.json';

const canvas = '#eef2f6',
  surface = '#fbfcfe',
  ink = '#162337',
  muted = '#526176',
  accent = '#456c98',
  deep = '#183a60',
  line = '#d4dce5';
const sceneFrames = 600;
const rise = (frame: number, delay: number, fps: number) =>
  spring({ frame: frame - delay, fps, config: { damping: 22, stiffness: 145, mass: 0.8 } });

function BrowserFrame({ image, frame }: { image: string; frame: number }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${line}`,
        overflow: 'hidden',
        boxShadow: '0 28px 80px rgba(24,58,96,.16)',
        width: 1480,
        margin: '0 auto',
        background: surface,
        transform: `perspective(1600px) rotateX(1deg) rotateY(-1deg) scale(${interpolate(frame, [0, sceneFrames], [0.985, 1.008], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
      }}
    >
      <div
        style={{
          height: 44,
          background: '#e3e9ef',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 20px',
        }}
      >
        {['#8da0b4', '#9aabc0', '#a7b6c7'].map((color) => (
          <i
            key={color}
            style={{ height: 10, width: 10, borderRadius: '50%', background: color }}
          />
        ))}
        <span
          style={{
            marginLeft: 24,
            width: 360,
            height: 24,
            borderRadius: 12,
            background: 'rgba(255,255,255,.78)',
            color: muted,
            fontSize: 15,
            lineHeight: '24px',
            paddingLeft: 18,
          }}
        >
          usesplitt.xyz/demo
        </span>
      </div>
      <Img
        src={staticFile(image)}
        style={{
          width: 1480,
          height: 650,
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block',
        }}
      />
    </div>
  );
}

function Scene({ scene, index }: { scene: (typeof scenes)[number]; index: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 24, stiffness: 130, mass: 0.9 } });
  const exit = interpolate(frame, [sceneFrames - 18, sceneFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const evidence = [
    ['Public surface', 'Website + HTTPS API'],
    ['Circle execution', '4 confirmed batches'],
    ['Arc activity', '2.4 test USDC'],
    ['Latest model run', 'Haiku → 0.3 USDC'],
  ];
  return (
    <AbsoluteFill
      style={{
        padding: '58px 100px 64px',
        color: ink,
        opacity: enter * exit,
        transform: `translateY(${(1 - enter) * 16}px)`,
      }}
    >
      <Audio src={staticFile(`voice-${index}.wav`)} volume={0.9} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 22,
          color: muted,
        }}
      >
        <span style={{ fontFamily: 'Grotesk', fontSize: 38, color: deep, letterSpacing: -1 }}>
          splitt.
        </span>
        <span>Hackathon walkthrough · 17 October 2026</span>
      </div>
      <h1
        style={{
          fontFamily: 'Grotesk',
          fontSize: 68,
          fontWeight: 500,
          letterSpacing: -2.4,
          lineHeight: 1.02,
          margin: '28px 0 24px',
          maxWidth: 1500,
        }}
      >
        {scene.title}
      </h1>
      {scene.kind === 'screen' && <BrowserFrame image={scene.image!} frame={frame} />}
      {scene.kind === 'hook' && (
        <div style={{ marginTop: 78 }}>
          <p
            style={{
              fontFamily: 'Georgia',
              fontStyle: 'italic',
              fontSize: 92,
              lineHeight: 1.05,
              margin: 0,
              color: deep,
              maxWidth: 1400,
            }}
          >
            {scene.accent}
          </p>
          <div style={{ display: 'flex', gap: 82, marginTop: 68 }}>
            {[
              ['Invoice', '2,000'],
              ['Received', '1,200'],
              ['Protected', '300'],
            ].map(([label, value], i) => (
              <div
                key={label}
                style={{
                  opacity: rise(frame, 16 + i * 10, fps),
                  transform: `translateY(${(1 - rise(frame, 16 + i * 10, fps)) * 20}px)`,
                }}
              >
                <p style={{ fontSize: 25, color: muted, margin: '0 0 12px' }}>{label}</p>
                <strong
                  style={{
                    fontFamily: 'Grotesk',
                    fontSize: 78,
                    fontWeight: 500,
                    letterSpacing: -2,
                  }}
                >
                  {value}
                  <small
                    style={{ fontFamily: 'Poppins', fontSize: 22, marginLeft: 13, color: muted }}
                  >
                    USDC
                  </small>
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {scene.kind === 'control' && (
        <div style={{ marginTop: 58, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          {[
            'Check current facts and policy',
            'Review the exact EIP-712 batch',
            'Execute through Circle',
            'Reconcile against chain state',
          ].map((text, i) => (
            <div
              key={text}
              style={{
                display: 'flex',
                gap: 24,
                alignItems: 'center',
                border: `1px solid ${line}`,
                borderRadius: 18,
                padding: '32px 34px',
                fontSize: 31,
                background: 'rgba(251,252,254,.82)',
                boxShadow: '0 16px 45px rgba(24,58,96,.08)',
                opacity: rise(frame, 12 + i * 8, fps),
                transform: `translateY(${(1 - rise(frame, 12 + i * 8, fps)) * 18}px)`,
              }}
            >
              <span style={{ color: accent, fontFamily: 'Grotesk', fontSize: 30 }}>0{i + 1}</span>
              {text}
            </div>
          ))}
        </div>
      )}
      {scene.kind === 'isolation' && (
        <div style={{ display: 'flex', gap: 36, marginTop: 74 }}>
          {[
            ['Northstar', '800', 'Obligations complete'],
            ['Fieldwork', '1,000', 'Separate balance untouched'],
          ].map(([name, value, detail], i) => (
            <div
              key={name}
              style={{
                flex: 1,
                border: `1px solid ${line}`,
                borderTop: `4px solid ${i === 0 ? accent : deep}`,
                borderRadius: 18,
                padding: '38px 42px',
                background: surface,
                boxShadow: '0 18px 55px rgba(24,58,96,.09)',
                opacity: rise(frame, 14 + i * 12, fps),
              }}
            >
              <p style={{ fontSize: 30, margin: 0, color: muted }}>{name}</p>
              <p
                style={{
                  fontFamily: 'Grotesk',
                  fontSize: 106,
                  letterSpacing: -3,
                  margin: '18px 0',
                }}
              >
                {value}
                <small style={{ fontSize: 25, marginLeft: 16, color: muted }}>USDC</small>
              </p>
              <p style={{ fontSize: 26, color: muted, margin: 0 }}>{detail}</p>
            </div>
          ))}
        </div>
      )}
      {scene.kind === 'proof' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 45 }}>
          {evidence.map(([label, value], i) => (
            <div
              key={label}
              style={{
                border: `1px solid ${line}`,
                borderRadius: 18,
                padding: '28px 34px',
                background: surface,
                boxShadow: '0 14px 44px rgba(24,58,96,.08)',
                opacity: rise(frame, 10 + i * 8, fps),
              }}
            >
              <p style={{ fontSize: 22, color: muted, margin: '0 0 8px' }}>{label}</p>
              <p
                style={{
                  fontFamily: 'Grotesk',
                  fontSize: 39,
                  margin: 0,
                  color: i === 2 ? accent : ink,
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      )}
      {scene.kind === 'end' && (
        <div
          style={{
            marginTop: 70,
            display: 'grid',
            gridTemplateColumns: '1.1fr .9fr',
            gap: 80,
            alignItems: 'center',
          }}
        >
          <div>
            <p
              style={{
                fontFamily: 'Georgia',
                fontStyle: 'italic',
                fontSize: 86,
                lineHeight: 1,
                margin: '0 0 35px',
                color: deep,
              }}
            >
              {scene.accent}
            </p>
            <p style={{ fontSize: 34, lineHeight: 1.5, margin: 0, maxWidth: 900 }}>
              Connect a wallet for the live flow.
              <br />
              Preview it without one.
            </p>
          </div>
          <div
            style={{
              border: `1px solid ${line}`,
              borderRadius: 20,
              padding: '36px 40px',
              background: surface,
              boxShadow: '0 20px 60px rgba(24,58,96,.1)',
            }}
          >
            <p style={{ fontSize: 23, color: muted, margin: '0 0 18px' }}>Release evidence</p>
            <p style={{ fontFamily: 'Grotesk', fontSize: 35, lineHeight: 1.5, margin: 0 }}>
              185 passing tests
              <br />
              Verified contract
              <br />
              Public API
            </p>
            <p style={{ fontSize: 21, color: muted, margin: '24px 0 0' }}>
              Controlled test wallets · verified businesses: 0
            </p>
          </div>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 46,
          left: 100,
          right: 100,
          display: 'flex',
          gap: 40,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ fontSize: 23, maxWidth: 1450, lineHeight: 1.45, margin: 0, color: muted }}>
          {scene.caption}
        </p>
        <span style={{ fontFamily: 'Grotesk', fontSize: 25, color: deep }}>
          {String(index + 1).padStart(2, '0')} / 08
        </span>
      </div>
    </AbsoluteFill>
  );
}

function Walkthrough() {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Loading Splitt fonts'));
  useEffect(() => {
    Promise.all([
      document.fonts.load('500 32px Grotesk'),
      document.fonts.load('400 32px Poppins'),
    ]).then(() => continueRender(fontHandle));
  }, [fontHandle]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 28% 22%, ${surface} 0%, ${canvas} 46%, #e4eaf0 100%)`,
        fontFamily: 'Poppins',
        overflow: 'hidden',
      }}
    >
      <style>{`@font-face{font-family:Grotesk;src:url('${staticFile('grotesk.woff2')}')}@font-face{font-family:Poppins;src:url('${staticFile('poppins.woff2')}')}`}</style>
      <div
        style={{
          position: 'absolute',
          width: 1050,
          height: 1050,
          border: '1px dotted rgba(69,108,152,.16)',
          borderRadius: '50%',
          right: -350,
          top: -320,
          transform: `rotate(${frame * 0.025}deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 620,
          height: 620,
          border: '1px dotted rgba(24,58,96,.1)',
          borderRadius: '50%',
          left: -260,
          bottom: -320,
          transform: `rotate(${-frame * 0.018}deg)`,
        }}
      />
      {scenes.map((scene, index) => (
        <Sequence
          key={index}
          from={index * sceneFrames}
          durationInFrames={sceneFrames}
          premountFor={30}
        >
          <Scene scene={scene} index={index} />
        </Sequence>
      ))}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 5,
          width: `${(100 * frame) / (sceneFrames * scenes.length)}%`,
          background: accent,
        }}
      />
    </AbsoluteFill>
  );
}
registerRoot(() => (
  <Composition
    id="SplittDemo"
    component={Walkthrough}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={scenes.length * sceneFrames}
  />
));
