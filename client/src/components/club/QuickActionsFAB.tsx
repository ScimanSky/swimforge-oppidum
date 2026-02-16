import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, PenSquare, Calendar, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsFABProps {
  isMember: boolean;
  isStaff: boolean;
  onPost: () => void;
  onCreateEvent: () => void;
  onInvite: () => void;
}

export default function QuickActionsFAB({ isMember, isStaff, onPost, onCreateEvent, onInvite }: QuickActionsFABProps) {
  const [open, setOpen] = useState(false);

  if (!isMember) return null;

  const actions = [
    { icon: PenSquare, label: "Posta", onClick: onPost, show: true },
    { icon: Calendar, label: "Evento", onClick: onCreateEvent, show: isStaff },
    { icon: UserPlus, label: "Invita", onClick: onInvite, show: isStaff },
  ].filter((a) => a.show);

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-2">
      <Button
        variant="neon"
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(!open)}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }}>
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
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
              className="h-10 w-10 rounded-full"
              onClick={() => { action.onClick(); setOpen(false); }}
            >
              <action.icon className="h-4 w-4" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
