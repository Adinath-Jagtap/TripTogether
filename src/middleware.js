import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const isDemo = request.cookies.get('demo_user')?.value === 'true';

  // Protected routes
  const protectedPaths = ['/dashboard', '/trip', '/profile'];
  const isProtected = protectedPaths.some(p => pathname.startsWith(p));
  const isAuthPage = pathname.startsWith('/auth');

  // Demo users: redirect away from auth pages
  if (isDemo && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Demo users can access protected routes freely
  if (isDemo && isProtected) {
    return NextResponse.next();
  }

  // Non-demo: redirect unauthenticated users away from protected pages.
  // Firebase sets a session cookie named '__session' when persistence is enabled.
  // We check for that cookie as a lightweight server-side gate.
  // The full auth validation still happens client-side via onAuthStateChanged.
  const firebaseSession = request.cookies.get('__session')?.value;

  if (isProtected && !firebaseSession && !isDemo) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|manifest.json|firebase-messaging-sw.js|icon-192.png|icon-512.png).*)'
  ],
};
