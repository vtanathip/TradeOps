"""Integration tests — hit the real Settrade UAT API."""
import pytest
from main import get_investor, get_quote


@pytest.fixture(scope="module")
def investor():
    return get_investor()


def test_investor_login(investor):
    assert investor is not None


def test_get_quote_ptt(investor):
    quote = get_quote(investor, "PTT")
    assert isinstance(quote, dict)
    assert quote, "Response should not be empty"
    print("\nPTT quote:", quote)


def test_get_quote_aot(investor):
    quote = get_quote(investor, "AOT")
    assert isinstance(quote, dict)
    assert quote
    print("\nAOT quote:", quote)


def test_get_quote_cpall(investor):
    quote = get_quote(investor, "CPALL")
    assert isinstance(quote, dict)
    assert quote
    print("\nCPALL quote:", quote)


def test_quote_has_expected_fields(investor):
    quote = get_quote(investor, "PTT")
    # Print all keys so we can discover the response schema
    print("\nResponse keys:", list(quote.keys()))
    # At minimum a quote should have some kind of price or symbol field
    assert len(quote) > 0
