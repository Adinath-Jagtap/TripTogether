import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { doc, updateDoc } from 'firebase/firestore';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const { train_number, date, tripId, bookingId, last_checked_at } = await request.json();

    if (!train_number) {
      return NextResponse.json({ error: 'train_number is required' }, { status: 400 });
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

    let result = null;

    // IRCTC API (RapidAPI)
    try {
      const res = await fetch(
        `https://irctc1.p.rapidapi.com/api/v1/liveTrainStatus?trainNo=${train_number}&startDay=0`,
        {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'irctc1.p.rapidapi.com',
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.status && data.data) {
          const d = data.data;
          const delayMin = d.delay || 0;
          const status = d.isCancelled ? 'cancelled'
            : delayMin >= 15 ? 'delayed'
            : 'on_time';

          result = {
            status,
            delay_minutes: delayMin,
            train_name: d.trainName || null,
            current_station: d.currentStation || null,
            source: 'irctc',
          };
        }
      }
    } catch (_) {}

    if (!result) {
      // Train not running yet (future date) or no live data — return simulated on_time
      result = {
        status: 'on_time',
        delay_minutes: 0,
        train_name: null,
        current_station: null,
        source: 'simulated',
        note: 'No live data available. Train may not have departed yet.',
      };
    }


    // Update Firestore booking cache
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
    console.error('train-status error:', err);
    return NextResponse.json({ error: 'Failed to fetch train status' }, { status: 500 });
  }
}
