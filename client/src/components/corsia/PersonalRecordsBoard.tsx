import { useId, useState, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { formatSwimCentiseconds } from "@/lib/swimTime";
import { formatDayMonthYear } from "@/lib/format";
import { SOURCE_LABELS, STROKE_LABELS } from "@/lib/profile-stats";
import { cn } from "@/lib/utils";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";
import { LoadError, LoadingSkeleton } from "./LoadState";

type FinaGender = "male" | "female";

/** The FINA tables chosen last on your own profile (no gender is stored on the profile). */
const STORAGE_KEY = "swimforge:finaGender";

const readGender = (): FinaGender => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "female" ? "female" : "male";
  } catch {
    return "male";
  }
};

const saveGender = (gender: FinaGender) => {
  try {
    localStorage.setItem(STORAGE_KEY, gender);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
};

const GENDER_OPTIONS: ReadonlyArray<ChoiceOption<FinaGender>> = [
  { value: "male", label: "Uomini" },
  { value: "female", label: "Donne" },
];

const finaPoints = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const points = Number(value);
  return Number.isFinite(points) ? Math.round(points) : null;
};

const hasDate = (value: unknown) => value !== null && value !== undefined && value !== "" &&
  !Number.isNaN(new Date(value as string | Date).getTime());

/**
 * Personal records of a swimmer with FINA points; «Uomini / Donne» picks the FINA tables.
 * `persist` remembers that choice on this device (your own profile only: someone else's profile
 * always starts from «Uomini»). `framed` false drops the card, to sit inside another one.
 */
export function PersonalRecordsBoard({
  userId,
  enabled = true,
  persist = false,
  limit = 24,
  emptyText = "Ancora nessun record personale.",
  framed = true,
  className,
}: {
  userId: number;
  /**
   * False while the swimmer is still loading (e.g. `auth.me`): the board shows its loading state
   * and asks for nothing, so never pass false for good.
   */
  enabled?: boolean;
  persist?: boolean;
  limit?: number;
  emptyText?: string;
  framed?: boolean;
  className?: string;
}) {
  const [gender, setGender] = useState<FinaGender>(() => (persist ? readGender() : "male"));
  const titleId = useId();
  const tablesId = useId();
  const waiting = !enabled || !Number.isFinite(userId) || userId <= 0;
  const query = trpc.records.getByUser.useQuery(
    { userId, finaGender: gender },
    // Switching tables keeps the current list on screen (marked busy) instead of a skeleton.
    { enabled: !waiting, placeholderData: keepPreviousData }
  );
  const rows = (((query.data as any)?.records as Array<any> | undefined) ?? []).slice(0, limit);
  const showingPrevious = query.isPlaceholderData;

  const choose = (value: FinaGender) => {
    setGender(value);
    if (persist) saveGender(value);
  };

  let content: ReactNode;
  // An empty list for the other tables is no answer for these: a skeleton, not «nessun record».
  if (waiting || query.isPending || (showingPrevious && rows.length === 0)) {
    content = (
      <LoadingSkeleton
        label="Caricamento dei record…"
        count={2}
        className="grid gap-2 sm:grid-cols-2"
        itemClassName="h-[92px] w-full rounded-xl"
      />
    );
  } else if (query.isError && !query.data) {
    // Inside the records card (or the one the board sits in when not framed).
    content = <LoadError variant="inline" onRetry={() => void query.refetch()} />;
  } else if (rows.length === 0) {
    content = <p className="text-sm text-muted-foreground">{emptyText}</p>;
  } else {
    content = (
      <ul className="grid gap-2 sm:grid-cols-2" aria-busy={showingPrevious || undefined}>
        {rows.map((row: any) => {
          const points = finaPoints(row.finaPoints);
          return (
            <li key={row.id} className="rounded-xl bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {STROKE_LABELS[String(row.strokeType)] ?? "Stile"} {Number(row.distanceMeters)} m
                </p>
                <span className="text-xs text-muted-foreground">Vasca {Number(row.poolLengthMeters)} m</span>
              </div>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                {formatSwimCentiseconds(row.timeCs)}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {SOURCE_LABELS[String(row.source)] ?? "Record"}
                  {points !== null ? ` · ${points} punti FINA` : ""}
                </span>
                {hasDate(row.achievedAt) ? <span>{formatDayMonthYear(row.achievedAt)}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby={titleId} className={cn(framed && "surface-panel p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-[17px] font-bold">
          Record personali
        </h2>
        <div className="flex items-center gap-2">
          <span id={tablesId} className="text-xs font-semibold text-muted-foreground">
            Tabelle FINA
          </span>
          <ChoiceGroup
            aria-labelledby={tablesId}
            options={GENDER_OPTIONS}
            value={gender}
            onChange={choose}
            optionClassName="text-sm"
          />
        </div>
      </div>
      <div className="mt-3">{content}</div>
    </section>
  );
}
