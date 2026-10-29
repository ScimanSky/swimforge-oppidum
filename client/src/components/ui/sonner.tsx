"use client";

import type { CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Sonner's default offsets (24px, 16px on phones) plus the system bars of the native app
      // (edge-to-edge); the insets are 0 on the web.
      offset={{
        top: "calc(24px + env(safe-area-inset-top))",
        bottom: "calc(24px + env(safe-area-inset-bottom))",
      }}
      mobileOffset={{
        top: "calc(16px + env(safe-area-inset-top))",
        bottom: "calc(16px + env(safe-area-inset-bottom))",
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
