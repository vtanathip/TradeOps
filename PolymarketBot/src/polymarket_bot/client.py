from py_clob_client.client import ClobClient

# Public CLOB host — no auth needed for read-only methods
CLOB_HOST = "https://clob.polymarket.com"
CHAIN_ID = 137  # Polygon mainnet


class PolymarketClient:
    """Thin wrapper around py-clob-client for market data access."""

    def __init__(self, private_key: str | None = None) -> None:
        if private_key:
            self._clob = ClobClient(
                host=CLOB_HOST,
                key=private_key,
                chain_id=CHAIN_ID,
            )
            creds = self._clob.create_or_derive_api_creds()
            self._clob.set_api_creds(creds)
        else:
            # Public read-only client — no wallet required
            self._clob = ClobClient(host=CLOB_HOST, chain_id=CHAIN_ID)

    @property
    def clob(self) -> ClobClient:
        return self._clob
