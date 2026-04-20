from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    amoy_rpc_url: str = "https://rpc-amoy.polygon.technology"
    wallet_private_key: str = ""
    wallet_address: str = ""
    kalshi_api_key: str = ""
    watch_list: str = ""


settings = Settings()

WATCH_TICKERS: list[str] = [
    t.strip() for t in settings.watch_list.split(",") if t.strip()
]

# ---------------------------------------------------------------------------
# Polygon Amoy testnet (chain_id = 80002)
# ---------------------------------------------------------------------------

AMOY_CHAIN_ID = 80002

# IMPORTANT: Verify these addresses on https://amoy.polygonscan.com/ before use.
# The mainnet USDC address (0x2791...) does NOT exist on Amoy.
# Likely Amoy USDC (Circle testnet): confirm at https://developers.circle.com/stablecoins/docs/usdc-on-test-networks
USDC_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"  # VERIFY before use

# Polymarket CTF and Exchange on Amoy — check deployments JSON at:
# https://github.com/Polymarket/ctf-exchange/tree/main/deployments
CTF_ADDRESS = "0x0000000000000000000000000000000000000000"           # PLACEHOLDER
CTF_EXCHANGE_ADDRESS = "0x0000000000000000000000000000000000000000"  # PLACEHOLDER

# ---------------------------------------------------------------------------
# ABIs
# ---------------------------------------------------------------------------

ERC20_ABI_MINIMAL = [
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
    },
]

# Skeleton ABI — full ABI at https://github.com/Polymarket/ctf-exchange/blob/main/abi/CTFExchange.json
CTF_EXCHANGE_ABI_SKELETON = [
    {
        "name": "fillOrder",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {
                "name": "order",
                "type": "tuple",
                "components": [
                    {"name": "salt",          "type": "uint256"},
                    {"name": "maker",         "type": "address"},
                    {"name": "signer",        "type": "address"},
                    {"name": "taker",         "type": "address"},
                    {"name": "tokenId",       "type": "uint256"},
                    {"name": "makerAmount",   "type": "uint256"},
                    {"name": "takerAmount",   "type": "uint256"},
                    {"name": "expiration",    "type": "uint256"},
                    {"name": "nonce",         "type": "uint256"},
                    {"name": "feeRateBps",    "type": "uint256"},
                    {"name": "side",          "type": "uint8"},
                    {"name": "signatureType", "type": "uint8"},
                    {"name": "signature",     "type": "bytes"},
                ],
            },
            {"name": "fillAmount", "type": "uint256"},
        ],
        "outputs": [],
    },
]

EIP712_DOMAIN = {
    "name": "CTF Exchange",
    "version": "1",
    "chainId": AMOY_CHAIN_ID,
    "verifyingContract": CTF_EXCHANGE_ADDRESS,
}
