/**
 * Post Reactions Component - Reazioni emotive avanzate
 * Supporta: splash (💧), fire (🔥), strong (💪), clap (👏), wave (🌊), love (❤️), rocket (🚀), wow (🤯), laugh (😂), cry (😢)
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Droplet } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

interface PostReactionsProps {
  postId: number;
  initialReactions?: any[];
  userReaction?: any;
  onReactionChange?: () => void;
}

const reactionEmojis = {
  splash: { emoji: "💧", label: "Splash", color: "text-blue-500" },
  fire: { emoji: "🔥", label: "Fuoco", color: "text-orange-500" },
  strong: { emoji: "💪", label: "Forza", color: "text-purple-500" },
  clap: { emoji: "👏", label: "Applauso", color: "text-yellow-500" },
  wave: { emoji: "🌊", label: "Onda", color: "text-cyan-500" },
  love: { emoji: "❤️", label: "Love", color: "text-rose-500" },
  rocket: { emoji: "🚀", label: "Razzo", color: "text-emerald-500" },
  wow: { emoji: "🤯", label: "Wow", color: "text-fuchsia-500" },
  laugh: { emoji: "😂", label: "Risata", color: "text-amber-500" },
  cry: { emoji: "😢", label: "Pianto", color: "text-sky-500" },
};

type FloatingReaction = {
  id: number;
  emoji: string;
  x: number;
  drift: number;
  rotate: number;
  delay: number;
};

export default function PostReactions({
  postId,
  initialReactions = [],
  userReaction,
  onReactionChange,
}: PostReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [burstReactions, setBurstReactions] = useState<FloatingReaction[]>([]);
  const utils = trpc.useUtils();

  const reactionsQuery = trpc.community.reactions.list.useQuery(
    { postId },
    {
      enabled: isOpen,
      initialData: initialReactions,
    }
  );

  const userReactionQuery = trpc.community.reactions.userReaction.useQuery(
    { postId },
    {
      initialData: userReaction,
    }
  );

  const toggleReactionMutation = trpc.community.reactions.toggle.useMutation({
    onSuccess: (data: any) => {
      utils.community.reactions.list.invalidate({ postId });
      utils.community.reactions.userReaction.invalidate({ postId });
      utils.community.feed.invalidate();
      utils.community.clubs.feed.invalidate();
      if (onReactionChange) onReactionChange();
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`);
      }
    },
  });

  const handleReaction = (reactionType: keyof typeof reactionEmojis) => {
    const selected = reactionEmojis[reactionType];
    const now = Date.now();
    const particles: FloatingReaction[] = Array.from({ length: 6 }, (_, idx) => ({
      id: now + idx,
      emoji: selected.emoji,
      x: (Math.random() - 0.5) * 58,
      drift: (Math.random() - 0.5) * 20,
      rotate: (Math.random() - 0.5) * 34,
      delay: idx * 0.02,
    }));
    setBurstReactions((prev) => [...prev, ...particles]);
    window.setTimeout(() => {
      setBurstReactions((prev) => prev.filter((item) => !particles.some((p) => p.id === item.id)));
    }, 780);
    toggleReactionMutation.mutate({ postId, reactionType });
    setIsOpen(false);
  };

  // Ottieni la reazione dell'utente corrente
  const currentUserReaction = userReactionQuery.data?.reactionType;
  const currentReactionConfig = currentUserReaction
    ? reactionEmojis[currentUserReaction as keyof typeof reactionEmojis]
    : null;
  const triggerAnimationKey = useMemo(() => `${currentUserReaction ?? "none"}`, [currentUserReaction]);

  return (
    <div className="relative flex items-center gap-2">
      {/* Picker delle reazioni */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1 hover:scale-110 transition-transform",
              currentUserReaction && currentReactionConfig?.color
            )}
          >
            {currentUserReaction && currentReactionConfig ? (
              <motion.span
                key={triggerAnimationKey}
                className="text-lg"
                initial={{ scale: 0.75, rotate: -14, y: 3 }}
                animate={{ scale: 1, rotate: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              >
                {currentReactionConfig.emoji}
              </motion.span>
            ) : (
              <Droplet className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {Object.entries(reactionEmojis).map(([type, { emoji, label }]) => (
              <motion.button
                key={type}
                onClick={() => handleReaction(type as keyof typeof reactionEmojis)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-accent transition-all hover:scale-110",
                  currentUserReaction === type && "bg-accent"
                )}
                title={label}
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.92 }}
              >
                <motion.span
                  className="text-2xl"
                  animate={currentUserReaction === type ? { y: [0, -2, 0] } : { y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  {emoji}
                </motion.span>
              </motion.button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Mostra le reazioni raggruppate */}
      {reactionsQuery.data && reactionsQuery.data.length > 0 && (
        <div className="flex gap-1">
          {reactionsQuery.data.slice(0, 3).map((reaction: any) => (
            <motion.div
              key={reaction.reactionType}
              className="flex items-center gap-1 text-xs bg-accent/50 rounded-full px-2 py-1"
              title={`${reaction.count} ${reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis]?.label || ""}`}
              initial={{ opacity: 0.75, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span>{reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis]?.emoji}</span>
            </motion.div>
          ))}
          {reactionsQuery.data.length > 3 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-xs text-muted-foreground hover:text-foreground">
                  Altre
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Tutte le reazioni</h4>
                  {reactionsQuery.data.map((reaction: any) => (
                    <div key={reaction.reactionType} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis]?.emoji}
                        </span>
                        <span className="text-sm">
                          {reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis]?.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
        <AnimatePresence>
          {burstReactions.map((item) => (
            <motion.span
              key={item.id}
              className="absolute text-lg"
              style={{ left: item.x, bottom: 0 }}
              initial={{ opacity: 0, y: 0, x: 0, scale: 0.75, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [-2, -22, -42],
                x: [0, item.drift],
                scale: [0.75, 1.08, 0.9],
                rotate: [0, item.rotate],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.72, ease: "easeOut", delay: item.delay }}
            >
              {item.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
