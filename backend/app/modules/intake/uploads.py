"""Shared PDF upload validation and immutable storage helpers."""
import hashlib
from pathlib import Path

from app.core.errors import ValidationError
from app.core.policy import get as policy_get


def validate_pdf(data: bytes, filename: str) -> None:
    """Validate content, not the user supplied filename extension."""
    if not data:
        raise ValidationError("Uploaded file is empty", details={"filename": filename})
    if b"%PDF" not in data[:1024]:
        raise ValidationError("Uploaded file is not a PDF", details={"filename": filename})
    max_bytes = int(policy_get("upload_max_mb") * 1024 * 1024)
    if len(data) > max_bytes:
        raise ValidationError(
            f"Uploaded file exceeds the {policy_get('upload_max_mb')} MB limit",
            details={"size_bytes": len(data), "max_bytes": max_bytes},
        )


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def save_document(instrument_id: str, data: bytes) -> tuple[Path, str]:
    """Store bytes under backend/data/files without replacing existing content."""
    digest = sha256_hex(data)
    backend_dir = Path(__file__).resolve().parents[3]
    target_dir = backend_dir / "data" / "files" / instrument_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{digest}.pdf"
    try:
        with target.open("xb") as output:
            output.write(data)
    except FileExistsError:
        if target.read_bytes() != data:
            raise
    return target.resolve(), digest
