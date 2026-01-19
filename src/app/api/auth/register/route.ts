import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createSupabaseRouteHandlerClient();
  const body = await request.json().catch(() => ({} as Record<string, string>));
  const { email, password } = body as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "請填寫 email 與密碼" }, { status: 400 });
  }

  const redirectUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
    : undefined;

  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: redirectUrl ? { emailRedirectTo: redirectUrl } : undefined
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "註冊失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
