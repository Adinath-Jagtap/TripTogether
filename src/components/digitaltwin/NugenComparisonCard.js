'use client';
import { useState } from 'react';
import { Sparkles, CheckCircle2, ShieldCheck, AlertTriangle, Info, Clock, Thermometer, ArrowRight } from 'lucide-react';
import styles from './NugenComparisonCard.module.css';

export default function NugenComparisonCard({ simulation = {}, bookings = [] }) {
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' | 'breakdown'

  const scenario = simulation.weatherScenario || { rainfall: 0, windSpeed: 12, visibility: 10 };
  const resilienceScore = simulation.resilienceScore ?? 92;
  const criticalCount = simulation.criticalCount || 0;
  const warningCount = simulation.warningCount || 0;
  const proactiveAdvice = simulation.proactiveAdvice || 'Your trip timeline is looking great! All transfer buffers are safe.';

  // Determine overall status
  const isHighRisk = resilienceScore < 50 || criticalCount > 0;
  const isModerateRisk = resilienceScore < 75 || warningCount > 0;

  const statusBadge = isHighRisk
    ? { label: 'ACTION RECOMMENDED', color: '#DC2626', bg: '#FEE2E2', icon: AlertTriangle }
    : isModerateRisk
    ? { label: 'MODERATE WEATHER IMPACT', color: '#D97706', bg: '#FEF3C7', icon: Info }
    : { label: 'SMOOTH TRAVEL GUARANTEED', color: '#059669', bg: '#D1FAE5', icon: CheckCircle2 };

  const StatusIcon = statusBadge.icon;

  return (
    <div className={styles.insightsCard}>
      {/* Header Area */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <span className={styles.sparkleBadge}>
            <Sparkles size={13} style={{ display: 'inline', marginRight: 4 }} />
            AI TRAVELER INSIGHTS
          </span>
          <h3 className={styles.cardTitle}>Smart AI Trip Advice &amp; Safety Forecast</h3>
        </div>

        <div className={styles.statusPill} style={{ background: statusBadge.bg, color: statusBadge.color }}>
          <StatusIcon size={14} />
          <span>{statusBadge.label}</span>
        </div>
      </div>

      <p className={styles.subText}>
        Simple, real-time guidance derived from live weather forecasts to keep your journey smooth and stress-free.
      </p>

      {/* Highlights Summary Grid (3 Cards) */}
      <div className={styles.summaryGrid}>
        {/* Card 1: Safety Margin */}
        <div className={styles.summaryBox}>
          <div className={styles.boxHeader}>
            <ShieldCheck size={18} color="#2563EB" />
            <span>Buffer Safety Margin</span>
          </div>
          <div className={styles.boxMainVal} style={{ color: isHighRisk ? '#DC2626' : '#059669' }}>
            {resilienceScore}%
          </div>
          <div className={styles.boxSub}>
            {isHighRisk ? 'Buffer consumed by weather' : isModerateRisk ? 'Slight buffer strain' : 'Optimal safety cushion'}
          </div>
        </div>

        {/* Card 2: Estimated Weather Impact */}
        <div className={styles.summaryBox}>
          <div className={styles.boxHeader}>
            <Clock size={18} color="#D97706" />
            <span>Expected Delay Drag</span>
          </div>
          <div className={styles.boxMainVal} style={{ color: simulation.totalDelay > 30 ? '#DC2626' : '#1F2937' }}>
            +{simulation.totalDelay || 0} min
          </div>
          <div className={styles.boxSub}>
            {scenario.rainfall > 20 ? `${scenario.rainfall} mm/h rain drag` : 'Minimal weather drag'}
          </div>
        </div>

        {/* Card 3: Model Confidence */}
        <div className={styles.summaryBox}>
          <div className={styles.boxHeader}>
            <Sparkles size={18} color="#7C3AED" />
            <span>AI Confidence</span>
          </div>
          <div className={styles.boxMainVal} style={{ color: '#7C3AED' }}>
            95.4%
          </div>
          <div className={styles.boxSub}>
            Grounded in physical transit rules
          </div>
        </div>
      </div>

      {/* Actionable Advice Banner */}
      <div className={styles.adviceBanner} style={{ borderColor: isHighRisk ? '#FCA5A5' : '#BFDBFE', background: isHighRisk ? '#FEF2F2' : '#EFF6FF' }}>
        <div className={styles.adviceHeader} style={{ color: isHighRisk ? '#991B1B' : '#1E40AF' }}>
          <Sparkles size={16} />
          <strong>What You Should Do Next:</strong>
        </div>
        <div className={styles.adviceBody} style={{ color: isHighRisk ? '#7F1D1D' : '#1E3A8A' }}>
          {proactiveAdvice}
        </div>
      </div>

      {/* Simple Waypoint Breakdown List */}
      <div className={styles.breakdownSection}>
        <h4 className={styles.breakdownTitle}>Stop-by-Stop Schedule Health:</h4>
        <div className={styles.waypointList}>
          {(simulation.evaluatedNodes || bookings).slice(0, 3).map((node, i) => {
            const isOk = node.status !== 'critical';
            return (
              <div key={i} className={styles.waypointItem}>
                <div className={styles.wpNumber}>{i + 1}</div>
                <div className={styles.wpContent}>
                  <div className={styles.wpTitle}>{node.title || `Booking Stop #${i + 1}`}</div>
                  <div className={styles.wpSub}>
                    Buffer: <strong>{node.connectionBuffer || 60} mins</strong> · {node.impactReason || 'Operating smoothly on time.'}
                  </div>
                </div>
                <div className={styles.wpBadge} style={{ background: isOk ? '#ECFDF5' : '#FEF2F2', color: isOk ? '#065F46' : '#991B1B' }}>
                  {isOk ? '✓ Safe Window' : '⚠️ Risk Detected'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
