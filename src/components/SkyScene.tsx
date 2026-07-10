import { useEffect, useRef } from "react";

interface Props {
  /** The (possibly simulated) current time that drives the sky. */
  now: Date;
}

type RGB = [number, number, number];

interface Stop {
  h: number;
  top: RGB;
  bottom: RGB;
}

/*
 * Cool, moody keyframes so the sky stays a readable backdrop for the graphite
 * UI while still telling the time of day. Dawn brings a teal glow at the
 * horizon that rhymes with the brand accent.
 */
const STOPS_DARK: Stop[] = [
  { h: 0, top: [8, 10, 16], bottom: [10, 14, 24] },
  { h: 5, top: [10, 14, 26], bottom: [16, 26, 40] },
  { h: 6.5, top: [13, 20, 34], bottom: [22, 52, 60] },
  { h: 8, top: [15, 26, 38], bottom: [24, 58, 62] },
  { h: 12, top: [16, 30, 40], bottom: [22, 50, 56] },
  { h: 17, top: [16, 24, 36], bottom: [30, 40, 54] },
  { h: 19, top: [14, 14, 26], bottom: [34, 22, 40] },
  { h: 21, top: [10, 12, 20], bottom: [14, 16, 30] },
  { h: 24, top: [8, 10, 16], bottom: [10, 14, 24] },
];

/* Light theme: a quiet weathered sky with restrained green and dawn warmth. */
const STOPS_LIGHT: Stop[] = [
  { h: 0, top: [224, 230, 227], bottom: [235, 238, 236] },
  { h: 5, top: [218, 228, 225], bottom: [235, 234, 229] },
  { h: 6.5, top: [210, 227, 223], bottom: [244, 231, 216] },
  { h: 8, top: [211, 229, 225], bottom: [234, 241, 238] },
  { h: 12, top: [207, 225, 222], bottom: [237, 242, 240] },
  { h: 17, top: [214, 225, 223], bottom: [243, 231, 226] },
  { h: 19, top: [219, 219, 218], bottom: [242, 229, 226] },
  { h: 21, top: [221, 228, 225], bottom: [235, 237, 234] },
  { h: 24, top: [224, 230, 227], bottom: [235, 238, 236] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const rgb = (c: RGB, alpha = 1) =>
  `rgba(${c[0].toFixed(0)}, ${c[1].toFixed(0)}, ${c[2].toFixed(0)}, ${alpha})`;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (t: number) => t * t * (3 - 2 * t);

function skyAt(hf: number, stops: Stop[]): { top: RGB; bottom: RGB } {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (hf >= a.h && hf <= b.h) {
      const t = smooth((hf - a.h) / (b.h - a.h));
      return { top: lerpRGB(a.top, b.top, t), bottom: lerpRGB(a.bottom, b.bottom, t) };
    }
  }
  return { top: stops[0]!.top, bottom: stops[0]!.bottom };
}

/** Stars on a deterministic grid so they don't jump between renders. */
const STARS = Array.from({ length: 90 }, (_, i) => {
  const r = Math.sin(i * 127.1) * 43758.5453;
  const rx = r - Math.floor(r);
  const r2 = Math.sin(i * 311.7) * 24634.6345;
  const ry = r2 - Math.floor(r2);
  const r3 = Math.sin(i * 74.7) * 9871.234;
  const rp = r3 - Math.floor(r3);
  return { x: rx, y: ry * 0.62, size: 0.5 + rp * 1.3, phase: rp * Math.PI * 2 };
});

const SUNRISE = 6.3;
const SUNSET = 19.6;

export function SkyScene({ now }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const light = window.matchMedia?.("(prefers-color-scheme: light)").matches;
    const stops = light ? STOPS_LIGHT : STOPS_DARK;

    let raf = 0;
    let disposed = false;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (tMs: number) => {
      if (disposed) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const d = nowRef.current;
      const hf = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

      const { top, bottom } = skyAt(hf, stops);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, rgb(top));
      grad.addColorStop(1, rgb(bottom));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Night factor → star visibility. Stars belong to the dark theme only.
      const night = light
        ? 0
        : clamp01(
            Math.max(
              hf < 12 ? (SUNRISE + 1.2 - hf) / 2.2 : (hf - (SUNSET - 1.2)) / 2.2,
              0,
            ),
          );
      if (night > 0.02) {
        for (const s of STARS) {
          const twinkle = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(tMs / 900 + s.phase);
          ctx.globalAlpha = night * twinkle * 0.9;
          ctx.fillStyle = "#eaf2ff";
          ctx.beginPath();
          ctx.arc(s.x * W, s.y * H, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Sun / moon arc across the sky.
      const dayT = (hf - SUNRISE) / (SUNSET - SUNRISE); // 0 at rise, 1 at set
      const up = dayT >= -0.06 && dayT <= 1.06;
      const bodyX = W * clamp01(dayT);
      const bodyY = H * 0.9 - Math.sin(Math.PI * clamp01(dayT)) * H * 0.72;

      if (up) {
        // warm-ish low sun, cool high sun; kept subtle
        const alt = Math.sin(Math.PI * clamp01(dayT));
        const sun: RGB = [
          lerp(255, 210, alt),
          lerp(196, 232, alt),
          lerp(150, 240, alt),
        ];
        const glow = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, 190);
        glow.addColorStop(0, rgb(sun, 0.5));
        glow.addColorStop(1, rgb(sun, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = rgb(sun, 0.95);
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, 15, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Moon rides the same arc on the night side.
        const moonT = ((hf + 12 - SUNRISE) / (SUNSET - SUNRISE)) % 2;
        const mx = W * clamp01(moonT);
        const my = H * 0.9 - Math.sin(Math.PI * clamp01(moonT)) * H * 0.7;
        ctx.globalAlpha = night;
        const mglow = ctx.createRadialGradient(mx, my, 0, mx, my, 120);
        mglow.addColorStop(0, "rgba(200, 214, 240, 0.28)");
        mglow.addColorStop(1, "rgba(200, 214, 240, 0)");
        ctx.fillStyle = mglow;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(226, 232, 246, 0.9)";
        ctx.beginPath();
        ctx.arc(mx, my, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Dawn/dusk horizon glow in the brand's teal, strongest around sunrise.
      const dawnBand = Math.max(
        0,
        1 - Math.min(Math.abs(hf - SUNRISE), Math.abs(hf - SUNSET)) / 2.4,
      );
      if (dawnBand > 0.02) {
        const hg = ctx.createLinearGradient(0, H * 0.55, 0, H);
        hg.addColorStop(0, "rgba(47, 211, 166, 0)");
        hg.addColorStop(1, `rgba(47, 211, 166, ${(dawnBand * 0.22).toFixed(3)})`);
        ctx.fillStyle = hg;
        ctx.fillRect(0, H * 0.55, W, H * 0.45);
      }

      if (!reduce) raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    // In reduced-motion, still repaint on a slow timer so the sky follows time.
    const slow = reduce
      ? window.setInterval(() => draw(0), 1000)
      : 0;

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      if (slow) window.clearInterval(slow);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="sky-canvas" aria-hidden />;
}
