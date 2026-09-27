# 日日進度

依照手寫設計實作的每日與重複任務網站。前端使用 React、Vite；正式資料使用 Supabase Auth 與 Postgres，部署目標是 Vercel。未設定 Supabase 時可直接試用瀏覽器本機示範模式。

## 規則

- 每日任務至少一項，總共 100 分；可平均分配、自訂分數，或設定權重按比例分配。
- 當天所有每日任務完成，再得 20 分。回看已完成的日期也會顯示該獎勵。
- 非每日任務每個排定日完成得 10 分：隔 n 天（每 n+1 天一次）、每週多選日期、每月指定日期、每年指定日期。
- 每月 29–31 日若該月沒有指定日期，這次略過。任務從建立日開始出現；封存後不再出現，完成紀錄保留。
- 日期依使用者瀏覽器時區顯示。

## 本機啟動

需要 Node.js 20 以上。

```bash
npm install
npm run dev
```

打開終端機顯示的本機網址即可試用。沒有環境變數時使用示範模式；示範資料只存於這個瀏覽器，不會與其他裝置同步。

## 連結 Supabase

1. 建立 Supabase 專案，在 **SQL Editor** 執行 [`supabase/schema.sql`](supabase/schema.sql)。
2. 在 **Authentication → Providers** 啟用 Email 登入。若啟用「Confirm email」，註冊者須先收信驗證。
3. 複製 `.env.example` 為 `.env.local`，填入專案 URL 和 **publishable key**：

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

4. 在 **Authentication → URL Configuration** 把本機網址設為開發用 redirect URL，正式部署後將 Vercel 網址設為 Site URL 並加入 redirect URLs。
5. 重開開發伺服器。登入與註冊頁面會自動出現。不要將 secret key 或 service role key 放進 `VITE_` 變數。

## 部署至 Vercel

將此目錄推到你的 Git 儲存庫，於 Vercel 匯入專案，Framework Preset 選 **Vite**。Build Command `npm run build`、Output Directory `dist`。到 Vercel 專案的 Environment Variables 填入上面兩個 `VITE_` 變數後重新部署。最後將實際部署網域加入 Supabase Authentication 的 URL Configuration。

目前的登入實作採用 Supabase Auth 電子郵件／密碼。如果之後決定使用 Clerk 等獨立登入服務，需要把其使用者身分與 Supabase RLS 串接，不能只替換登入畫面。

## 備註

- 分數是個人進度紀錄；前端不提供跨使用者排名或可信的競賽結算。
- 更改每日分配後，當天已完成任務的分數會更新；過去日期的得分保留完成當時的分數。修改或封存任務可能改變舊日期的「全數完成」獎勵判斷；正式上線若需要不可變的歷史帳本，需新增每日快照與交易式寫入。
- 登入資料目前一次載入最近 2,000 筆完成紀錄；資料量更大時應增加分頁或依日期查詢。
