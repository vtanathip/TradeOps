"""Integration tests for set_mcp financial statement scraping.

set_mcp scrapes annual financial statements (income statement, balance sheet,
cash flow) from public settrade.com pages — no API credentials required.
This complements the real-time Settrade Open API quotes in main.py:

  main.py / settrade-v2  →  real-time quotes, order placement
  set_mcp                →  annual fundamentals (revenue, assets, cash flow)

All tests hit the live settrade.com website.
"""
import asyncio
import sys
import pytest
from set_mcp.settrade_scraper import FinancialStatement, get_financial_statement_from_year


def _puts(text: str) -> None:
    """Print UTF-8 text safely on Windows terminals (avoids cp1252 crash)."""
    sys.stdout.buffer.write((text + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()


# ---------------------------------------------------------------------------
# Shared fixture — fetch PTT 2023–2024 once for the whole module
# ---------------------------------------------------------------------------

def _print_statements(symbol: str, result: FinancialStatement) -> None:
    _puts(f"\n{'='*60}")
    _puts(f"  {symbol} — Business Type")
    _puts(f"{'='*60}")
    _puts(result["business_type"] or "(none)")

    for label, key in [
        ("Income Statement", "income_statement"),
        ("Balance Sheet", "balance_sheet"),
        ("Cash Flow Statement", "cash_flow_statement"),
    ]:
        lines = result[key].splitlines()
        _puts(f"\n--- {label} ({len(lines)-1} rows) ---")
        _puts(lines[0])           # header
        for line in lines[1:]:    # data rows
            _puts(line)


@pytest.fixture(scope="module")
def ptt_financials() -> FinancialStatement:
    result = asyncio.run(get_financial_statement_from_year("PTT", 2023, 2024))
    _print_statements("PTT 2023–2024", result)
    return result


# ---------------------------------------------------------------------------
# Response structure
# ---------------------------------------------------------------------------

def test_response_has_all_required_keys(ptt_financials):
    assert set(ptt_financials.keys()) == {
        "business_type",
        "income_statement",
        "balance_sheet",
        "cash_flow_statement",
    }


def test_income_statement_csv_has_year_columns(ptt_financials):
    header = ptt_financials["income_statement"].splitlines()[0]
    assert "2023" in header and "2024" in header


def test_balance_sheet_csv_has_year_columns(ptt_financials):
    header = ptt_financials["balance_sheet"].splitlines()[0]
    assert "2023" in header and "2024" in header


def test_cash_flow_csv_has_year_columns(ptt_financials):
    header = ptt_financials["cash_flow_statement"].splitlines()[0]
    assert "2023" in header and "2024" in header


def test_csv_delimiter_is_pipe(ptt_financials):
    first_line = ptt_financials["income_statement"].splitlines()[0]
    assert "|" in first_line


# ---------------------------------------------------------------------------
# Key account codes present in each statement
# ---------------------------------------------------------------------------

def test_income_statement_contains_revenue_line(ptt_financials):
    # accountCode 410100 = revenue from sales and services
    assert "410100" in ptt_financials["income_statement"]


def test_income_statement_contains_net_profit_line(ptt_financials):
    # accountCode 409996 = net profit for the period
    assert "409996" in ptt_financials["income_statement"]


def test_balance_sheet_contains_total_assets(ptt_financials):
    # accountCode 109999 = total assets
    assert "109999" in ptt_financials["balance_sheet"]


def test_balance_sheet_contains_total_equity(ptt_financials):
    # accountCode 309998 = total shareholders' equity
    assert "309998" in ptt_financials["balance_sheet"]


def test_cash_flow_contains_operating_activities(ptt_financials):
    # accountCode 519999 = net cash from operating activities
    assert "519999" in ptt_financials["cash_flow_statement"]


# ---------------------------------------------------------------------------
# Business type
# ---------------------------------------------------------------------------

def test_business_type_is_populated(ptt_financials):
    assert ptt_financials["business_type"] is not None
    assert len(ptt_financials["business_type"]) > 0


# ---------------------------------------------------------------------------
# Single-year range
# ---------------------------------------------------------------------------

def test_single_year_returns_one_amount_column():
    result = asyncio.run(get_financial_statement_from_year("SCB", 2024, 2024))
    _print_statements("SCB 2024", result)
    header = result["income_statement"].splitlines()[0]
    assert "2024" in header
    assert "2023" not in header


# ---------------------------------------------------------------------------
# Other major SET symbols
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("symbol", ["AOT", "CPALL", "KBANK"])
def test_major_set_stocks_return_all_statements(symbol):
    result = asyncio.run(get_financial_statement_from_year(symbol, 2024, 2024))
    _print_statements(f"{symbol} 2024", result)
    assert result["income_statement"], f"{symbol}: income statement is empty"
    assert result["balance_sheet"], f"{symbol}: balance sheet is empty"
    assert result["cash_flow_statement"], f"{symbol}: cash flow is empty"
