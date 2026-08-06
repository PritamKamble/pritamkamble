import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ADMIN_HOST = "admin.pritamkamble.com";
const PROTECTED_ROLES = ["candidate", "hr", "admin"] as const;
type Role = (typeof PROTECTED_ROLES)[number];

function roleForPath(pathname: string): Role | null {
  for (const role of PROTECTED_ROLES) {
    if (pathname === `/${role}` || pathname.startsWith(`/${role}/`)) {
      return role;
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  let pathname = url.pathname;

  // Host-based routing: admin.pritamkamble.com/ -> /admin. This only rewrites
  // the path we evaluate below - it does NOT skip the role gate.
  const isAdminHostRoot =
    request.headers.get("host") === ADMIN_HOST && pathname === "/";
  if (isAdminHostRoot) {
    pathname = "/admin";
  }

  const requiredRole = roleForPath(pathname);
  const isLoginPage = pathname === "/login";

  if (!requiredRole && !isLoginPage) {
    return isAdminHostRoot
      ? NextResponse.rewrite(new URL("/admin", request.url))
      : NextResponse.next();
  }

  const { response, user, supabase } = await updateSession(request);

  function finish(redirectTo?: string) {
    if (!redirectTo) {
      if (!isAdminHostRoot) return response;
      const rewritten = NextResponse.rewrite(new URL("/admin", request.url));
      response.cookies.getAll().forEach((cookie) => {
        rewritten.cookies.set(cookie);
      });
      return rewritten;
    }
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  if (!user) {
    if (isLoginPage) return finish();
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Signup race: auth user exists but the on_auth_user_created trigger
    // hasn't committed the profiles row yet.
    return finish("/login?pending=1");
  }

  const actualRole = profile.role as Role;

  if (isLoginPage) {
    return finish(`/${actualRole}`);
  }

  if (requiredRole && actualRole !== requiredRole) {
    return finish(`/${actualRole}`);
  }

  return finish();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:html|svg|png|jpg|jpeg|gif|webp|css|js|txt|xml)$).*)",
  ],
};
