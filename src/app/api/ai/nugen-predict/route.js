import { NextResponse } from 'next/server';
import { runNugenInference, runBaseModelInference } from '@/lib/ai/nugen';

export async function POST(req) {
  try {
    const body = await req.json();
    const { scenario = {}, bookings = [], compare = true } = body;

    const alignedResult = await runNugenInference(scenario, bookings);
    const baseResult = compare ? await runBaseModelInference(scenario, bookings) : null;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      nugen_pipeline: 'Base Model → Nugen Alignment → Domain Model → Project Integration',
      aligned: alignedResult,
      base: baseResult,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || 'Nugen evaluation failed' },
      { status: 500 }
    );
  }
}
