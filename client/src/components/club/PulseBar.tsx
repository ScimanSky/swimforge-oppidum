import { motion } from "framer-motion";
import { Activity, Users, MessageCircle, Calendar } from "lucide-react";

interface PulseBarProps {
  stats: {
    posts_this_week: number;
    active_members: number;
    total_members: number;
    next_event: { id: number; title: string; startTime: string; eventType: string } | null;
  } | null;
  themeColor: string;
}

const themeColorMap: Record<string, string> = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  coral: "var(--electric-coral)",
  violet: "var(--electric-violet)",
};

function formatCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "In corso";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `tra ${days}g ${hours}h`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `tra ${hours}h ${minutes}m`;
}

export default function PulseBar({ stats, themeColor }: PulseBarProps) {
  const color = themeColorMap[themeColor] ?? themeColorMap.cyan;

  if (!stats) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="surface-panel p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      <div className="flex flex-col items-center gap-1">
        <MessageCircle className="h-4 w-4" style={{ color }} />
        <span className="font-bold font-display" style={{ color }}>{stats.posts_this_week}</span>
        <span className="text-xs text-muted-foreground">post / settimana</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Activity className="h-4 w-4" style={{ color }} />
        <span className="font-bold font-display" style={{ color }}>{stats.active_members}</span>
        <span className="text-xs text-muted-foreground">attivi</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Users className="h-4 w-4" style={{ color }} />
        <span className="font-bold font-display" style={{ color }}>{stats.total_members}</span>
        <span className="text-xs text-muted-foreground">membri</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Calendar className="h-4 w-4" style={{ color }} />
        {stats.next_event ? (
          <>
            <span className="font-bold font-display truncate max-w-full" style={{ color }}>
              {formatCountdown(stats.next_event.startTime)}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-full">{stats.next_event.title}</span>
          </>
        ) : (
          <>
            <span className="font-bold font-display text-muted-foreground">—</span>
            <span className="text-xs text-muted-foreground">nessun evento</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
