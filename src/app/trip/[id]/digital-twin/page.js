'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTrip } from '../layout';
import { getBookings } from '@/lib/firebase/firestore';
import { getDestinationCoordinates, getLiveWeather } from '@/lib/weather/openMeteo';
import { Zap, CloudRain, Wind, Eye, Sparkles } from 'lucide-react';

import WhatIfSimulator from '@/components/digitaltwin/WhatIfSimulator';
import WeatherMap from '@/components/digitaltwin/WeatherMap';
import NugenComparisonCard from '@/components/digitaltwin/NugenComparisonCard';
import SocialSignalFeed from '@/components/digitaltwin/SocialSignalFeed';

import styles from './page.module.css';

export default function DigitalTwinPage() {
  const { trip } = useTrip();
  const { id } = useParams();

  const [bookings, setBookings] = useState([]);
  const [liveWeather, setLiveWeather] = useState({});
  const [coords, setCoords] = useState(null);
  const [simulation, setSimulation] = useState({});
  const [loading, setLoading] = useState(true);

  const destinationName = trip?.destination || bookings[0]?.location || bookings[0]?.destination || 'Mumbai';

  useEffect(() => {
    const init = async () => {
      // 1. Fetch trip bookings
      let bList = [];
      try { bList = await getBookings(id); } catch (_) {}
      if (bList.length === 0 && typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('cached_bookings_' + id);
          if (cached) bList = JSON.parse(cached);
        } catch (_) {}
      }
      setBookings(bList);

      // 2. Resolve actual destination coordinates via Open-Meteo Geocoding
      const destName = trip?.destination || bList[0]?.location || bList[0]?.destination || destinationName;
      const location = await getDestinationCoordinates(destName);
      setCoords(location);

      // 3. Fetch live weather telemetry for actual destination lat/lon
      const weather = await getLiveWeather(location.latitude, location.longitude);
      setLiveWeather(weather);

      setLoading(false);
    };

    init();
  }, [id, trip?.destination, destinationName]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 30 }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* 4.2 HERO HEADER SECTION */}
      <div className={styles.heroSection}>
        <div className={styles.heroBadges}>
          <span className={styles.heroAmberPill}>
            <Zap size={14} /> DIGITAL TWIN SIMULATION LAYER
          </span>
          <span className={styles.heroBlueBadge}>
            MIDNIGHT TASK 1 &amp; 2 INTEGRATED
          </span>
        </div>
        <h1 className={styles.heroTitle}>
          Weather-Driven Digital Twin &amp; Nugen AI Intelligence
        </h1>
        <p className={styles.heroSub}>
          Virtual simulation layer directly embedded into TripTogether&apos;s trip graph. Real-time Open-Meteo telemetry, GIS radar map, real-world distress feeds, and Nugen domain-aligned cascade assessment.
        </p>
      </div>

      {/* 4.3 BOX 1: LIVE WEATHER TELEMETRY HEADER CARD (3-Column Layout) */}
      <div className={styles.liveWeatherCard}>
        {/* Col 1: Temperature & Live Dot */}
        <div className={styles.colTemp}>
          <div className={styles.livePulseRow}>
            <span className={styles.pulseDot} />
            <span>LIVE OPEN-METEO TELEMETRY</span>
          </div>
          <div className={styles.tempDisplay}>
            {liveWeather.temperature || 20}°C
          </div>
          <div className={styles.conditionMeta}>
            {liveWeather.conditionIcon || '⛅'} {liveWeather.conditionLabel || 'Partly Cloudy'} · {coords?.name || destinationName}
          </div>
        </div>

        {/* Col 2: Metrics Group */}
        <div className={styles.metricsGroup}>
          <div className={styles.metricBadge}>
            <CloudRain size={16} color="#2563EB" />
            <span>Precipitation: <strong>{liveWeather.precipitation || 0} mm/h</strong></span>
          </div>
          <div className={styles.metricBadge}>
            <Wind size={16} color="#059669" />
            <span>Wind Speed: <strong>{liveWeather.windSpeed || 12} km/h</strong></span>
          </div>
          <div className={styles.metricBadge}>
            <Eye size={16} color="#7C3AED" />
            <span>Humidity: <strong>{liveWeather.humidity || 65}%</strong></span>
          </div>
        </div>

        {/* Col 3: 8-Hour Micro-Forecast Timeline */}
        <div className={styles.hourlyContainer}>
          <div className={styles.hourlyTitle}>Today&apos;s Micro-Forecast:</div>
          <div className={styles.hourlyRow}>
            {(liveWeather.forecastTimeline || []).map((step, i) => (
              <div key={i} className={styles.hourlyBox}>
                <div className={styles.hTime}>{step.time}</div>
                <div className={styles.hTemp}>{step.temp}°</div>
                <div className={styles.hRain}>{step.rainProb}% rain</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4.4 BOX 2: WHAT-IF COUNTERFACTUAL SCENARIO SIMULATOR */}
      <WhatIfSimulator
        bookings={bookings}
        liveWeather={liveWeather}
        onSimulationChange={sim => setSimulation(sim)}
      />

      {/* 4.5 BOX 3: GEOSPATIAL ROUTE NETWORK & LIVE GIS RADAR MAP */}
      <WeatherMap
        simulation={simulation}
        trip={trip}
        coords={coords}
      />

      {/* 4.6 BOX 4: NUGEN INTELLIGENCE MODEL ALIGNMENT BENCHMARK (Task 2 Requirement) */}
      <NugenComparisonCard
        simulation={simulation}
        bookings={bookings}
      />

      {/* 4.7 BOX 5: REAL-WORLD SOCIAL DISTRESS & CROWD SIGNALS FEED */}
      <SocialSignalFeed
        destination={destinationName}
        simulation={simulation}
      />
    </div>
  );
}
