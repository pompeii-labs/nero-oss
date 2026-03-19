export interface WeatherData {
    temp: string;
    condition: string;
    high: string;
    low: string;
    icon: string;
}

const WMO_CODES: Record<number, { condition: string; icon: string }> = {
    0: { condition: 'Clear sky', icon: 'sun' },
    1: { condition: 'Mainly clear', icon: 'sun' },
    2: { condition: 'Partly cloudy', icon: 'cloud-sun' },
    3: { condition: 'Overcast', icon: 'cloud' },
    45: { condition: 'Foggy', icon: 'cloud-fog' },
    48: { condition: 'Depositing rime fog', icon: 'cloud-fog' },
    51: { condition: 'Light drizzle', icon: 'cloud-drizzle' },
    53: { condition: 'Moderate drizzle', icon: 'cloud-drizzle' },
    55: { condition: 'Dense drizzle', icon: 'cloud-drizzle' },
    56: { condition: 'Freezing drizzle', icon: 'cloud-drizzle' },
    57: { condition: 'Heavy freezing drizzle', icon: 'cloud-drizzle' },
    61: { condition: 'Slight rain', icon: 'cloud-rain' },
    63: { condition: 'Moderate rain', icon: 'cloud-rain' },
    65: { condition: 'Heavy rain', icon: 'cloud-rain' },
    66: { condition: 'Freezing rain', icon: 'cloud-rain' },
    67: { condition: 'Heavy freezing rain', icon: 'cloud-rain' },
    71: { condition: 'Slight snow', icon: 'snowflake' },
    73: { condition: 'Moderate snow', icon: 'snowflake' },
    75: { condition: 'Heavy snow', icon: 'snowflake' },
    77: { condition: 'Snow grains', icon: 'snowflake' },
    80: { condition: 'Slight rain showers', icon: 'cloud-rain' },
    81: { condition: 'Moderate rain showers', icon: 'cloud-rain' },
    82: { condition: 'Violent rain showers', icon: 'cloud-rain' },
    85: { condition: 'Slight snow showers', icon: 'snowflake' },
    86: { condition: 'Heavy snow showers', icon: 'snowflake' },
    95: { condition: 'Thunderstorm', icon: 'cloud-lightning' },
    96: { condition: 'Thunderstorm with hail', icon: 'cloud-lightning' },
    99: { condition: 'Thunderstorm with heavy hail', icon: 'cloud-lightning' },
};

export async function geolocate(): Promise<{ lat: number; lon: number } | null> {
    try {
        const res = await fetch('http://ip-api.com/json/?fields=lat,lon,status', {
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (
            data.status === 'success' &&
            typeof data.lat === 'number' &&
            typeof data.lon === 'number'
        ) {
            return { lat: data.lat, lon: data.lon };
        }
        return null;
    } catch {
        return null;
    }
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;

        const data = await res.json();
        const current = data.current;
        const daily = data.daily;

        if (!current || !daily) return null;

        const code = current.weather_code ?? 0;
        const wmo = WMO_CODES[code] ?? { condition: 'Unknown', icon: 'cloud' };

        return {
            temp: `${Math.round(current.temperature_2m)}`,
            condition: wmo.condition,
            high: `${Math.round(daily.temperature_2m_max[0])}`,
            low: `${Math.round(daily.temperature_2m_min[0])}`,
            icon: wmo.icon,
        };
    } catch {
        return null;
    }
}
