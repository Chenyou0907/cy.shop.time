# 修復手機瀏覽器重開需要重新登入的問題

## 問題描述
手機瀏覽器關閉後重新打開，需要重新登入，非常不方便。

## 解決方案

### 1. 修改 Supabase Client 設定 (`src/lib/supabase/client.ts`)
- 啟用 Session 持久化監聽
- 確保 Session 自動保存到 localStorage

### 2. 修改登入 API (`src/app/api/auth/login/route.ts`)
- 設定 Cookie 過期時間為 30 天
- 使用 `httpOnly` 和 `secure` Cookie 提高安全性
- 同時設定 `access_token` 和 `refresh_token`

### 3. 新增 Middleware (`src/middleware.ts`)
- 自動刷新 Session
- 確保每次請求都檢查並更新 Session

## Cookie 設定說明

### maxAge: 30 天
- 30 天內不需要重新登入
- 即使關閉瀏覽器也能保持登入狀態

### httpOnly: true
- Cookie 無法被 JavaScript 讀取
- 防止 XSS 攻擊

### secure: true (生產環境)
- 只在 HTTPS 連線時傳送 Cookie
- 提高安全性

### sameSite: 'lax'
- 防止 CSRF 攻擊
- 允許正常的導航請求

## 測試步驟

1. 在手機瀏覽器登入
2. 關閉瀏覽器（完全關閉，不是切換到背景）
3. 重新打開瀏覽器並訪問網站
4. 應該會自動保持登入狀態，不需要重新輸入帳號密碼

## 注意事項

- 如果 30 天內沒有訪問網站，Session 會過期，需要重新登入
- 如果手動登出，Session 會立即清除
- 清除瀏覽器資料會刪除 Session，需要重新登入

## 部署

修改完成後，執行以下命令部署到 Vercel：

```bash
git add .
git commit -m "修復手機瀏覽器 Session 持久化問題，延長登入時間至 30 天"
git push
```

或使用批次檔：

```bash
.\deploy.bat
```

