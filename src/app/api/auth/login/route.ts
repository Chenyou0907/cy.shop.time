import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createSupabaseRouteHandlerClient();
  const body = await request.json().catch(() => ({} as Record<string, string>));
  const { email, password } = body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "請填寫 email 與密碼" }, { status: 400 });
  }

  try {
    // 登入並設定 Session 持續時間為 30 天
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (error) throw error;
    
    // 設定 Cookie 的過期時間為 30 天
    const response = NextResponse.json({ ok: true });
    
    if (data.session) {
      // 設定更長的 Cookie 過期時間（30 天）
      const maxAge = 60 * 60 * 24 * 30; // 30 天（秒）
      
      response.cookies.set('sb-access-token', data.session.access_token, {
        path: '/',
        maxAge,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      response.cookies.set('sb-refresh-token', data.session.refresh_token, {
        path: '/',
        maxAge,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "登入失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
