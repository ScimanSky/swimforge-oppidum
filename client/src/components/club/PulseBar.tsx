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
  layout?: "grid" | "stackedCompact";
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

export default function PulseBar({ stats, themeColor, layout = "grid" }: PulseBarProps) {
  const color = themeColorMap[themeColor] ?? themeColorMap.cyan;

  if (!stats) return null;

  const metricItems = [
    { key: "posts", icon: MessageCircle, value: String(stats.posts_this_week), label: "post / settimana" },
    { key: "active", icon: Activity, value: String(stats.active_members), label: "attivi" },
    { key: "members", icon: Users, value: String(stats.total_members), label: "membri" },
    {
      key: "event",
      icon: Calendar,
      value: stats.next_event ? formatCountdown(stats.next_event.startTime) : "—",
      label: stats.next_event ? stats.next_event.title : "nessun evento",
    },
  ] as const;

  if (layout === "stackedCompact") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="surface-panel p-3 text-sm"
        style={{ borderColor: color, borderWidth: "1px" }}
      >
        <div className="mb-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
          Pulse del club
        </div>
        <div className="space-y-2">
          {metricItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border border-border/55 bg-background/40 px-2.5 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <item.icon className="h-4 w-4 shrink-0" style={{ color }} />
                <span className="truncate text-xs text-muted-foreground">{item.label}</span>
              </div>
              <span className="shrink-0 text-sm font-bold font-display" style={{ color }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="surface-panel p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      {metricItems.map((item) => (
        <div key={item.key} className="flex flex-col items-center gap-1">
          <item.icon className="h-4 w-4" style={{ color }} />
          <span className="font-bold font-display truncate max-w-full" style={{ color }}>
            {item.value}
          </span>
          <span className="text-xs text-muted-foreground truncate max-w-full">{item.label}</span>
        </div>
      ))}
    </motion.div>
  );
}
