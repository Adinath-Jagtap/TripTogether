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

      if (onTripDataSuggested && (!trip?.destination || trip.destination === '')) {
        onTripDataSuggested({
          destination: data.destination,
          title: data.suggested_title,
          country: data.country || 'India',
          start_date: data.start_date,
          end_date: data.end_date,
          budget: data.budget,
          currency: data.currency || 'INR',
        });
      }
    }
  };

  const handleVoiceUpdate = (updatedBookings, updatedDeps) => {
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
      <div className={styles.modeSwitch}>
        <button
          type="button"
          onClick={() => setActiveMode('pdf')}
          className={`${styles.modeTab} ${activeMode === 'pdf' ? styles.modeTabActive : ''}`}
        >
          <FileUp size={16} />
          <span>Upload Itinerary PDF</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('voice')}
          className={`${styles.modeTab} ${activeMode === 'voice' ? styles.modeTabActive : ''}`}
        >
          <Mic size={16} />
          <span>Voice & Chat Dictation</span>
        </button>
      </div>

      <div className={styles.twoColumnLayout}>
        <div>
          {activeMode === 'pdf' ? (
            <PDFUploader
              onParsed={handlePDFParsed}
              onError={(msg) => toast?.error?.(msg)}
            />
          ) : (
            <VoiceAssistant
              destination={trip?.destination || ''}
              startDate={trip?.start_date || ''}
              currentBookings={bookings}
              onUpdateDraft={handleVoiceUpdate}
              onError={(msg) => toast?.error?.(msg)}
            />
          )}
        </div>

        <div>
          <ItineraryCanvas
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
