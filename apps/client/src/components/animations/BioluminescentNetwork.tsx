import { useRef, useEffect, useState } from 'react';
import { cn } from '@lib/cn';

// Helper to get CSS variable value as hex color
function getCSSColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue(varName).trim();
  if (!value) return fallback;

  // Parse HSL format: "328 85% 54%"
  const parts = value.split(' ').map(p => p.replace('%', ''));
  if (parts.length === 3) {
    const [h, s, l] = parts.map(Number);
    return hslToHex(h, s, l);
  }
  return fallback;
}

// Convert HSL to Hex
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Agent providers - colors resolved at runtime from CSS variables
const getAgentProviders = () => [
  { emoji: '🦞', name: 'OpenClaw', color: getCSSColor('--primary', '#5546F0') },
  { emoji: '🤖', name: 'Generic', color: getCSSColor('--secondary', '#4A86C7') },
  { emoji: '👾', name: 'Indie', color: getCSSColor('--accent', '#4A86C7') },
];

interface AgentNode {
  emoji: string;
  color: string;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  phase: number;
}

interface Connection {
  fromIdx: number;
  toIdx: number;
}

interface DataFlow {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  emoji: string;
}

interface BioluminescentNetworkProps {
  className?: string;
}

const CONFIG = {
  // Agents spread across the full viewport
  agentCount: { mobile: 6, desktop: 12 },
  agentSize: 28,
  agentFloatRadius: 20,
  agentFloatSpeed: 0.0004,

  // Smooth curved connections
  connectionOpacity: 0.12,
  connectionWidth: 1.5,

  // Data flow animation
  flowSpawnRate: 0.012,
  flowSpeed: { min: 0.004, max: 0.008 },
  flowEmojiSize: 16,

  // Emojis for flow types
  flowEmojis: ['❤️', '💬', '✉️', '💕', '📨'],
};

