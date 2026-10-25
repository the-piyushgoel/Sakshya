"""
Cryptographic signing, canonical serialization, and verification code generation
for the Release Letter Subsystem (SRS §7.2, Appendix H).

Features:
- SimulatedSigner: Software Ed25519 keys for Release Authority (Member Secretary)
- Deterministic key derivation for reproducible demo and testing
- RFC 8785 Canonical JSON scheme & SHA-256 payload digest
- Crockford-style verification token generator
"""
import hashlib
import os
import secrets
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519

from app.core.audit import canonical_json

# Crockford Base32 alphabet excluding 0, 1, I, O to eliminate human confusion
_CROCKFORD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

# Key ID constants
RA_KEY_ID = "key-ra1-ed25519"
_RA_SEED = hashlib.sha256(b"sakshya-ra1-release-authority-ed25519-seed-v1").digest()
_RA_PRIVATE_KEY = ed25519.Ed25519PrivateKey.from_private_bytes(_RA_SEED)
_RA_PUBLIC_KEY = _RA_PRIVATE_KEY.public_key()


def generate_verification_code(prefix: str = "SAK-2026") -> str:
    """
    Generate an uppercase, human-friendly, tamper-resistant verification code.
    Format: SAK-2026-XXXX-YYYY (12 random Crockford Base32 characters).
    """
    part1 = "".join(secrets.choice(_CROCKFORD_ALPHABET) for _ in range(4))
    part2 = "".join(secrets.choice(_CROCKFORD_ALPHABET) for _ in range(4))
    if prefix:
        return f"{prefix}-{part1}-{part2}"
    return f"{part1}-{part2}"


def compute_canonical_hash(payload: dict[str, Any]) -> tuple[str, str]:
    """
    Serialize payload to RFC 8785 canonical JSON and compute SHA-256 digest.

    Returns:
        (canonical_json_str, sha256_hex_digest)
    """
    canon_str = canonical_json(payload)
    digest = hashlib.sha256(canon_str.encode("utf-8")).hexdigest()
    return canon_str, digest


class SimulatedSigner:
    """
    Software KMS signer for AICTE Release Authority (SRS Appendix H).
    Performs Ed25519 asymmetric signing over SHA-256 canonical payload digests.
    """

    def __init__(self, private_key: ed25519.Ed25519PrivateKey | None = None, key_id: str = RA_KEY_ID):
        self._private_key = private_key or _RA_PRIVATE_KEY
        self._public_key = self._private_key.public_key()
        self.key_id = key_id

    @property
    def public_key_hex(self) -> str:
        """Hex representation of 32-byte Ed25519 public key."""
        from cryptography.hazmat.primitives import serialization
        raw_bytes = self._public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return raw_bytes.hex()

    def sign_digest(self, digest_hex: str) -> tuple[str, str]:
        """
        Sign a 32-byte SHA-256 digest (in hex) using Ed25519.

        Returns:
            (signature_hex, key_id)
        """
        digest_bytes = bytes.fromhex(digest_hex)
        signature = self._private_key.sign(digest_bytes)
        return signature.hex(), self.key_id

    def verify_digest(self, digest_hex: str, signature_hex: str) -> bool:
        """
        Verify an Ed25519 signature over a 32-byte SHA-256 digest (in hex).

        Returns:
            True if signature is valid, False otherwise.
        """
        try:
            digest_bytes = bytes.fromhex(digest_hex)
            sig_bytes = bytes.fromhex(signature_hex)
            self._public_key.verify(sig_bytes, digest_bytes)
            return True
        except (InvalidSignature, ValueError):
            return False


# Singleton signer for release authority
signer = SimulatedSigner()

