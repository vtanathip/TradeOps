"""Integration tests — hit the real Settrade API (broker: InnovestX 023).

InnovestX has two application credential types:
  - ALGO      (TFEX / Derivatives)
  - ALGO_EQ   (Equity)

InnovestX supports:
  - Derivatives Market Data  ✓  (ALGO credentials)
  - Derivatives Order API    ✓
  - Equity Market Data       ✓  (ALGO_EQ credentials)
  - Equity Order API         ✓
"""
import os
import json
import pytest
from dotenv import load_dotenv
from settrade_v2 import Investor
from main import get_quote

load_dotenv()

BROKER_ID = "023"


def _make_investor(app_id: str, app_secret: str, app_code: str) -> Investor:
    return Investor(
        app_id=app_id,
        app_secret=app_secret,
        app_code=app_code,
        broker_id=BROKER_ID,
        is_auto_queue=False,
    )


@pytest.fixture(scope="module")
def investor_algo():
    """ALGO credentials — TFEX / Derivatives access."""
    return _make_investor(
        app_id=os.environ["INVX_ALGO_APP_ID"],
        app_secret=os.environ["INVX_ALGO_APP_SECRET"],
        app_code="ALGO",
    )


@pytest.fixture(scope="module")
def investor_algo_eq():
    """ALGO_EQ credentials — Equity access."""
    return _make_investor(
        app_id=os.environ["INVX_ALGO_EQ_APP_ID"],
        app_secret=os.environ["INVX_ALGO_EQ_APP_SECRET"],
        app_code="ALGO_EQ",
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_algo_login_succeeds(investor_algo):
    assert investor_algo is not None


def test_algo_eq_login_succeeds(investor_algo_eq):
    assert investor_algo_eq is not None


# ---------------------------------------------------------------------------
# Derivatives market data — ALGO credentials (TFEX)
# ---------------------------------------------------------------------------

def test_set50_futures_quote_returns_price_data(investor_algo):
    quote = get_quote(investor_algo, "S50M26")
    print("\nSET50 Futures (S50M26):\n" + json.dumps(quote, indent=2))
    assert isinstance(quote, dict)
    assert quote


def test_gold_futures_quote_returns_price_data(investor_algo):
    quote = get_quote(investor_algo, "GFM26")
    print("\nGold Futures (GFM26):\n" + json.dumps(quote, indent=2))
    assert isinstance(quote, dict)
    assert quote


def test_futures_quote_response_contains_expected_fields(investor_algo):
    quote = get_quote(investor_algo, "S50M26")
    expected_fields = {"symbol", "instrumentType", "high", "low", "last",
                       "totalVolume", "expDate", "openInterest"}
    missing = expected_fields - quote.keys()
    print("\nAll fields returned:\n" + json.dumps(quote, indent=2))
    assert not missing, f"Missing fields in response: {missing}"


# ---------------------------------------------------------------------------
# Equity market data — ALGO_EQ credentials
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("symbol", ["PTT", "AOT", "CPALL"])
def test_equity_quote_returns_price_data(investor_algo_eq, symbol):
    quote = get_quote(investor_algo_eq, symbol)
    print(f"\nEquity ({symbol}):\n" + json.dumps(quote, indent=2))
    assert isinstance(quote, dict)
    assert quote


def test_equity_quote_response_contains_expected_fields(investor_algo_eq):
    quote = get_quote(investor_algo_eq, "PTT")
    expected_fields = {"symbol", "high", "low", "last", "totalVolume"}
    missing = expected_fields - quote.keys()
    print("\nAll fields returned:\n" + json.dumps(quote, indent=2))
    assert not missing, f"Missing fields in response: {missing}"
