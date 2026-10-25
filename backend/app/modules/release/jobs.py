"""
Background jobs for Release module (§1.3, §3.5, §7.8).

Jobs:
- `letter_expiry`: Scans ISSUED release letters and marks them EXPIRED when valid_until <= now.
"""
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core import audit, clock, jobs, notify
from app.core.enums import AlertType, LetterState, ReleaseState, Role
from app.modules.release.models import ReleaseLetter, ReleaseRequest


def letter_expiry_handler(db: Session, now_dt: datetime) -> dict[str, Any]:
    """
    Scan for issued release letters whose validity period (14 days) has lapsed.
    Transitions state from ISSUED to EXPIRED, updates parent release request,
    and dispatches notifications and audit entries.
    """
    expired_letters = (
        db.query(ReleaseLetter)
        .filter(
            ReleaseLetter.state == LetterState.ISSUED.value,
            ReleaseLetter.valid_until <= now_dt,
        )
        .all()
    )

    if not expired_letters:
        return {"status": "clean", "expired_count": 0}

    expired_ids = []
    for letter in expired_letters:
        letter.state = LetterState.EXPIRED.value
        expired_ids.append(letter.id)

        # Update parent release request state if currently APPROVED
        req = db.query(ReleaseRequest).filter(ReleaseRequest.id == letter.release_request_id).first()
        if req and req.state == ReleaseState.APPROVED.value:
            req.state = ReleaseState.LETTER_EXPIRED.value
            req.updated_at = now_dt

        # Cryptographic audit entry
        audit.log(
            actor="SYSTEM",
            action="RELEASE_LETTER_EXPIRED",
            entity_type="RELEASE_LETTER",
            entity_id=letter.id,
            payload={
                "verification_code": letter.verification_code,
                "valid_until": letter.valid_until.isoformat() if letter.valid_until else None,
                "expired_at": now_dt.isoformat(),
            },
            db=db,
        )

        # Notify institute and release authority
        notify.send(
            title="Release letter expired",
            body=f"Release letter {letter.verification_code} has expired after 14 days without execution.",
            role=Role.INS_SIGNATORY,
            institute_id=letter.institute_id,
            level="HIGH",
            link="/institute/release",
            dedupe_key=f"release-letter:{letter.id}:expired",
            db=db,
        )
        notify.send(
            title="Release letter expired",
            body=f"Release letter {letter.verification_code} for institute {letter.institute_id} has expired.",
            role=Role.RELEASE_AUTHORITY,
            level="MEDIUM",
            link="/release-desk",
            dedupe_key=f"release-letter:{letter.id}:expired:ra",
            db=db,
        )

    db.commit()
    return {"status": "expired_processed", "expired_count": len(expired_ids), "expired_ids": expired_ids}


# Register job on import so tick runner and clock advance can invoke it
jobs.register("letter_expiry", letter_expiry_handler)

