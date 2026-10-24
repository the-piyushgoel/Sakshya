import hashlib
import hmac
import os
import re


def fingerprint(fdr_number: str, bank_id: str) -> str:
    normalised = re.sub(r"[^A-Z0-9]", "", str(fdr_number).upper()) + str(bank_id)
    key = os.getenv("FINGERPRINT_KEY", "sakshya-dev-fingerprint-key").encode()
    return hmac.new(key, normalised.encode(), hashlib.sha256).hexdigest()
