'use client';
import { useState, useEffect } from 'react';
import { Radio, RefreshCw, ExternalLink, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import styles from './SocialSignalFeed.module.css';

export default function SocialSignalFeed({ destination = 'Tokyo', simulation = {} }) {
  const [sourceMode, setSourceMode] = useState('destination'); // 'destination' | 'global' | 'whatif'
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');

  const { rainfall = 42, windSpeed = 95 } = simulation.weatherScenario || {};

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/digitaltwin/social-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, rainfall, windSpeed, sourceMode }),
      });
      const data = await res.json();
      if (data.success) {
        setSignals(data.signals || []);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err) {
      console.warn('Social signals feed error:', err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSignals();
  }, [destination, sourceMode, rainfall, windSpeed]);

  const cleanDest = destination.split(',')[0].trim();

  return (
    <div className={styles.feedCardContainer}>
      <div className={styles.feedHeader}>
        <div className={styles.titleBox}>
          <Radio size={18} color="#DC2626" style={{ animation: 'pulse 1.5s infinite' }} />
          <span className={styles.liveTag}>100% LIVE RSS FEED</span>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, margin: 0, color: '#111827' }}>
            Real-World Social Distress &amp; Crowd Signals
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
            {lastUpdated ? `Updated at ${lastUpdated}` : 'Live Sync'}
          </span>
          <button type="button" className={styles.refreshBtn} onClick={fetchSignals} disabled={loading}>
            <RefreshCw size={13} className={loading ? styles.spin : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* 3-Way Feed Source Switcher */}
      <div className={styles.sourceSelectorRow}>
        <button
          type="button"
          className={`${styles.sourceBtn} ${sourceMode === 'destination' ? styles.sourceActive : ''}`}
          onClick={() => setSourceMode('destination')}
        >
          🌐 {cleanDest} Local News (Google News RSS)
        </button>

        <button
          type="button"
          className={`${styles.sourceBtn} ${sourceMode === 'global' ? styles.sourceActive : ''}`}
          onClick={() => setSourceMode('global')}
        >
          📡 Global Weather Wire (RSS.app)
        </button>

        <button
          type="button"
          className={`${styles.sourceBtn} ${sourceMode === 'whatif' ? styles.sourceActive : ''}`}
          onClick={() => setSourceMode('whatif')}
        >
          ⚡ What-If Scenario Wire (Reactive)
        </button>
      </div>

      {/* Feed Signal Cards List */}
      <div className={styles.feedList}>
        {signals.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280', fontSize: '0.8125rem' }}>
            {loading ? 'Fetching real-world distress signals...' : 'No active distress signals for this destination.'}
          </div>
        ) : (
          signals.map(sig => (
            <div key={sig.id} className={styles.signalItem}>
              <div className={styles.signalTopRow}>
                <div className={styles.sourceInfo}>
                  <span>{sig.source}</span>
                  <span className={styles.timeLabel}>· {sig.time}</span>
                </div>
                <span className={styles.locationBadge}>{sig.location}</span>
              </div>

              <div className={styles.contentBody}>
                &quot;{sig.content}&quot;
              </div>

              {sig.url && sig.url !== '#' && (
                <div>
                  <a href={sig.url} target="_blank" rel="noopener noreferrer" className={styles.articleLink}>
                    Read full article <ExternalLink size={11} />
                  </a>
                </div>
              )}

              <div className={styles.signalFooterRow}>
                <div className={styles.sentimentBar}>
                  <span style={{ color: sig.sentiment < -0.4 ? '#DC2626' : sig.sentiment > 0.2 ? '#059669' : '#D97706' }}>
                    {sig.sentiment < -0.4 ? '🔴 High Distress' : sig.sentiment > 0.2 ? '🟢 Positive' : '🟡 Neutral/Alert'}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>(Sentiment: {sig.sentiment})</span>
                </div>

                {sig.corroborated && (
                  <span className={styles.corroboratedBadge}>
                    <CheckCircle size={12} /> {sig.corroborationNote}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
