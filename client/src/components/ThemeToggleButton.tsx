import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";

type ThemeToggleButtonProps = {
  className?: string;
};

/**
 * Theme switch of the public pages (sign-in, sign-up, password): signed-in users pick the theme
 * in Profilo › Aspetto. The name says what a press does.
 */
export function ThemeToggleButton({ className }: ThemeToggleButtonProps) {
  const { theme, toggleTheme, switchable } = useTheme();

  if (!switchable || !toggleTheme) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      {theme === "dark" ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </Button>
  );
}

export default ThemeToggleButton;
