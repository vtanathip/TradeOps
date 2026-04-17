import json
import os

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from polymarket_bot.client import PolymarketClient
from polymarket_bot.market_data import (
    get_active_markets,
    get_midpoint,
    get_order_book,
    get_spread,
)

load_dotenv()
console = Console()


def main() -> None:
    # ------------------------------------------------------------------
    # 1. Fetch active markets from Gamma REST API (no auth)
    # ------------------------------------------------------------------
    console.rule("[bold blue]Polymarket Bot — Market Data Sample")
    console.print("\n[bold]Fetching active markets from Gamma API...[/bold]")

    markets = get_active_markets(limit=5)

    table = Table(title="Active Markets", show_lines=True)
    table.add_column("Question", style="cyan", max_width=60)
    table.add_column("Condition ID", style="dim", max_width=20)
    table.add_column("Token IDs (YES / NO)", style="green")

    for m in markets:
        token_ids = json.loads(m.get("clobTokenIds", "[]"))
        token_str = "\n".join(token_ids) if token_ids else "N/A"
        table.add_row(
            m.get("question", ""),
            m.get("conditionId", "")[:16] + "…",
            token_str,
        )

    console.print(table)

    # ------------------------------------------------------------------
    # 2. Deep-dive on first market using the public CLOB client
    # ------------------------------------------------------------------
    private_key = os.getenv("POLYMARKET_PRIVATE_KEY")  # optional for read-only
    client = PolymarketClient(private_key=private_key)

    if markets:
        first_market = markets[0]
        token_ids: list[str] = json.loads(first_market.get("clobTokenIds", "[]"))
        question = first_market.get("question", "")

        if token_ids:
            yes_token = token_ids[0]
            console.print(f"\n[bold]Deep-dive on:[/bold] {question}")
            console.print(f"YES token_id: {yes_token}\n")

            # Order book
            try:
                book = get_order_book(client.clob, yes_token)
                _print_order_book(book)
            except Exception as exc:
                console.print(f"[yellow]Order book unavailable: {exc}[/yellow]")

            # Midpoint price
            try:
                mid = get_midpoint(client.clob, yes_token)
                console.print(f"[bold]Midpoint price:[/bold] {mid.get('mid', 'N/A')}")
            except Exception as exc:
                console.print(f"[yellow]Midpoint unavailable: {exc}[/yellow]")

            # Spread
            try:
                spread = get_spread(client.clob, yes_token)
                console.print(f"[bold]Spread:[/bold] {spread.get('spread', 'N/A')}")
            except Exception as exc:
                console.print(f"[yellow]Spread unavailable: {exc}[/yellow]")

    console.print("\n[green]Done.[/green]")


def _print_order_book(book) -> None:
    asks = book.asks[:5]
    bids = book.bids[:5]

    t = Table(title="Order Book (top 5)", show_lines=False)
    t.add_column("Side", style="bold")
    t.add_column("Price", justify="right")
    t.add_column("Size", justify="right")

    for a in asks:
        t.add_row("[red]ASK[/red]", a.price, a.size)
    for b in bids:
        t.add_row("[green]BID[/green]", b.price, b.size)

    console.print(t)
