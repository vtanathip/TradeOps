# set-mcp Integration

[set-mcp](https://github.com/batprem/set-mcp) provides annual financial statements for SET-listed stocks scraped from the public [settrade.com](https://www.settrade.com) website.

It works in two modes inside this project:

| Mode | How | Use case |
|---|---|---|
| MCP server | Claude Code reads `.mcp.json` and spawns `uvx set-mcp` | Ask Claude to analyse financials in conversation |
| Python import | `from set_mcp.settrade_scraper import get_financial_statement_from_year` | Fetch fundamentals inside your own scripts/tests |

No Settrade API credentials are required — data is scraped from public pages.

## How it complements the Settrade Open API

The two data sources cover different needs:

| | `settrade-v2` (Settrade Open API) | `set_mcp` |
|---|---|---|
| Data | Real-time quotes, order book | Annual income statement, balance sheet, cash flow |
| Credentials | Required (broker API key) | None |
| Stock coverage | Depends on broker permission scope | All SET-listed equities |
| Typical use | Trading signals, order placement | Fundamental analysis, screening |

## Setup

### 1. MCP server (Claude Code)

`.mcp.json` at the project root is already configured:

```json
{
  "mcpServers": {
    "set_mcp": {
      "command": "C:\\Users\\mart_\\.local\\bin\\uvx.exe",
      "args": ["set-mcp"]
    }
  }
}
```

Restart Claude Code to activate. On first run `uvx` downloads and caches the package automatically.

### 2. Python package

`set-mcp` is listed in `pyproject.toml` and installed when you run:

```sh
uv sync
```

## Usage

### In Claude Code (MCP tool)

Once the MCP server is active you can ask Claude directly:

> "Get PTT's financial statements from 2022 to 2024"  
> "Compare SCB and KBANK net profit over the last 3 years"  
> "Is AOT's debt-to-equity improving? Check 2021–2024"

Claude calls `get_financial_statement` with `symbol`, `from_year`, `to_year` and returns the formatted data.

### In Python

```python
import asyncio
from set_mcp.settrade_scraper import get_financial_statement_from_year

result = asyncio.run(get_financial_statement_from_year("PTT", 2022, 2024))

print(result["income_statement"])     # pipe-delimited CSV
print(result["balance_sheet"])
print(result["cash_flow_statement"])
print(result["business_type"])        # company business description (Thai)
```

#### Return type

`get_financial_statement_from_year` returns a `FinancialStatement` TypedDict:

```python
class FinancialStatement(TypedDict):
    business_type: Optional[str]      # business description (Thai language)
    income_statement: str             # pipe-delimited CSV, unit: Million THB
    balance_sheet: str                # pipe-delimited CSV, unit: Million THB
    cash_flow_statement: str          # pipe-delimited CSV, unit: Million THB
```

Each CSV string has the columns `accountCode|accountName|<year>|<year>|...`.

#### Example output (income statement header)

```
accountCode|accountName|2023|2024
409996|net profit for the period|78383.86|73854.58
410101|revenue from sales and services|1890654.38|1768847.16
...
```

### Combining with real-time quotes

```python
import asyncio
from set_mcp.settrade_scraper import get_financial_statement_from_year
from main import get_investor, get_quote

symbol = "S50M26"   # Derivatives work with Pi Securities

investor = get_investor()
realtime = get_quote(investor, symbol)          # live price from Settrade API
fundamentals = asyncio.run(                     # annual fundamentals from set_mcp
    get_financial_statement_from_year("PTT", 2023, 2024)
)
```

> Pi Securities (broker 003) only supports derivatives quotes. For equity real-time quotes alongside fundamentals, switch to INVX (023) — see the [broker scope table](../README.md#6-run-integration-tests) in the main README.

## Tests

```sh
uv run pytest tests/test_set_mcp_integration.py -v
```

Tests cover:
- Response structure (all four keys present, pipe-delimited CSV format)
- Key account codes in each statement (revenue, net profit, total assets, equity, operating cash flow)
- Single-year vs multi-year ranges
- Multiple symbols: PTT, SCB, AOT, CPALL, KBANK

All 15 tests hit the live settrade.com website. No credentials needed.

## Key account codes reference

| Code | Statement | Description |
|---|---|---|
| `410101` | Income | Revenue from sales and services |
| `409996` | Income | Net profit for the period |
| `409992` | Income | EBIT (profit before finance cost and tax) |
| `109999` | Balance sheet | Total assets |
| `119999` | Balance sheet | Total current assets |
| `129999` | Balance sheet | Total non-current assets |
| `209999` | Balance sheet | Total liabilities |
| `309998` | Balance sheet | Total shareholders' equity |
| `519999` | Cash flow | Net cash from operating activities |
| `529999` | Cash flow | Net cash from investing activities |
| `539999` | Cash flow | Net cash from financing activities |
| `509999` | Cash flow | Net increase / (decrease) in cash |
