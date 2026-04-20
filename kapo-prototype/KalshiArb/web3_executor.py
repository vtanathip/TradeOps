"""
web3_executor.py — Web3 interaction layer for Polygon Amoy testnet.

Testnet prerequisites:
  - Amoy MATIC for gas: https://faucet.polygon.technology/
  - Test USDC: Aave testnet faucet or https://usdcfaucet.com/

Phase 1: only get_usdc_balance() is called by arb_engine.
sign_order_eip712() and claim_winnings() are structural skeletons
for the next phase when real order submission is wired up.
"""

from __future__ import annotations

from loguru import logger
from web3 import Web3

from config import (
    AMOY_CHAIN_ID,
    CTF_EXCHANGE_ABI_SKELETON,
    EIP712_DOMAIN,
    ERC20_ABI_MINIMAL,
    USDC_ADDRESS,
    settings,
)


class Web3Executor:
    """Wraps a Web3 connection and wallet for Polygon Amoy testnet."""

    def __init__(self) -> None:
        self._w3 = Web3(Web3.HTTPProvider(settings.amoy_rpc_url))

        if not self._w3.is_connected():
            raise ConnectionError(
                f"Cannot connect to Amoy RPC at {settings.amoy_rpc_url!r}. "
                "Check AMOY_RPC_URL in .env."
            )

        actual_chain = self._w3.eth.chain_id
        if actual_chain != AMOY_CHAIN_ID:
            raise ValueError(
                f"Connected to chain {actual_chain}, expected Amoy ({AMOY_CHAIN_ID}). "
                "Update AMOY_RPC_URL in .env."
            )

        logger.info(f"Connected to Polygon Amoy (chain_id={actual_chain})")

        self._account = None
        if settings.wallet_private_key:
            self._account = self._w3.eth.account.from_key(settings.wallet_private_key)
            logger.info(f"Wallet loaded: {self._account.address}")
        else:
            logger.warning("No WALLET_PRIVATE_KEY — on-chain transactions will fail.")

        self._usdc = self._w3.eth.contract(
            address=Web3.to_checksum_address(USDC_ADDRESS),
            abi=ERC20_ABI_MINIMAL,
        )

    # ------------------------------------------------------------------
    # Read-only
    # ------------------------------------------------------------------

    def get_usdc_balance(self, address: str | None = None) -> float:
        """
        Return USDC balance as a human-readable float (6 decimals).

        Uses the wallet address loaded from WALLET_PRIVATE_KEY, or the
        explicit `address` argument, or WALLET_ADDRESS from env — in that order.

        Returns 0.0 on error (e.g. USDC contract not yet verified on Amoy).
        """
        target = (
            address
            or (self._account.address if self._account else None)
            or settings.wallet_address
        )
        if not target:
            logger.error("get_usdc_balance: no address available.")
            return 0.0

        try:
            checksum = Web3.to_checksum_address(target)
            raw: int = self._usdc.functions.balanceOf(checksum).call()
            balance = raw / 10 ** 6
            logger.debug(f"USDC balance for {checksum}: {balance:.4f}")
            return balance
        except Exception as exc:
            logger.error(f"get_usdc_balance({target!r}) failed: {exc}")
            return 0.0

    # ------------------------------------------------------------------
    # Skeleton: EIP-712 order signing (phase 2)
    # ------------------------------------------------------------------

    def sign_order_eip712(self, order_data: dict) -> str:
        """
        Sign an order using EIP-712 structured data.

        SKELETON — returns a zero-byte placeholder signature.
        Full implementation: use web3.py >= 6 sign_typed_data() with
        the typed_data structure below once CTF_EXCHANGE_ADDRESS is set.
        """
        if not self._account:
            raise RuntimeError("Wallet private key not loaded.")

        typed_data = {
            "domain": EIP712_DOMAIN,
            "types": {
                "EIP712Domain": [
                    {"name": "name",              "type": "string"},
                    {"name": "version",           "type": "string"},
                    {"name": "chainId",           "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                "Order": [
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
                ],
            },
            "primaryType": "Order",
            "message": order_data,
        }

        # TODO: sig = self._w3.eth.account.sign_typed_data(typed_data, self._account.key)
        #       return sig.signature.hex()
        logger.warning("sign_order_eip712 is a skeleton — no real signature computed.")
        return "0x" + "00" * 65

    # ------------------------------------------------------------------
    # Skeleton: claim CTF winnings (phase 2)
    # ------------------------------------------------------------------

    def claim_winnings(self, condition_id: str, token_id: str) -> str:
        """
        Redeem winning outcome tokens after market resolution.

        SKELETON — no transaction is submitted.
        Full implementation requires:
          1. ERC-1155 setApprovalForAll on the CTF contract
          2. CTF.redeemPositions(collateralToken, parentCollectionId, conditionId, indexSets)
        """
        if not self._account:
            raise RuntimeError("Wallet private key not loaded.")

        logger.warning(
            f"claim_winnings({condition_id!r}, {token_id!r}) is a skeleton — "
            "no transaction submitted."
        )
        return "0x" + "00" * 32
