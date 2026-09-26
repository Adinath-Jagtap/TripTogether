import { NextResponse } from 'next/server';

// Firebase handles OAuth redirects differently from Supabase.
// Google sign-in uses signInWithPopup (client-side) — no server-side code exchange needed.
// This route simply redirects to dashboard for any leftover legacy callback URLs.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next') ?? '/dashboard';
  return NextResponse.redirect(new URL(next, request.url));
}
