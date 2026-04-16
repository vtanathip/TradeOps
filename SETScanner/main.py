from settrade_v2 import Investor
import config


def get_investor() -> Investor:
    return Investor(
        app_id=config.APP_ID,
        app_secret=config.APP_SECRET,
        app_code=config.APP_CODE,
        broker_id=config.BROKER_ID,
        is_auto_queue=False,
    )


def get_quote(investor: Investor, symbol: str) -> dict:
    market_data = investor.MarketData()
    return market_data.get_quote_symbol(symbol=symbol)


def main():
    investor = get_investor()

    symbols = ["PTT", "AOT", "CPALL"]
    for symbol in symbols:
        quote = get_quote(investor, symbol)
        print(f"{symbol}: {quote}")


if __name__ == "__main__":
    main()
