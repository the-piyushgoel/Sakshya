"""
ReportLab PDF and QR Code Generator for Signed Release Letters (§7.2, §1.3).

Generates official government-grade release authorization certificates with:
- Formal AICTE national letterhead
- Structured tabular settlement breakdown
- Dynamic QR code linking to the public verification portal
- SHA-256 cryptographic fingerprint and Ed25519 digital signature metadata
- Light watermark indicating demo/simulated status
"""
from datetime import datetime
import io
import os
from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.modules.release.models import ReleaseLetter

# Color palette: Govt Navy, Saffron, Charcoal
NAVY = colors.HexColor("#0D233A")
SAFFRON = colors.HexColor("#E65100")
CHARCOAL = colors.HexColor("#263238")
LIGHT_BG = colors.HexColor("#F8FAFC")
BORDER_COLOR = colors.HexColor("#CBD5E1")
MUTED_TEXT = colors.HexColor("#64748B")


def format_inr(paise: int) -> str:
    """Format paise into Indian Rupee format (e.g. 450000000 -> ₹ 45,00,000.00)."""
    rupees = paise / 100.0
    s = f"{rupees:,.2f}"
    # Replace standard comma separation with Indian numbering if desired, or standard commas
    return f"INR {s}"


class NumberedCanvas(canvas.Canvas):
    """Canvas with diagonal watermark and formal footer."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_watermark()
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_watermark(self):
        self.saveState()
        self.setFont("Helvetica-Bold", 38)
        self.setFillColor(colors.HexColor("#E2E8F0"), alpha=0.35)
        self.translate(A4[0] / 2.0, A4[1] / 2.0)
        self.rotate(45)
        self.drawCentredString(0, 0, "DEMO · SIMULATED SIGNATURE")
        self.restoreState()

    def draw_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(MUTED_TEXT)
        footer_text = "Sakshya v1.0 National FDR Repository — AICTE Statutory Release Portal — Single Use Authorization"
        self.drawString(40, 25, footer_text)
        self.drawRightString(A4[0] - 40, 25, f"Page {self._pageNumber} of {page_count}")
        self.setStrokeColor(BORDER_COLOR)
        self.setLineWidth(0.5)
        self.line(40, 35, A4[0] - 40, 35)
        self.restoreState()


def generate_qr_image(verify_url: str) -> io.BytesIO:
    """Generate high-density QR code image in memory."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=1,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0D233A", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def generate_release_letter_pdf(
    letter: ReleaseLetter,
    institute_name: str,
    trust_name: str,
    bank_name: str,
    base_url: str | None = None,
) -> bytes:
    """
    Render binary PDF for a digitally signed release letter.

    Produces a tamper-evident document with:
    - Official letterhead and metadata
    - FDR particulars and beneficiary breakdown
    - Dynamic verification QR code
    - Cryptographic SHA-256 fingerprint & Ed25519 signature hex
    """
    public_base = base_url or os.getenv("PUBLIC_BASE_URL", "http://localhost:5173")
    short_hash = letter.letter_hash[:8]
    verify_url = f"{public_base}/verify/{letter.verification_code}?h={short_hash}"

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=35,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()
    normal = styles["Normal"]

    style_org_title = ParagraphStyle(
        "OrgTitle",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=NAVY,
        alignment=1,  # Center
    )
    style_org_sub = ParagraphStyle(
        "OrgSub",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=CHARCOAL,
        alignment=1,
    )
    style_doc_title = ParagraphStyle(
        "DocTitle",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=SAFFRON,
        alignment=1,
    )
    style_meta_label = ParagraphStyle(
        "MetaLabel",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=MUTED_TEXT,
    )
    style_meta_val = ParagraphStyle(
        "MetaVal",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=NAVY,
    )
    style_cell_label = ParagraphStyle(
        "CellLabel",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=CHARCOAL,
    )
    style_cell_val = ParagraphStyle(
        "CellVal",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=CHARCOAL,
    )
    style_code_font = ParagraphStyle(
        "CodeFont",
        parent=normal,
        fontName="Courier",
        fontSize=7.5,
        leading=9.5,
        textColor=CHARCOAL,
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("ALL INDIA COUNCIL FOR TECHNICAL EDUCATION", style_org_title))
    story.append(Paragraph("(A Statutory Body under Ministry of Education, Govt. of India)<br/>Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070", style_org_sub))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=NAVY, spaceAfter=8))
    story.append(Paragraph("OFFICIAL FIXED DEPOSIT RELEASE & SETTLEMENT AUTHORISATION", style_doc_title))
    story.append(Spacer(1, 8))

    # 2. Key Metadata Block
    issued_str = letter.issued_at.strftime("%d-%b-%Y %H:%M UTC") if letter.issued_at else "N/A"
    valid_str = letter.valid_until.strftime("%d-%b-%Y %H:%M UTC") if letter.valid_until else "N/A"

    meta_data = [
        [
            Paragraph("VERIFICATION CODE", style_meta_label),
            Paragraph(letter.verification_code, style_meta_val),
            Paragraph("LETTER ID", style_meta_label),
            Paragraph(letter.id, style_code_font),
        ],
        [
            Paragraph("DATE OF ISSUANCE", style_meta_label),
            Paragraph(issued_str, style_cell_val),
            Paragraph("VALID UNTIL", style_meta_label),
            Paragraph(f"<font color='#B91C1C'><b>{valid_str}</b></font> (14 Days)", style_cell_val),
        ],
        [
            Paragraph("AUTHORIZATION STATE", style_meta_label),
            Paragraph(f"<b>{letter.state}</b>", style_cell_val),
            Paragraph("AUTHORITY ROLE", style_meta_label),
            Paragraph("RELEASE_AUTHORITY (Member Secretary)", style_cell_val),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[110, 150, 100, 155])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # 3. Institute & Obligation Particulars
    inst_data = [
        [Paragraph("Institute Name", style_cell_label), Paragraph(institute_name, style_cell_val)],
        [Paragraph("Sponsoring Trust", style_cell_label), Paragraph(trust_name, style_cell_val)],
        [Paragraph("Obligation Reference", style_cell_label), Paragraph(letter.obligation_id, style_code_font)],
        [Paragraph("Depository Bank", style_cell_label), Paragraph(f"{bank_name} ({letter.bank_id})", style_cell_val)],
        [Paragraph("FDR Account Number", style_cell_label), Paragraph(f"<b>{letter.fdr_number}</b>", style_meta_val)],
    ]
    inst_table = Table(inst_data, colWidths=[140, 375])
    inst_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(inst_table)
    story.append(Spacer(1, 10))

    # 4. Financial Settlement Breakdown Table
    dest = letter.destination_account_json or {}
    dest_str = f"{dest.get('beneficiary', 'AICTE')}, A/C: {dest.get('account_number', 'N/A')}, {dest.get('bank_name', '')} (IFSC: {dest.get('ifsc', '')})"

    settle_data = [
        [
            Paragraph("<b>Component</b>", style_cell_label),
            Paragraph("<b>Beneficiary / Destination</b>", style_cell_label),
            Paragraph("<b>Amount (INR)</b>", style_cell_label),
        ],
        [
            Paragraph("Total FDR Principal", style_cell_label),
            Paragraph("Joint Deposit Released", style_cell_val),
            Paragraph(format_inr(letter.principal_paise), style_cell_label),
        ],
        [
            Paragraph("Refund to Institute Trust", style_cell_label),
            Paragraph(f"Trust Registered Bank Account ({trust_name})", style_cell_val),
            Paragraph(f"<b>{format_inr(letter.principal_to_trust_paise)}</b>", style_meta_val),
        ],
        [
            Paragraph("AICTE Statutory Share / Penalty", style_cell_label),
            Paragraph(f"Designated Central Remittance:<br/>{dest_str}", style_cell_val),
            Paragraph(f"<b>{format_inr(letter.aicte_share_paise)}</b>", style_cell_label),
        ],
    ]
    settle_table = Table(settle_data, colWidths=[150, 240, 125])
    settle_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(settle_table)
    story.append(Spacer(1, 10))

    # 5. Directives & Conditions Box
    conditions_p = Paragraph(
        "<b>LEGAL DIRECTIVES FOR DEPOSITORY BANK:</b><br/>"
        "1. <b>Verification Requirement:</b> Bank maker and checker must verify this document's cryptographic code "
        "and fingerprint on the official Sakshya portal (or via QR code scan) before CBS execution.<br/>"
        "2. <b>Single Use:</b> This release mandate is strictly single-use. Replays will be rejected by the portal.<br/>"
        "3. <b>AICTE Remittance:</b> AICTE share (if any) must be remitted exclusively to the designated account.<br/>"
        "4. <b>Validity:</b> Disburse only if presented prior to the validity expiration timestamp.",
        style_cell_val,
    )
    cond_table = Table([[conditions_p]], colWidths=[515])
    cond_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#F59E0B")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(cond_table)
    story.append(Spacer(1, 10))

    # 6. Cryptographic Security & QR Verification Block
    qr_buf = generate_qr_image(verify_url)
    qr_img = Image(qr_buf, width=1.35 * inch, height=1.35 * inch)

    crypto_text = (
        f"<b>DIGITAL AUTHENTICATION RECORD (Ed25519)</b><br/>"
        f"<b>SHA-256 Digest:</b><br/>"
        f"<font name='Courier' size='7'>{letter.letter_hash}</font><br/><br/>"
        f"<b>Ed25519 Signature Hex (Key ID: {letter.signer_key_id}):</b><br/>"
        f"<font name='Courier' size='6.5'>{letter.signature_hex[:64]}...{letter.signature_hex[-16:]}</font><br/><br/>"
        f"<b>Signer:</b> Release Authority (Member Secretary, AICTE)<br/>"
        f"<b>Public Verification URL:</b><br/>"
        f"<font name='Courier' size='6.5'>{verify_url}</font>"
    )
    crypto_p = Paragraph(crypto_text, style_cell_val)

    sec_table = Table([[qr_img, crypto_p]], colWidths=[110, 405])
    sec_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(KeepTogether(sec_table))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()

