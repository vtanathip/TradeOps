# Polymarket Bot

A TypeScript trading bot for [Polymarket](https://polymarket.com) prediction markets with a real-time React dashboard, powered by Firebase Cloud Functions.

## Architecture

```text
┌─────────────────────────────────────┐
│  React Dashboard (webapp/)          │
│  Configure & submit a run request   │
└──────────────┬──────────────────────┘
               │ writes /run_requests (status: pending)
               ▼
┌─────────────────────────────────────┐
│  Firestore                          │
│  /run_requests   /signals           │
└──────────────┬──────────────────────┘
               │ Firestore trigger fires automatically
               ▼
┌─────────────────────────────────────┐
│  Firebase Cloud Function            │
│  functions/src/index.ts             │
│  ├─ Fetch active markets (Gamma API)│
│  ├─ Build MarketSnapshot (CLOB API) │
│  ├─ Evaluate strategy               │
│  └─ Write TradeSignals → /signals   │
└─────────────────────────────────────┘
```

**Why Firestore trigger?** The dashboard writes a `run_requests` document the moment you click "Run Strategy". Firestore automatically wakes the Cloud Function — no polling server, no cron job, no infrastructure to manage. The function runs, writes signals, and shuts down. You pay only for the seconds it runs.

## Project Structure

```text
PolymarketBot/
├── firebase.json                 # Deploy config (functions + hosting + emulators)
├── .firebaserc                   # Which Firebase project to deploy to
├── firestore.rules               # Firestore security rules
│
├── functions/                    # Cloud Functions (TypeScript bot)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts              # Cloud Function entry — Firestore trigger
│       ├── runner.ts             # Shared executeRun() + local polling runner
│       ├── client.ts             # PolymarketClient (wraps @polymarket/clob-client)
│       ├── marketData.ts         # Gamma API + CLOB data helpers
│       ├── firebaseWriter.ts     # Firestore read/write
│       └── strategies/
│           ├── types.ts          # Action, MarketSnapshot, TradeSignal, RiskConfig
│           ├── kellySize.ts      # Kelly Criterion position sizing
│           ├── strategy.ts       # Strategy abstract base class
│           ├── snapshot.ts       # buildSnapshot() — assembles market data
│           ├── fairValue.ts      # FairValueStrategy
│           └── marketMaking.ts   # MarketMakingStrategy + MakerQuotes
│
└── webapp/                       # React dashboard (TypeScript + Vite)
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx               # Sidebar layout + tab routing
        ├── firebase.ts           # Firebase app init (reads VITE_* env vars)
        └── components/
            ├── TriggerPanel.tsx  # Configure & submit runs
            ├── RunsTable.tsx     # Live signals table with filters
            └── StatsPanel.tsx    # Analytics overview
```

## Prerequisites

Before you start, install and configure these tools:

### Node.js 20+

The Cloud Function runtime targets Node 20 (set in `functions/package.json` under `"engines"`). Using an older version locally can produce a build that works locally but fails at deploy time. Check your version with `node --version`.

### Firebase CLI

```bash
npm install -g firebase-tools
```

The Firebase CLI (`firebase`) is the command-line tool that communicates with Google's Firebase services. You use it to deploy functions, deploy the webapp to Firebase Hosting, and manage project settings. It must be installed globally so the `firebase` command is available everywhere.

### Firebase project with Firestore enabled

You need a Firebase project (created in the [Firebase Console](https://console.firebase.google.com)) with:

- **Firestore Database** enabled (Native mode, not Datastore mode)
- **Blaze (pay-as-you-go) plan** — required to deploy Cloud Functions. Free Spark plan does not allow external network calls from functions.

### Log in to Firebase

```bash
firebase login
```

This opens a browser and links the Firebase CLI on your machine to your Google account. All subsequent `firebase` commands will use your account's permissions. You only need to do this once per machine.

## Setup

### 1. Install dependencies

```bash
cd functions && npm install
cd ../webapp  && npm install
```

Each package (`functions/` and `webapp/`) has its own `package.json` and its own `node_modules`. You must install both separately. `functions/` is the bot (Firebase Admin SDK, Polymarket client); `webapp/` is the React dashboard (React, Tailwind, Firebase web SDK).

### 2. Point the CLI at your Firebase project

Edit [.firebaserc](.firebaserc) and replace the placeholder with your actual project ID:

```json
{ "projects": { "default": "your-firebase-project-id" } }
```

Your project ID appears in the Firebase Console URL: `console.firebase.google.com/project/**your-id**/overview`. This file tells the Firebase CLI which project to target when you run `firebase deploy`. Without it, every deploy command would ask you to pick a project interactively.

### 3. Configure the webapp's Firebase connection

```bash
cp webapp/.env.example webapp/.env.local
```

Then open `webapp/.env.local` and fill in your Firebase web app credentials:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

**Where to find these values:** Firebase Console → Project Settings (gear icon) → scroll to "Your apps" → select your web app → "SDK setup and configuration" → Config.

These are **not** secrets — they're safe to include in the built webapp bundle. They simply tell the Firebase JS SDK which project to connect to. The actual security is enforced by Firestore rules, not by keeping these values hidden.

### 4. Create a service account for local development

For `npm run runner` (local bot without deploying to Cloud Functions), the bot needs to authenticate to Firestore as a server. The webapp uses the public web SDK; the bot uses the Admin SDK, which requires a service account.

1. Firebase Console → Project Settings → **Service accounts** tab
2. Click **Generate new private key** → download the JSON file
3. Save it outside your git repo (e.g. `../firebase-credentials.json`)
4. Copy the functions env file and fill it in:

```bash
cp functions/.env.example functions/.env
```

```bash
# functions/.env
FIREBASE_CREDENTIALS_PATH=../firebase-credentials.json
POLYMARKET_PRIVATE_KEY=   # leave blank for now (read-only mode)
POLYMARKET_FUNDER=        # leave blank for now
```

`FIREBASE_CREDENTIALS_PATH` is only needed locally. When deployed as a Cloud Function, Firebase provides credentials automatically — the function runs inside Google's infrastructure under your project's service account.

## Local Development

### Run the bot locally (no Cloud Functions deploy needed)

```bash
cd functions
npm run runner
```

This compiles and runs [functions/src/runner.ts](functions/src/runner.ts) using `ts-node` (TypeScript executed directly without a separate compile step). The runner polls Firestore every 5 seconds for documents with `status: "pending"` in the `/run_requests` collection. When it finds one, it runs the strategy and writes signals — exactly what the Cloud Function does, but triggered by polling instead of a Firestore event.

**Use this when:** You want to iterate quickly on strategy logic without the deploy cycle (~2–3 min per deploy).

**Difference from Cloud Functions:** The runner keeps running until you press Ctrl+C. The Cloud Function starts fresh for each request and exits when done.

### Run the dashboard locally

```bash
cd webapp
npm run dev
# Opens at http://localhost:5173
```

Vite starts a development server with hot-module replacement. Changes to `.tsx` files appear in the browser immediately without a page reload. The dashboard connects to your real Firestore project — so signals written by the local runner appear live in the browser.

## Deploy to Firebase

### Step 1 — Compile TypeScript to JavaScript

```bash
cd functions
npm run build
```

**What it does:** `tsc` (the TypeScript compiler) reads `functions/tsconfig.json` and compiles every `.ts` file in `functions/src/` into plain `.js` files in `functions/lib/`. The output uses CommonJS module format (`require`/`exports`) because that's what Node.js on Firebase Cloud Functions uses at runtime — native ESM is not yet supported by the Firebase Functions runtime.

**Why this step is needed:** Firebase can only deploy JavaScript, not TypeScript. The compiled `lib/` directory is what actually gets uploaded.

### Step 2 — Deploy Cloud Functions

```bash
npm run deploy
# equivalent to: firebase deploy --only functions
```

**What it does:**

1. Packages `functions/lib/` plus `functions/package.json` into a zip
2. Uploads it to Google Cloud Storage
3. Creates or updates a Cloud Function named `onRunRequest` in your Firebase project
4. The function is wired to fire on `run_requests/{requestId}` document creation

**What happens in production:** When you click "Run Strategy" in the dashboard, the Firestore SDK creates a document. About 1–5 seconds later, Cloud Functions detects the new document and invokes `onRunRequest`. The function reads the config, fetches Polymarket data, evaluates the strategy, and writes signals — all without any server you manage.

**Runtime environment:** Google runs the function in a container on Node 20. It has internet access (required for Polymarket APIs), 512 MiB RAM (set in `index.ts`), and a 5-minute timeout. The container starts cold (a few hundred ms delay) on the first invocation and stays warm briefly for subsequent ones.

### Step 3 — Store secrets in Secret Manager (production only)

For production, never put `POLYMARKET_PRIVATE_KEY` in a `.env` file that could be accidentally committed or exposed. Use Firebase Secret Manager instead:

```bash
firebase functions:secrets:set POLYMARKET_PRIVATE_KEY
# Prompts you to paste the value — it is encrypted at rest by Google KMS
```

**Why Secret Manager?** The `.env` approach works locally but is a file on disk. Secret Manager stores the value encrypted in Google's infrastructure. The Cloud Function accesses it at runtime via the `secrets: ["POLYMARKET_PRIVATE_KEY"]` declaration in `index.ts` — Google injects it as an environment variable. No human can read it from the Firebase Console after it is set.

After setting the secret, redeploy so the function picks it up:

```bash
npm run build && npm run deploy
```

### Step 4 — Deploy the webapp (optional)

The webapp can be served from anywhere (Vercel, Netlify, your own host). Firebase Hosting is the simplest option since you're already using Firebase.

```bash
cd webapp
npm run build
# Outputs to webapp/dist/
```

**What `npm run build` does:** Vite bundles all React components, TypeScript, Tailwind CSS, and assets into static files in `webapp/dist/`. Tailwind removes every CSS class not used in the source (tree-shaking), resulting in a small CSS file. The output is pure HTML + JS + CSS — no server needed to serve it.

```bash
cd ..   # back to project root
firebase deploy --only hosting
```

**What this does:** Uploads the contents of `webapp/dist/` to Firebase Hosting's global CDN. Firebase Hosting serves the files over HTTPS from edge nodes worldwide, with automatic SSL certificates. The `rewrites` rule in [firebase.json](firebase.json) ensures that all URLs (e.g. `/signals`, `/stats`) return `index.html` so React Router handles routing client-side.

**Result:** Your dashboard is live at `https://your-project-id.web.app` (and `https://your-project-id.firebaseapp.com`).

### Deploy both at once

```bash
cd functions && npm run build && cd ..
firebase deploy
```

`firebase deploy` without `--only` deploys both functions and hosting in a single command.

## Strategies

### Fair Value Strategy

Trade when the market price diverges from your probability estimate.

```typescript
const strategy = new FairValueStrategy(0.65, {
  bankrollUsd: 1000,
  maxPositionUsd: 100,
  minEdge: 0.04,
});
const signal = strategy.evaluate(snapshot);
// signal.action: BUY_YES | BUY_NO | SKIP
```

**Logic:**

- `edge_yes = fairProb - marketPrice` — if ≥ `minEdge`, buy YES
- `edge_no  = marketPrice - fairProb` — if ≥ `minEdge`, buy NO
- Position sized by Kelly Criterion: `f* = (p - price) / (1 - price)`
- Applies quality filters first: minimum liquidity, maximum spread, market not expired

### Market Making Strategy

Provide liquidity by quoting both sides of the book.

```typescript
const strategy = new MarketMakingStrategy(
  0.02,  // halfSpread (2 cents each side)
  0.05,  // tailCutoff (skip if price < 5% or > 95%)
  3,     // resolutionDays (widen spread within 3 days of close)
);
const { bid, ask, skipped } = strategy.evaluateBoth(snapshot);
```

**Logic:**

- Quotes at `mid ± halfSpread`
- Skips extreme probabilities (`< tailCutoff` or `> 1 - tailCutoff`) — asymmetric risk near resolution
- Widens spread linearly as resolution approaches (gamma risk from binary outcome)

### Adding a Custom Strategy

```typescript
import { Strategy, MarketSnapshot, TradeSignal } from "./strategies/types";

export class MyStrategy extends Strategy {
  evaluate(snapshot: MarketSnapshot): TradeSignal {
    const [ok, reason] = this.passesQualityChecks(snapshot);
    if (!ok) return this.skip(reason);

    // Your logic here...
    return this.skip("not implemented");
  }
}
```

Register it in [functions/src/runner.ts](functions/src/runner.ts) in `buildStrategy()`.

## Core Types

```typescript
interface MarketSnapshot {
  conditionId: string;
  question:    string;
  yesTokenId:  string;
  noTokenId:   string;
  yesPrice:    number;       // mid-market probability (0.01–0.99)
  noPrice:     number;       // 1 - yesPrice
  spread:      number;       // ask - bid
  liquidity:   number | null;
  closesAt:    Date   | null;
  // top-of-book (null if CLOB call failed)
  yesBid: number | null; yesAsk: number | null;
  noBid:  number | null; noAsk:  number | null;
}

interface TradeSignal {
  action:  Action;   // BUY_YES | BUY_NO | HOLD | SKIP
  tokenId: string;   // which token to buy
  price:   number;   // limit price to submit
  sizeUsd: number;   // dollar notional (Kelly-sized)
  edge:    number;   // |ourProb - marketPrice|
  reason:  string;   // human-readable explanation
}

interface RiskConfig {
  bankrollUsd:     number;  // total capital (default 1000)
  maxPositionUsd:  number;  // cap per trade (default 100)
  minEdge:         number;  // minimum edge to trade (default 0.04)
  kellyFraction:   number;  // fraction of full Kelly (default 0.25 = quarter-Kelly)
  minLiquidityUsd: number;  // skip illiquid markets (default 500)
  maxSpread:       number;  // skip wide-spread markets (default 0.05)
}
```

## Firestore Schema

The dashboard reads these exact field names. **Do not rename them** without updating the frontend components.

```text
/run_requests/{id}
  status:        "pending" | "running" | "completed" | "failed"
  created_at:    Timestamp   — set by dashboard (serverTimestamp)
  started_at:    Timestamp   — set when function begins executing
  completed_at:  Timestamp   — set on completion or failure
  config:        { strategy, market_limit, fair_prob?, half_spread?, ..., risk: {...} }
  signal_count:  number      — written on completion
  error:         string      — written on failure

/signals/{id}
  request_id:    string      — links signal back to its run request
  run_timestamp: Timestamp   — when signal was written (serverTimestamp)
  strategy:      string      — "FairValueStrategy" | "MarketMakingStrategy"
  condition_id:  string      — Polymarket market ID
  question:      string      — market question text
  action:        "BUY_YES" | "BUY_NO" | "HOLD" | "SKIP"
  token_id:      string      — CLOB token to buy
  price:         number      — limit price
  size_usd:      number      — Kelly-sized position in USD
  edge:          number      — |ourProb - marketPrice|
  reason:        string      — why this action was chosen
  yes_price:     number      — YES mid-market price at signal time
  no_price:      number      — NO mid-market price at signal time
  spread:        number      — bid-ask spread at signal time
  liquidity:     number | null
```

## Environment Variables

### `functions/.env` (local runner only, never committed)

```bash
# Path to your Firebase service account JSON file.
# Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key
FIREBASE_CREDENTIALS_PATH=../firebase-credentials.json

# Polymarket wallet private key — needed for order placement (not yet implemented).
# Leave blank to run in read-only market scanning mode.
POLYMARKET_PRIVATE_KEY=

# Polymarket funder address — used alongside the private key for order submission.
POLYMARKET_FUNDER=
```

### `webapp/.env.local` (local dashboard, never committed)

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

All values come from Firebase Console → Project Settings → Your apps → Web app → Config.

## Security Notes

- **Firestore rules** in [firestore.rules](firestore.rules) are currently in test mode (open read/write for 30 days). Before going to production, add Firebase Authentication and restrict access so only authenticated users can create run requests and read signals.

- **Order placement is not yet implemented.** The bot currently scans markets and evaluates strategies in read-only mode. Placing actual orders requires constructing a `viem` `WalletClient` from `POLYMARKET_PRIVATE_KEY` and passing it as `signer` to `ClobClient`. This is intentionally left out until the signal quality has been validated.

- **Cloud Functions billing:** The free Spark plan allows ~125K function invocations per month. Each "Run Strategy" click is one invocation. For heavy automated usage, upgrade to the Blaze plan — you only pay for what you use beyond the free tier (currently $0.40/million invocations).
