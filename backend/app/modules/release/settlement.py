"""
Settlement Computation Engine for Release Letters (§7.2, §5.2).

Calculates:
- Principal refund amount to institute trust
- AICTE share and statutory penalties (based on case_type and policy rules)
- Remittance coordinates for AICTE destination account
"""
from typing import Any
from sqlalchemy.orm import Session

from app.core import policy
from app.core.enums import CaseType
from app.modules.intake import service as intake_service
from app.modules.release.models import ReleaseRequest


def _mask_fdr(fdr_number: str) -> str:
    """Mask FDR number leaving last 4 digits visible."""
    clean = str(fdr_number or "").strip()
    if len(clean) <= 4:
        return clean
    return f"XXXX{clean[-4:]}"


def compute_settlement(
    request: ReleaseRequest,
    db: Session,
) -> dict[str, Any]:
    """
    Compute official settlement breakdown for an approved release request.

    Evaluates principal amounts from all requested instruments,
    applies regulatory penalty rules from policy, and incorporates the
    immutable AICTE destination bank coordinates.
    """
    total_principal_paise = 0
    total_interest_paise = 0
    instrument_summaries: list[dict[str, Any]] = []

    for iid in (request.instrument_ids_json or []):
        ins = intake_service.get_instrument(iid, db)
        if not ins:
            continue

        # Extract principal
        p_val = intake_service.get_field_value(ins, "principal_paise", db)
        principal_paise = int(p_val) if p_val and p_val.isdigit() else 0
        total_principal_paise += principal_paise

        # Extract accrued interest
        i_val = intake_service.get_field_value(ins, "accrued_interest_paise", db)
        interest_paise = int(i_val) if i_val and i_val.isdigit() else 0
        total_interest_paise += interest_paise

        fdr_num = intake_service.get_field_value(ins, "fdr_number", db) or ins.id
        ifsc = intake_service.get_field_value(ins, "bank_ifsc", db) or "BRBK0001234"

        instrument_summaries.append({
            "instrument_id": ins.id,
            "fdr_number": fdr_num,
            "fdr_masked": _mask_fdr(fdr_num),
            "bank_id": ins.bank_id,
            "bank_ifsc": ifsc,
            "principal_paise": principal_paise,
            "interest_paise": interest_paise,
        })

    # Policy penalty rules evaluation (§6.4)
    penalty_rules = policy.get("penalty_rules", db) or {"TERM_COMPLETE": 0, "DEFAULT": 10}
    case_type = request.case_type
    if isinstance(case_type, CaseType):
        case_type = case_type.value

    if case_type == CaseType.TERM_COMPLETE.value:
        penalty_pct = penalty_rules.get("TERM_COMPLETE", 0)
    else:
        penalty_pct = penalty_rules.get("DEFAULT", 10)

    penalty_paise = (total_principal_paise * penalty_pct) // 100
    principal_to_trust_paise = total_principal_paise - penalty_paise

    # For term complete, AICTE statutory penalty is 0, principal returns 100% to trust
    aicte_share_paise = penalty_paise

    # Official AICTE destination account from policy snapshot
    destination_account = policy.get("interest_destination", db) or {
        "beneficiary": "Member Secretary, AICTE",
        "account_number": "99990000123456",
        "bank_name": "State Bank of India",
        "ifsc": "SBIN0000001",
    }

    return {
        "total_principal_paise": total_principal_paise,
        "principal_to_trust_paise": principal_to_trust_paise,
        "aicte_share_paise": aicte_share_paise,
        "penalty_paise": penalty_paise,
        "interest_paise": total_interest_paise,
        "destination_account": destination_account,
        "instrument_summaries": instrument_summaries,
    }

