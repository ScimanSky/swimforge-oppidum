export type MeetStroke = "SL" | "DO" | "RA" | "FA" | "MX";
export type MeetGender = "M" | "F";

export type MeetProgramTemplateEvent = {
  key: string;
  label: string;
  distanceMeters: number;
  stroke: MeetStroke;
  gender: MeetGender;
  defaultOrder: number;
};

const STROKE_ALIASES: Record<string, MeetStroke> = {
  SL: "SL",
  STILE: "SL",
  STILELIBERO: "SL",
  CRAWL: "SL",
  DO: "DO",
  DORSO: "DO",
  RA: "RA",
  RANA: "RA",
  FA: "FA",
  FARFALLA: "FA",
  DELFINO: "FA",
  MX: "MX",
  MISTI: "MX",
  MISTO: "MX",
};

const GENDER_ALIASES: Record<string, MeetGender> = {
  M: "M",
  MASCHI: "M",
  MASCHILE: "M",
  UOMINI: "M",
  F: "F",
  FEMMINE: "F",
  FEMMINILE: "F",
  DONNE: "F",
};

function normalizeToken(token: string): string {
  return token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function buildMeetProgramKey(input: {
  distanceMeters: number | null | undefined;
  stroke: string | null | undefined;
  gender: string | null | undefined;
}): string | null {
  const distance = Number(input.distanceMeters);
  const strokeToken = normalizeToken(String(input.stroke ?? ""));
  const genderToken = normalizeToken(String(input.gender ?? ""));
  const stroke = STROKE_ALIASES[strokeToken] ?? null;
  const gender = GENDER_ALIASES[genderToken] ?? null;

  if (!Number.isFinite(distance) || distance <= 0 || !stroke || !gender) {
    return null;
  }

  return `${Math.round(distance)}|${stroke}|${gender}`;
}

export function parseMeetEventLabel(label: string): {
  distanceMeters: number | null;
  stroke: MeetStroke | null;
  gender: MeetGender | null;
} {
  const tokens = label
    .split(/\s+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);

  let distanceMeters: number | null = null;
  let stroke: MeetStroke | null = null;
  let gender: MeetGender | null = null;

  for (const token of tokens) {
    if (distanceMeters === null && /^\d{2,4}$/.test(token)) {
      const parsed = Number(token);
      if (Number.isFinite(parsed)) {
        distanceMeters = parsed;
        continue;
      }
    }

    if (!stroke && STROKE_ALIASES[token]) {
      stroke = STROKE_ALIASES[token];
      continue;
    }

    if (!gender && GENDER_ALIASES[token]) {
      gender = GENDER_ALIASES[token];
      continue;
    }
  }

  return { distanceMeters, stroke, gender };
}

function makeLabel(distanceMeters: number, stroke: MeetStroke, gender: MeetGender): string {
  return `${distanceMeters} ${stroke} ${gender}`;
}

function makeKey(distanceMeters: number, stroke: MeetStroke, gender: MeetGender): string {
  return `${distanceMeters}|${stroke}|${gender}`;
}

function buildTemplate(): MeetProgramTemplateEvent[] {
  const freestyle = [50, 100, 200, 400, 800, 1500] as const;
  const dorsal = [50, 100, 200] as const;
  const breast = [50, 100, 200] as const;
  const fly = [50, 100, 200] as const;
  const medley = [100, 200, 400] as const;

  let order = 1;
  const rows: MeetProgramTemplateEvent[] = [];

  const pushAll = (gender: MeetGender, distances: readonly number[], stroke: MeetStroke) => {
    for (const distance of distances) {
      rows.push({
        key: makeKey(distance, stroke, gender),
        label: makeLabel(distance, stroke, gender),
        distanceMeters: distance,
        stroke,
        gender,
        defaultOrder: order,
      });
      order += 1;
    }
  };

  pushAll("M", freestyle, "SL");
  pushAll("M", dorsal, "DO");
  pushAll("M", breast, "RA");
  pushAll("M", fly, "FA");
  pushAll("M", medley, "MX");

  pushAll("F", freestyle, "SL");
  pushAll("F", dorsal, "DO");
  pushAll("F", breast, "RA");
  pushAll("F", fly, "FA");
  pushAll("F", medley, "MX");

  return rows;
}

export const MEET_PROGRAM_TEMPLATE: MeetProgramTemplateEvent[] = buildTemplate();
