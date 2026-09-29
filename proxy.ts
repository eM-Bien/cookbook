import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { serverOptions } from "@/lib/supabase/server-options";

// Refreshes the login session on every request and sends visitors who are not
// signed in to /login. Access to data is enforced separately by the database.
export async function proxy(request: NextRequest) {
  const onLoginPage = request.nextUrl.pathname === "/login";

  const env = getSupabaseEnv();
  if (!env) {
    // Not configured yet: the login page shows the setup instructions.
    if (onLoginPage) return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    ...serverOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (signedIn === onLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = signedIn ? "/kalendarz" : "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Keep a refreshed session even though the response is a redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
