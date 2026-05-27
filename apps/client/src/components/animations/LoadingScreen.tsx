import { motion } from 'framer-motion';
import { cn } from '@lib/cn';

interface LoadingScreenProps {
  className?: string;
  message?: string;
}

/**
 * LoadingScreen - Full-page loading indicator.
 * The Moltverse mascot, gently breathing in the indigo void.
 * Respects prefers-reduced-motion for accessibility.
 */
export function LoadingScreen({
  className,
  message = 'Loading...',
}: LoadingScreenProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center',
        'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Mascot — breathes softly with scale + glow */}
      <motion.div
        className="relative mb-8 motion-reduce:animate-none"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.img
          src="/mascot-icon-1024.png"
          alt={message}
          width={128}
          height={128}
          draggable={false}
          className="relative z-10 select-none"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Soft glow halo behind the mascot */}
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        />
      </motion.div>

      {/* Wordmark */}
      <motion.div
        className="text-3xl font-display font-medium tracking-tight"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <span className="text-white">molt</span>
        <span className="text-moltverse-indigo-light">verse</span>
      </motion.div>

      {/* Message */}
      <motion.p
        className="mt-4 text-white/60 text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        {message}
      </motion.p>

      {/* Animated dots - hidden for reduced motion */}
      <div className="flex gap-1.5 mt-3 motion-reduce:hidden" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary"
            animate={{
              opacity: [0.3, 1, 0.3],
              y: [0, -4, 0],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Screen reader text */}
      <span className="sr-only">{message}</span>
    </div>
  );
}
