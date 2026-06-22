#!/usr/bin/env python3
"""Verify an IBKR *paper* account: connect, read account/positions, and prove
buy/sell order entry works by placing a BUY and a SELL limit order far from
market (so they never fill), confirming each is accepted, then cancelling.

Safe to run any time of day — takes no real position.

TWS must allow API order entry first (one-time, in the app):
  Global Configuration -> API -> Settings
    [x] Enable ActiveX and Socket Clients
    Socket port = 7497   (TWS paper; live is 7496, IB Gateway paper is 4002)
    [ ] Read-Only API    <- must be UNCHECKED to place orders
    Trusted IPs: add 127.0.0.1 (optional; skips the accept-connection popup)
  ...and be logged into the PAPER account.

Run:  uv run python verify_ibkr.py
Config via env / .env: IBKR_HOST, IBKR_PORT, IBKR_CLIENT_ID, IBKR_SYMBOL.
"""
import math
import os

from dotenv import load_dotenv
from ib_async import IB, LimitOrder, Stock

ACCEPTED = {"Submitted", "PreSubmitted", "PendingSubmit", "Filled"}
CANCELLED = {"Cancelled", "ApiCancelled", "PendingCancel"}


def _num(x):
    """Return x if it's a real number, else None (IB returns nan for no data)."""
    return x if isinstance(x, (int, float)) and not math.isnan(x) else None


def reference_price(ib, contract):
    """Anchor price for the test orders. Delayed-frozen data (type 4) is free and
    needs no subscription; falls back to a fixed price if nothing comes back."""
    ib.reqMarketDataType(4)
    ticker = ib.reqMktData(contract, "", False, False)
    try:
        for _ in range(8):
            ib.sleep(0.5)
            px = _num(ticker.marketPrice()) or _num(ticker.last) or _num(ticker.close)
            if px:
                return px, "delayed"
        return 100.0, "fallback"  # ponytail: limits sit ±15% off this; still won't fill
    finally:
        ib.cancelMktData(contract)


def place_and_cancel(ib, contract, action, price):
    """Place a 1-share limit order, assert it's accepted, then cancel it."""
    order = LimitOrder(action, 1, price)
    trade = ib.placeOrder(contract, order)
    for _ in range(10):
        ib.sleep(0.5)
        if trade.orderStatus.status in ACCEPTED | CANCELLED | {"Inactive"}:
            break
    accepted = trade.orderStatus.status
    assert accepted in ACCEPTED, (
        f"{action} order not accepted (status={accepted!r}). "
        f"Reasons: {[e.message for e in trade.log]}"
    )

    ib.cancelOrder(order)
    for _ in range(10):
        ib.sleep(0.5)
        if trade.orderStatus.status in CANCELLED:
            break
    print(f"✅ {action:4} 1 {contract.symbol} LMT {price:.2f} "
          f"-> {accepted} -> {trade.orderStatus.status}")


def main():
    load_dotenv()
    host = os.environ.get("IBKR_HOST", "127.0.0.1")
    port = int(os.environ.get("IBKR_PORT", "7497"))
    client_id = int(os.environ.get("IBKR_CLIENT_ID", "1"))
    symbol = os.environ.get("IBKR_SYMBOL", "AAPL")

    ib = IB()
    try:
        ib.connect(host, port, clientId=client_id, timeout=15)
    except Exception as e:
        print(f"❌ Could not connect to TWS at {host}:{port} (clientId {client_id}): {e}")
        print("   Check: TWS running, 'Enable ActiveX and Socket Clients' on, "
              "port matches (7497 paper / 7496 live), clientId not already in use.")
        raise SystemExit(1)
    print(f"✅ Connected to TWS {host}:{port} (clientId {client_id})")

    try:
        summary = {v.tag: v.value for v in ib.accountSummary()}
        assert summary, "accountSummary() returned nothing — account not reachable"
        acct = (ib.managedAccounts() or ["?"])[0]

        def money(tag):
            v = summary.get(tag)
            return f"{float(v):,.0f}" if v else "n/a"

        print(f"✅ Account {acct}  NetLiq={money('NetLiquidation')}  "
              f"Available={money('AvailableFunds')}  BuyingPower={money('BuyingPower')}")
        if not acct.startswith("D"):
            print("   ⚠️  account id doesn't look like paper (paper ids start with 'D').")
        positions = ib.positions()
        print("   Positions: " + (", ".join(
            f"{p.position:+g} {p.contract.symbol}" for p in positions) or "none"))

        contract = Stock(symbol, "SMART", "USD")
        assert ib.qualifyContracts(contract), f"could not qualify contract for {symbol}"
        ref, src = reference_price(ib, contract)
        print(f"   {symbol} ref price ~{ref:.2f} ({src})")

        place_and_cancel(ib, contract, "BUY", round(ref * 0.85, 2))
        place_and_cancel(ib, contract, "SELL", round(ref * 1.15, 2))

        print("✅ ALL CHECKS PASSED — paper account reachable and accepts buy/sell orders")
    except AssertionError as e:
        print(f"❌ Check failed: {e}")
        raise SystemExit(1)
    finally:
        ib.disconnect()


if __name__ == "__main__":
    main()
