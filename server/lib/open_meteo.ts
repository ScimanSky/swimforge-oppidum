export type EventWeatherSnapshot = {
  source: "open-meteo";
  fetchedAt: string;
  targetTime: string;
  resolvedTime: string | null;
  timezone: string | null;
  general: {
    temperatureC: number | null;
    weatherCode: number | null;
  };
  wind: {
    speedMps: number | null;
    directionDeg: number | null;
  };
  waves: {
    heightM: number | null;
    directionDeg: number | null;
    periodSeconds: number | null;
  };
};

type ForecastResponse = {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    weather_code?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
  };
};

type MarineResponse = {
  timezone?: string;
  hourly?: {
    time?: string[];
    wave_height?: Array<number | null>;
    wave_direction?: Array<number | null>;
    wave_period?: Array<number | null>;
  };
};

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickClosestIndex(times: string[] | undefined, targetMs: number): number {
  if (!times?.length) return -1;
  let bestIndex = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i += 1) {
    const ms = new Date(times[i]).getTime();
    if (!Number.isFinite(ms)) continue;
    const delta = Math.abs(ms - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return bestIndex;
}

async function fetchJson<T>(url: string, timeoutMs = 9_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEventWeatherSnapshot(params: {
  lat: number;
  lng: number;
  targetTime?: Date;
}): Promise<EventWeatherSnapshot> {
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Invalid coordinates for weather snapshot");
  }

  const targetMs = params.targetTime?.getTime() ?? Date.now();
  const shared = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    timezone: "auto",
    forecast_days: "3",
  });

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?${shared.toString()}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${shared.toString()}&hourly=wave_height,wave_direction,wave_period`;

  const [forecast, marine] = await Promise.all([
    fetchJson<ForecastResponse>(forecastUrl),
    fetchJson<MarineResponse>(marineUrl),
  ]);

  const forecastIdx = pickClosestIndex(forecast.hourly?.time, targetMs);
  const marineIdx = pickClosestIndex(marine.hourly?.time, targetMs);

  const forecastTime = forecastIdx >= 0 ? forecast.hourly?.time?.[forecastIdx] ?? null : null;
  const marineTime = marineIdx >= 0 ? marine.hourly?.time?.[marineIdx] ?? null : null;
  const resolvedTime = forecastTime ?? marineTime ?? null;

  return {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    targetTime: new Date(targetMs).toISOString(),
    resolvedTime,
    timezone: forecast.timezone ?? marine.timezone ?? null,
    general: {
      temperatureC: forecastIdx >= 0 ? toFiniteNumber(forecast.hourly?.temperature_2m?.[forecastIdx]) : null,
      weatherCode: forecastIdx >= 0 ? toFiniteNumber(forecast.hourly?.weather_code?.[forecastIdx]) : null,
    },
    wind: {
      speedMps: forecastIdx >= 0 ? toFiniteNumber(forecast.hourly?.wind_speed_10m?.[forecastIdx]) : null,
      directionDeg: forecastIdx >= 0 ? toFiniteNumber(forecast.hourly?.wind_direction_10m?.[forecastIdx]) : null,
    },
    waves: {
      heightM: marineIdx >= 0 ? toFiniteNumber(marine.hourly?.wave_height?.[marineIdx]) : null,
      directionDeg: marineIdx >= 0 ? toFiniteNumber(marine.hourly?.wave_direction?.[marineIdx]) : null,
      periodSeconds: marineIdx >= 0 ? toFiniteNumber(marine.hourly?.wave_period?.[marineIdx]) : null,
    },
  };
}
