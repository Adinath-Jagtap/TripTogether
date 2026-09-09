import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Delete in reverse foreign-key order
    await supabase.from('ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('settlements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('expense_shares').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('disruptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('booking_dependencies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('trip_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('trips').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({ success: true, message: 'All trips and related data deleted from DB' });
  } catch (err) {
    console.error('Reset trips DB error:', err);
    return NextResponse.json({ error: 'Failed to reset trips DB', details: err.message }, { status: 500 });
  }
}
