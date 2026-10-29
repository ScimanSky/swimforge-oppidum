import { useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatSwimCentiseconds } from "@/lib/swimTime";
import { formatDayMonthYear } from "@/lib/format";
import { SOURCE_LABELS, STROKE_LABELS } from "@/lib/profile-stats";
import { cn } from "@/lib/utils";
import { ChoiceGroup, type ChoiceOption } from "./ChoiceGroup";

type FinaGender = "male" | "female";

/** The FINA tables chosen last (no gender is stored on the profile). */
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
 * Personal records of a swimmer with FINA points; «Uomini / Donne» picks the FINA tables
 * (remembered on this device). `framed` false drops the card, to sit inside another one.
 */
export function PersonalRecordsBoard({
  userId,
  enabled = true,
  limit = 24,
  emptyText = "Ancora nessun record personale.",
  framed = true,
  className,
}: {
  userId: number;
  enabled?: boolean;
  limit?: number;
  emptyText?: string;
  framed?: boolean;
  className?: string;
}) {
  const [gender, setGender] = useState<FinaGender>(readGender);
  const titleId = useId();
  const query = trpc.records.getByUser.useQuery(
    { userId, finaGender: gender },
    { enabled: enabled && Number.isFinite(userId) && userId > 0 }
  );
  const rows = (((query.data as any)?.records as Array<any> | undefined) ?? []).slice(0, limit);

  const choose = (value: FinaGender) => {
    setGender(value);
    saveGender(value);
  };

  return (
    <section aria-labelledby={titleId} className={cn(framed && "surface-panel p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-[17px] font-bold">
          Record personali
        </h2>
        <ChoiceGroup
          aria-label="Tabelle FINA"
          options={GENDER_OPTIONS}
          value={gender}
          onChange={choose}
          optionClassName="text-sm"
        />
      </div>
      <div className="mt-3">
        {query.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Caricamento dei record…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
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
        )}
      </div>
    </section>
  );
}
