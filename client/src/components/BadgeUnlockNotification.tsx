import { assetUrl } from "@/lib/asset-base";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Chip } from "@/components/corsia/Chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getBadgeImageUrl } from "@/lib/badgeImages";
import { cn } from "@/lib/utils";
import type { BadgeNotificationItem } from "@/hooks/useBadgeNotifications";
import { CELEBRATION_LAYER, useCelebrationsAllowed } from "@/hooks/useCelebrationGate";

interface BadgeUnlockNotificationProps {
  badges: BadgeNotificationItem[];
  onComplete: () => void;
}

/** The XP and action colours of the theme, for the confetti (canvas needs real colours). */
function confettiColours(): string[] | undefined {
  if (typeof document === "undefined") return undefined;
  const style = getComputedStyle(document.documentElement);
  const colours = ["--xp", "--primary"].map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
  return colours.length ? colours : undefined;
}

// Play celebration sound using Web Audio API (silently skipped where it is not available)
function playCelebrationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();

    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);

      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };

    // Play a cheerful ascending melody
    playTone(523.25, 0, 0.15); // C5
    playTone(659.25, 0.15, 0.15); // E5
    playTone(783.99, 0.3, 0.15); // G5
    playTone(1046.5, 0.45, 0.3); // C6
  } catch {
    // No sound: the dialog says it all.
  }
}

// Confetti in the theme's XP and action colours; none with reduced motion.
function triggerConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const colors = confettiColours();
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999, disableForReducedMotion: true, colors };

  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const particleCount = 50 * (timeLeft / duration);

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}

/**
 * New badges, one dialog each: «Prossimo badge» / «Continua». Closing it (Esc, a tap outside)
 * moves on too, as the tap on the backdrop always did. Queued while the cookie banner or the
 * onboarding is open (useCelebrationsAllowed).
 */
export default function BadgeUnlockNotification({ badges, onComplete }: BadgeUnlockNotificationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const allowed = useCelebrationsAllowed();

  const currentBadge = badges[currentIndex];
  const normalizeBadgeUrl = (url: string) =>
    url.startsWith("/badges/") ? url.replace("/badges/", "/badges_new/") : url;
  const resolvedImageUrl = assetUrl(
    currentBadge?.image_url
      ? normalizeBadgeUrl(currentBadge.image_url)
      : (currentBadge?.code ? getBadgeImageUrl(currentBadge.code) : ""),
  );
  const fallbackImageUrl = assetUrl("/badges_new/oppidum_member.png");

  // Sound and confetti when a badge shows, not while it waits behind the banner or the tour.
  useEffect(() => {
    if (currentBadge && allowed) {
      playCelebrationSound();
      triggerConfetti();
    }
  }, [currentIndex, allowed]);

  const isLast = currentIndex >= badges.length - 1;

  const handleNext = () => {
    if (!isLast) {
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

  if (!currentBadge || !allowed) return null;

  return (
    <Dialog open={isVisible} onOpenChange={(open) => { if (!open) handleNext(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={CELEBRATION_LAYER}
        className={cn("rounded-2xl bg-card p-6 text-center shadow-none sm:max-w-sm", CELEBRATION_LAYER)}
      >
        {badges.length > 1 ? (
          <Chip className="mx-auto">
            Badge {currentIndex + 1} di {badges.length}
          </Chip>
        ) : null}
        <DialogTitle className="font-display text-[30px] font-bold leading-tight">Complimenti!</DialogTitle>
        <img
          src={resolvedImageUrl}
          alt=""
          className="mx-auto size-40 object-contain"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (img.dataset.fallbackApplied) return;
            img.dataset.fallbackApplied = "true";
            img.src = fallbackImageUrl;
          }}
        />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Hai sbloccato un nuovo badge</p>
          <p className="text-[17px] font-bold">{currentBadge.name}</p>
          <DialogDescription className="text-sm text-muted-foreground">{currentBadge.description}</DialogDescription>
        </div>
        <Button className="w-full" onClick={handleNext}>
          {isLast ? "Continua" : "Prossimo badge"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
