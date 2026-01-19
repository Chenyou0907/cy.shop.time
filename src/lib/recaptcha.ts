const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export async function verifyRecaptchaToken(token: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    throw new Error("尚未設定 RECAPTCHA_SECRET_KEY");
  }

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);

  const response = await fetch(RECAPTCHA_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!response.ok) {
    throw new Error("reCAPTCHA 驗證失敗，請稍後再試");
  }

  const data = (await response.json()) as { success: boolean; "error-codes"?: string[] };
  if (!data.success) {
    const code = data["error-codes"]?.[0] ?? "unknown";
    throw new Error(`reCAPTCHA 驗證未通過 (${code})`);
  }
}
