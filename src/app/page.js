'use client';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight, Shield, Users, Zap, FileText,
  Mic, Upload, BarChart3, Link2, ChevronRight,
  AlertTriangle, Wallet
} from 'lucide-react';
import styles from './page.module.css';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function LandingPage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Navbar />

        <main>
          {/* ── Hero ─────────────────────────── */}
          <section className={styles.hero}>
            <div className="container">
              <motion.div
                className={styles.heroContent}
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
              >
                <motion.span variants={fadeUp} className={styles.heroBadge}>
                  <Zap size={14} /> Intelligent Travel Resilience
                </motion.span>
                <motion.h1 variants={fadeUp} className={styles.heroTitle}>
                  Travel disruptions happen.<br />
                  <span className={styles.heroAccent}>Recovery shouldn&apos;t be stressful.</span>
                </motion.h1>
                <motion.p variants={fadeUp} className={styles.heroSub}>
                  AI-powered itinerary management, disruption recovery, and group expense
                  settlement&nbsp;&mdash;&nbsp;all in one place.
                </motion.p>
                <motion.div variants={fadeUp} className={styles.heroCtas}>
                  <Link href="/auth/register" className="btn btn-primary btn-lg">
                    Start Planning <ArrowRight size={18} />
                  </Link>
                  <a href="#how-it-works" className="btn btn-secondary btn-lg">See How It Works</a>
                </motion.div>
              </motion.div>
            </div>
          </section>

          {/* ── Problem ──────────────────────── */}
          <section className={styles.problemSection}>
            <div className="container">
              <div className={styles.problemGrid}>
                <div className={`card ${styles.problemCard}`}>
                  <div className={styles.problemIcon} style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                    <AlertTriangle size={24} />
                  </div>
                  <h3>When one booking breaks&hellip;</h3>
                  <p>A delayed flight cascades into missed transfers, invalid hotel check-ins, and ruined plans. Manually sorting through alternatives costs hours of stress.</p>
                </div>
                <div className={`card ${styles.problemCard}`}>
                  <div className={styles.problemIcon} style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                    <Wallet size={24} />
                  </div>
                  <h3>When groups travel&hellip;</h3>
                  <p>Shared expenses, partial participants, cancellations, and refunds create financial chaos. Someone always ends up overpaying or underpaying.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Features ─────────────────────── */}
          <section id="features" className={styles.featuresSection}>
            <div className="container">
              <div className={styles.sectionHeader}>
                <h2>Everything your trip needs</h2>
                <p>Two problem statements. One intelligent platform.</p>
              </div>
              <div className={styles.featuresGrid}>
                {[
                  { icon: <Mic size={24} />, title: 'AI Itinerary Builder', desc: 'Upload PDFs or just describe your trip. AI structures your entire itinerary with dependencies auto-detected.' },
                  { icon: <Link2 size={24} />, title: 'Connected Itinerary', desc: 'Booking dependencies visualized. When disruption hits, ripple effects are instantly identified across your plan.' },
                  { icon: <Shield size={24} />, title: 'Smart Disruption Recovery', desc: 'AI generates recovery plans in seconds. Compare by cost, time, and convenience. One-click to apply.' },
                  { icon: <BarChart3 size={24} />, title: 'Group Ledger & Settlement', desc: 'Transparent expense tracking with multiple split types. Hash-verified audit trail. Minimum-transaction settlement.' },
                ].map((f, i) => (
                  <motion.div
                    key={i}
                    className={`card ${styles.featureCard}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className={styles.featureIcon}>{f.icon}</div>
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ── How It Works ─────────────────── */}
          <section id="how-it-works" className={styles.howSection}>
            <div className="container">
              <div className={styles.sectionHeader}>
                <h2>How it works</h2>
                <p>From planning to settlement in four simple steps.</p>
              </div>
              <div className={styles.stepsGrid}>
                {[
                  { num: '01', title: 'Tell us your plans', desc: 'Upload booking PDFs or just talk — AI builds your connected itinerary.' },
                  { num: '02', title: 'Track expenses', desc: 'Log costs with flexible splits. Every penny tracked per participant.' },
                  { num: '03', title: 'Handle disruptions', desc: 'AI detects cascading impact and generates recovery plans instantly.' },
                  { num: '04', title: 'Settle up', desc: 'Fair, transparent, hash-verified settlement with minimum transactions.' },
                ].map((s, i) => (
                  <motion.div
                    key={i}
                    className={styles.step}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <span className={styles.stepNum}>{s.num}</span>
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ── CTA ──────────────────────────── */}
          <section className={styles.ctaSection}>
            <div className="container">
              <div className={styles.ctaCard}>
                <h2>Ready to travel smarter?</h2>
                <p>Create your trip, invite your group, and let TripTogether handle the chaos.</p>
                <Link href="/auth/register" className="btn btn-primary btn-lg">
                  Create Your First Trip <ChevronRight size={18} />
                </Link>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </ToastProvider>
    </AuthProvider>
  );
}
