import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string> = { value: T; label: string; icon?: ReactNode };

/**
 * A small single choice («Aspetto», «Uomini / Donne») as native radios in a `radiogroup`:
 * arrows move the choice, the checked option has a check, a tinted fill and an action border.
 */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  className,
  optionClassName,
  ...labelling
}: {
  options: ReadonlyArray<ChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  optionClassName?: string;
} & ({ "aria-label": string } | { "aria-labelledby": string })) {
  const name = useId();
  return (
    <div role="radiogroup" {...labelling} className={cn("flex gap-2", className)}>
      {options.map(option => (
        <label
          key={option.value}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-border bg-raised px-3 font-semibold transition-colors has-[:checked]:border-action-text has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
            optionClassName
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.icon}
          <span className="flex-1">{option.label}</span>
          {value === option.value ? <Check className="size-4 shrink-0 text-action-text" aria-hidden /> : null}
        </label>
      ))}
    </div>
  );
}
