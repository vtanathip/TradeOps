# SETScanner

SET market data scanner using the [Settrade Open API](https://developer.settrade.com/open-api/).

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager
- A Settrade Open API account and registered application

## 1. Register on Settrade Developer Portal

1. Go to [https://developer.settrade.com/open-api/](https://developer.settrade.com/open-api/) and sign up.
2. Create a new application. During creation you will set an **App Code** — this is a name/label you choose (e.g. `MY_SCANNER`).
3. After creating the app, the portal gives you:
   - **Application ID** — your API key
   - **Secret** — your API secret
   - **App Code** — the name you assigned

## 2. Find your Broker ID

The broker ID is specific to the brokerage firm you use with Settrade. Common ones:

| Broker | ID |
|---|---|
| Pi Securities (pi.finance) | `003` |

A full list is available at [https://developer.settrade.com/open-api/document/broker-list](https://developer.settrade.com/open-api/document/broker-list).

## 3. Configure credentials

Copy `.env.example` to `.env` and fill in your values:

```sh
cp .env.example .env
```

### Sandbox (UAT) — recommended for testing

On the Settrade developer portal, each application has a **Sandbox** tab that provides a separate `Application ID` and `Secret` for the UAT environment. Use those values and set both `APP_CODE` and `BROKER_ID` to `SANDBOX`:

```env
SETTRADE_APP_ID=your_sandbox_application_id
SETTRADE_APP_SECRET=your_sandbox_secret
SETTRADE_APP_CODE=SANDBOX
SETTRADE_BROKER_ID=SANDBOX
```

`SETTRADE_APP_CODE` and `SETTRADE_BROKER_ID` both default to `SANDBOX` in [config.py](config.py), so you can also omit those two lines entirely.

### Production

Use the credentials from the **Production** tab and set your real broker ID:

```env
SETTRADE_APP_ID=your_application_id
SETTRADE_APP_SECRET=your_secret
SETTRADE_APP_CODE=your_app_code
SETTRADE_BROKER_ID=003
```

> `.env` is git-ignored and will never be committed.

## 4. Install dependencies

```sh
uv sync
```

## 5. Run

```sh
uv run python main.py
```

Fetches live quotes for PTT, AOT, and CPALL and prints them to stdout.

## 6. Run integration tests

```sh
uv run pytest tests/ -v -s
```

The tests hit the real Settrade API using credentials from `.env`.

> **Note — broker permission scope matters.**  
> Each broker supports a different subset of the API. Equity quotes return a `GWD-07` error if the broker does not have Equity Market Data permission.
>
> | Broker | Equity Order API | Equity Market Data | Derivatives Order API | Derivatives Market Data |
> | --- | --- | --- | --- | --- |
> | Pi Securities (003) | ✗ | ✗ | ✓ | ✓ |
> | INVX (023) | ✓ | ✓ | ✓ | ✓ |
> | BYD (038) | ✓ | ✓ | ✓ | ✓ |
> | Globlex (025) | ✓ | ✓ | ✓ | ✓ |
>
> **Pi Securities** — current production credentials in `.env`. Derivatives market data only; equity quotes are tested as expected-denial (GWD-07).  
> **INVX (023)** — next target broker. Supports full equity + derivatives access; swap `SETTRADE_BROKER_ID=023` and use INVX app credentials to unlock equity quotes (PTT, AOT, CPALL).
>
> See the full list at [developer.settrade.com/open-api/document/broker-list](https://developer.settrade.com/open-api/document/broker-list).

## Project structure

```
.
├── main.py                          # Entry point — login and fetch quotes
├── config.py                        # Loads credentials from .env
├── tests/
│   ├── test_pi_integration.py       # Integration tests for Pi Securities (003)
│   └── test_set_mcp_integration.py  # Financial statement tests via set-mcp
├── docs/
│   └── set-mcp-integration.md       # set-mcp setup and usage guide
├── .mcp.json                        # MCP server config for Claude Code
├── .env                             # Your credentials (git-ignored)
└── .env.example                     # Credential template
```

## Financial statements (set-mcp)

Annual income statements, balance sheets, and cash flow for any SET stock are available via [set-mcp](https://github.com/batprem/set-mcp) — no credentials required.

- **In Claude Code:** ask Claude directly, e.g. *"Get PTT financials 2022–2024"*
- **In Python:** `from set_mcp.settrade_scraper import get_financial_statement_from_year`

See [docs/set-mcp-integration.md](docs/set-mcp-integration.md) for full setup and usage.

## How the SDK credentials work

The `Investor` object requires four values:

| Parameter | What it is |
|---|---|
| `app_id` | Application ID from the developer portal |
| `app_secret` | Secret from the developer portal |
| `app_code` | The name you gave your app when registering |
| `broker_id` | Your broker's numeric ID (`003` = Pi Securities, `023` = INVX) |

Setting `broker_id="SANDBOX"` (and `app_code="SANDBOX"`) switches the SDK to the UAT test environment. Use the **Sandbox** credentials shown on your app's Sandbox tab at [developer.settrade.com](https://developer.settrade.com/open-api/) — they are different from your production credentials.
