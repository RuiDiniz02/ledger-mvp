# Ledger — personal finance MVP

Next.js 15 (App Router) + React 19 + Tailwind CSS v4 + TypeScript. No backend yet: the whole ledger lives in `localStorage`, so it deploys to Vercel as a static-ish client app with zero environment variables.

## Run locally

    npm install
    npm run dev

Open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a new GitHub repository (it must be the repo root, or set it as the Vercel *Root Directory*).
2. On vercel.com: **Add New → Project → Import** the repo.
3. Framework preset is detected as **Next.js**. Build command `next build`, output handled automatically. No env vars needed.
4. Deploy.

Or from this folder with the CLI:

    npx vercel
    npx vercel --prod

## Deploy to Netlify

Same idea, no local tooling needed:

1. Put the folder in a Git repo (github.com lets you upload files straight from the browser).
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. `netlify.toml` in this folder already sets the build command and the Next.js plugin. Deploy.

Netlify *Drop* (dragging a folder onto the dashboard) will not work here — it expects an already-built site, and building needs Node. If you specifically want a drag-and-droppable folder, add `output: 'export'` to `next.config.mjs`, run `npm run build` once, and drop the generated `out/` folder. This app is fully client-side, so a static export behaves identically.

## Product decisions baked in

- **Calendar month, no rollover.** Budgets reset on the 1st.
- **Warnings at 80% then 100%** (`WARN_AT` in `components/App.tsx`). Fixed categories read as *funded* rather than overspent.
- **Per-expense splits.** Every transaction stores `scope`, `pct` (your share) and `paidBy`, so adding a second member later is a join, not a migration. `unsettled()` in `lib/data.ts` already computes the settle-up balance.
- **Money is integer minor units (cents)** everywhere. Never floats.
- **Append-only intent.** Each row carries `source: 'manual' | 'bank' | 'recurring'` so a bank import cannot overwrite hand-entered history.

## Files

    app/layout.tsx        fonts, metadata, viewport
    app/page.tsx          renders <App />
    app/globals.css       Tailwind v4 theme tokens + keyframes
    components/App.tsx    all screens, sheets, tab bar
    components/Icons.tsx  clay category tiles + tab icons
    lib/types.ts          Category, Tx, Ledger
    lib/data.ts           seed data, month maths, warning model, split maths
    lib/store.ts          useLedger() — localStorage persistence
    lib/format.ts         currency + date formatting

## Next steps toward Phase 2/3

1. **Postgres + Drizzle.** Tables: `users`, `households`, `household_members`, `categories`, `budgets` (per month), `transactions`, `transaction_splits`. Row-level security keyed on `household_id`.
2. **Auth.** Supabase Auth or Clerk, where an organisation maps 1:1 to a household.
3. **Swap the store.** Replace `useLedger()` with TanStack Query hooks against `/api/*` route handlers. Nothing in the component tree changes.
4. **Bank sync.** GoCardless Bank Account Data (EU/PSD2) in a background worker; write imported rows with `source: 'bank'` and a `pending` categorisation state.

## Swapping the icons

Category tiles are geometric placeholders drawn in `components/Icons.tsx`. Drop a real 3D icon set in `public/icons/` and replace the `<Mark />` inside `<Tile />` with an `<Image />` — the gradient tile and shadow stay.
