import { motion } from "framer-motion";

interface BubbleAnimationProps {
  count?: number;
  className?: string;
  bubbleColor?: string;
  intensity?: "low" | "medium" | "high";
}

/**
 * BubbleAnimation Component
 * 
 * Animated floating bubbles effect used throughout the app.
 * Creates a dynamic, engaging visual effect with customizable intensity.
 * 
 * Design Philosophy: SwimForge Dark Gaming Neon Theme
 * - Uses semi-transparent white bubbles for a premium feel
 * - Smooth, continuous animations for immersive experience
 * - Adjustable intensity for different contexts
 */
export function BubbleAnimation({
  count = 20,
  className = "",
  bubbleColor = "bg-white/20",
  intensity = "medium",
}: BubbleAnimationProps) {
  // Adjust animation parameters based on intensity
  const getAnimationConfig = () => {
    switch (intensity) {
      case "low":
        return {
          yRange: [-20, 0],
          duration: [4, 6],
          opacityRange: [0.1, 0.3],
        };
      case "high":
        return {
          yRange: [-50, 0],
          duration: [2, 4],
          opacityRange: [0.3, 0.6],
        };
      case "medium":
      default:
        return {
          yRange: [-30, 0],
          duration: [3, 5],
          opacityRange: [0.2, 0.5],
        };
    }
  };

  const config = getAnimationConfig();

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {[...Array(count)].map((_, i) => {
        // Randomize bubble size (4px to 14px) for better visibility
        const size = 4 + Math.random() * 10;
        
        return (
          <motion.div
            key={i}
            className={`absolute rounded-full ${bubbleColor}`}
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [config.yRange[0], config.yRange[1]],
              opacity: [config.opacityRange[0], config.opacityRange[1]],
              x: [0, Math.random() * 20 - 10], // Slight horizontal drift
            }}
            transition={{
              duration: config.duration[0] + Math.random() * (config.duration[1] - config.duration[0]),
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

export default BubbleAnimation;
