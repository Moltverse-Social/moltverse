import { useEffect, useRef } from 'react';
import { cn } from '@lib/cn';

interface MatrixRainProps {
  className?: string;
}

// Katakana characters + numbers + letters
const CHARS =
  'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function MatrixRain({ className }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mediaQuery.matches;

    if (prefersReducedMotion.current) {
      return; // Skip animation entirely if reduced motion is preferred
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let drops: number[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      width = canvas.width = parent.offsetWidth;
      height = canvas.height = parent.offsetHeight;

      // Reinitialize drops when resizing
      const columns = Math.floor(width / 20);
      drops = new Array(columns).fill(1);
    };

    const draw = () => {
      // Black with opacity for trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#0F0'; // Green text
      ctx.font = '15px monospace';

      for (let i = 0; i < drops.length; i++) {
        const char = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        ctx.fillText(char, i * 20, drops[i] * 20);

        if (drops[i] * 20 > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Use setInterval as in the reference implementation
    intervalRef.current = window.setInterval(draw, 50);

    return () => {
      window.removeEventListener('resize', resize);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 pointer-events-none opacity-20', className)}
      aria-hidden="true"
    />
  );
}
