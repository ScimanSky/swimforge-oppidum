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
import { formatInteger } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { Droplet, Heart } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

interface PostReactionsProps {
  postId: number;
  initialReactions?: any[];
  userReaction?: any;
  onReactionChange?: () => void;
  /**
   * "heart" (Corsia feed): one heart, filled in the XP colour when you reacted, with the
   * total count; the picker is the same. "emoji" (default): the reaction and the grouped emoji.
   */
  variant?: "emoji" | "heart";
}

// The emoji carry their own colours: no colour classes around them (Corsia tokens only).
const reactionEmojis = {
  splash: { emoji: "💧", label: "Splash" },
  fire: { emoji: "🔥", label: "Fuoco" },
  strong: { emoji: "💪", label: "Forza" },
  clap: { emoji: "👏", label: "Applauso" },
  wave: { emoji: "🌊", label: "Onda" },
  love: { emoji: "❤️", label: "Cuore" },
  rocket: { emoji: "🚀", label: "Razzo" },
  wow: { emoji: "🤯", label: "Wow" },
  laugh: { emoji: "😂", label: "Risata" },
  cry: { emoji: "😢", label: "Pianto" },
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
  initialReactions,
  userReaction,
  onReactionChange,
  variant = "emoji",
}: PostReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [burstReactions, setBurstReactions] = useState<FloatingReaction[]>([]);
  const utils = trpc.useUtils();

  const reactionsQuery = trpc.community.reactions.list.useQuery(
    { postId },
    {
      // Seed only real data: an empty default would count as fresh for staleTime and the
      // reactions would never be fetched on mount.
      ...(initialReactions ? { initialData: initialReactions } : {}),
      staleTime: 15_000,
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
        toast.success(`+${formatInteger(data.actionXp.awardedXp)} XP`);
      }
    },
    onError: (error) => toast.error(errorToastMessage(error, "Reazione non riuscita, riprova")),
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
  const totalReactions = (reactionsQuery.data ?? []).reduce(
    (sum: number, reaction: any) => sum + (Number(reaction?.count) || 0),
    0
  );
  const isHeart = variant === "heart";

  return (
    <div className="relative flex items-center gap-2">
      {/* Picker delle reazioni */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {isHeart ? (
            <button
              type="button"
              aria-label={`${currentUserReaction ? "Cambia reazione" : "Reagisci"}, ${totalReactions} ${totalReactions === 1 ? "reazione" : "reazioni"}`}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-foreground transition-colors hover:bg-raised"
            >
              <Heart
                aria-hidden
                className={cn(
                  "size-[22px]",
                  currentUserReaction ? "fill-current text-xp" : "text-muted-foreground"
                )}
              />
              {totalReactions > 0 ? <span className="tabular-nums">{formatInteger(totalReactions)}</span> : null}
            </button>
          ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label={
              currentReactionConfig
                ? `La tua reazione: ${currentReactionConfig.label}. Cambia reazione`
                : "Reagisci"
            }
            className="gap-1 transition-transform hover:scale-110"
          >
            {currentUserReaction && currentReactionConfig ? (
              <motion.span
                key={triggerAnimationKey}
                aria-hidden
                className="text-lg"
                initial={{ scale: 0.75, rotate: -14, y: 3 }}
                animate={{ scale: 1, rotate: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              >
                {currentReactionConfig.emoji}
              </motion.span>
            ) : (
              <Droplet aria-hidden className="size-4" />
            )}
          </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {Object.entries(reactionEmojis).map(([type, { emoji, label }]) => (
              <motion.button
                key={type}
                type="button"
                aria-label={label}
                aria-pressed={currentUserReaction === type}
                onClick={() => handleReaction(type as keyof typeof reactionEmojis)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-2 transition-all hover:scale-110 hover:bg-raised",
                  currentUserReaction === type && "bg-raised"
                )}
                title={label}
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.92 }}
              >
                <motion.span
                  aria-hidden
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

      {/* Grouped reactions: emoji and count, read as «Fuoco 2». */}
      {!isHeart && reactionsQuery.data && reactionsQuery.data.length > 0 && (
        <ul aria-label="Reazioni" className="flex gap-1">
          {reactionsQuery.data.map((reaction: any) => {
            const config = reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis];
            if (!config) return null;
            return (
              <motion.li
                key={reaction.reactionType}
                className="flex h-7 items-center gap-1 rounded-full bg-raised px-2 text-xs font-semibold"
                initial={{ opacity: 0.75, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <span aria-hidden>{config.emoji}</span>
                <span className="sr-only">{config.label}</span>{" "}
                <span className="tabular-nums">{formatInteger(reaction.count)}</span>
              </motion.li>
            );
          })}
        </ul>
      )}

      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
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
