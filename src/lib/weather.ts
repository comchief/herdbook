/** Farm location, local time, and current-weather lookups — backed by
 * Open-Meteo (https://open-meteo.com), which is free and needs no API key.
 * Geocoding runs once, when the owner saves a location in Farm settings
 * (src/lib/actions/settings.ts); the resolved latitude/longitude/timezone
 * are cached on the farm row rather than re-resolved on every page view.
 * The dashboard then calls fetchCurrentWeather on each load, which Next.js
 * caches for 30 minutes so it isn't re-requested on every render. */

export type GeocodedLocation = {
  /** Display label combining city, region, and country, e.g. "Kingston,
   * Jamaica" — not necessarily what the owner typed. */
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type GeocodeApiResult = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

/** Resolves a free-typed place name ("Kingston", "Austin TX") to
 * coordinates and an IANA timezone. Returns null if nothing matched, or if
 * the lookup fails/times out — callers should treat that as "couldn't find
 * that place" rather than a hard error. */
export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: { results?: GeocodeApiResult[] };
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const r = data.results?.[0];
  if (!r) return null;
  const name = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
  return { name, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone };
}

export type CurrentWeather = {
  tempC: number;
  feelsLikeC: number;
  highC: number;
  lowC: number;
  label: string;
  /** Icon component name — one of the ic-* symbols in icons.tsx. */
  icon: string;
  isDay: boolean;
};

/** WMO weather codes (as used by Open-Meteo) mapped to a short label and
 * icon. Grouped by what actually changes the picture, not the full WMO
 * granularity: a light drizzle and a heavy rain both just read "rain". */
const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "sun" },
  1: { label: "Mostly clear", icon: "sun" },
  2: { label: "Partly cloudy", icon: "cloud-sun" },
  3: { label: "Overcast", icon: "cloud" },
  45: { label: "Fog", icon: "cloud" },
  48: { label: "Fog", icon: "cloud" },
  51: { label: "Light drizzle", icon: "cloud-rain" },
  53: { label: "Drizzle", icon: "cloud-rain" },
  55: { label: "Dense drizzle", icon: "cloud-rain" },
  56: { label: "Freezing drizzle", icon: "cloud-rain" },
  57: { label: "Freezing drizzle", icon: "cloud-rain" },
  61: { label: "Light rain", icon: "cloud-rain" },
  63: { label: "Rain", icon: "cloud-rain" },
  65: { label: "Heavy rain", icon: "cloud-rain" },
  66: { label: "Freezing rain", icon: "cloud-rain" },
  67: { label: "Freezing rain", icon: "cloud-rain" },
  71: { label: "Light snow", icon: "snow" },
  73: { label: "Snow", icon: "snow" },
  75: { label: "Heavy snow", icon: "snow" },
  77: { label: "Snow grains", icon: "snow" },
  80: { label: "Rain showers", icon: "cloud-rain" },
  81: { label: "Rain showers", icon: "cloud-rain" },
  82: { label: "Violent rain showers", icon: "cloud-rain" },
  85: { label: "Snow showers", icon: "snow" },
  86: { label: "Snow showers", icon: "snow" },
  95: { label: "Thunderstorm", icon: "cloud-lightning" },
  96: { label: "Thunderstorm with hail", icon: "cloud-lightning" },
  99: { label: "Thunderstorm with hail", icon: "cloud-lightning" },
};

/** Current conditions plus today's high/low for one location. Returns null
 * on any failure (network, timeout, unexpected payload) — the dashboard
 * just omits the weather card rather than erroring the whole page over a
 * third-party outage. */
export async function fetchCurrentWeather(latitude: number, longitude: number, timezone: string): Promise<CurrentWeather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(timezone)}&temperature_unit=celsius&forecast_days=1`;
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: {
    current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number };
    daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] };
  };
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const current = data.current;
  if (!current) return null;
  const codeInfo = WEATHER_CODES[current.weather_code] ?? { label: "Unsettled", icon: "cloud" };
  return {
    tempC: current.temperature_2m,
    feelsLikeC: current.apparent_temperature,
    highC: data.daily?.temperature_2m_max?.[0] ?? current.temperature_2m,
    lowC: data.daily?.temperature_2m_min?.[0] ?? current.temperature_2m,
    label: codeInfo.label,
    icon: codeInfo.icon,
    isDay: current.is_day === 1,
  };
}

/** The current hour (0-23) in the farm's local timezone, for the
 * dashboard's time-of-day greeting. Falls back to the server's own clock
 * when the farm has no location/timezone on file yet. */
export function localHour(timezone: string | null, now: Date = new Date()): number {
  if (!timezone) return now.getHours();
  try {
    const formatted = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now);
    const h = parseInt(formatted, 10);
    // Some ICU builds render midnight as "24" with hour12:false; normalize.
    return h === 24 ? 0 : h;
  } catch {
    return now.getHours();
  }
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}
