"""Compare entered, printed, and QR values."""
from rapidfuzz.fuzz import ratio

STRING_FIELDS = ("fdr_number", "bank_ifsc", "favouring", "holder_names")
FIELDS = STRING_FIELDS + ("principal_paise", "issue_date", "maturity_date", "interest_rate_pct")


def _equal(field, left, right):
    if field in STRING_FIELDS:
        return ratio(str(left).casefold(), str(right).casefold()) >= 90
    try:
        return float(left) == float(right)
    except (TypeError, ValueError):
        return str(left) == str(right)


def _compare(a, b):
    return any(field in a and field in b and not _equal(field, a[field], b[field]) for field in FIELDS)


def evaluate(qr_value, text_values, entered, allowed):
    flags = []
    checks = []
    if qr_value is None:
        checks.append({"name": "qr_consistency", "outcome": "NA", "confidence": 0.0, "details": "No QR code found"})
    else:
        diff = _compare(qr_value, entered) or _compare(qr_value, text_values)
        checks.append({"name": "qr_consistency", "outcome": "FLAG" if diff else "PASS", "confidence": 0.99,
                       "details": "QR differs from entered or printed values" if diff else "QR matches available values"})
        if diff:
            flags.append("D-11")
    diff = _compare(text_values, entered)
    checks.append({"name": "text_consistency", "outcome": "FLAG" if diff else "PASS", "confidence": 0.9,
                   "details": "Printed value differs from entered value" if diff else "Printed values match entered values"})
    if diff:
        flags.append("D-10")
    favouring = (qr_value or {}).get("favouring", text_values.get("favouring"))
    is_allowed = favouring is None or any(ratio(str(favouring).casefold(), item.casefold()) >= 90 for item in allowed)
    checks.append({"name": "favouring", "outcome": "PASS" if is_allowed else "FLAG", "confidence": 0.95,
                   "details": "Favouring is allowed" if is_allowed else "Favouring is not in allowed list"})
    if not is_allowed:
        flags.append("D-07")
    return checks, flags
