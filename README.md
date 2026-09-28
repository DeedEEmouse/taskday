# 日日進度

依照手寫設計實作的每日與重複任務網站。前端使用 React、Vite；正式資料使用 Supabase Auth 與 Postgres，部署目標是 Vercel。未設定 Supabase 時可直接試用瀏覽器本機示範模式。

## 規則

- 每日任務至少一項，總共 100 分；可平均分配、自訂分數，或設定權重按比例分配。
- 當天所有每日任務完成，再得 20 分。回看已完成的日期也會顯示該獎勵。
- 非每日任務每個排定日完成得 10 分：隔 n 天（每 n+1 天一次）、每週多選日期、每月指定日期、每年指定日期。
- 每月 29–31 日若該月沒有指定日期，這次略過。任務從建立日開始出現；封存後不再出現，完成紀錄保留。
- 日期依使用者瀏覽器時區顯示。
- Beta：開發者帳號可使用雙欄一日行程表，左欄記預計、右欄記實際；可拖選連續小時建立一塊內容、點方塊編輯、長按拖動方塊改時間。待辦分成待完成和已完成；行程連結待辦後，共用完成狀態。一般帳號不顯示此頁；資料庫也拒絕一般帳號直接讀寫行程。

## 本機啟動

需要 Node.js 20 以上。

```bash
npm install
npm run dev
```

打開終端機顯示的本機網址即可試用。沒有環境變數時使用示範模式；示範資料只存於這個瀏覽器，不會與其他裝置同步。

## 連結 Supabase

1. 建立 Supabase 專案，在 **SQL Editor** 執行 [`supabase/schema.sql`](supabase/schema.sql)。
   如果既有網站已執行過 `schema.sql`，依序執行 [`supabase/beta_upgrade.sql`](supabase/beta_upgrade.sql)、[`supabase/beta_timeline_upgrade.sql`](supabase/beta_timeline_upgrade.sql)；新專案則依序執行三份。若你已套用第一版 Beta，只需執行 `beta_timeline_upgrade.sql`。**資料庫升級完成後才部署此版前端。**
2. 在 **Authentication → Providers** 啟用 Email 登入。若啟用「Confirm email」，註冊者須先收信驗證。
3. 複製 `.env.example` 為 `.env.local`，填入專案 URL 和 **publishable key**：

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

4. 在 **Authentication → URL Configuration** 把本機網址設為開發用 redirect URL，正式部署後將 Vercel 網址設為 Site URL 並加入 redirect URLs。
5. 重開開發伺服器。登入與註冊頁面會自動出現。不要將 secret key 或 service role key 放進 `VITE_` 變數。

### 開啟自己的開發者功能

在 Supabase **Authentication → Users** 找到你的帳號，複製 **User UID**。用 SQL Editor 執行（替換 UUID）：

```sql
insert into public.user_roles(user_id, role)
values ('YOUR_USER_UID'::uuid, 'developer')
on conflict (user_id) do update set role = excluded.role;
```

重新整理網站後，桌面左側與手機底部就會出現「一日行程表」。此 SQL 只能由有資料庫管理權限的人執行；網頁上的使用者無法自行升級角色。要取消權限，可在 SQL Editor 將 `role` 更新成 `user`。

### 行程表操作

- 08:00–隔天 02:00：左邊為預計、右邊為實際；連續拖選兩三格會建立一個跨小時時段。點方塊編輯，長按約 0.3 秒後拖到空白時段可改時間。
- 從下方待完成清單點「安排」，可快速把待辦放進預計欄；也可在時段編輯視窗選擇「連結今日待辦」。同一天的待辦完成紀錄決定連結方塊的完成狀態，從兩處操作均會同步。實際欄保持手動紀錄，不會因預計完成而自動填入。
- 舊版 Beta 時段會轉為預計欄。早於 08:00 的舊時段會以文字列出，請重新安排到可見表格。以整點為單位；舊版非整點時段升級時會向下／向上取到整點。

## 部署至 Vercel

將此目錄推到你的 Git 儲存庫，於 Vercel 匯入專案，Framework Preset 選 **Vite**。Build Command `npm run build`、Output Directory `dist`。到 Vercel 專案的 Environment Variables 填入上面兩個 `VITE_` 變數後重新部署。最後將實際部署網域加入 Supabase Authentication 的 URL Configuration。

建議先以 Git 的 Beta 分支建立 Vercel Preview Deployment。新版必須先執行兩份 Beta 資料庫升級檔（已套用第一份者只需第二份），再將程式碼部署到 Vercel；原本的一般使用者功能維持可用。

### 不透過 GitHub 外掛部署預覽版

已登入 Vercel CLI 且擁有現有 `taskday` 專案權限時，可在此目錄執行：

```bash
npx vercel link
npx vercel deploy
```

`vercel link` 請選現有專案，`vercel deploy` 會產生 Preview URL，不會取代正式網站。確認現有 Vercel 專案已設定 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY` 的 Preview 環境變數，並把 Preview URL 加入 Supabase Auth redirect URLs。先執行兩份 Beta SQL，再試用行程功能。

目前的登入實作採用 Supabase Auth 電子郵件／密碼。如果之後決定使用 Clerk 等獨立登入服務，需要把其使用者身分與 Supabase RLS 串接，不能只替換登入畫面。

## 備註

- 分數是個人進度紀錄；前端不提供跨使用者排名或可信的競賽結算。
- 更改每日分配後，當天已完成任務的分數會更新；過去日期的得分保留完成當時的分數。修改或封存任務可能改變舊日期的「全數完成」獎勵判斷；正式上線若需要不可變的歷史帳本，需新增每日快照與交易式寫入。
- 登入資料目前一次載入最近 2,000 筆完成紀錄；資料量更大時應增加分頁或依日期查詢。
- 行程表依照提供的截圖設計成左右雙欄時間軸；尚未匯入 Notion 資料。
