"""Integration tests — hit the real Settrade API (broker: Pi Securities 003).

Pi Securities supports:
  - Derivatives Market Data  ✓
  - Derivatives Order API    ✓
  - Equity Market Data       ✗  (GWD-07 expected)
  - Equity Order API         ✗
"""
import json
import pytest
from settrade_v2.errors import SettradeError
from main import get_investor, get_quote


@pytest.fixture(scope="module")
def investor():
    try:
        return get_investor()
    except Exception as e:
        pytest.skip(f"Pi Securities credentials not configured or invalid: {e}")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_login_with_production_credentials_succeeds(investor):
    assert investor is not None


# ---------------------------------------------------------------------------
# Derivatives market data (supported by Pi Securities)
# ---------------------------------------------------------------------------

def test_set50_futures_quote_returns_price_data(investor):
    quote = get_quote(investor, "S50M26")
    print("\nSET50 Futures (S50M26):\n" + json.dumps(quote, indent=2))
    assert isinstance(quote, dict)
    assert quote


def test_gold_futures_quote_returns_price_data(investor):
    quote = get_quote(investor, "GFM26")
    print("\nGold Futures (GFM26):\n" + json.dumps(quote, indent=2))
    assert isinstance(quote, dict)
    assert quote


def test_futures_quote_response_contains_expected_fields(investor):
    quote = get_quote(investor, "S50M26")
    expected_fields = {"symbol", "instrumentType", "high", "low", "last",
                       "totalVolume", "expDate", "openInterest"}
    missing = expected_fields - quote.keys()
    print("\nAll fields returned:\n" + json.dumps(quote, indent=2))
    assert not missing, f"Missing fields in response: {missing}"


# ---------------------------------------------------------------------------
# Equity market data — Pi Securities does NOT support this (negative tests)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("symbol", ["PTT", "AOT", "CPALL"])
def test_equity_quote_is_denied_for_pi_securities_broker(investor, symbol):
    """Pi Securities (003) does not have Equity Market Data permission — expect GWD-07."""
    with pytest.raises(SettradeError) as exc_info:
        get_quote(investor, symbol)
    assert exc_info.value.code == "GWD-07", (
        f"Expected GWD-07 for equity symbol {symbol}, got {exc_info.value.code}"
    )
