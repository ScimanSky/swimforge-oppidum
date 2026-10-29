import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const errorIdFor = (fieldId: string) => `${fieldId}-errore`;

/** aria-invalid and aria-describedby of a field with its error (and an optional hint) below it. */
export function fieldAria(fieldId: string, error?: string, hintId?: string) {
  const describedBy = [error ? errorIdFor(fieldId) : null, hintId].filter(Boolean).join(" ");
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

/** The error under a field, read with the field (aria-describedby, see fieldAria). */
export function FieldError({ fieldId, error }: { fieldId: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={errorIdFor(fieldId)} className="text-sm text-danger">
      {error}
    </p>
  );
}

/** A failure of the whole form (wrong credentials, network): announced as soon as it appears. */
export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );
}

/**
 * Per-field errors of a form: `show` puts them under their fields and focuses the first invalid
 * one (so a screen reader reads its label and error); `clear` drops one as the field is edited.
 */
export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  /** `fields`: [key, element id] in page order. Returns true when the form has no error. */
  const show = useCallback(
    (next: Partial<Record<K, string>>, fields: ReadonlyArray<readonly [K, string]>) => {
      setErrors(next);
      const first = fields.find(([key]) => next[key]);
      if (first) setFocusRequest({ id: first[1] });
      return !first;
    },
    []
  );

  const clear = useCallback((key: K) => {
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  return { errors, show, clear };
}

/**
 * Password field with a show/hide button: one label («Mostra password») and aria-pressed for
 * the state, so the button never changes name under the user's finger.
 */
export function PasswordInput({
  className,
  disabled,
  showLabel = "Mostra password",
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
  /** Name of the show/hide button, distinct when a form has two password fields. */
  showLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 text-muted-foreground hover:text-foreground"
        aria-label={showLabel}
        aria-pressed={visible}
        aria-controls={props.id}
        disabled={disabled}
        onClick={() => setVisible(value => !value)}
      >
        {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
    </div>
  );
}
