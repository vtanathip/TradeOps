# kapo-prototype

A Signal-to-Execution prediction market bot that cross-references **Kalshi** public event probabilities with **Polymarket** on-chain prices, detects spread opportunities, and logs virtual paper trades to a local SQLite database.

All execution targets the **Polygon Amoy testnet** — no real capital is at risk in this phase.

---

## Architecture

```
Signal Layer          Execution Layer
─────────────         ───────────────────────────────
Kalshi REST API  ──►  matcher.py  ──►  arb_engine.py  ──►  trades.db (SQLite)
                        │
Polymarket CLOB  ──►  web3_executor.py  (Polygon Amoy testnet)
Gamma API
```

| Module | Role |
|---|---|
| `kalshi_client.py` | Fetch `yes_bid` for a Kalshi ticker via the public REST v2 API |
| `matcher.py` | Fuzzy-match Kalshi tickers → Polymarket markets using rapidfuzz |
| `web3_executor.py` | Check testnet USDC balance; EIP-712 signing & claim-winnings skeletons |
| `arb_engine.py` | 60-second poll loop — calculates spreads, evaluates signals, logs to SQLite |
| `config.py` | pydantic-settings config, Amoy chain constants, ERC-20 / CTF ABIs |

---

## Quickstart

### 1. Install dependencies

Requires [uv](https://docs.astral.sh/uv/) and Python 3.10+.

```bash
uv sync
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
WALLET_ADDRESS=0xYourTestnetWallet
WALLET_PRIVATE_KEY=          # optional for phase 1
KALSHI_API_KEY=               # optional; add if you get 401
WATCH_LIST=KXBTC-25APR-T60000,KXETH-25APR-T3000
```

### 3. Run the scanner

```bash
uv run python arb_engine.py
```

The engine will:
1. Fetch all active Polymarket markets (Gamma API)
2. Fuzzy-match each Kalshi ticker in `WATCH_LIST` to a Polymarket market
3. Fetch the Polymarket YES token midpoint (CLOB API)
4. Calculate the cross-venue spread
5. Evaluate a signal (`BUY_YES` / `BUY_NO` / `HOLD`)
6. Log every observation to `trades.db`

### 4. Query results

```bash
sqlite3 trades.db "SELECT timestamp, kalshi_ticker, kalshi_yes_bid, polymarket_yes_price, spread_pct, action FROM virtual_trades ORDER BY id DESC LIMIT 20;"
```

---

## Signal Logic

```
spread = (kalshi_yes_bid - polymarket_yes_price) / polymarket_yes_price

spread > +3pp  →  BUY_YES   (Kalshi overpriced; buy YES cheaper on Polymarket)
spread < -3pp  →  BUY_NO    (Polymarket overpriced; buy NO on Polymarket)
otherwise      →  HOLD
```

---

## Execution Layer (Web3 — Phase 2)

`web3_executor.py` connects to Polygon Amoy (chain ID 80002) and provides:

- **`get_usdc_balance()`** — live ERC-20 call, works today
- **`sign_order_eip712()`** — skeleton for EIP-712 signed orders (CTF Exchange)
- **`claim_winnings()`** — skeleton for redeeming resolved market positions

### Before going on-chain

1. **Verify contract addresses** in `config.py`:
   - `USDC_ADDRESS` — confirm the Circle USDC testnet address at [amoy.polygonscan.com](https://amoy.polygonscan.com)
   - `CTF_ADDRESS` / `CTF_EXCHANGE_ADDRESS` — check [Polymarket ctf-exchange deployments](https://github.com/Polymarket/ctf-exchange/tree/main/deployments)

2. **Get testnet MATIC** for gas: [faucet.polygon.technology](https://faucet.polygon.technology/)

---

## Kalshi Authentication

Kalshi's v2 API may require RSA-PKCS1-v1_5 signed requests. If you receive a `401`:

1. Generate an API key pair on [kalshi.com/account/api](https://kalshi.com/account/api)
2. Download your RSA private key PEM
3. Add `KALSHI_RSA_PRIVATE_KEY_PATH=./kalshi_private_key.pem` to `.env`
4. Implement full RSA signing in `kalshi_client._build_headers()` — see [Kalshi auth docs](https://trading-api.kalshi.com/docs#section/Authentication)

---

## APIs Used

| Endpoint | Auth | Purpose |
|---|---|---|
| `https://trading-api.kalshi.com/trade-api/v2/markets/{ticker}` | API key | Kalshi market data (yes_bid) |
| `https://gamma-api.polymarket.com/markets` | None | Polymarket market list |
| `https://clob.polymarket.com/midpoint?token_id=X` | None | Polymarket YES token mid price |
| `https://rpc-amoy.polygon.technology` | None | Polygon Amoy JSON-RPC |

---

## Project Structure

```
kapo-prototype/
├── .env.example          # Environment template
├── .python-version       # Python 3.10
├── pyproject.toml        # uv project manifest
├── config.py             # Settings, chain constants, ABIs
├── kalshi_client.py      # Kalshi REST client
├── web3_executor.py      # Web3 / EIP-712 layer
├── matcher.py            # Fuzzy market matching
├── arb_engine.py         # Main poll loop + SQLite logging
└── README.md
```

---

## Safety & Compliance

- All on-chain execution targets **Polygon Amoy testnet only** (chain ID 80002)
- No logic for bypassing geo-restrictions on centralised frontends
- Paper trading only in this phase — no real orders are submitted
- Never commit `.env` or private key PEM files (both are gitignored)
