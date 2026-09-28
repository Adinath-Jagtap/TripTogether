'use client';
import { useState } from 'react';
import { FileUp, Mic, LayoutGrid, CheckCircle } from 'lucide-react';
import PDFUploader from './PDFUploader';
import VoiceAssistant from './VoiceAssistant';
import ItineraryCanvas from './ItineraryCanvas';
import { useToast } from '@/context/ToastContext';
import styles from './ItineraryOnboarding.module.css';

export default function ItineraryOnboarding({
  trip,
  initialBookings = [],
  initialDependencies = [],
  defaultMode,
  onItineraryConfirmed,
  onTripDataSuggested,
}) {
  const normalizeBookings = (list) => {
    return (list || []).map((b, idx) => ({
      ...b,
      temp_id: b.temp_id || b.id || `node_${idx + 1}`,
      cost: Number(b.cost) || 0,
    }));
  };

  const normalizeDeps = (list) => {
    return (list || []).map(d => ({
      ...d,
      upstream_temp_id: d.upstream_temp_id || d.upstream_booking_id,
      downstream_temp_id: d.downstream_temp_id || d.downstream_booking_id,
    }));
  };

  const [activeMode, setActiveMode] = useState(() =>
    defaultMode || (initialBookings && initialBookings.length > 0 ? 'voice' : 'pdf')
  );
  const [bookings, setBookings] = useState(() => normalizeBookings(initialBookings));
  const [dependencies, setDependencies] = useState(() => normalizeDeps(initialDependencies));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toast = useToast();

  const handlePDFParsed = (data) => {
    if (data.bookings && data.bookings.length > 0) {
      setBookings(prev => {
        if (!prev || prev.length === 0) {
          return data.bookings.map((b, idx) => ({
            ...b,
            temp_id: b.temp_id || `pdf_${Date.now()}_${idx}`,
          }));
        }

        // Avoid duplicates by comparing title and start_datetime
        const existingKeys = new Set(
          prev.map(b => `${(b.title || '').trim().toLowerCase()}__${(b.start_datetime || '').slice(0, 10)}`)
        );

        const newItems = data.bookings
          .filter(b => !existingKeys.has(`${(b.title || '').trim().toLowerCase()}__${(b.start_datetime || '').slice(0, 10)}`))
          .map((b, idx) => ({
            ...b,
            temp_id: b.temp_id || `pdf_add_${Date.now()}_${idx}`,
          }));

        if (newItems.length === 0) {
          toast?.info?.('Document processed — all bookings already exist in your canvas.');
          return prev;
        }

        toast?.success?.(`Added ${newItems.length} new bookings to your existing canvas! Review nodes and give your Pass Check.`);
        return [...prev, ...newItems];
      });

      if (data.dependencies && data.dependencies.length > 0) {
        setDependencies(prev => {
          const keyOf = (d) => `${d.upstream_temp_id || d.upstream_booking_id}->${d.downstream_temp_id || d.downstream_booking_id}`;
          const currentKeys = new Set(prev.map(keyOf));
          const toAdd = data.dependencies
            .filter(d => !currentKeys.has(keyOf(d)))
            .map(d => ({
              ...d,
              upstream_temp_id: d.upstream_temp_id || d.upstream_booking_id,
              downstream_temp_id: d.downstream_temp_id || d.downstream_booking_id,
            }));
          return [...prev, ...toAdd];
        });
      }

      if (onTripDataSuggested) {
        onTripDataSuggested({
          destination: data.destination,
          title: data.suggested_title || data.title,
          country: data.country || 'India',
          start_date: data.start_date,
          end_date: data.end_date,
          budget: data.budget,
          currency: data.currency || 'INR',
        });
      }

      // Auto switch to canvas tab on mobile
      setActiveMode('canvas');
    }
  };

  const handleVoiceUpdate = (updatedBookings, updatedDeps, meta = {}) => {
    // Preserve database IDs for existing items
    const dbIdMap = new Map();
    bookings.forEach(b => {
      if (b.id) {
        if (b.temp_id) dbIdMap.set(b.temp_id, b.id);
        dbIdMap.set(b.id, b.id);
        if (b.title) dbIdMap.set(b.title.toLowerCase().trim(), b.id);
      }
    });

    const enriched = (updatedBookings || []).map(ub => ({
      ...ub,
      id: ub.id || dbIdMap.get(ub.temp_id) || dbIdMap.get((ub.title || '').toLowerCase().trim()) || undefined,
      cost: Number(ub.cost) || 0,
    }));

    setBookings(enriched);
    if (updatedDeps && updatedDeps.length > 0) {
      setDependencies(normalizeDeps(updatedDeps));
    }
    toast?.info?.('Itinerary canvas updated with your latest voice instructions.');

    // Auto-suggest trip details if updatedBookings has items
    if (onTripDataSuggested && enriched.length > 0) {
      const dateTimes = enriched
        .map(b => b.start_datetime)
        .filter(Boolean)
        .sort();
      const endTimes = enriched
        .map(b => b.end_datetime || b.start_datetime)
        .filter(Boolean)
        .sort();

      const startDate = meta.suggested_start_date || (dateTimes.length > 0 ? dateTimes[0].slice(0, 10) : trip?.start_date);
      const endDate = meta.suggested_end_date || (endTimes.length > 0 ? endTimes[endTimes.length - 1].slice(0, 10) : startDate);
      const totalBudget = meta.suggested_budget || enriched.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

      let inferredDest = meta.suggested_destination;
      if (!inferredDest) {
        const firstDestBooking = enriched.find(b => b.destination_location || b.venue);
        inferredDest = firstDestBooking ? (firstDestBooking.destination_location || firstDestBooking.venue) : trip?.destination;
      }

      let inferredTitle = meta.suggested_title;
      if (!inferredTitle && inferredDest) {
        inferredTitle = `${inferredDest} Adventure`;
      }

      if (inferredDest || startDate) {
        onTripDataSuggested({
          destination: inferredDest || trip?.destination,
          title: inferredTitle || (inferredDest ? `${inferredDest} Adventure` : undefined),
          country: meta.suggested_country || 'India',
          start_date: startDate || trip?.start_date,
          end_date: endDate || trip?.end_date,
          budget: totalBudget > 0 ? totalBudget : undefined,
          currency: trip?.currency || 'INR',
        });
      }
    }
  };

  const handleRemoveBooking = (bookingIdOrTempId) => {
    setBookings(prev => prev.filter(b => (b.temp_id || b.id) !== bookingIdOrTempId && b.id !== bookingIdOrTempId && b.temp_id !== bookingIdOrTempId));
    setDependencies(prev =>
      prev.filter(
        d =>
          d.upstream_temp_id !== bookingIdOrTempId &&
          d.downstream_temp_id !== bookingIdOrTempId &&
          d.upstream_booking_id !== bookingIdOrTempId &&
          d.downstream_booking_id !== bookingIdOrTempId
      )
    );
  };

  const handleConfirm = async () => {
    if (bookings.length === 0) {
      toast?.warning?.('Add at least one booking to your itinerary before confirming.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (onItineraryConfirmed) {
        await onItineraryConfirmed(bookings, dependencies);
      }
      toast?.success?.('Itinerary confirmed and synced with resilience engine!');
    } catch (err) {
      console.error('Confirmation error:', err);
      toast?.error?.(err.message || 'Failed to save itinerary.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Mode Switcher Tabs */}
      <div className={styles.modeSwitch}>
        <button
          type="button"
          onClick={() => setActiveMode('pdf')}
          className={`${styles.modeTab} ${activeMode === 'pdf' ? styles.modeTabActive : ''}`}
        >
          <FileUp size={15} />
          <span className={styles.desktopText}>Upload PDF</span>
          <span className={styles.mobileText}>PDF</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('voice')}
          className={`${styles.modeTab} ${activeMode === 'voice' ? styles.modeTabActive : ''}`}
        >
          <Mic size={15} />
          <span className={styles.desktopText}>Voice Dictation</span>
          <span className={styles.mobileText}>Voice AI</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('canvas')}
          className={`${styles.modeTab} ${activeMode === 'canvas' ? styles.modeTabActive : ''} ${styles.mobileCanvasTab} ${bookings.length > 0 ? styles.canvasTabHighlight : ''}`}
        >
          <LayoutGrid size={15} />
          <span className={styles.desktopText}>Live Canvas ({String(bookings.length)})</span>
          <span className={styles.mobileText}>Canvas ({String(bookings.length)})</span>
        </button>
      </div>

      {/* Responsive Layout: Single Tree */}
      <div className={styles.responsiveLayout}>
        <div className={`${styles.inputColumn} ${activeMode === 'canvas' ? styles.hideOnMobile : ''}`}>
          <div style={{ display: activeMode === 'pdf' ? 'block' : 'none' }}>
            <PDFUploader
              onParsed={handlePDFParsed}
              onError={(msg) => toast?.error?.(msg)}
            />
          </div>
          <div style={{ display: activeMode === 'voice' ? 'block' : 'none' }}>
            <VoiceAssistant
              destination={trip?.destination || ''}
              startDate={trip?.start_date || ''}
              currentBookings={bookings}
              onUpdateDraft={handleVoiceUpdate}
              onError={(msg) => toast?.error?.(msg)}
            />
          </div>
        </div>

        <div className={`${styles.canvasColumn} ${activeMode !== 'canvas' ? styles.hideOnMobile : ''}`}>
          <ItineraryCanvas
            key="itinerary_canvas"
            bookings={bookings}
            dependencies={dependencies}
            currency={trip?.currency || 'INR'}
            onRemoveBooking={handleRemoveBooking}
            onConfirmItinerary={handleConfirm}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
