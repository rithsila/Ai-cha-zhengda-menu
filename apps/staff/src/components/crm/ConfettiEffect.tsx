import { useEffect, useRef } from 'react';

type ConfettiParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRotation: number;
  alpha: number;
};

const COLORS = [
  '#10B981', // Emerald
  '#F59E0B', // Amber / Gold
  '#3B82F6', // Blue
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#14B8A6', // Teal
];

export function ConfettiEffect({ active = true, durationMs = 3500 }: { active?: boolean; durationMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const particles: ConfettiParticle[] = [];
    const count = 90;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * (height * 0.4) - 20,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 2,
        size: Math.random() * 8 + 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        vRotation: (Math.random() - 0.5) * 8,
        alpha: 1,
      });
    }

    const startTime = Date.now();
    let animationFrameId: number;

    const render = () => {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // Gravity
        p.rotation += p.vRotation;

        if (elapsed > durationMs - 1000) {
          p.alpha = Math.max(0, (durationMs - elapsed) / 1000);
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (elapsed < durationMs) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [active, durationMs]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-50 size-full"
      aria-hidden="true"
    />
  );
}
