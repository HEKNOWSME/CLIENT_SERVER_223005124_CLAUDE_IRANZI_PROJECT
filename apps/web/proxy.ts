import { NextResponse, type NextRequest } from 'next/server';

const REFRESH_COOKIES = ['pmrms_refresh', '__Host-pmrms_refresh'];

/**
 * Optimistic redirect only: without a refresh cookie there is no session to restore, so send the
 * visitor straight to sign-in instead of flashing the app shell. Real authorisation is the API's job.
 */
export function proxy(request: NextRequest) {
  if (REFRESH_COOKIES.some(name => request.cookies.has(name))) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = new URLSearchParams({ next: request.nextUrl.pathname }).toString();
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/patient', '/patient/:path*', '/doctor', '/doctor/((?!apply$).*)'],
};
