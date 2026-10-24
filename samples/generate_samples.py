"""Generate deterministic fictional FDR PDFs for document-intel tests."""
import json
import re
from pathlib import Path

import pymupdf
import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sample_constants import (
    ALLOWED_FAVOURING,
    BANK_IFSC,
    HOLDERS,
    INTEREST_RATE,
    ISSUE_DATE,
    MATURITY_DATE,
    PRINCIPAL_RUPEES,
    SEED_VJ_FDR_NUMBER,
)

SAMPLES = {
    "fdr_genuine_aryabhatta.pdf": ("BRB-FDR-2024-000101", PRINCIPAL_RUPEES, PRINCIPAL_RUPEES, ALLOWED_FAVOURING),
    "fdr_tampered_amount.pdf": ("BRB-FDR-2024-000102", PRINCIPAL_RUPEES, "2600000.00", ALLOWED_FAVOURING),
    "fdr_wrong_favouring.pdf": ("BRB-FDR-2024-000103", PRINCIPAL_RUPEES, PRINCIPAL_RUPEES, "Secretary, Example Board"),
    "fdr_duplicate_vidyajyoti.pdf": (SEED_VJ_FDR_NUMBER, PRINCIPAL_RUPEES, PRINCIPAL_RUPEES, ALLOWED_FAVOURING),
}


def _payload(number, amount, favouring):
    return {"v": 1, "fdr": number, "ifsc": BANK_IFSC, "principal": amount,
            "issue": ISSUE_DATE, "maturity": MATURITY_DATE, "fav": favouring}


def generate_samples(output_dir=None):
    out = Path(output_dir) if output_dir else Path(__file__).parent / "out"
    out.mkdir(parents=True, exist_ok=True)
    for filename, (number, qr_amount, printed_amount, favouring) in SAMPLES.items():
        payload = json.dumps(_payload(number, qr_amount, favouring), separators=(",", ":"), sort_keys=True)
        qr = qrcode.QRCode(box_size=1, border=4)
        qr.add_data(payload)
        qr.make(fit=True)
        qr_matrix = qr.get_matrix()
        path = out / filename
        pdf = canvas.Canvas(str(path), pagesize=A4, invariant=1)
        pdf.setTitle("Fixed Deposit Receipt")
        pdf.setAuthor("Example Bank")
        pdf.setFont("Helvetica", 12)
        rows = [f"FDR Number: {number}", f"IFSC: {BANK_IFSC}", f"Principal: INR {printed_amount}",
                f"Issue Date: {ISSUE_DATE}", f"Maturity Date: {MATURITY_DATE}",
                f"Interest Rate: {INTEREST_RATE}%", f"Favouring: {favouring}", f"Holder Names: {HOLDERS}"]
        for index, row in enumerate(rows):
            pdf.drawString(55, 780 - index * 28, row)
        module = 150 / len(qr_matrix)
        pdf.setFillColorRGB(0, 0, 0)
        for row_index, row in enumerate(qr_matrix):
            for column_index, dark in enumerate(row):
                if dark:
                    pdf.rect(55 + column_index * module, 430 + (len(qr_matrix) - row_index - 1) * module,
                             module, module, stroke=0, fill=1)
        pdf.save()
    _make_incremental(out)
    return [out / name for name in (*SAMPLES, "fdr_edited_incremental.pdf")]


def _make_incremental(out):
    src = out / "fdr_genuine_aryabhatta.pdf"
    dst = out / "fdr_edited_incremental.pdf"
    dst.write_bytes(src.read_bytes())
    doc = pymupdf.open(dst)
    meta = doc.metadata
    meta["producer"] = "Example Bank edited"
    meta["modDate"] = "D:20261024000000Z"
    doc.set_metadata(meta)
    doc.save(dst, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
    doc.close()
    data = dst.read_bytes()
    data = re.sub(rb"(/ID\s*\[<[0-9A-Fa-f]+><)[0-9A-Fa-f]+(>\])",
                  rb"\g<1>00000000000000000000000000000000\2", data)
    dst.write_bytes(data)


if __name__ == "__main__":
    generate_samples()
