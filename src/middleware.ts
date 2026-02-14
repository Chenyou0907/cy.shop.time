import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // 刷新 Session（如果存在）
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // 如果有 Session，確保它被正確設定到 Cookie
  if (session) {
    // Session 會自動被 Supabase 設定到 Cookie
    // 這裡只需要確保 middleware 正確處理了 Session
  }

  return res
}

// 指定哪些路徑需要經過 middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

