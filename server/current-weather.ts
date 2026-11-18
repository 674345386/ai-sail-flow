import { z } from 'zod';

export const currentWeatherInput = z.object({
  station: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,8}$/).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).refine(input => input.station || (input.latitude !== undefined && input.longitude !== undefined), {
  message: '请提供已知的美国气象站代码，或提供地点的纬度和经度。',
});

const observationSchema = z.object({
  properties: z.object({
    timestamp: z.iso.datetime({ offset: true }),
    temperature: z.object({ value: z.number().nullable(), unitCode: z.literal('wmoUnit:degC') }),
    textDescription: z.string(),
  }),
});

const forecastSchema = z.object({
  properties: z.object({
    timeseries: z.array(z.object({
      time: z.iso.datetime(),
      data: z.object({
        instant: z.object({ details: z.object({ air_temperature: z.number() }) }),
        next_1_hours: z.object({ summary: z.object({ symbol_code: z.string() }) }).optional(),
      }),
    })).min(1),
  }),
});

async function fetchWeather(url: URL) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AI-Sail-Flow/1.0 (https://lululib.cn)', Accept: 'application/json, application/geo+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`气象数据源返回 HTTP ${response.status}。`);
  return response.json() as Promise<unknown>;
}

export async function getCurrentWeather(input: z.infer<typeof currentWeatherInput>) {
  if (input.station) {
    const source = new URL(`https://api.weather.gov/stations/${input.station}/observations/latest`);
    const { properties } = observationSchema.parse(await fetchWeather(source));
    return { kind: 'observation', station: input.station, timestamp: properties.timestamp, celsius: properties.temperature.value,
      condition: properties.textDescription || undefined, source: source.href };
  }
  const source = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
  source.searchParams.set('lat', input.latitude!.toFixed(4));
  source.searchParams.set('lon', input.longitude!.toFixed(4));
  const { properties } = forecastSchema.parse(await fetchWeather(source));
  const now = Date.now();
  const forecast = properties.timeseries.reduce((nearest, entry) =>
    Math.abs(Date.parse(entry.time) - now) < Math.abs(Date.parse(nearest.time) - now) ? entry : nearest);
  return { kind: 'forecast', timestamp: forecast.time, celsius: forecast.data.instant.details.air_temperature,
    condition: forecast.data.next_1_hours?.summary.symbol_code, source: source.href };
}
