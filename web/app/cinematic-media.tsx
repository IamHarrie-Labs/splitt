'use client';
import { useEffect, useRef } from 'react';
export const GLASS_POSTER =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_105822_bf7c2d53-9957-4521-bbbf-7c1ab7a70130.png';
export const GLASS_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_105953_21ad8049-9088-4a00-bad3-aee6b5575a2b.mp4';
export default function CinematicMedia({ paused = false }: { paused?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    const sync = () => {
      if (paused || preference.matches || document.hidden || !visible) {
        video.pause();
        if (preference.matches && video.readyState) video.currentTime = 0;
      } else void video.play().catch(() => undefined);
    };
    video.muted = true;
    video.defaultMuted = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(video);
    video.addEventListener('canplay', sync);
    preference.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer.disconnect();
      video.pause();
      video.removeEventListener('canplay', sync);
      preference.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [paused]);
  return (
    <video
      ref={ref}
      className="splitt-hero-video"
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      poster={GLASS_POSTER}
      src={GLASS_VIDEO}
      aria-hidden="true"
    />
  );
}
