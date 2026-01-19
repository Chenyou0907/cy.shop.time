# 工時與薪資計算 (Next.js + Supabase)

功能：
- Email/密碼登入、註冊（需 Email 綁定）、忘記密碼重設連結
- 工時輸入：日期、上/下班、休息分鐘、假別（颱風假/國定假日雙倍時薪）
- 依勞基法預設加班倍數（可自訂，儲存到帳號 metadata）
- 工資計算、列表合計
- XLSX 匯入/匯出（欄位：日期、上班時間、下班時間、休息時間、工作時數、時薪、工資、備註）
- 中文介面，Vercel 部署就緒

## 環境變數 (.env.local)
複製 `.env.example`：
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Supabase 設定
1) 建專案，取得 `SUPABASE_URL` 與 `anon key`。
2) Auth 設定：
   - 啟用 Email 登入。
   - "Site URL" 設為 `NEXT_PUBLIC_APP_URL`。
   - "Redirect URLs" 加上 `${NEXT_PUBLIC_APP_URL}/auth/callback` 與 `${NEXT_PUBLIC_APP_URL}/reset-password`。
3) 密碼重設：`NEXT_PUBLIC_APP_URL/reset-password` 會交換 code 並允許更新密碼。
4) 帳號設定：加班倍率會存入 `user_metadata.overtimeSettings`。

## reCAPTCHA
目前已移除登入的 reCAPTCHA 驗證，若未來需要防刷，可再加回 v2 核取方塊並新增 `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY`。

## 開發
```
npm install
npm run dev
```
開啟 http://localhost:3000。

## 部署到 Vercel
- 以此專案為來源建立 Vercel 專案。
- 在 Vercel 專案的 Environment Variables 填入與本地相同的變數。
- Build 命令：`npm run build`，Output：`.next`（預設）。

## 工時與加班計算
- 預設規則：
  - 8 小時內為基本時薪。
  - 超過 8 小時：前 2 小時 1.33 倍、再 2 小時 1.67 倍、再超過 12 小時 2.67 倍。
  - 假別為「颱風假」或「國定假日」時，全段雙倍時薪。
- 規則與基礎時薪可在儀表板調整並儲存到帳號設定。

## XLSX 匯入/匯出格式
首列標題需為：
`日期, 上班時間, 下班時間, 休息時間, 工作時數, 時薪, 工資, 備註`

匯入時：若有「颱風」或「國定」關鍵字於備註，會自動套用雙倍時薪假別。

## 已知限制
- 現行工時計算假設未跨午夜；如需跨日班次需再調整計算邏輯。
- Supabase 資料表尚未建立，當前資料僅在前端保存；若要永久保存工時紀錄，請於 Supabase 建立 timesheet 資料表並接線。
- 依賴 reCAPTCHA v2；若要改 v3，需更新前後端驗證流程。

## 指令
- 開發：`npm run dev`
- 測試建置：`npm run build`
- Lint：`npm run lint`
