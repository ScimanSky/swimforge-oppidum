/**
 * Post Reactions Component - Reazioni emotive avanzate
 * Supporta: splash (💧), fire (🔥), strong (💪), clap (👏), wave (🌊)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Droplet } from "lucide-react";

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
};

export default function PostReactions({
  postId,
  initialReactions = [],
  userReaction,
  onReactionChange,
}: PostReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
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
    onSuccess: () => {
      utils.community.reactions.list.invalidate({ postId });
      utils.community.reactions.userReaction.invalidate({ postId });
      utils.community.feed.invalidate();
      utils.community.clubs.feed.invalidate();
      if (onReactionChange) onReactionChange();
    },
  });

  const handleReaction = (reactionType: keyof typeof reactionEmojis) => {
    toggleReactionMutation.mutate({ postId, reactionType });
    setIsOpen(false);
  };

  // Calcola il totale delle reazioni
  const totalReactions = reactionsQuery.data?.reduce(
    (acc: number, r: any) => acc + (r.count || 0),
    0
  ) || 0;

  // Ottieni la reazione dell'utente corrente
  const currentUserReaction = userReactionQuery.data?.reactionType;

  // Raggruppa le reazioni per tipo
  const reactionCounts = reactionsQuery.data?.reduce((acc: any, r: any) => {
    acc[r.reactionType] = r.count;
    return acc;
  }, {}) || {};

  return (
    <div className="flex items-center gap-2">
      {/* Picker delle reazioni */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1 hover:scale-110 transition-transform",
              currentUserReaction && reactionEmojis[currentUserReaction as keyof typeof reactionEmojis]?.color
            )}
          >
            {currentUserReaction && reactionEmojis[currentUserReaction as keyof typeof reactionEmojis] ? (
              <span className="text-lg">
                {reactionEmojis[currentUserReaction as keyof typeof reactionEmojis].emoji}
              </span>
            ) : (
              <Droplet className="h-4 w-4" />
            )}
            {totalReactions > 0 && <span className="text-sm">{totalReactions}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {Object.entries(reactionEmojis).map(([type, { emoji, label }]) => (
              <button
                key={type}
                onClick={() => handleReaction(type as keyof typeof reactionEmojis)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-accent transition-all hover:scale-110",
                  currentUserReaction === type && "bg-accent"
                )}
                title={label}
              >
                <span className="text-2xl">{emoji}</span>
                {reactionCounts[type] > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {reactionCounts[type]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Mostra le reazioni raggruppate */}
      {reactionsQuery.data && reactionsQuery.data.length > 0 && (
        <div className="flex gap-1">
          {reactionsQuery.data.slice(0, 3).map((reaction: any) => (
            <div
              key={reaction.reactionType}
              className="flex items-center gap-1 text-xs bg-accent/50 rounded-full px-2 py-1"
              title={`${reaction.count} ${reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis]?.label || ""}`}
            >
              <span>{reactionEmojis[reaction.reactionType as keyof typeof reactionEmojis]?.emoji}</span>
              <span className="text-muted-foreground">{reaction.count}</span>
            </div>
          ))}
          {reactionsQuery.data.length > 3 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-xs text-muted-foreground hover:text-foreground">
                  +{reactionsQuery.data.length - 3}
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
                      <span className="text-sm font-semibold">{reaction.count}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}
