/**
 * Open-Meteo Meteorological & Geocoding Client
 * Free & Keyless Open API Integration for Weather Telemetry
 */

const CITY_COORDINATE_CACHE = {
  mumbai: { latitude: 19.0760, longitude: 72.8777, name: 'Mumbai', country: 'India' },
  bombay: { latitude: 19.0760, longitude: 72.8777, name: 'Mumbai', country: 'India' },
  delhi: { latitude: 28.6139, longitude: 77.2090, name: 'New Delhi', country: 'India' },
  newdelhi: { latitude: 28.6139, longitude: 77.2090, name: 'New Delhi', country: 'India' },
  nanded: { latitude: 19.1383, longitude: 77.3210, name: 'Nanded', country: 'India' },
  manali: { latitude: 32.2432, longitude: 77.1892, name: 'Manali', country: 'India' },
  kullu: { latitude: 31.9579, longitude: 77.1095, name: 'Kullu Manali', country: 'India' },
  shimla: { latitude: 31.1048, longitude: 77.1734, name: 'Shimla', country: 'India' },
  goa: { latitude: 15.2993, longitude: 74.1240, name: 'Goa', country: 'India' },
  panaji: { latitude: 15.4909, longitude: 73.8278, name: 'Goa (Panaji)', country: 'India' },
  bangalore: { latitude: 12.9716, longitude: 77.5946, name: 'Bangalore', country: 'India' },
  bengaluru: { latitude: 12.9716, longitude: 77.5946, name: 'Bengaluru', country: 'India' },
  pune: { latitude: 18.5204, longitude: 73.8567, name: 'Pune', country: 'India' },
  hyderabad: { latitude: 17.3850, longitude: 78.4867, name: 'Hyderabad', country: 'India' },
  chennai: { latitude: 13.0827, longitude: 80.2707, name: 'Chennai', country: 'India' },
  kolkata: { latitude: 22.5726, longitude: 88.3639, name: 'Kolkata', country: 'India' },
  jaipur: { latitude: 26.9124, longitude: 75.7873, name: 'Jaipur', country: 'India' },
  udaipur: { latitude: 24.5854, longitude: 73.7125, name: 'Udaipur', country: 'India' },
  kochi: { latitude: 9.9312, longitude: 76.2673, name: 'Kochi', country: 'India' },
  cochin: { latitude: 9.9312, longitude: 76.2673, name: 'Kochi', country: 'India' },
  varanasi: { latitude: 25.3176, longitude: 82.9739, name: 'Varanasi', country: 'India' },
  kerala: { latitude: 10.8505, longitude: 76.2711, name: 'Kerala', country: 'India' },
  leh: { latitude: 34.1526, longitude: 77.5771, name: 'Leh', country: 'India' },
  ladakh: { latitude: 34.1526, longitude: 77.5771, name: 'Ladakh', country: 'India' },
  srinagar: { latitude: 34.0837, longitude: 74.7973, name: 'Srinagar', country: 'India' },
  agra: { latitude: 27.1767, longitude: 78.0081, name: 'Agra', country: 'India' },
  rishikesh: { latitude: 30.0869, longitude: 78.2676, name: 'Rishikesh', country: 'India' },
  amritsar: { latitude: 31.6340, longitude: 74.8723, name: 'Amritsar', country: 'India' },
  tokyo: { latitude: 35.6762, longitude: 139.6503, name: 'Tokyo', country: 'Japan' },
  paris: { latitude: 48.8566, longitude: 2.3522, name: 'Paris', country: 'France' },
  london: { latitude: 51.5074, longitude: -0.1278, name: 'London', country: 'United Kingdom' },
  newyork: { latitude: 40.7128, longitude: -74.0060, name: 'New York', country: 'United States' },
  dubai: { latitude: 25.2048, longitude: 55.2708, name: 'Dubai', country: 'United Arab Emirates' },
  singapore: { latitude: 1.3521, longitude: 103.8198, name: 'Singapore', country: 'Singapore' },
  bangkok: { latitude: 13.7563, longitude: 100.5018, name: 'Bangkok', country: 'Thailand' },
  rome: { latitude: 41.9028, longitude: 12.4964, name: 'Rome', country: 'Italy' },
  barcelona: { latitude: 41.3851, longitude: 2.1734, name: 'Barcelona', country: 'Spain' },
};

/**
 * Interpret WMO weather interpretation codes
 */
