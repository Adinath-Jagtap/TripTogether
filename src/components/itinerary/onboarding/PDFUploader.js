'use client';
import { useState, useRef } from 'react';
import { FileUp, FileText, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import styles from './PDFUploader.module.css';

export default function PDFUploader({ onParsed, onError }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState('');
  const [parsedSummary, setParsedSummary] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      processFile(files[0]);
    } else {
      if (onError) onError('Please upload a PDF file (tickets, booking confirmation, or itinerary).');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file) => {
    try {
      setIsParsing(true);
      setParseStatus('Extracting itinerary data with AI Engine...');

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ai/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse itinerary PDF');
      }

      setParseStatus('Bookings and dependencies parsed successfully!');
      setParsedSummary({
        fileName: file.name,
        count: data.bookings?.length || 0,
        title: data.suggested_title || data.destination,
        destination: data.destination,
      });
      setTimeout(() => {
        setIsParsing(false);
        if (onParsed) onParsed(data);
      }, 600);
    } catch (err) {
      console.error('PDF Parse error:', err);
      setIsParsing(false);
      if (onError) onError(err.message || 'Error parsing document.');
    }
  };

  const triggerSampleParse = () => {
    try {
      setIsParsing(true);
      setParseStatus('Loading Tokyo Odyssey sample itinerary...');

      const start = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
      const end = new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10);

      const tokyoSample = {
        success: true,
        destination: 'Tokyo & Kyoto',
        country: 'Japan',
        suggested_title: 'Tokyo Cherry Blossom & Mount Fuji Odyssey',
        start_date: start,
        end_date: end,
        budget: 165000,
        currency: 'INR',
        bookings: [
          {
            temp_id: 'sample-b1',
            type: 'flight',
            title: 'ANA NH830: Mumbai to Tokyo Haneda',
            start_datetime: `${start}T08:00:00.000Z`,
            end_datetime: `${start}T17:30:00.000Z`,
            origin_location: 'Mumbai (BOM)',
            destination_location: 'Tokyo Haneda (HND)',
            cost: 46000,
            vendor: 'All Nippon Airways',
            confirmation_number: 'ANA-NH830-491',
            day_number: 1,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b2',
            type: 'transfer',
            title: 'Haneda Airport Limousine Bus to Shinjuku',
            start_datetime: `${start}T19:00:00.000Z`,
            end_datetime: `${start}T20:15:00.000Z`,
            origin_location: 'Haneda Airport Terminal 3',
            destination_location: 'Shinjuku Expressway Bus Terminal',
            cost: 2400,
            vendor: 'Airport Transport Service',
            day_number: 1,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b3',
            type: 'hotel',
            title: 'Hotel Gracery Shinjuku (Godzilla Head Hotel)',
            start_datetime: `${start}T20:30:00.000Z`,
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 39600000).toISOString(),
            venue: 'Kabukicho, Shinjuku, Tokyo',
            cost: 22000,
            vendor: 'Hotel Gracery Shinjuku',
            day_number: 1,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b4',
            type: 'activity',
            title: 'Meiji Jingu Shrine & Harajuku Takeshita Street Tour',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 1 + 36000000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 1 + 54000000).toISOString(),
            venue: 'Meiji Jingu & Shibuya Ward',
            cost: 3500,
            vendor: 'Tokyo Urban Explorers',
            day_number: 2,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b5',
            type: 'activity',
            title: 'Shibuya Crossing & TeamLab Planets Digital Art Museum',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 2 + 36000000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 2 + 57600000).toISOString(),
            venue: 'teamLab Planets Toyosu & Shibuya Sky',
            cost: 4200,
            vendor: 'teamLab Japan Exhibitions',
            day_number: 3,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b6',
            type: 'train',
            title: 'Shinkansen Bullet Train Nozomi (Tokyo to Kyoto)',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 32400000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 40200000).toISOString(),
            origin_location: 'Tokyo Station (Tokaido Shinkansen)',
            destination_location: 'Kyoto Station',
            cost: 8500,
            vendor: 'JR Central (Japan Railways)',
            confirmation_number: 'JR-NZM-2190',
            day_number: 4,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b7',
            type: 'hotel',
            title: 'Hotel Granvia Kyoto (Kyoto Station Hotel)',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 43200000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 6 + 39600000).toISOString(),
            venue: 'JR Kyoto Station Building, Shimogyo Ward',
            cost: 26000,
            vendor: 'Hotel Granvia Kyoto',
            day_number: 4,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b8',
            type: 'activity',
            title: 'Fushimi Inari 10,000 Torii Gates & Arashiyama Bamboo Walk',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 4 + 32400000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 4 + 55800000).toISOString(),
            venue: 'Fushimi Inari Taisha',
            cost: 2800,
            vendor: 'Kyoto Cultural Heritage Expeditions',
            day_number: 5,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b9',
            type: 'activity',
            title: 'Gion Tea Ceremony & Traditional Kaiseki Banquet',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 5 + 61200000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 5 + 75600000).toISOString(),
            venue: 'Gion Chaya Tea House, Kyoto',
            cost: 16000,
            vendor: 'Kyoto Artisan Culinary Guild',
            day_number: 6,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b10',
            type: 'hotel',
            title: 'Mount Fuji Onsen & Ryokan Resort (Lake Kawaguchiko)',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 6 + 54000000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 8 + 36000000).toISOString(),
            venue: 'Lake Kawaguchiko Onsen Village',
            cost: 28000,
            vendor: 'Fuji Onsen Resorts',
            day_number: 7,
            status: 'confirmed',
            risk_level: 'low',
          },
          {
            temp_id: 'sample-b11',
            type: 'activity',
            title: 'Mount Fuji 5th Station & Lake Ashi Scenic Cruise',
            start_datetime: new Date(new Date(start).getTime() + 86400000 * 7 + 32400000).toISOString(),
            end_datetime: new Date(new Date(start).getTime() + 86400000 * 7 + 57600000).toISOString(),
            venue: 'Hakone Lake Ashi',
            cost: 6500,
            vendor: 'Hakone Sightseeing Cruise',
            day_number: 8,
            status: 'confirmed',
            risk_level: 'low',
          }
        ],
        dependencies: [
          { upstream_temp_id: 'sample-b1', downstream_temp_id: 'sample-b2', buffer_minutes: 90, dependency_type: 'sequential' },
          { upstream_temp_id: 'sample-b2', downstream_temp_id: 'sample-b3', buffer_minutes: 45, dependency_type: 'sequential' },
          { upstream_temp_id: 'sample-b3', downstream_temp_id: 'sample-b4', buffer_minutes: 120, dependency_type: 'buffer' },
          { upstream_temp_id: 'sample-b4', downstream_temp_id: 'sample-b5', buffer_minutes: 180, dependency_type: 'sequential' },
          { upstream_temp_id: 'sample-b3', downstream_temp_id: 'sample-b6', buffer_minutes: 90, dependency_type: 'sequential' },
          { upstream_temp_id: 'sample-b6', downstream_temp_id: 'sample-b7', buffer_minutes: 60, dependency_type: 'sequential' },
          { upstream_temp_id: 'sample-b7', downstream_temp_id: 'sample-b8', buffer_minutes: 90, dependency_type: 'buffer' },
          { upstream_temp_id: 'sample-b7', downstream_temp_id: 'sample-b10', buffer_minutes: 120, dependency_type: 'sequential' }
        ]
      };

      setParsedSummary({
        fileName: 'Tokyo_Odyssey_Itinerary.pdf',
        count: tokyoSample.bookings.length,
        title: tokyoSample.suggested_title,
        destination: tokyoSample.destination,
      });

      setTimeout(() => {
        setIsParsing(false);
        if (onParsed) onParsed(tokyoSample);
      }, 400);
    } catch (err) {
      setIsParsing(false);
      if (onError) onError(err.message);
    }
  };

  return (
    <div className={styles.container}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        className={styles.fileInput}
      />

      {parsedSummary ? (
        <div className={styles.parsedCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', flexShrink: 0 }}>
              <CheckCircle2 size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#171717' }}>
                  {parsedSummary.fileName}
                </span>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: 9999 }}>
                  ✓ Extracted &amp; Ready
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#059669', fontWeight: 500 }}>
                {parsedSummary.count} bookings extracted for {parsedSummary.title}
              </p>
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.8125rem', color: '#92400E' }}>
              <Sparkles size={14} color="#D97706" />
              <span>Canvas Pass Check Required</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#78350F', lineHeight: 1.45 }}>
              Review the flight, hotel, and activity nodes on the interactive canvas on the right. When the schedule looks verified, click <strong>&quot;✓ Give Pass Check &amp; Confirm Itinerary&quot;</strong> below the canvas to finalize.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary btn-sm"
            >
              Upload Different PDF
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isParsing && fileInputRef.current?.click()}
        >
          {isParsing ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p className={styles.statusText}>{parseStatus}</p>
            </div>
          ) : (
            <>
              <div className={styles.iconWrapper}>
                <FileUp size={28} />
              </div>
              <h4 className={styles.title}>Upload Itinerary or Booking PDF</h4>
              <p className={styles.subtitle}>
                Drag &amp; drop your airline e-tickets, hotel confirmations, or multi-day brochure PDF.
                AI will automatically extract flights, hotels, schedule times, and transfer dependencies.
              </p>
            </>
          )}
        </div>
      )}

      <div className={styles.sampleBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="var(--color-primary)" />
          <span>Don&apos;t have a travel PDF handy right now?</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerSampleParse();
          }}
          disabled={isParsing}
          className={styles.sampleButton}
        >
          Use Sample Itinerary (Tokyo Odyssey)
        </button>
      </div>
    </div>
  );
}
