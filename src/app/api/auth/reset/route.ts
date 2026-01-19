import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createSupabaseRouteHandlerClient();
  const body = await request.json().catch(() => ({} as Record<string, string>));
  const { email } = body as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "請填寫 email" }, { status: 400 });
  }

  const redirectUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`
    : undefined;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "寄送失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