export function interpretWMOCode(code) {
  const WMO_MAP = {
    0: { label: 'Clear Sky', icon: '☀️', severity: 'low' },
    1: { label: 'Mainly Clear', icon: '🌤️', severity: 'low' },
    2: { label: 'Partly Cloudy', icon: '⛅', severity: 'low' },
    3: { label: 'Overcast', icon: '☁️', severity: 'low' },
    45: { label: 'Foggy', icon: '🌫️', severity: 'medium' },
    48: { label: 'Depositing Rime Fog', icon: '🌫️', severity: 'medium' },
    51: { label: 'Light Drizzle', icon: '🌧️', severity: 'low' },
    53: { label: 'Moderate Drizzle', icon: '🌧️', severity: 'medium' },
    55: { label: 'Dense Drizzle', icon: '🌧️', severity: 'medium' },
    61: { label: 'Slight Rain', icon: '🌧️', severity: 'low' },
    63: { label: 'Moderate Rain', icon: '🌧️', severity: 'medium' },
    65: { label: 'Heavy Rain', icon: '🌧️', severity: 'high' },
    71: { label: 'Slight Snow', icon: '🌨️', severity: 'medium' },
    73: { label: 'Moderate Snow', icon: '🌨️', severity: 'high' },
    75: { label: 'Heavy Snow', icon: '❄️', severity: 'high' },
    80: { label: 'Slight Rain Showers', icon: '🌦️', severity: 'medium' },
    81: { label: 'Moderate Rain Showers', icon: '🌧️', severity: 'medium' },
    82: { label: 'Violent Rain Showers', icon: '⛈️', severity: 'high' },
    95: { label: 'Thunderstorm', icon: '🌩️', severity: 'high' },
    96: { label: 'Thunderstorm with Hail', icon: '⛈️', severity: 'high' },
  };

  return WMO_MAP[code] || { label: 'Partly Cloudy', icon: '⛅', severity: 'low' };
}

/**
 * Resolve destination city to geographic coordinates (lat, lon)
 */
export async function getDestinationCoordinates(destinationName = 'Mumbai') {
  if (!destinationName) return CITY_COORDINATE_CACHE.mumbai;

  const raw = destinationName.trim().toLowerCase();
  const firstWord = raw.split(',')[0].trim().replace(/[^a-z0-9]/g, '');

  if (CITY_COORDINATE_CACHE[firstWord]) {
    return CITY_COORDINATE_CACHE[firstWord];
  }

  // Check if any key in cache is contained inside destinationName
  for (const [key, loc] of Object.entries(CITY_COORDINATE_CACHE)) {
    if (raw.includes(key)) {
      return loc;
    }
  }

  // Attempt live geocoding API lookup
  try {
    const query = destinationName.split(',')[0].trim();
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
    );
    const data = await res.json();
    if (data?.results?.[0]) {
      const { latitude, longitude, name, country } = data.results[0];
      return { latitude, longitude, name, country };
    }
  } catch (err) {
    console.warn('Geocoding search failed for:', destinationName, err.message);
  }

  return CITY_COORDINATE_CACHE.mumbai;
}

/**
 * Fetch live weather telemetry & hourly micro-forecast from Open-Meteo
 */
export async function getLiveWeather(latitude = 19.0760, longitude = 72.8777) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&forecast_days=1&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Open-Meteo API status ${res.status}`);

    const data = await res.json();
    const current = data.current || {};
    const condition = interpretWMOCode(current.weather_code || 0);

    const hourlyTimes = data.hourly?.time || [];
    const hourlyTemps = data.hourly?.temperature_2m || [];
    const hourlyRainProb = data.hourly?.precipitation_probability || [];
    const hourlyWmo = data.hourly?.weather_code || [];

    const nowHour = new Date().getHours();
    const forecastTimeline = [];

    for (let i = 0; i < Math.min(8, hourlyTimes.length); i++) {
      const idx = (nowHour + i) % hourlyTimes.length;
      const timeStr = hourlyTimes[idx] ? hourlyTimes[idx].slice(11, 16) : `${(nowHour + i) % 24}:00`;
      forecastTimeline.push({
        time: timeStr,
        temp: Math.round(hourlyTemps[idx] ?? 20),
        rainProb: Math.round(hourlyRainProb[idx] ?? 10),
        condition: interpretWMOCode(hourlyWmo[idx] ?? 0),
      });
    }

    return {
      success: true,
      temperature: Math.round(current.temperature_2m ?? 24),
      humidity: Math.round(current.relative_humidity_2m ?? 65),
      precipitation: Number((current.precipitation ?? 0).toFixed(1)),
      windSpeed: Math.round(current.wind_speed_10m ?? 12),
      weatherCode: current.weather_code ?? 0,
      conditionLabel: condition.label,
      conditionIcon: condition.icon,
      severity: condition.severity,
      forecastTimeline,
      latitude,
      longitude,
    };
  } catch (err) {
    console.warn('Live weather fallback used:', err.message);
    return {
      success: false,
      temperature: 26,
      humidity: 60,
      precipitation: 0,
      windSpeed: 10,
      weatherCode: 0,
      conditionLabel: 'Partly Cloudy',
      conditionIcon: '⛅',
      severity: 'low',
      forecastTimeline: [
        { time: '12:00', temp: 26, rainProb: 10, condition: { icon: '⛅', label: 'Partly Cloudy' } },
        { time: '15:00', temp: 28, rainProb: 15, condition: { icon: '🌤️', label: 'Mainly Clear' } },
        { time: '18:00', temp: 25, rainProb: 5, condition: { icon: '☀️', label: 'Clear Sky' } },
        { time: '21:00', temp: 23, rainProb: 0, condition: { icon: '🌙', label: 'Clear' } },
      ],
      latitude,
      longitude,
    };
  }
}
