import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const { flight_number, date, tripId, bookingId, last_checked_at } = await request.json();

    if (!flight_number) {
      return NextResponse.json({ error: 'flight_number is required' }, { status: 400 });
    }

    // Rate-limit: only call real API if 3+ hours have passed
    if (last_checked_at) {
      const lastMs = typeof last_checked_at === 'number'
        ? last_checked_at
        : new Date(last_checked_at).getTime();
      if (Date.now() - lastMs < THREE_HOURS_MS) {
        return NextResponse.json({ cached: true, message: 'Using cached status' });
      }
    }

    const flightDate = date || new Date().toISOString().split('T')[0];
    const cleanNumber = flight_number.replace(/[\s-]/g, '').toUpperCase();

    let result = null;

    // Primary: AeroDataBox (RapidAPI)
    try {
      const res = await fetch(
        `https://aerodatabox.p.rapidapi.com/flights/number/${cleanNumber}/${flightDate}`,
        {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        const flight = Array.isArray(data) ? data[0] : data;
        if (flight) {
          const depDelay = flight.departure?.delay || 0;
          const arrDelay = flight.arrival?.delay || 0;
          const delayMin = Math.max(depDelay, arrDelay);
          const status = flight.status === 'Cancelled' ? 'cancelled'
            : delayMin >= 15 ? 'delayed'
            : 'on_time';

          result = {
            status,
            delay_minutes: delayMin,
            scheduled_departure: flight.departure?.scheduledTime?.local || null,
            actual_departure: flight.departure?.actualTime?.local || null,
            airline: flight.airline?.name || null,
            origin: flight.departure?.airport?.icao || null,
            destination: flight.arrival?.airport?.icao || null,
            source: 'aerodatabox',
          };
        }
      }
    } catch (_) {}

    // Fallback: AviationStack
    if (!result) {
      try {
        const res = await fetch(
          `http://api.aviationstack.com/v1/flights?flight_iata=${cleanNumber}&access_key=${process.env.AVIATIONSTACK_API_KEY}`
        );
        if (res.ok) {
          const data = await res.json();
          const flight = data.data?.[0];
          if (flight) {
            const depDelay = flight.departure?.delay || 0;
            const status = flight.flight_status === 'cancelled' ? 'cancelled'
              : depDelay >= 15 ? 'delayed'
              : 'on_time';

            result = {
              status,
              delay_minutes: depDelay,
              scheduled_departure: flight.departure?.scheduled || null,
              actual_departure: flight.departure?.actual || null,
              airline: flight.airline?.name || null,
              origin: flight.departure?.iata || null,
              destination: flight.arrival?.iata || null,
              source: 'aviationstack',
            };
          }
        }
      } catch (_) {}
    }

    if (!result) {
      // Flight not found or not yet departed — return simulated on_time
      result = {
        status: 'on_time',
        delay_minutes: 0,
        scheduled_departure: null,
        actual_departure: null,
        airline: null,
        origin: null,
        destination: null,
        source: 'simulated',
        note: 'No live data. Flight may not have departed yet.',
      };
    }


    // Update booking in Firestore cache
    if (tripId && bookingId) {
      try {
        await updateDoc(doc(db, 'trips', tripId, 'bookings', bookingId), {
          live_status: result.status,
          delay_minutes: result.delay_minutes,
          last_checked_at: Date.now(),
        });
      } catch (_) {}
    }

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    console.error('flight-status error:', err);
    return NextResponse.json({ error: 'Failed to fetch flight status' }, { status: 500 });
  }
}
