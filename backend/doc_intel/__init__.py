"""Standalone FDR document analysis helpers."""

from .consistency import evaluate
from .qr import decode_qr
from .structure import check_structure
from .text_extract import extract_text, extract_values


def analyze(pdf_bytes: bytes, entered: dict, allowed_favouring: list[str] | None = None) -> dict:
    """Extract FDR fields and report consistency and structure indicators."""
    try:
        if not isinstance(pdf_bytes, bytes) or not pdf_bytes or not pdf_bytes.startswith(b"%PDF-"):
            raise ValueError("Input is not a PDF")
        text, pages = extract_text(pdf_bytes)
        if not text.strip():
            raise ValueError("PDF contains no extractable text")
        qr_value = decode_qr(pages)
        text_values = extract_values(text)
        extracted = {}
        for field in (
            "fdr_number", "bank_ifsc", "principal_paise", "issue_date",
            "maturity_date", "interest_rate_pct", "favouring", "holder_names",
        ):
            value = qr_value.get(field) if qr_value and field in qr_value else text_values.get(field)
            if value is not None:
                extracted[field] = {"value": value, "confidence": 0.99 if qr_value and field in qr_value else 0.9,
                                    "source": "QR" if qr_value and field in qr_value else "TEXT"}
        checks, flags = evaluate(qr_value, text_values, entered or {}, allowed_favouring or ["Member Secretary, AICTE"])
        checks.append(check_structure(pdf_bytes))
        if checks[-1]["outcome"] == "FLAG":
            flags.append("D-12")
        return {"extracted": extracted, "checks": checks,
                "flags": [f for f in ("D-07", "D-10", "D-11", "D-12") if f in flags]}
    except Exception as exc:  # noqa: BLE001 - public API must convert every failure to ERROR
        return {"extracted": {}, "checks": [{"name": "document_analysis", "outcome": "ERROR",
                "confidence": 0.0, "details": str(exc)}], "flags": []}