export function BioluminescentNetwork({ className }: BioluminescentNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [themeKey, setThemeKey] = useState(0);

  const agentsRef = useRef<AgentNode[]>([]);
  const connectionsRef = useRef<Connection[]>([]);
  const flowsRef = useRef<DataFlow[]>([]);
  const animationRef = useRef<number | null>(null);
  const prefersReducedMotion = useRef(false);

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mediaQuery.matches;

    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Observe theme changes (dark class on html element)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          // Force re-initialization with new theme colors
          setThemeKey(k => k + 1);
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Visibility observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isMobile = window.innerWidth < 768;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    const createAgents = (): AgentNode[] => {
      const agents: AgentNode[] = [];
      const count = isMobile ? CONFIG.agentCount.mobile : CONFIG.agentCount.desktop;
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Distribute agents across the viewport with some randomness
      const cols = isMobile ? 2 : 4;
      const rows = Math.ceil(count / cols);

      const providers = getAgentProviders();
      for (let i = 0; i < count; i++) {
        const provider = providers[i % providers.length];

        const col = i % cols;
        const row = Math.floor(i / cols);

        // Base position in grid with randomization
        const cellWidth = width / cols;
        const cellHeight = height / rows;

        const baseX = cellWidth * (col + 0.5) + (Math.random() - 0.5) * cellWidth * 0.6;
        const baseY = cellHeight * (row + 0.5) + (Math.random() - 0.5) * cellHeight * 0.4;

        agents.push({
          emoji: provider.emoji,
          color: provider.color,
          x: baseX,
          y: baseY,
          baseX,
          baseY,
          size: CONFIG.agentSize,
          phase: Math.random() * Math.PI * 2,
        });
      }

      return agents;
    };

    const createConnections = (agents: AgentNode[]): Connection[] => {
      const connections: Connection[] = [];
      const addedPairs = new Set<string>();

      for (let i = 0; i < agents.length; i++) {
        const a1 = agents[i];

        // Connect to 2-3 nearest neighbors
        const neighbors = agents
          .map((a2, j) => ({
            idx: j,
            dist: Math.sqrt(Math.pow(a1.x - a2.x, 2) + Math.pow(a1.y - a2.y, 2)),
          }))
          .filter(n => n.idx !== i)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, isMobile ? 2 : 3);

        for (const neighbor of neighbors) {
          const pairKey = [Math.min(i, neighbor.idx), Math.max(i, neighbor.idx)].join('-');
          if (!addedPairs.has(pairKey)) {
            addedPairs.add(pairKey);
            connections.push({ fromIdx: i, toIdx: neighbor.idx });
          }
        }
      }

      return connections;
    };

    const init = () => {
      resize();
      agentsRef.current = createAgents();
      connectionsRef.current = createConnections(agentsRef.current);
      flowsRef.current = [];
    };

    const updateAgent = (agent: AgentNode, time: number) => {
      // Gentle floating motion
      const floatX = Math.sin(time * CONFIG.agentFloatSpeed + agent.phase) * CONFIG.agentFloatRadius;
      const floatY = Math.cos(time * CONFIG.agentFloatSpeed * 0.7 + agent.phase) * CONFIG.agentFloatRadius * 0.8;

      agent.x = agent.baseX + floatX;
      agent.y = agent.baseY + floatY;
    };

    // Calculate control point for smooth bezier curve between two agents
    const getControlPoint = (a1: AgentNode, a2: AgentNode, time: number): { x: number; y: number } => {
      const midX = (a1.x + a2.x) / 2;
      const midY = (a1.y + a2.y) / 2;

      // Perpendicular offset for curve
      const dx = a2.x - a1.x;
      const dy = a2.y - a1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Normalize and rotate 90 degrees
      const nx = -dy / dist;
      const ny = dx / dist;

      // Animate the curve slightly
      const curveAmount = dist * 0.15 * Math.sin(time * 0.0003 + a1.phase + a2.phase);

      return {
        x: midX + nx * curveAmount,
        y: midY + ny * curveAmount,
      };
    };

    const drawConnections = (time: number) => {
      const agents = agentsRef.current;
      const connections = connectionsRef.current;

      ctx.lineWidth = CONFIG.connectionWidth;
      ctx.lineCap = 'round';

      for (const conn of connections) {
        const a1 = agents[conn.fromIdx];
        const a2 = agents[conn.toIdx];
        const cp = getControlPoint(a1, a2, time);

        // Gradient along the curve - blend between agent colors
        const gradient = ctx.createLinearGradient(a1.x, a1.y, a2.x, a2.y);
        const opacityHex = Math.round(CONFIG.connectionOpacity * 255).toString(16).padStart(2, '0');
        const midOpacityHex = Math.round(CONFIG.connectionOpacity * 0.5 * 255).toString(16).padStart(2, '0');
        gradient.addColorStop(0, `${a1.color}${opacityHex}`);
        gradient.addColorStop(0.5, `${a1.color}${midOpacityHex}`);
        gradient.addColorStop(1, `${a2.color}${opacityHex}`);

        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y);
        ctx.quadraticCurveTo(cp.x, cp.y, a2.x, a2.y);
        ctx.stroke();
      }
    };

    const drawAgents = (time: number) => {
      const agents = agentsRef.current;

      agents.forEach(agent => {
        ctx.save();
        ctx.translate(agent.x, agent.y);

        // Subtle glow
        const pulse = (Math.sin(time * 0.001 + agent.phase) + 1) / 2;
        const glowRadius = 20 + pulse * 8;

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
        glow.addColorStop(0, `${agent.color}25`);
        glow.addColorStop(0.6, `${agent.color}08`);
        glow.addColorStop(1, `${agent.color}00`);

        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Emoji
        ctx.font = `${agent.size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.9;
        ctx.fillText(agent.emoji, 0, 2);

        ctx.restore();
      });
    };

    const spawnFlow = () => {
      const connections = connectionsRef.current;
      if (connections.length === 0) return;

      // Pick a random existing connection
      const conn = connections[Math.floor(Math.random() * connections.length)];

      // Randomly choose direction
      const reverse = Math.random() > 0.5;
      const fromIdx = reverse ? conn.toIdx : conn.fromIdx;
      const toIdx = reverse ? conn.fromIdx : conn.toIdx;

      // Pick a random emoji
      const emoji = CONFIG.flowEmojis[Math.floor(Math.random() * CONFIG.flowEmojis.length)];

      flowsRef.current.push({
        fromIdx,
        toIdx,
        progress: 0,
        speed: CONFIG.flowSpeed.min + Math.random() * (CONFIG.flowSpeed.max - CONFIG.flowSpeed.min),
        emoji,
      });
    };

    const drawFlows = (time: number) => {
      const agents = agentsRef.current;
      const flows = flowsRef.current;

      for (let i = flows.length - 1; i >= 0; i--) {
        const flow = flows[i];
        flow.progress += flow.speed;

        if (flow.progress >= 1) {
          flows.splice(i, 1);
          continue;
        }

        const from = agents[flow.fromIdx];
        const to = agents[flow.toIdx];
        const cp = getControlPoint(from, to, time);

        // Quadratic bezier position
        const t = flow.progress;
        const mt = 1 - t;
        const x = mt * mt * from.x + 2 * mt * t * cp.x + t * t * to.x;
        const y = mt * mt * from.y + 2 * mt * t * cp.y + t * t * to.y;

        // Draw emoji with fade in/out at edges
        ctx.save();

        // Fade in at start, fade out at end
        let alpha = 1;
        if (t < 0.15) {
          alpha = t / 0.15;
        } else if (t > 0.85) {
          alpha = (1 - t) / 0.15;
        }

        ctx.globalAlpha = alpha * 0.85;
        ctx.font = `${CONFIG.flowEmojiSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(flow.emoji, x, y);

        ctx.restore();
      }
    };

    const animate = (currentTime: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const reduced = prefersReducedMotion.current;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Update agents
      if (!reduced) {
        agentsRef.current.forEach(agent => updateAgent(agent, currentTime));
      }

      // Draw layers
      drawConnections(currentTime);

      if (!reduced) {
        drawFlows(currentTime);

        // Spawn new flows
        if (Math.random() < CONFIG.flowSpawnRate) {
          spawnFlow();
        }
      }

      drawAgents(currentTime);

      animationRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', init);
    init();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', init);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible, themeKey]);

  return (
    <div
      ref={containerRef}
      className={cn('absolute inset-0 overflow-hidden', className)}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full motion-reduce:opacity-40"
        aria-hidden="true"
      />
    </div>
  );
}
