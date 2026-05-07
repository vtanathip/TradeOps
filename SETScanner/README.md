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
uv run pytest test_integration.py -v -s
```

The tests hit the real Settrade API using credentials from `.env`.

## Project structure

```
.
├── main.py              # Entry point — login and fetch quotes
├── config.py            # Loads credentials from .env
├── test_integration.py  # Integration tests against live API
├── .env                 # Your credentials (git-ignored)
└── .env.example         # Credential template
```

## How the SDK credentials work

The `Investor` object requires four values:

| Parameter | What it is |
|---|---|
| `app_id` | Application ID from the developer portal |
| `app_secret` | Secret from the developer portal |
| `app_code` | The name you gave your app when registering |
| `broker_id` | Your broker's numeric ID (e.g. `003` for Pi Securities) |

Using `broker_id="SANDBOX"` switches the SDK to the UAT test environment automatically (broker `098`).
