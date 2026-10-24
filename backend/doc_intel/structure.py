"""Lightweight PDF revision and metadata consistency checks."""
import re

import pymupdf


def check_structure(pdf_bytes):
    eof_count = pdf_bytes.count(b"%%EOF")
    inconsistent = eof_count > 1
    details = [f"EOF markers: {eof_count}"]
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        metadata = doc.metadata or {}
        producer = metadata.get("producer") or ""
        mod = metadata.get("modDate") or ""
        created = metadata.get("creationDate") or ""
        doc.close()
        dates = [v for v in (mod, created) if v]
        if producer and len(dates) == 2:
            clean = [re.sub(r"[^0-9]", "", value)[:14] for value in dates]
            if clean[0] != clean[1]:
                inconsistent = True
                details.append("ModDate and CreationDate differ")
    except (pymupdf.FileDataError, ValueError, RuntimeError):
        pass
    return {"name": "pdf_structure", "outcome": "FLAG" if inconsistent else "PASS", "confidence": 0.75,
            "details": "; ".join(details)}
