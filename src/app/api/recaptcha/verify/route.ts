import { NextResponse } from "next/server";
import { verifyRecaptchaToken } from "@/lib/recaptcha";

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({ token: "" }));
  if (!token) {
    return NextResponse.json({ error: "缺少驗證碼" }, { status: 400 });
  }

  try {
    await verifyRecaptchaToken(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
