import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Protect everything except /login, /api/auth, assets, and internals
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicRoute = pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/api/webhook");
  const token = req.cookies.get("admin_token")?.value;

  // Verificação de token forte
  let isAuthenticated = false;
  
  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret");
      await jwtVerify(token, secret);
      isAuthenticated = true;
    } catch (err) {
      // Invalid or expired token
      isAuthenticated = false;
    }
  }

  if (!isAuthenticated && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}
