"""PDF text extraction and simple label based FDR field parsing."""
import re

import pymupdf


def extract_text(pdf_bytes):
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        text_parts, pages = [], []
        for page in doc:
            text_parts.append(page.get_text())
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
            pages.append(pix.tobytes("png"))
        return "\n".join(text_parts), pages
    finally:
        doc.close()


def extract_values(text):
    patterns = {
        "fdr_number": r"(?:FDR\s*(?:Number|No\.?))\s*[:#-]?\s*([A-Z0-9-]+)",
        "bank_ifsc": r"(?:IFSC)\s*[:#-]?\s*([A-Z0-9]{11})",
        "issue_date": r"(?:Issue\s*Date)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})",
        "maturity_date": r"(?:Maturity\s*Date)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})",
        "interest_rate_pct": r"(?:Interest\s*Rate)\s*[:#-]?\s*([\d.]+)\s*%?",
        "favouring": r"(?:Favouring)\s*[:#-]?\s*(.+)",
        "holder_names": r"(?:Holder\s*Names?)\s*[:#-]?\s*(.+)",
    }
    out = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            out[key] = float(match.group(1)) if key == "interest_rate_pct" else match.group(1).strip()
    match = re.search(r"(?:Principal|Amount)\s*[:#-]?\s*(?:INR\s*)?([\d,]+(?:\.\d{1,2})?)", text, re.IGNORECASE)
    if match:
        out["principal_paise"] = round(float(match.group(1).replace(",", "")) * 100)
    return out
