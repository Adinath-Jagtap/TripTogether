'use client';
import { useState, useEffect } from 'react';
import { CloudRain, Wind, Eye, Clock, RotateCcw, Sparkles, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { runDigitalTwinSimulation } from '@/lib/digitaltwin/weatherTwin';
import styles from './WhatIfSimulator.module.css';

export default function WhatIfSimulator({ bookings = [], liveWeather = {}, onSimulationChange }) {
  const [rainfall, setRainfall] = useState(liveWeather.precipitation || 0);
  const [windSpeed, setWindSpeed] = useState(liveWeather.windSpeed || 12);
  const [visibility, setVisibility] = useState(10);
  const [timeOffset, setTimeOffset] = useState(0);

  // Sync state when live weather finishes loading
  useEffect(() => {
    if (liveWeather.precipitation !== undefined) setRainfall(liveWeather.precipitation);
    if (liveWeather.windSpeed !== undefined) setWindSpeed(liveWeather.windSpeed);
  }, [liveWeather]);

  // Run physics engine simulation when parameters change
  const scenario = { rainfall, windSpeed, visibility, timeOffset };
  const simulation = runDigitalTwinSimulation(bookings, scenario);

  useEffect(() => {
    if (onSimulationChange) {
      onSimulationChange(simulation);
    }
  }, [rainfall, windSpeed, visibility, timeOffset, bookings.length]);

  const handleReset = () => {
    setRainfall(liveWeather.precipitation || 0);
    setWindSpeed(liveWeather.windSpeed || 12);
    setVisibility(10);
    setTimeOffset(0);
  };

  const applyPreset = (r, w, v, t) => {
    setRainfall(r);
    setWindSpeed(w);
    setVisibility(v);
    setTimeOffset(t);
  };

  const { resilienceScore, criticalCount, warningCount, proactiveAdvice } = simulation;

  const riskClass = resilienceScore < 50
    ? styles.riskPillSevere
    : resilienceScore < 75
    ? styles.riskPillElevated
    : styles.riskPillLow;

  const riskLabel = resilienceScore < 50
    ? '🔴 SEVERE RISK'
    : resilienceScore < 75
    ? '🟡 ELEVATED RISK'
    : '🟢 LOW RISK';

  return (
    <div className={styles.simulatorCard}>
      <div className={styles.simHeader}>
        <div className={styles.simTitleBox}>
          <span className={styles.enginePill}>DIGITAL TWIN WHAT-IF ENGINE</span>
          <span className={riskClass}>{riskLabel}</span>
        </div>
        <button type="button" className={styles.resetBtn} onClick={handleReset}>
          <RotateCcw size={14} /> Reset Live
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: '#111827' }}>
          Counterfactual Disruption Simulator
        </h3>
        <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '4px 0 0 0' }}>
          Dynamically modulate weather parameters to test DAG cascade resilience and transit buffer elasticity.
        </p>
      </div>

      {/* Preset Scenario Buttons */}
      <div className={styles.presetRow}>
        <span className={styles.presetLabel}>Quick Presets:</span>
        <button type="button" className={styles.presetBtn} onClick={() => applyPreset(65, 28, 2.5, 0)}>
          🌧️ Monsoon Cloudburst
        </button>
        <button type="button" className={styles.presetBtn} onClick={() => applyPreset(42, 95, 1.8, 3)}>
          🌪️ Typhoon Warning
        </button>
        <button type="button" className={styles.presetBtn} onClick={() => applyPreset(0, 12, 0.2, 0)}>
          🌫️ Dense Winter Fog
        </button>
        <button type="button" className={styles.presetBtn} onClick={() => applyPreset(0, 10, 10, 0)}>
          ☀️ Clear Skies
        </button>
      </div>

      {/* 4-Slider Interactive Control Grid */}
      <div className={styles.slidersGrid}>
        {/* Slider 1: Rainfall */}
        <div className={styles.sliderCard}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>
              <CloudRain size={16} color="#2563EB" /> Rainfall Intensity
            </span>
            <span className={styles.sliderValue}>{rainfall} mm/h</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={rainfall}
            onChange={e => setRainfall(Number(e.target.value))}
            className={styles.sliderInput}
          />
          <div className={styles.ticksRow}>
            <span>0 (Clear)</span>
            <span>25 (Mod)</span>
            <span>50 (Heavy)</span>
            <span>100 (Torrential)</span>
          </div>
        </div>

        {/* Slider 2: Wind Speed */}
        <div className={styles.sliderCard}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>
              <Wind size={16} color="#059669" /> Surface Wind Velocity
            </span>
            <span className={styles.sliderValue}>{windSpeed} km/h</span>
          </div>
          <input
            type="range"
            min="0"
            max="120"
            step="1"
            value={windSpeed}
            onChange={e => setWindSpeed(Number(e.target.value))}
            className={styles.sliderInput}
          />
          <div className={styles.ticksRow}>
            <span>0 (Calm)</span>
            <span>35 (Breeze)</span>
            <span>65 (Gale)</span>
            <span>120 (Typhoon)</span>
          </div>
        </div>

        {/* Slider 3: Visibility */}
        <div className={styles.sliderCard}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>
              <Eye size={16} color="#7C3AED" /> Atmospheric Visibility
            </span>
            <span className={styles.sliderValue}>{visibility} km</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="10.0"
            step="0.1"
            value={visibility}
            onChange={e => setVisibility(Number(e.target.value))}
            className={styles.sliderInput}
          />
          <div className={styles.ticksRow}>
            <span>0.1 (Dense Fog)</span>
            <span>2.0 (Haze)</span>
            <span>10 km (Clear)</span>
          </div>
        </div>

        {/* Slider 4: Storm Impact Timing Horizon */}
        <div className={styles.sliderCard}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>
              <Clock size={16} color="#D97706" /> Storm Lead Time
            </span>
            <span className={styles.sliderValue}>
              {timeOffset === 0 ? 'Immediate' : `+${timeOffset} Hours`}
            </span>
          </div>
          <div className={styles.timingButtons}>
            <button
              type="button"
              className={`${styles.timingBtn} ${timeOffset === 0 ? styles.timingActive : ''}`}
              onClick={() => setTimeOffset(0)}
            >
              Immediate
            </button>
            <button
              type="button"
              className={`${styles.timingBtn} ${timeOffset === 3 ? styles.timingActive : ''}`}
              onClick={() => setTimeOffset(3)}
            >
              +3 Hours
            </button>
            <button
              type="button"
              className={`${styles.timingBtn} ${timeOffset === 6 ? styles.timingActive : ''}`}
              onClick={() => setTimeOffset(6)}
            >
              +6 Hours
            </button>
          </div>
        </div>
      </div>

      {/* Impact Summary Bar */}
      <div className={styles.impactSummaryBar}>
        <div className={styles.scoreCircleArea}>
          <div
            className={styles.resilienceScoreCircle}
            style={{
              borderColor: resilienceScore < 50 ? '#DC2626' : resilienceScore < 75 ? '#D97706' : '#059669',
              color: resilienceScore < 50 ? '#DC2626' : resilienceScore < 75 ? '#D97706' : '#059669',
            }}
          >
            {resilienceScore}
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>
              Simulated Resilience Score
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1F2937' }}>
              {resilienceScore >= 80 ? 'Optimal Route Graph' : resilienceScore >= 50 ? 'Strained DAG Graph' : 'Critical Cascade Failure'}
            </div>
          </div>
        </div>

        <div className={styles.summaryText}>
          <div className={styles.summaryTitle}>
            {criticalCount > 0 ? `⚠️ Cascade across ${criticalCount} connected transit nodes` : warningCount > 0 ? `⚡ ${warningCount} transit nodes strained` : '✓ All buffer margins intact'}
          </div>
          <div className={styles.summarySub}>
            {criticalCount > 0
              ? 'Weather parameters exceed safety thresholds. Topological connection buffers consumed.'
              : 'Microclimate drag within safety parameters.'}
          </div>

          <div className={styles.mitigationBox}>
            <div className={styles.mitigationHeader}>
              <Sparkles size={14} /> Recommended Proactive Action:
            </div>
            <div>{proactiveAdvice}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
