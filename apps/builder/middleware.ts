import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;

  const isProtectedRoute =
    pathname.startsWith("/workflows") ||
    pathname.startsWith("/deployments");
  const isAuthRoute =
    pathname === "/sign-in" || pathname === "/sign-up";

  if (!url || !key) {
    if (isAuthRoute) {
      return NextResponse.redirect(new URL("/workflows", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/workflows", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/workflows/:path*",
    "/deployments",
    "/deployments/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
