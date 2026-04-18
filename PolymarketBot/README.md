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

No separate server required — the Cloud Function fires the instant a run request is created.

## Project Structure

```
PolymarketBot/
├── firebase.json                 # Firebase deploy config
├── .firebaserc                   # Firebase project alias
├── firestore.rules               # Firestore security rules
│
├── functions/                    # Cloud Functions (TypeScript bot)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts              # Cloud Function entry (Firestore trigger)
│       ├── runner.ts             # Shared executeRun() + local polling runner
│       ├── client.ts             # PolymarketClient wrapper
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
└── webapp/                       # React dashboard (TypeScript)
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── firebase.ts
        └── components/
            ├── TriggerPanel.tsx  # Configure & submit runs
            ├── RunsTable.tsx     # Live signals table
            └── StatsPanel.tsx    # Analytics overview
```

## Prerequisites

- **Node.js 20+**
- **Firebase CLI**: `npm install -g firebase-tools`
- **Firebase project** with Firestore enabled
- Firebase login: `firebase login`

## Setup

### 1. Install dependencies

```bash
cd functions && npm install
cd ../webapp && npm install
```

### 2. Configure Firebase project

Edit [.firebaserc](.firebaserc) and replace `YOUR_FIREBASE_PROJECT_ID` with your actual project ID:

```json
{ "projects": { "default": "your-project-id" } }
```

### 3. Configure the webapp

```bash
cp webapp/.env.example webapp/.env.local
# Fill in your Firebase web app credentials from:
# Firebase Console → Project Settings → Your apps → Web app → SDK config
```

## Local Development

Run the bot locally against your real Firestore project (no Cloud Functions deployment needed):

```bash
cd functions
cp .env.example .env
# Fill in FIREBASE_CREDENTIALS_PATH (path to service account JSON)

npm run runner
# Polls Firestore every 5s for pending run_requests
```

Run the dashboard locally:

```bash
cd webapp
npm run dev
# Opens at http://localhost:5173
```

## Deploy to Firebase

### Deploy Cloud Functions

```bash
cd functions
npm run build          # compile TypeScript → lib/
npm run deploy         # firebase deploy --only functions
```

For the private key in production, use Firebase Secret Manager instead of `.env`:

```bash
firebase functions:secrets:set POLYMARKET_PRIVATE_KEY
```

The Cloud Function runtime provides Firebase credentials automatically — no `FIREBASE_CREDENTIALS_PATH` needed in production.

### Deploy webapp (optional)

```bash
cd webapp
npm run build          # outputs to webapp/dist/
firebase deploy --only hosting
```

## Strategies

### Fair Value Strategy

Trade when the market price diverges from your probability estimate.

```typescript
import { FairValueStrategy, RiskConfig } from "./strategies";

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

### Market Making Strategy

Provide liquidity by quoting both sides of the book.

```typescript
import { MarketMakingStrategy } from "./strategies";

const strategy = new MarketMakingStrategy(
  0.02,  // halfSpread (2 cents)
  0.05,  // tailCutoff (skip price < 5% or > 95%)
  3,     // resolutionDays (widen spread within 3 days of resolution)
);
const { bid, ask, skipped } = strategy.evaluateBoth(snapshot);
```

**Logic:**

- Quotes at `mid ± halfSpread`
- Skips tail prices (`< tailCutoff` or `> 1 - tailCutoff`) — asymmetric risk
- Widens spread linearly as resolution approaches (gamma risk)

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
  noPrice:     number;
  spread:      number;
  liquidity:   number | null;
  closesAt:    Date   | null;
  // top-of-book (optional)
  yesBid: number | null; yesAsk: number | null;
  noBid:  number | null; noAsk:  number | null;
}

interface TradeSignal {
  action:  Action;   // BUY_YES | BUY_NO | HOLD | SKIP
  tokenId: string;
  price:   number;   // limit price
  sizeUsd: number;   // dollar notional (Kelly-sized)
  edge:    number;   // |ourProb - marketPrice|
  reason:  string;
}

interface RiskConfig {
  bankrollUsd:     number;  // default 1000
  maxPositionUsd:  number;  // default 100
  minEdge:         number;  // default 0.04
  kellyFraction:   number;  // default 0.25 (quarter-Kelly)
  minLiquidityUsd: number;  // default 500
  maxSpread:       number;  // default 0.05
}
```

## Firestore Schema

```
/run_requests/{id}
  status:       "pending" | "running" | "completed" | "failed"
  created_at:   Timestamp
  config:       { strategy, market_limit, fair_prob?, half_spread?, ..., risk: {...} }
  signal_count: number  (on completion)
  error:        string  (on failure)

/signals/{id}
  request_id:    string
  run_timestamp: Timestamp
  strategy:      string
  condition_id:  string
  question:      string
  action:        "BUY_YES" | "BUY_NO" | "HOLD" | "SKIP"
  token_id:      string
  price:         number
  size_usd:      number
  edge:          number
  reason:        string
  yes_price:     number
  no_price:      number
  spread:        number
  liquidity:     number | null
```

## Environment Variables

### `functions/.env` (local dev only)

```bash
# Service account JSON (from Firebase Console → Project Settings → Service Accounts)
FIREBASE_CREDENTIALS_PATH=../firebase-credentials.json

# Polymarket keys (reserved for future order execution)
POLYMARKET_PRIVATE_KEY=
POLYMARKET_FUNDER=
```

### `webapp/.env.local`

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Notes

- The bot currently runs in **read-only mode** (market scanning only, no order placement). Placing orders requires constructing a `viem` `WalletClient` from `POLYMARKET_PRIVATE_KEY` and passing it as `signer` to `ClobClient`.
- Firestore security rules in [firestore.rules](firestore.rules) are in test mode (open read/write). Lock down with Firebase Auth before going to production.
- Cloud Functions use the Firebase free Spark plan up to ~125K invocations/month. For heavier usage, upgrade to the Blaze plan.
