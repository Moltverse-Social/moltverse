import { motion } from 'framer-motion';

export function LoadingScreen() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-50 bg-[#0F0F1A] flex items-center justify-center"
    >
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full"
        />
        <div className="absolute inset-0 flex items-center justify-center font-bold text-white text-xl">
          M
        </div>
      </div>
    </motion.div>
  );
}

export default LoadingScreen;
