'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight, Shield, Users, Zap, FileText,
  Mic, Upload, BarChart3, Link2, ChevronRight,
  AlertTriangle, Wallet, Phone, Radar, Plane
} from 'lucide-react';
import styles from './page.module.css';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function LandingPage() {
  const heroTrackRef = useRef(null);
  const videoRef = useRef(null);
  const [videoFinished, setVideoFinished] = useState(false);

  // Ultra-smooth scroll-driven video with lerp interpolation
  useEffect(() => {
    const video = videoRef.current;
    const track = heroTrackRef.current;
    if (!video || !track) return;

    video.pause();
    video.addEventListener('loadedmetadata', () => video.pause());

    let targetTime = 0;
    let currentTime = 0;
    let running = true;

    // Scroll handler — just sets the target, doesn't touch video
    const handleScroll = () => {
      if (!video?.duration || !track) return;
      const trackHeight = track.offsetHeight - window.innerHeight;
      if (trackHeight <= 0) return;
      const fraction = Math.min(1, Math.max(0, window.scrollY / trackHeight));
      targetTime = fraction * video.duration;
      setVideoFinished(fraction >= 0.98);
    };

    // 60fps render loop with lerp for buttery-smooth frame transitions
    const tick = () => {
      if (!running) return;
      // Lerp: ease currentTime toward targetTime (0.12 = smooth, higher = snappier)
      currentTime += (targetTime - currentTime) * 0.12;
      if (video && !isNaN(currentTime) && Math.abs(video.currentTime - currentTime) > 0.01) {
        video.currentTime = currentTime;
      }
      requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    requestAnimationFrame(tick);

    return () => {
      running = false;
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <Navbar />

        <main style={{ marginTop: 0, paddingTop: 0, position: 'relative' }}>
          {/* ── Scroll-Driven Video Hero ─────────────────────────── */}
          <div ref={heroTrackRef} className={styles.heroScrollTrack}>
            <div className={`${styles.heroFixedContainer} ${videoFinished ? styles.heroUnpinned : ''}`}>
              <video
                ref={videoRef}
                className={styles.heroVideoBg}
                src="/hero-video.mp4"
                muted
                playsInline
                preload="auto"
              />
              <div className={styles.heroContentContainer}>
                <motion.div
                  className={styles.heroContent}
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
                >
                  <motion.div variants={fadeUp} className={styles.heroCtas}>
                    <Link href="/auth/register" className="btn btn-primary btn-lg">
                      Start Planning <ArrowRight size={18} />
                    </Link>
                    <a href="#how-it-works" className="btn btn-secondary btn-lg">See How It Works</a>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </div>

          {/* ── Problem Section (Slides smoothly into view after video finishes) ──────────────────────── */}
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

          {/* ── Features Section ─────────────────────── */}
          <section id="features" className={styles.featuresSection}>
            <div className="container">
              <div className={styles.sectionHeader}>
                <h2>Everything your trip needs</h2>
                <p>Two problem statements. One intelligent platform.</p>
              </div>
              <div className={styles.featuresGrid}>
                {[
                  { icon: <Mic size={24} />, title: 'AI Itinerary Builder', desc: 'Upload PDFs or describe your trip in natural language. AI structures your entire itinerary with smart dependency detection between bookings.' },
                  { icon: <Radar size={24} />, title: 'Live Flight & Train Tracking', desc: 'Real-time status of every flight and train. Auto-checks on page load with AeroDataBox and IRCTC APIs. Animated status badges show delays instantly.' },
                  { icon: <Shield size={24} />, title: 'Cascading Disruption Recovery', desc: 'When one booking breaks, AI identifies every downstream impact and generates 3 recovery plans ranked by cost, time, and comfort. One-click to apply.' },
                  { icon: <Phone size={24} />, title: 'AI VoIP Hotel Calling', desc: 'AI agent calls hotels directly via browser to negotiate schedule changes. Full voice conversation with speech recognition and synthesis. No Twilio needed.' },
                  { icon: <BarChart3 size={24} />, title: 'Smart Expense Ledger', desc: 'Track every expense with flexible splits (equal, exact, percentage). Hash-verified audit trail ensures transparency. Minimum-transaction settlement.' },
                  { icon: <Link2 size={24} />, title: 'Connected Booking Graph', desc: 'Visualize booking dependencies. Flight → Transfer → Hotel chains show exact buffer times. When disruption hits, ripple effects cascade in real-time.' },
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

          {/* ── How It Works Section ─────────────────── */}
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

          {/* ── CTA Section ──────────────────────────── */}
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
