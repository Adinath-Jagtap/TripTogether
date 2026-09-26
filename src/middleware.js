import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const isDemo = request.cookies.get('demo_user')?.value === 'true';

  const protectedPaths = ['/dashboard', '/trip', '/profile'];
  const isProtected = protectedPaths.some(p => pathname.startsWith(p));
  const isAuth = pathname.startsWith('/auth');

  // Firebase Auth is fully client-side; the middleware only gates on the demo cookie.
  // Real Firebase session validation happens client-side via onAuthStateChanged.
  // For server-side protection we rely on the demo cookie; authenticated users
  // are redirected by the AuthContext on the client if not logged in.

  if (isProtected && !isDemo) {
    // Allow the request through — client-side auth guard will redirect if needed.
    // This avoids breaking Firebase Auth which doesn't use server-side cookies by default.
    return NextResponse.next();
  }

  if (isDemo && isAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
