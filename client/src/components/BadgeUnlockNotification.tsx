import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { getBadgeImageUrl } from "@/lib/badgeImages";

interface Badge {
  id: number;
  code: string;
  name: string;
  description: string;
  image_url: string;
}

interface BadgeUnlockNotificationProps {
  badges: Badge[];
  onComplete: () => void;
}

export default function BadgeUnlockNotification({ badges, onComplete }: BadgeUnlockNotificationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const currentBadge = badges[currentIndex];
  const resolvedImageUrl =
    currentBadge?.image_url ||
    (currentBadge?.code ? getBadgeImageUrl(currentBadge.code) : "");

  // Play celebration sound using Web Audio API
  const playCelebrationSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a more festive sound with multiple tones
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
      
      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };

    // Play a cheerful ascending melody
    playTone(523.25, 0, 0.15);    // C5
    playTone(659.25, 0.15, 0.15); // E5
    playTone(783.99, 0.3, 0.15);  // G5
    playTone(1046.50, 0.45, 0.3); // C6
  };

  // Trigger confetti animation
  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  };

  useEffect(() => {
    if (currentBadge) {
      playCelebrationSound();
      triggerConfetti();
    }
  }, [currentIndex]);

  const handleNext = () => {
    if (currentIndex < badges.length - 1) {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setIsVisible(true);
      }, 300);
    } else {
      setIsVisible(false);
      setTimeout(() => {
        onComplete();
      }, 300);
    }
  };

  if (!currentBadge) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={handleNext}
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 20,
              duration: 0.6 
            }}
            className="relative max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glowing background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-orange-500/20 to-pink-500/20 rounded-3xl blur-3xl animate-pulse" />
            
            {/* Main card */}
            <div className="relative bg-gradient-to-br from-[oklch(0.25_0.08_220)] to-[oklch(0.15_0.05_220)] rounded-3xl p-8 border-2 border-[oklch(0.70_0.18_220)] shadow-2xl">
              {/* Badge count indicator */}
              {badges.length > 1 && (
                <div className="absolute top-4 right-4 px-3 py-1 bg-[oklch(0.70_0.18_220)]/20 rounded-full border border-[oklch(0.70_0.18_220)]">
                  <span className="text-sm font-medium text-[oklch(0.70_0.18_220)]">
                    {currentIndex + 1} / {badges.length}
                  </span>
                </div>
              )}

              {/* Title */}
              <motion.h2
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500 bg-clip-text text-transparent"
              >
                🎉 Complimenti! 🎉
              </motion.h2>

              {/* Badge image */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ 
                  delay: 0.3, 
                  type: "spring", 
                  stiffness: 150, 
                  damping: 15 
                }}
                className="flex justify-center mb-6"
              >
                <div className="relative">
                  {/* Animated glow rings */}
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 blur-xl"
                  />
                  
                  <img
                    src={resolvedImageUrl}
                    alt={currentBadge.name}
                    className="relative w-48 h-48 object-contain drop-shadow-2xl"
                  />
                </div>
              </motion.div>

              {/* Badge info */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center space-y-3"
              >
                <p className="text-lg text-[oklch(0.80_0.03_220)]">
                  Hai sbloccato un nuovo badge!
                </p>
                <h3 className="text-2xl font-bold text-[oklch(0.95_0.01_220)]">
                  {currentBadge.name}
                </h3>
                <p className="text-[oklch(0.70_0.03_220)]">
                  {currentBadge.description}
                </p>
              </motion.div>

              {/* Tap to continue */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="mt-8 text-center"
              >
                <button
                  onClick={handleNext}
                  className="px-6 py-3 bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] rounded-full font-semibold text-white hover:opacity-90 transition-opacity shadow-lg"
                >
                  {currentIndex < badges.length - 1 ? "Prossimo Badge →" : "Continua"}
                </button>
                
                <motion.p
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-sm text-[oklch(0.60_0.03_220)] mt-3"
                >
                  Tocca per continuare
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
