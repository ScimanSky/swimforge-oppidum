type StrokeType = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed";
type Gender = "male" | "female";
type PoolLength = 25 | 50;

const LCM_BASE_TIME_CS: Record<string, number> = {
  "male:freestyle:50": 2091,
  "male:freestyle:100": 4640,
  "male:freestyle:200": 10200,
  "male:freestyle:400": 22007,
  "male:freestyle:800": 45212,
  "male:freestyle:1500": 87102,
  "male:backstroke:50": 2355,
  "male:backstroke:100": 5160,
  "male:backstroke:200": 11192,
  "male:breaststroke:50": 2595,
  "male:breaststroke:100": 5688,
  "male:breaststroke:200": 12612,
  "male:butterfly:50": 2227,
  "male:butterfly:100": 4945,
  "male:butterfly:200": 11151,
  "male:mixed:200": 11400,

  "female:freestyle:50": 2361,
  "female:freestyle:100": 5171,
  "female:freestyle:200": 11223,
  "female:freestyle:400": 23538,
  "female:freestyle:800": 48479,
  "female:freestyle:1500": 91500,
  "female:backstroke:50": 2686,
  "female:backstroke:100": 5733,
  "female:backstroke:200": 12314,
  "female:breaststroke:50": 2916,
  "female:breaststroke:100": 6413,
  "female:breaststroke:200": 13867,
  "female:butterfly:50": 2443,
  "female:butterfly:100": 5548,
  "female:butterfly:200": 12378,
  "female:mixed:200": 12612,
};

function getBaseTimeCs(params: {
  strokeType: StrokeType;
  distanceMeters: number;
  gender: Gender;
  poolLengthMeters: PoolLength;
}): number | null {
  const key = `${params.gender}:${params.strokeType}:${params.distanceMeters}`;
  const lcmBase = LCM_BASE_TIME_CS[key];
  if (!lcmBase) return null;
  if (params.poolLengthMeters === 50) return lcmBase;
  return Math.round(lcmBase * 0.975);
}

export function isSupportedFinaEvent(strokeType: StrokeType, distanceMeters: number) {
  return (
    (strokeType === "freestyle" && [50, 100, 200, 400, 800, 1500].includes(distanceMeters)) ||
    (strokeType === "backstroke" && [50, 100, 200].includes(distanceMeters)) ||
    (strokeType === "breaststroke" && [50, 100, 200].includes(distanceMeters)) ||
    (strokeType === "butterfly" && [50, 100, 200].includes(distanceMeters)) ||
    (strokeType === "mixed" && [200].includes(distanceMeters))
  );
}

export function calculateFinaPoints(params: {
  strokeType: StrokeType;
  distanceMeters: number;
  timeCs: number;
  gender: Gender;
  poolLengthMeters: PoolLength;
}): number {
  const baseTimeCs = getBaseTimeCs(params);
  if (!baseTimeCs || !Number.isFinite(params.timeCs) || params.timeCs <= 0) return 0;

  const ratio = baseTimeCs / params.timeCs;
  const points = Math.round(1000 * Math.pow(ratio, 3));
  return Math.max(0, Math.min(points, 3000));
}
