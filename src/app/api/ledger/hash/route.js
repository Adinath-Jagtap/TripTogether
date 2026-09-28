import { NextResponse } from 'next/server';
import { generateEntryHash, verifyChain } from '@/lib/algorithms/hashChain';

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, entry, previousHash, entries } = body;

    if (action === 'verify') {
      const result = await verifyChain(entries || []);
      return NextResponse.json({ success: true, ...result });
    }

    // Default: generate hash for a new entry
    if (!entry) {
      return NextResponse.json({ error: 'Entry object is required' }, { status: 400 });
    }

    const hash = await generateEntryHash(entry, previousHash || 'GENESIS');
    return NextResponse.json({ success: true, hash });
  } catch (error) {
    console.error('Ledger hash error:', error);
    return NextResponse.json(
      { error: 'Failed to process ledger hash', details: error.message },
      { status: 500 }
    );
  }
}
