import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, PenSquare, Calendar, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface QuickActionsFABProps {
  isMember: boolean;
  isStaff: boolean;
  onPost: () => void;
  onOpenEvents?: () => void;
  onCreateEvent: () => void;
  onCreateMeet?: () => void;
  onInvite: () => void;
}

export default function QuickActionsFAB({
  isMember,
  isStaff,
  onPost,
  onOpenEvents,
  onCreateEvent,
  onCreateMeet,
  onInvite,
}: QuickActionsFABProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isMember) return null;
  if (!mounted || typeof document === "undefined") return null;

  const actions = [
    { icon: PenSquare, label: "Posta", onClick: onPost, show: true },
    { icon: Calendar, label: "Eventi", onClick: onOpenEvents ?? (() => {}), show: Boolean(onOpenEvents) },
    { icon: Calendar, label: "Nuova convocazione", onClick: onCreateMeet ?? (() => {}), show: isStaff && Boolean(onCreateMeet) },
    { icon: Calendar, label: isStaff ? "Nuovo evento" : "Nuovo evento (1/g)", onClick: onCreateEvent, show: true },
    { icon: UserPlus, label: "Invita", onClick: onInvite, show: isStaff },
  ].filter((a) => a.show);

  const fab = (
    <div className="flex flex-col-reverse items-end gap-2">
      <Button
        variant="neon"
        size="icon"
        className={`rounded-full shadow-lg ${isMobile ? "h-12 w-12" : "h-14 w-14"}`}
        onClick={() => setOpen(!open)}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }}>
          {open ? <X className={isMobile ? "h-5 w-5" : "h-6 w-6"} /> : <Plus className={isMobile ? "h-5 w-5" : "h-6 w-6"} />}
        </motion.div>
      </Button>
      <AnimatePresence>
        {open && actions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2"
          >
            <span className="text-xs bg-black/80 text-white px-2 py-1 rounded">{action.label}</span>
            <Button
              variant="outline-neon"
              size="icon"
              className={`rounded-full ${isMobile ? "h-9 w-9" : "h-10 w-10"}`}
              onClick={() => { action.onClick(); setOpen(false); }}
            >
              <action.icon className="h-4 w-4" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return createPortal(
    <div className={`fixed right-4 z-[75] ${isMobile ? "bottom-[calc(env(safe-area-inset-bottom)+5rem)]" : "bottom-6"}`}>
      {fab}
    </div>,
    document.body,
  );
}
