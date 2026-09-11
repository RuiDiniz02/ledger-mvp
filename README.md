# Ledger — personal finance MVP

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + TypeScript. No backend yet: the whole ledger lives in `localStorage`, so it deploys to Vercel as a static-ish client app with zero environment variables.

It is an installable PWA. Added to a phone's home screen it runs full-screen, starts with no network, and keeps every expense on that device — which is the point while the idea is still being tested with real people.

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

**Serve it over HTTPS.** Service workers and `navigator.storage.persist()` only run in a secure context, so on plain HTTP the app will not install and will not work offline. Vercel and Netlify both give you HTTPS by default.

## Testing the installed app locally

`npm run dev` skips the service worker on purpose, so HMR is not cached. To exercise install and offline behaviour:

    npm run build
    npx next start

Then open it, let the worker register, and use your browser's offline mode or stop the server and reload.

## Product decisions baked in

- **Three kinds of category**, because a monthly budget has three kinds of money in it. `used()` in `lib/data.ts` is the whole rule:
  - `variable` costs what you logged, and warns at 80% then 100% (`WARN_AT` in `components/App.tsx`).
  - `fixed` is a commitment. It costs `max(target, spent)`, so it leaves the budget on the 1st whether or not you log it, logging it does not charge it twice, and paying more than planned counts the larger sum. This is why there is no separate recurring-expenses feature: a fixed category already *is* the recurring expense, and building both would be two machines for one job.
  - `saving` is a pot, and the only kind whose money is treated as gone before it is spent, because putting 200 into a pot really does remove it from what you can spend this month. The target is that monthly contribution and it accumulates. Taking money out is an expense logged against the pot, which lowers the balance and costs the month nothing, since it was charged to the months that saved it. `potBalance()` answers "how much is in the emergency fund", which no monthly figure can.

  The rule in one line: **allocating is not spending.** A target says money is there to spend, not that it has gone. Only a pot contribution leaves.

  A pot can carry an optional `goal`. Once its balance reaches it the pot stops taking its contribution, and `monthFreed()` reports the money that frees up. Taking money out starts it filling again on its own. Because each month then depends on the one before it, `potAt()` walks the months rather than summing them, topping the pot up first and spending from it second.
- **A category's kind is about whether the app warns you, not about the amount being identical.** Fuel and haircuts belong in `fixed` even though the amount moves: you had to spend it, so a warning at 80% would be noise.
- **Calendar month, no rollover** for variable and fixed. Pots are the deliberate exception: carrying over is the entire point of a pot.
- **Per-expense splits, off by default.** Every transaction still stores `scope`, `pct` (your share) and `paidBy`, so adding a second member later is a join, not a migration. The controls stay hidden until someone turns them on in Account, because until there is a second person the settle-up balance is a number nobody can settle. `splitsOn()` shows them anyway for anyone whose ledger already has split rows.
- **Money is integer minor units (cents)** everywhere. Never floats.
- **Append-only intent.** Each row carries `source: 'manual' | 'bank' | 'recurring'` so a bank import cannot overwrite hand-entered history. Editing an expense keeps its `id`, `paidBy` and `source`.
- **Data is never silently dropped.** `lib/store.ts` migrates a stored ledger forward through `MIGRATIONS` on load; anything genuinely unreadable is parked under `ledger.mvp.unreadable` instead of being discarded, so it can still be recovered by hand.
- **Deleting a category asks what happens to its expenses** — move them, leave them uncategorised, or delete them too. Orphans get an *Uncategorised* card so the month total always equals the sum of what is on screen.

## Storage on the device

There is no server, so the only copy of someone's history is the one on their phone. Three things protect it:

1. **`navigator.storage.persist()`** is requested on load, which stops mobile Safari clearing script-writable storage for a site that has not been opened in a while.
2. **Installing to the home screen** is prompted for in Account (a real prompt on Android, written instructions on iOS, which has no API for it). Installed storage is much less likely to be evicted.
3. **Export and import** in Account. Export goes through the share sheet on a phone — the only route that reaches Files or iCloud on iOS — and falls back to a download, then to copying JSON as text. Imports are migrated like stored data, so an old backup still restores, and are previewed before they replace anything.

Writes are coalesced on a 150 ms timer and flushed on `pagehide`/`visibilitychange`, so dragging a target slider does not hammer `localStorage`.

## Files

    app/layout.tsx           self-hosted fonts, metadata, viewport, PWA meta
    app/manifest.ts          web app manifest
    app/icon.png             favicon
    app/apple-icon.png       iOS home-screen icon
    app/page.tsx             renders <App />
    app/globals.css          Tailwind v4 theme tokens + keyframes
    public/sw.js             offline shell (network-first HTML, cache-first hashed assets)
    public/icon-*.png        manifest icons, incl. maskable
    components/App.tsx       all screens, sheets, tab bar
    components/Icons.tsx     clay category tiles + tab icons
    components/Onboarding.tsx first-run setup
    components/ServiceWorker.tsx registers public/sw.js in production only
    lib/types.ts             Category, Tx, Ledger, SCHEMA
    lib/data.ts             month maths, the three kinds, pot balances, history, search
    lib/store.ts            useLedger() — persistence, migrations, storage health
    lib/backup.ts           export / import / validate
    lib/format.ts           currency + date formatting
    lib/i18n.ts             English + Portuguese strings
    lib/tap.ts              haptics and click feedback

## Tests

    npm test

Node 24 runs the TypeScript directly, so there is no test dependency to install. `test/resolve-ts.mjs` only teaches Node's resolver the extensionless imports Next uses.

The suite covers the money maths and the migrations, in that order of importance. A migration bug is the one failure here with no way back: it corrupts real data on someone's phone, and there is no server holding a copy.

## Changing the schema

Bump `SCHEMA` in `lib/types.ts` and add a matching step to `MIGRATIONS` in `lib/store.ts`, keyed by the version you are migrating *from*. Every step must set the new `v`. Without a step, a ledger at the old version is treated as unreadable rather than upgraded.

## Next steps toward Phase 2/3

0. **Sync.** The one thing testers will ask for that is not here. Export/import is the manual stand-in; real sync needs the accounts work below. Until then, a second device is a second ledger.
1. **Postgres + Drizzle.** Tables: `users`, `households`, `household_members`, `categories`, `budgets` (per month), `transactions`, `transaction_splits`. Row-level security keyed on `household_id`.
2. **Auth.** Supabase Auth or Clerk, where an organisation maps 1:1 to a household.
3. **Swap the store.** Replace `useLedger()` with TanStack Query hooks against `/api/*` route handlers. Nothing in the component tree changes.
4. **Bank sync.** GoCardless Bank Account Data (EU/PSD2) in a background worker; write imported rows with `source: 'bank'` and a `pending` categorisation state.

## Swapping the icons

Category tiles are geometric placeholders drawn in `components/Icons.tsx`. Drop a real 3D icon set in `public/icons/` and replace the `<Mark />` inside `<Tile />` with an `<Image />` — the gradient tile and shadow stay.
