# PolymarketBot

A Python bot for evaluating and trading on [Polymarket](https://polymarket.com) prediction markets — with a React dashboard to configure runs, trigger the bot, and track results in real time via Firebase Firestore.

---

## Quick Start

### Python bot

```bash
uv sync                              # install dependencies (includes firebase-admin)
cp .env.example .env                 # fill in FIREBASE_CREDENTIALS_PATH
uv run polymarket-bot                # one-shot demo (no Firebase needed)
uv run polymarket-runner             # polling runner — watches Firestore for run requests
```

### Web dashboard

```bash
cd webapp
npm install
cp .env.example .env.local           # fill in VITE_FIREBASE_* values
npm run dev                          # http://localhost:5173
```

### Firebase setup (first time)

1. Go to [Firebase Console](https://console.firebase.google.com) → Create project
2. Enable **Firestore Database** (start in test mode)
3. **Bot credentials**: Project Settings → Service Accounts → Generate new private key → save as `firebase-credentials.json`, set `FIREBASE_CREDENTIALS_PATH` in `.env`
4. **Web app credentials**: Project Settings → General → Your apps → Add web app → copy config values into `webapp/.env.local`
5. Deploy Firestore rules: `firebase deploy --only firestore:rules` (requires [Firebase CLI](https://firebase.google.com/docs/cli))

---

## How It Works

```text
Web Dashboard (React+Vite)           Firestore                  Bot (Python)
  TriggerPanel  ──write──▶  /run_requests  ◀──poll──  polymarket-runner
  RunsTable     ◀─listen──  /signals       ──write──▶  firebase_writer.py
  StatsPanel    ◀─listen──  /signals
```

1. Configure a strategy run in the dashboard and click **Run Strategy**
2. A document is written to `/run_requests` with status `pending`
3. `polymarket-runner` polls every 5 seconds, picks it up, and sets status to `running`
4. The bot fetches active markets, evaluates each with the configured strategy, and writes each `TradeSignal` to `/signals`
5. The dashboard updates live — no page refresh needed

---

## Firestore Collections

| Collection | Written by | Read by | Purpose |
| --- | --- | --- | --- |
| `/run_requests` | Web app | Bot | Strategy run configuration + lifecycle status |
| `/signals` | Bot | Web app | Individual `TradeSignal` records per market |

**`/run_requests` document shape:**
```json
{
  "status":     "pending | running | completed | failed",
  "created_at": "<Timestamp>",
  "config": {
    "strategy":        "fair_value | market_making",
    "market_limit":    10,
    "fair_prob":       0.60,
    "half_spread":     0.02,
    "tail_cutoff":     0.05,
    "resolution_days": 3,
    "risk": {
      "bankroll_usd": 1000, "max_position_usd": 100,
      "min_edge": 0.04,     "kelly_fraction": 0.25,
      "min_liquidity_usd": 500, "max_spread": 0.05
    }
  },
  "signal_count": 12,
  "started_at":   "<Timestamp>",
  "completed_at": "<Timestamp>"
}
```

---

## Project Structure

```
PolymarketBot/
├── src/polymarket_bot/
│   ├── client.py               # Polymarket CLOB API client wrapper
│   ├── market_data.py          # Market data fetch functions (Gamma + CLOB APIs)
│   ├── main.py                 # Demo runner — fetches markets, runs strategy eval
│   └── strategies/
│       ├── base.py             # Core types: MarketSnapshot, TradeSignal, RiskConfig, Strategy ABC
│       ├── snapshot.py         # build_snapshot() — converts live API data → MarketSnapshot
│       ├── fair_value.py       # FairValueStrategy — trade on probability edge
│       └── market_making.py    # MarketMakingStrategy — quote both sides, earn spread
├── .env.example
└── pyproject.toml
```

---

## Architecture

The bot separates concerns into three layers:

```
┌─────────────────────────────────────────────┐
│                  Runner / main.py            │  orchestrates the loop
└────────────────────┬────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   Strategy Layer       │  evaluate(snapshot) → TradeSignal
         │  fair_value.py         │
         │  market_making.py      │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Data Layer           │  live market state → typed snapshot
         │  snapshot.py           │
         │  market_data.py        │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   API Layer            │  HTTP calls to Polymarket
         │  client.py             │  CLOB API + Gamma REST API
         └───────────────────────┘
```

### API Layer — `client.py`

`PolymarketClient` wraps `py-clob-client`. Pass a private key for authenticated trading; omit it for read-only market data.

```python
client = PolymarketClient(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))
clob   = client.clob   # py_clob_client.ClobClient
```

Two APIs are used:

| API | URL | Auth | Used for |
|-----|-----|------|----------|
| Gamma REST | `gamma-api.polymarket.com` | None | Discover active markets |
| CLOB | `clob.polymarket.com` | Optional | Order books, pricing, order placement |

### Data Layer — `market_data.py` + `snapshot.py`

`market_data.py` exposes thin wrappers around CLOB and Gamma endpoints:
`get_active_markets`, `get_order_book`, `get_midpoint`, `get_spread`, `get_last_trade_price`.

`snapshot.py` assembles those calls into a single typed `MarketSnapshot` that strategies consume:

```python
snapshot = build_snapshot(market_dict, clob)
```

### Strategy Layer — `strategies/`

Strategies are stateless evaluators. Each receives a `MarketSnapshot` and returns a `TradeSignal`. They do not place orders themselves — execution is the runner's responsibility.

```
MarketSnapshot  →  Strategy.evaluate()  →  TradeSignal
```

---

## Polymarket vs. General Trading

Polymarket prediction markets differ from traditional assets in three ways that shape every design decision:

| Concept | Traditional trading | Polymarket |
|---------|---------------------|------------|
| Price meaning | Arbitrary asset value | A probability (0.01 – 0.99) |
| Outcome | Continuous, open-ended | Binary — resolves to 0.00 or 1.00 |
| "Short selling" | Sell the asset | Buy the NO token instead |
| Stop loss | Exit at price target | Sell token back to book, or hold to resolution |
| Position sizing | % risk / ATR | Kelly Criterion on probability edge |

Because prices are probabilities, **edge** is simply `your_estimate − market_price`. The Kelly Criterion then converts that edge into a dollar size.

---

## Strategy Reference

### Core Types (`strategies/base.py`)

#### `MarketSnapshot`

Immutable snapshot of one market at a point in time. Built by `build_snapshot()`.

| Field | Type | Description |
|-------|------|-------------|
| `condition_id` | `str` | Unique market identifier |
| `question` | `str` | Human-readable market question |
| `yes_token_id` | `str` | Outcome token ID for YES |
| `no_token_id` | `str` | Outcome token ID for NO |
| `yes_price` | `float` | Mid-market price of YES (= implied probability) |
| `no_price` | `float` | Mid-market price of NO |
| `yes_bid/ask` | `float\|None` | Top-of-book for YES |
| `no_bid/ask` | `float\|None` | Top-of-book for NO |
| `spread` | `float` | Bid-ask spread of YES token |
| `liquidity` | `float\|None` | Total USDC in the order book |
| `closes_at` | `datetime\|None` | Resolution deadline |

#### `TradeSignal`

What a strategy decided to do.

| Field | Type | Description |
|-------|------|-------------|
| `action` | `Action` | `BUY_YES`, `BUY_NO`, `HOLD`, or `SKIP` |
| `token_id` | `str` | Token to buy (empty for HOLD/SKIP) |
| `price` | `float` | Limit price to submit |
| `size_usd` | `float` | Dollar notional after Kelly sizing |
| `edge` | `float` | Raw probability edge |
| `reason` | `str` | Human-readable rationale |

#### `RiskConfig`

Portfolio-level guardrails shared by all strategies.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `bankroll_usd` | 1000.0 | Total capital |
| `max_position_usd` | 100.0 | Hard cap per market |
| `min_edge` | 0.04 | Minimum edge to trade (4 pp) |
| `kelly_fraction` | 0.25 | Fraction of full Kelly (quarter-Kelly is conservative) |
| `min_liquidity_usd` | 500.0 | Skip markets below this USDC depth |
| `max_spread` | 0.05 | Skip markets with spread above this |

#### Kelly Criterion for Binary Markets

Full Kelly fraction for each side:

```
Buy YES:  f* = (p - price) / (1 - price)
Buy NO:   f* = ((1-p) - (1-price)) / price   =   (price - p) / price
```

Where `p` is your probability estimate and `price` is the current market mid. Dollar size = `bankroll × kelly_fraction × f*`, capped at `max_position_usd`.

---

### Built-in Strategies

#### `FairValueStrategy`

Trade when the market price diverges from your probability estimate by at least `min_edge`.

```python
from polymarket_bot.strategies import FairValueStrategy, RiskConfig

strategy = FairValueStrategy(
    fair_prob=0.65,          # your estimated probability of YES
    config=RiskConfig(
        bankroll_usd=1_000,
        min_edge=0.04,
        kelly_fraction=0.25,
    )
)

signal = strategy.evaluate(snapshot)
# signal.action → BUY_YES / BUY_NO / SKIP
# signal.size_usd → Kelly-sized dollar amount
```

**Logic:**
1. Run quality checks (liquidity, spread, not expired)
2. Compute `edge_yes = fair_prob − yes_price`
3. If `edge_yes ≥ min_edge` → `BUY_YES` with Kelly size
4. Else if `−edge_yes ≥ min_edge` → `BUY_NO` with Kelly size
5. Otherwise → `SKIP`

---

#### `MarketMakingStrategy`

Provide liquidity on both sides of the YES token, earning the spread. Returns two signals (bid + ask) via `evaluate_both()`.

```python
from polymarket_bot.strategies import MarketMakingStrategy, RiskConfig

strategy = MarketMakingStrategy(
    half_spread=0.02,        # quote 2 cents each side of mid
    tail_cutoff=0.05,        # skip markets below 5% or above 95%
    resolution_days=3,       # widen spread within 3 days of resolution
    config=RiskConfig(bankroll_usd=2_000, max_position_usd=100),
)

quotes = strategy.evaluate_both(snapshot)
# quotes.bid  → TradeSignal(BUY_YES, price=mid-half_spread, ...)
# quotes.ask  → TradeSignal(BUY_NO,  price=1-(mid+half_spread), ...)
```

**Logic:**
1. Skip tail prices (`price < tail_cutoff` or `price > 1 − tail_cutoff`) — asymmetric resolution risk
2. Adjust `half_spread` upward linearly as resolution approaches
3. Place limit bid at `mid − half_spread` (BUY_YES)
4. Place limit ask at `mid + half_spread` expressed as a BUY_NO price

---

### Writing a Custom Strategy

Subclass `Strategy` and implement `evaluate()`. Always return a `TradeSignal` — use `self._skip(reason)` instead of raising.

```python
from polymarket_bot.strategies import (
    Action, MarketSnapshot, RiskConfig,
    Strategy, TradeSignal, kelly_size,
)

class MyStrategy(Strategy):
    def evaluate(self, snapshot: MarketSnapshot) -> TradeSignal:
        ok, reason = self._passes_quality_checks(snapshot)
        if not ok:
            return self._skip(reason)

        my_prob = self._estimate_probability(snapshot)   # your model here
        edge    = my_prob - snapshot.yes_price

        if edge >= self.config.min_edge:
            size = kelly_size(my_prob, snapshot.yes_price, Action.BUY_YES, self.config)
            return TradeSignal(
                action=Action.BUY_YES,
                token_id=snapshot.yes_token_id,
                price=snapshot.yes_ask or snapshot.yes_price,
                size_usd=size,
                edge=edge,
                reason=f"my_model={my_prob:.2f} market={snapshot.yes_price:.2f}",
            )

        if -edge >= self.config.min_edge:
            size = kelly_size(my_prob, snapshot.yes_price, Action.BUY_NO, self.config)
            return TradeSignal(
                action=Action.BUY_NO,
                token_id=snapshot.no_token_id,
                price=snapshot.no_ask or snapshot.no_price,
                size_usd=size,
                edge=-edge,
                reason=f"my_model={my_prob:.2f} market={snapshot.yes_price:.2f}",
            )

        return self._skip(f"edge={edge:.3f} below min={self.config.min_edge}")

    def _estimate_probability(self, snapshot: MarketSnapshot) -> float:
        # Replace with your model: news sentiment, base rates, external data, etc.
        return 0.5
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POLYMARKET_PRIVATE_KEY` | No | Ethereum/Polygon private key — only needed for order placement |
| `POLYMARKET_FUNDER` | No | Wallet address used when submitting orders |

Read-only market data (order books, prices, active markets) works without any credentials.
