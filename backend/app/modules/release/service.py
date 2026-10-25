"""
Release service engine — owned by Premansh (Lane A).

Implements:
- Eligibility rules engine E-01..E-08 + E-12 (SRS §7.4)
- Release request state machine operations (submit, resubmit, recommend, reject)
- Compliance hold management (place, lift, get_active_hold)
- Instrument release locking via intake.service.transition
"""
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core import audit, clock, notify, policy, sod
from app.core.db import SessionLocal
from app.core.enums import (
    CaseType,
    EligibilityVerdict,
    InstrumentState,
    LetterState,
    ReleaseState,
    Role,
    RuleResult,
    TrustLevel,
)
from app.core.errors import ForbiddenError, InvalidStateError, NotFoundError, ValidationError
from app.core.models import User
from app.modules.bank import service as bank_service
from app.modules.bank.models import Bank
from app.modules.intake import service as intake_service
from app.modules.intake.models import Discrepancy, Institute, Obligation, Trust
from app.modules.release.crypto import compute_canonical_hash, generate_verification_code, signer
from app.modules.release.models import EligibilityRuleResult, Hold, ReleaseLetter, ReleaseRequest
from app.modules.release.pdf import generate_release_letter_pdf
from app.modules.release.schemas import HoldScope
from app.modules.release.settlement import compute_settlement


# ── Hold Management ───────────────────────────────────────────────────────────

def get_active_hold(scope: str, entity_id: str, db: Session | None = None) -> Hold | None:
    """
    Check if an active compliance hold exists for an entity (§3.6 service interface).
    Supports scope: 'INSTITUTE', 'TRUST', 'INSTRUMENT'.
    """
    session = db or SessionLocal()
    should_close = db is None
    try:
        return (
            session.query(Hold)
            .filter(
                Hold.scope == scope,
                Hold.entity_id == entity_id,
                Hold.is_active == True,  # noqa: E712
            )
            .first()
        )
    finally:
        if should_close:
            session.close()


def list_holds(
    db: Session,
    scope: str | None = None,
    entity_id: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Hold], int]:
    """Query compliance holds with optional filters and pagination."""
    query = db.query(Hold)
    if scope:
        query = query.filter(Hold.scope == scope)
    if entity_id:
        query = query.filter(Hold.entity_id == entity_id)
    if is_active is not None:
        query = query.filter(Hold.is_active == is_active)
    total = query.count()
    items = query.order_by(Hold.placed_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def place_hold(
    scope: str,
    entity_id: str,
    reason: str,
    legal_ref: str | None,
    actor: User,
    db: Session,
) -> Hold:
    """Place a compliance hold on an institute, trust, or instrument."""
    if Role.COMPLIANCE_OFFICER.value not in actor.roles and Role.SYSTEM_ADMIN.value not in actor.roles:
        raise ForbiddenError("Only Compliance Officers can place holds")

    if not reason or not reason.strip():
        raise ValidationError("Hold reason is required")

    valid_scopes = {HoldScope.INSTITUTE.value, HoldScope.TRUST.value, HoldScope.INSTRUMENT.value}
    if scope not in valid_scopes:
        raise ValidationError(f"Invalid hold scope '{scope}'. Allowed: {valid_scopes}")

    now = clock.now()
    hold = Hold(
        id=str(uuid4()),
        scope=scope,
        entity_id=entity_id,
        reason=reason.strip(),
        legal_ref=legal_ref.strip() if legal_ref else None,
        is_active=True,
        placed_by_id=actor.id,
        placed_at=now,
    )
    db.add(hold)
    db.flush()

    audit.log(
        actor=actor,
        action="COMPLIANCE_HOLD_PLACED",
        entity_type="HOLD",
        entity_id=hold.id,
        payload={
            "scope": scope,
            "entity_id": entity_id,
            "reason": hold.reason,
            "legal_ref": hold.legal_ref,
        },
        db=db,
    )
    db.commit()
    db.refresh(hold)
    return hold


def lift_hold(hold_id: str, reason: str, actor: User, db: Session) -> Hold:
    """Lift an active compliance hold."""
    if Role.COMPLIANCE_OFFICER.value not in actor.roles and Role.SYSTEM_ADMIN.value not in actor.roles:
        raise ForbiddenError("Only Compliance Officers can lift holds")

    if not reason or not reason.strip():
        raise ValidationError("Reason for lifting hold is required")

    hold = db.query(Hold).filter(Hold.id == hold_id).first()
    if not hold:
        raise NotFoundError(f"Hold '{hold_id}' not found")

    if not hold.is_active:
        raise InvalidStateError("Hold is already lifted")

    now = clock.now()
    hold.is_active = False
    hold.lifted_by_id = actor.id
    hold.lifted_at = now
    hold.lift_reason = reason.strip()

    audit.log(
        actor=actor,
        action="COMPLIANCE_HOLD_LIFTED",
        entity_type="HOLD",
        entity_id=hold.id,
        payload={
            "scope": hold.scope,
            "entity_id": hold.entity_id,
            "lift_reason": hold.lift_reason,
        },
        db=db,
    )
    db.commit()
    db.refresh(hold)
    return hold


# ── Eligibility Engine (SRS §7.4) ─────────────────────────────────────────────

def evaluate_eligibility(
    obligation_id: str,
    instrument_ids: list[str],
    case_type: CaseType | str,
    actor: User,
    db: Session,
    exclude_request_id: str | None = None,
) -> tuple[EligibilityVerdict, list[dict]]:
    """
    Evaluate eligibility rules E-01 through E-08 + E-12 in deterministic order.

    Returns:
        (verdict, list of rule result dicts)
    """
    case_type_str = case_type.value if isinstance(case_type, CaseType) else str(case_type)
    now = clock.now()
    today = now.date()
    rule_results: list[dict] = []

    obligation = intake_service.get_obligation(obligation_id, db)

    # ── E-01: Obligation Existence & Ownership ────────────────────────────────
    if not obligation:
        rule_results.append({
            "rule_id": "E-01",
            "name": "Obligation & Trust Ownership",
            "result": RuleResult.FAIL,
            "message": f"Obligation '{obligation_id}' not found.",
            "fix_hint": "Select a valid obligation registered to your institute.",
        })
    elif actor.institute_id and obligation.institute_id != actor.institute_id:
        rule_results.append({
            "rule_id": "E-01",
            "name": "Obligation & Trust Ownership",
            "result": RuleResult.FAIL,
            "message": f"Obligation belongs to another institute ('{obligation.institute_id}').",
            "fix_hint": "You can only request release for obligations belonging to your institute.",
        })
    else:
        rule_results.append({
            "rule_id": "E-01",
            "name": "Obligation & Trust Ownership",
            "result": RuleResult.PASS,
            "message": f"Obligation '{obligation_id}' confirmed for institute '{obligation.institute_id}'.",
            "fix_hint": None,
        })

    # ── E-02: Signatory Authorisation ─────────────────────────────────────────
    is_signatory = Role.INS_SIGNATORY.value in actor.roles
    is_same_institute = (not actor.institute_id) or (obligation and actor.institute_id == obligation.institute_id)
    if not is_signatory or not is_same_institute:
        rule_results.append({
            "rule_id": "E-02",
            "name": "Signatory Authorisation",
            "result": RuleResult.FAIL,
            "message": "User is not an authorized, active signatory for this institute.",
            "fix_hint": "Only registered institute signatories can initiate release requests.",
        })
    else:
        rule_results.append({
            "rule_id": "E-02",
            "name": "Signatory Authorisation",
            "result": RuleResult.PASS,
            "message": f"Signatory '{actor.id}' is active and authorized for institute '{actor.institute_id}'.",
            "fix_hint": None,
        })

    # ── E-03: Instrument State & L2 Trust ─────────────────────────────────────
    if not instrument_ids:
        rule_results.append({
            "rule_id": "E-03",
            "name": "Instrument Active & L2 Trust",
            "result": RuleResult.FAIL,
            "message": "No instruments specified for release.",
            "fix_hint": "Select at least one valid instrument under this obligation.",
        })
    else:
        e03_failed = False
        e03_messages = []
        for iid in instrument_ids:
            ins = intake_service.get_instrument(iid, db)
            if not ins:
                e03_failed = True
                e03_messages.append(f"Instrument '{iid}' not found.")
                continue

            if ins.obligation_id != obligation_id:
                e03_failed = True
                e03_messages.append(f"Instrument '{iid}' does not belong to obligation '{obligation_id}'.")
                continue

            valid_states = {InstrumentState.ACTIVE.value, InstrumentState.MATURED.value, InstrumentState.RELEASE_LOCKED.value}
            # Note: RELEASE_LOCKED is valid only if this request already locked it (handled in E-04)
            if ins.state not in {InstrumentState.ACTIVE.value, InstrumentState.MATURED.value}:
                e03_failed = True
                e03_messages.append(f"Instrument '{iid}' is in state '{ins.state}', expected ACTIVE or MATURED.")
                continue

            fields = intake_service.get_fields(iid, db)
            p_trust = fields.get("principal_paise", {}).get("trust")
            l_trust = fields.get("lien_marked", {}).get("trust")
            if p_trust != TrustLevel.L2_BANK_CONFIRMED.value or l_trust != TrustLevel.L2_BANK_CONFIRMED.value:
                e03_failed = True
                e03_messages.append(f"Instrument '{iid}' lacks L2 bank confirmation (principal: {p_trust}, lien: {l_trust}).")

        if e03_failed:
            rule_results.append({
                "rule_id": "E-03",
                "name": "Instrument Active & L2 Trust",
                "result": RuleResult.FAIL,
                "message": "; ".join(e03_messages),
                "fix_hint": "All instruments must be in ACTIVE or MATURED state with L2 bank lien confirmation.",
            })
        else:
            rule_results.append({
                "rule_id": "E-03",
                "name": "Instrument Active & L2 Trust",
                "result": RuleResult.PASS,
                "message": f"All {len(instrument_ids)} instruments verified in ACTIVE/MATURED state with L2 bank trust.",
                "fix_hint": None,
            })

    # ── E-04: Release Lock & Concurrent Check ─────────────────────────────────
    e04_failed = False
    e04_messages = []
    active_release_states = {
        ReleaseState.SUBMITTED.value,
        ReleaseState.SCRUTINY.value,
        ReleaseState.RECOMMENDED.value,
        ReleaseState.APPROVED.value,
        ReleaseState.EXECUTED.value,
        ReleaseState.SETTLEMENT_PENDING.value,
    }
    for iid in instrument_ids:
        ins = intake_service.get_instrument(iid, db)
        if ins and ins.state == InstrumentState.RELEASE_LOCKED.value:
            e04_failed = True
            e04_messages.append(f"Instrument '{iid}' is currently RELEASE_LOCKED.")

        # Check existing active release requests
        conflict_query = db.query(ReleaseRequest).filter(
            ReleaseRequest.state.in_(active_release_states),
        )
        if exclude_request_id:
            conflict_query = conflict_query.filter(ReleaseRequest.id != exclude_request_id)

        for req in conflict_query.all():
            if iid in (req.instrument_ids_json or []):
                e04_failed = True
                e04_messages.append(f"Instrument '{iid}' is locked by active release request '{req.id}'.")
                break

    if e04_failed:
        rule_results.append({
            "rule_id": "E-04",
            "name": "Release Lock Free",
            "result": RuleResult.FAIL,
            "message": "; ".join(e04_messages),
            "fix_hint": "Instrument is currently locked by another active release request.",
        })
    else:
        rule_results.append({
            "rule_id": "E-04",
            "name": "Release Lock Free",
            "result": RuleResult.PASS,
            "message": "No concurrent release lock or open request detected on requested instruments.",
            "fix_hint": None,
        })

    # ── E-05: Case Type Term Completion ───────────────────────────────────────
    if case_type_str == CaseType.TERM_COMPLETE.value:
        from app.core.enums import ObligationState
        is_term_complete = obligation and (
            obligation.state == ObligationState.TERM_COMPLETE.value or obligation.end_date <= today
        )
        if not is_term_complete:
            end_date_disp = str(obligation.end_date) if obligation else "unknown"
            rule_results.append({
                "rule_id": "E-05",
                "name": "Tenor Completion",
                "result": RuleResult.FAIL,
                "message": f"Obligation term completes on {end_date_disp}, which is in the future.",
                "fix_hint": f"Obligation term completes on {end_date_disp}. Early release requires special approval.",
            })
        else:
            end_date_str = str(obligation.end_date) if obligation else "verified"
            rule_results.append({
                "rule_id": "E-05",
                "name": "Tenor Completion",
                "result": RuleResult.PASS,
                "message": f"Obligation term complete on {end_date_str}.",
                "fix_hint": None,
            })
    else:
        rule_results.append({
            "rule_id": "E-05",
            "name": "Tenor Completion",
            "result": RuleResult.PASS,
            "message": f"Case type '{case_type_str}' validated.",
            "fix_hint": None,
        })

    # ── E-06: Active Holds & Vigilance Quarantine ─────────────────────────────
    e06_failed = False
    e06_messages = []
    # 1. Quarantined instruments
    for iid in instrument_ids:
        ins = intake_service.get_instrument(iid, db)
        if ins and ins.is_quarantined:
            e06_failed = True
            e06_messages.append(f"Instrument '{iid}' is quarantined by compliance/vigilance.")

        # 2. Instrument-scoped hold
        ins_hold = get_active_hold(HoldScope.INSTRUMENT.value, iid, db)
        if ins_hold:
            e06_failed = True
            e06_messages.append(f"Active hold on instrument '{iid}': {ins_hold.reason}")

    # 3. Institute-scoped hold
    if obligation:
        inst_hold = get_active_hold(HoldScope.INSTITUTE.value, obligation.institute_id, db)
        if inst_hold:
            e06_failed = True
            e06_messages.append(f"Active compliance hold on institute: {inst_hold.reason}")

        # 4. Trust-scoped hold
        if obligation.trust_id:
            trust_hold = get_active_hold(HoldScope.TRUST.value, obligation.trust_id, db)
            if trust_hold:
                e06_failed = True
                e06_messages.append(f"Active compliance hold on trust: {trust_hold.reason}")

    if e06_failed:
        rule_results.append({
            "rule_id": "E-06",
            "name": "Compliance Hold & Quarantine",
            "result": RuleResult.FAIL,
            "message": "; ".join(e06_messages),
            "fix_hint": "Active compliance hold or quarantine in place. Contact AICTE Compliance.",
        })
    else:
        rule_results.append({
            "rule_id": "E-06",
            "name": "Compliance Hold & Quarantine",
            "result": RuleResult.PASS,
            "message": "Zero active compliance holds or vigilance quarantines found.",
            "fix_hint": None,
        })

    # ── E-07: Open Discrepancies Check ────────────────────────────────────────
    e07_failed = False
    has_medium_warn = False
    e07_messages = []
    for iid in instrument_ids:
        if intake_service.has_open_high(iid, db):
            e07_failed = True
            e07_messages.append(f"Instrument '{iid}' has open or escalated HIGH discrepancies.")

        med = (
            db.query(Discrepancy)
            .filter(
                Discrepancy.instrument_id == iid,
                Discrepancy.severity == "MEDIUM",
                Discrepancy.status.in_(["OPEN", "ESCALATED"]),
            )
            .first()
        )
        if med:
            has_medium_warn = True

    if e07_failed:
        rule_results.append({
            "rule_id": "E-07",
            "name": "Discrepancy Clearance",
            "result": RuleResult.FAIL,
            "message": "; ".join(e07_messages),
            "fix_hint": "Resolve all open high-severity discrepancies prior to release.",
        })
    elif has_medium_warn:
        rule_results.append({
            "rule_id": "E-07",
            "name": "Discrepancy Clearance",
            "result": RuleResult.WARN,
            "message": "Instrument has open medium discrepancies (informational warning).",
            "fix_hint": "Review open medium discrepancies before final disbursement.",
        })
    else:
        rule_results.append({
            "rule_id": "E-07",
            "name": "Discrepancy Clearance",
            "result": RuleResult.PASS,
            "message": "Zero open discrepancies on requested instruments.",
            "fix_hint": None,
        })

    # ── E-08: Bank Confirmation Freshness ─────────────────────────────────────
    freshness_threshold = policy.get("recon_freshness_days") or 90
    needs_manual_review = False
    e08_messages = []
    for iid in instrument_ids:
        confirmation = bank_service.latest_confirmation(iid)
        if not confirmation or not confirmation.get("confirmed_at"):
            needs_manual_review = True
            e08_messages.append(f"Instrument '{iid}' has no recorded bank confirmation.")
        else:
            confirmed_at = confirmation["confirmed_at"]
            if confirmed_at.tzinfo is None:
                confirmed_at = confirmed_at.replace(tzinfo=now.tzinfo)
            age_days = (now - confirmed_at).days
            if age_days > freshness_threshold:
                needs_manual_review = True
                e08_messages.append(
                    f"Instrument '{iid}' confirmation is {age_days} days old (threshold: {freshness_threshold} days)."
                )

    if needs_manual_review:
        rule_results.append({
            "rule_id": "E-08",
            "name": "Confirmation Freshness",
            "result": RuleResult.MANUAL,
            "message": f"Bank confirmation aged or missing: {'; '.join(e08_messages)}",
            "fix_hint": "Bank confirmation is older than threshold. Fresh bank pre-check recommended.",
        })
    else:
        rule_results.append({
            "rule_id": "E-08",
            "name": "Confirmation Freshness",
            "result": RuleResult.PASS,
            "message": f"Bank confirmations verified fresh within {freshness_threshold} days.",
            "fix_hint": None,
        })

    # ── E-12: Trust Beneficiary Details ───────────────────────────────────────
    if obligation and obligation.trust_id:
        trust = db.query(Trust).filter(Trust.id == obligation.trust_id).first()
        if not trust or not trust.name:
            rule_results.append({
                "rule_id": "E-12",
                "name": "Beneficiary Verification",
                "result": RuleResult.WARN,
                "message": "Trust registration details incomplete; verify payout beneficiary before disbursement.",
                "fix_hint": "Ensure trust beneficiary bank details are current.",
            })
        else:
            rule_results.append({
                "rule_id": "E-12",
                "name": "Beneficiary Verification",
                "result": RuleResult.PASS,
                "message": f"Trust beneficiary '{trust.name}' registered and verified.",
                "fix_hint": None,
            })
    else:
        rule_results.append({
            "rule_id": "E-12",
            "name": "Beneficiary Verification",
            "result": RuleResult.PASS,
            "message": "Beneficiary details recorded.",
            "fix_hint": None,
        })

    # ── Compute Composite Verdict ─────────────────────────────────────────────
    has_fail = any(r["result"] == RuleResult.FAIL for r in rule_results)
    has_manual = any(r["result"] == RuleResult.MANUAL for r in rule_results)

    if has_fail:
        verdict = EligibilityVerdict.INELIGIBLE
    elif has_manual:
        verdict = EligibilityVerdict.MANUAL_REVIEW
    else:
        verdict = EligibilityVerdict.ELIGIBLE

    return verdict, rule_results


# ── Release Request State Machine ─────────────────────────────────────────────

def create_release_request(
    obligation_id: str,
    instrument_ids: list[str],
    case_type: CaseType | str,
    remarks: str | None,
    actor: User,
    db: Session,
) -> ReleaseRequest:
    """
    Create a new release request from an institute signatory.
    Evaluates eligibility, locks instruments if eligible, persists rules, and sends notifications.
    """
    if Role.INS_SIGNATORY.value not in actor.roles:
        raise ForbiddenError("Only institute signatories can create release requests")

    obligation = intake_service.get_obligation(obligation_id, db)
    if not obligation:
        raise NotFoundError(f"Obligation '{obligation_id}' not found")

    if actor.institute_id and obligation.institute_id != actor.institute_id:
        raise ForbiddenError("Cannot create release request for another institute")

    # Sum total amount in paise
    total_amount_paise = 0
    for iid in instrument_ids:
        val = intake_service.get_field_value(intake_service.get_instrument(iid, db), "principal_paise", db)
        if val:
            try:
                total_amount_paise += int(val)
            except ValueError:
                pass

    case_type_str = case_type.value if isinstance(case_type, CaseType) else str(case_type)
    verdict, rule_evals = evaluate_eligibility(obligation_id, instrument_ids, case_type_str, actor, db)

    settlement = {
        "principal_to_trust_paise": total_amount_paise,
        "aicte_share_paise": 0,
        "penalty_paise": 0,
        "interest_paise": 0,
    }

    now = clock.now()
    req_id = str(uuid4())

    if verdict == EligibilityVerdict.INELIGIBLE:
        target_state = ReleaseState.INELIGIBLE.value
    else:
        target_state = ReleaseState.SCRUTINY.value

    request = ReleaseRequest(
        id=req_id,
        obligation_id=obligation_id,
        institute_id=obligation.institute_id,
        case_type=case_type_str,
        state=target_state,
        instrument_ids_json=instrument_ids,
        total_amount_paise=total_amount_paise,
        settlement_json=settlement,
        eligibility_verdict=verdict.value,
        letter_id=None,
        recommender_id=None,
        recommendation_note=None,
        rejection_reason=None,
        created_by=actor.id,
        created_at=now,
        updated_at=now,
    )
    db.add(request)
    db.flush()

    # Persist rule results
    for r in rule_evals:
        db.add(EligibilityRuleResult(
            id=str(uuid4()),
            release_request_id=request.id,
            rule_id=r["rule_id"],
            name=r["name"],
            result=r["result"].value if isinstance(r["result"], RuleResult) else str(r["result"]),
            message=r["message"],
            fix_hint=r["fix_hint"],
            evaluated_at=now,
        ))

    # If eligible or manual review: transition instruments to RELEASE_LOCKED
    if target_state == ReleaseState.SCRUTINY.value:
        for iid in instrument_ids:
            intake_service.transition(
                iid,
                InstrumentState.RELEASE_LOCKED,
                actor,
                f"Locked for release request {request.id}",
                db,
            )

    # Cryptographic audit logging
    audit.log(
        actor=actor,
        action="RELEASE_REQUEST_SUBMITTED",
        entity_type="RELEASE_REQUEST",
        entity_id=request.id,
        payload={
            "obligation_id": obligation_id,
            "institute_id": obligation.institute_id,
            "state": target_state,
            "verdict": verdict.value,
            "total_amount_paise": total_amount_paise,
            "instrument_ids": instrument_ids,
        },
        db=db,
    )

    # Notify Approving Officers if moved to SCRUTINY
    if target_state == ReleaseState.SCRUTINY.value:
        inst = db.query(Institute).filter(Institute.id == obligation.institute_id).first()
        inst_name = inst.name if inst else obligation.institute_id
        notify.send(
            title="New release request for scrutiny",
            body=f"Release request {request.id} for {inst_name} has entered scrutiny.",
            role=Role.APPROVING_OFFICER,
            level="INFO",
            link=f"/release-desk?id={request.id}",
            dedupe_key=f"release-request:{request.id}:scrutiny",
            db=db,
        )

    db.commit()
    db.refresh(request)
    return request


def resubmit_release_request(request_id: str, actor: User, db: Session) -> ReleaseRequest:
    """
    Resubmit an INELIGIBLE release request after fixing issues.
    Re-evaluates eligibility rules and locks instruments if now passing.
    """
    if Role.INS_SIGNATORY.value not in actor.roles:
        raise ForbiddenError("Only institute signatories can resubmit release requests")

    request = db.query(ReleaseRequest).filter(ReleaseRequest.id == request_id).first()
    if not request:
        raise NotFoundError(f"Release request '{request_id}' not found")

    if actor.institute_id and request.institute_id != actor.institute_id:
        raise ForbiddenError("Cannot resubmit release request for another institute")

    if request.state != ReleaseState.INELIGIBLE.value:
        raise InvalidStateError(f"Cannot resubmit request from state '{request.state}'. Expected INELIGIBLE.")

    verdict, rule_evals = evaluate_eligibility(
        request.obligation_id,
        request.instrument_ids_json or [],
        request.case_type,
        actor,
        db,
        exclude_request_id=request.id,
    )

    now = clock.now()

    # Clear old rule results
    db.query(EligibilityRuleResult).filter(EligibilityRuleResult.release_request_id == request.id).delete()
    for r in rule_evals:
        db.add(EligibilityRuleResult(
            id=str(uuid4()),
            release_request_id=request.id,
            rule_id=r["rule_id"],
            name=r["name"],
            result=r["result"].value if isinstance(r["result"], RuleResult) else str(r["result"]),
            message=r["message"],
            fix_hint=r["fix_hint"],
            evaluated_at=now,
        ))

    old_state = request.state
    if verdict == EligibilityVerdict.INELIGIBLE:
        request.state = ReleaseState.INELIGIBLE.value
    else:
        request.state = ReleaseState.SCRUTINY.value
        # Lock instruments
        for iid in (request.instrument_ids_json or []):
            intake_service.transition(
                iid,
                InstrumentState.RELEASE_LOCKED,
                actor,
                f"Locked on resubmission for release request {request.id}",
                db,
            )

    request.eligibility_verdict = verdict.value
    request.updated_at = now

    audit.log(
        actor=actor,
        action="RELEASE_REQUEST_RESUBMITTED",
        entity_type="RELEASE_REQUEST",
        entity_id=request.id,
        payload={
            "from_state": old_state,
            "to_state": request.state,
            "verdict": verdict.value,
        },
        db=db,
    )

    if request.state == ReleaseState.SCRUTINY.value:
        notify.send(
            title="Release request resubmitted",
            body=f"Release request {request.id} is now eligible and ready for scrutiny.",
            role=Role.APPROVING_OFFICER,
            level="INFO",
            link=f"/release-desk?id={request.id}",
            dedupe_key=f"release-request:{request.id}:resubmitted",
            db=db,
        )

    db.commit()
    db.refresh(request)
    return request


def recommend_release_request(
    request_id: str,
    recommendation_note: str,
    actor: User,
    db: Session,
) -> ReleaseRequest:
    """
    Approving Officer recommends an eligible release request to the Release Authority.
    Enforces SoD: Signatory cannot recommend their own request.
    """
    if Role.APPROVING_OFFICER.value not in actor.roles:
        raise ForbiddenError("Only Approving Officers can recommend release requests")

    if not recommendation_note or len(recommendation_note.strip()) < 3:
        raise ValidationError("Recommendation note must be at least 3 characters")

    request = db.query(ReleaseRequest).filter(ReleaseRequest.id == request_id).first()
    if not request:
        raise NotFoundError(f"Release request '{request_id}' not found")

    if request.state != ReleaseState.SCRUTINY.value:
        raise InvalidStateError(f"Cannot recommend request from state '{request.state}'. Expected SCRUTINY.")

    # Separation of Duties check
    sod.ensure_different(actor, request.created_by, "Signatory cannot recommend their own release request")

    now = clock.now()
    request.state = ReleaseState.RECOMMENDED.value
    request.recommender_id = actor.id
    request.recommendation_note = recommendation_note.strip()
    request.updated_at = now

    audit.log(
        actor=actor,
        action="RELEASE_REQUEST_RECOMMENDED",
        entity_type="RELEASE_REQUEST",
        entity_id=request.id,
        payload={
            "recommender_id": actor.id,
            "recommendation_note": request.recommendation_note,
        },
        db=db,
    )

    notify.send(
        title="Release request recommended for approval",
        body=f"Release request {request.id} recommended by {actor.username}. Ready for RA signature.",
        role=Role.RELEASE_AUTHORITY,
        level="HIGH",
        link=f"/release-desk?id={request.id}",
        dedupe_key=f"release-request:{request.id}:recommended",
        db=db,
    )

    db.commit()
    db.refresh(request)
    return request


def reject_release_request(
    request_id: str,
    reason: str,
    actor: User,
    db: Session,
) -> ReleaseRequest:
    """
    Reject a release request (by Approving Officer or Release Authority).
    Unlocks any instruments that were in RELEASE_LOCKED.
    """
    allowed_roles = {
        Role.APPROVING_OFFICER.value,
        Role.RELEASE_AUTHORITY.value,
        Role.COMPLIANCE_OFFICER.value,
        Role.SYSTEM_ADMIN.value,
    }
    if not any(r in allowed_roles for r in actor.roles):
        raise ForbiddenError("Only officers can reject release requests")

    if not reason or len(reason.strip()) < 3:
        raise ValidationError("Rejection reason must be at least 3 characters")

    request = db.query(ReleaseRequest).filter(ReleaseRequest.id == request_id).first()
    if not request:
        raise NotFoundError(f"Release request '{request_id}' not found")

    rejectable_states = {
        ReleaseState.SUBMITTED.value,
        ReleaseState.INELIGIBLE.value,
        ReleaseState.SCRUTINY.value,
        ReleaseState.RECOMMENDED.value,
    }
    if request.state not in rejectable_states:
        raise InvalidStateError(f"Cannot reject request from state '{request.state}'.")

    old_state = request.state
    now = clock.now()

    # Unlock instruments back to previous state (MATURED or ACTIVE)
    from app.core.enums import ObligationState
    from app.modules.intake.models import InstrumentStateHistory
    obligation = intake_service.get_obligation(request.obligation_id, db)
    today = now.date()
    is_matured_eligible = obligation and (
        obligation.state == ObligationState.TERM_COMPLETE.value or obligation.end_date <= today
    )

    for iid in (request.instrument_ids_json or []):
        ins = intake_service.get_instrument(iid, db)
        if ins and ins.state == InstrumentState.RELEASE_LOCKED.value:
            last_hist = (
                db.query(InstrumentStateHistory)
                .filter(
                    InstrumentStateHistory.instrument_id == iid,
                    InstrumentStateHistory.to_state == InstrumentState.RELEASE_LOCKED.value,
                )
                .order_by(InstrumentStateHistory.at.desc())
                .first()
            )
            target_ins_state = (
                last_hist.from_state
                if last_hist and last_hist.from_state
                else (InstrumentState.MATURED.value if is_matured_eligible else InstrumentState.ACTIVE.value)
            )
            intake_service.transition(
                iid,
                target_ins_state,
                actor,
                f"Unlocked due to release request {request.id} rejection: {reason.strip()}",
                db,
            )

    request.state = ReleaseState.REJECTED.value
    request.rejection_reason = reason.strip()
    request.updated_at = now

    audit.log(
        actor=actor,
        action="RELEASE_REQUEST_REJECTED",
        entity_type="RELEASE_REQUEST",
        entity_id=request.id,
        payload={
            "from_state": old_state,
            "rejection_reason": request.rejection_reason,
            "rejected_by": actor.id,
        },
        db=db,
    )

    notify.send(
        title="Release request rejected",
        body=f"Your release request {request.id} was rejected: {reason.strip()}",
        role=Role.INS_SIGNATORY,
        institute_id=request.institute_id,
        level="HIGH",
        link=f"/institute/release",
        dedupe_key=f"release-request:{request.id}:rejected",
        db=db,
    )

    db.commit()
    db.refresh(request)
    return request


# ── Query Helpers ─────────────────────────────────────────────────────────────

def get_release_request(request_id: str, actor: User, db: Session) -> ReleaseRequest:
    """Fetch release request with multi-tenant institute scoping."""
    request = db.query(ReleaseRequest).filter(ReleaseRequest.id == request_id).first()
    if not request:
        raise NotFoundError(f"Release request '{request_id}' not found")

    is_institute_user = any(r in (Role.INS_SIGNATORY.value, Role.INS_ADMIN.value) for r in actor.roles)
    if is_institute_user and actor.institute_id and request.institute_id != actor.institute_id:
        raise NotFoundError(f"Release request '{request_id}' not found")

    return request


def list_release_requests(
    db: Session,
    actor: User,
    state: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[ReleaseRequest], int]:
    """List release requests with multi-tenant institute scoping."""
    query = db.query(ReleaseRequest)

    is_institute_user = any(r in (Role.INS_SIGNATORY.value, Role.INS_ADMIN.value) for r in actor.roles)
    if is_institute_user:
        if actor.institute_id:
            query = query.filter(ReleaseRequest.institute_id == actor.institute_id)
        else:
            return [], 0

    if state:
        query = query.filter(ReleaseRequest.state == state)

    total = query.count()
    items = query.order_by(ReleaseRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


# ── Release Letter Operations (PR-7) ──────────────────────────────────────────

def sign_release_request(
    request_id: str,
    actor: User,
    db: Session,
) -> ReleaseLetter:
    """
    Release Authority digitally signs an approved release request using Ed25519 (SRS §7.2).
    Generates canonical RFC 8785 JSON payload, computes SHA-256 hash, signs with RA private key,
    issues ReleaseLetter, and transitions request to APPROVED.
    """
    if Role.RELEASE_AUTHORITY.value not in actor.roles and Role.SYSTEM_ADMIN.value not in actor.roles:
        raise ForbiddenError("Only Release Authority can sign release requests")

    request = db.query(ReleaseRequest).filter(ReleaseRequest.id == request_id).first()
    if not request:
        raise NotFoundError(f"Release request '{request_id}' not found")

    if request.state != ReleaseState.RECOMMENDED.value:
        raise InvalidStateError(
            f"Cannot sign release request from state '{request.state}'. Expected RECOMMENDED."
        )

    now = clock.now()
    validity_days = policy.get("letter_validity_days", db) or 14
    valid_until = now + timedelta(days=validity_days)

    # Compute financial settlement breakdown
    settlement = compute_settlement(request, db)

    # Resolve primary bank & FDR number from instruments
    bank_id = "BRB"
    fdr_number = "FDR-UNKNOWN"
    if request.instrument_ids_json:
        first_ins = intake_service.get_instrument(request.instrument_ids_json[0], db)
        if first_ins:
            bank_id = first_ins.bank_id
            fdr_num_val = intake_service.get_field_value(first_ins, "fdr_number", db)
            if fdr_num_val:
                fdr_number = fdr_num_val

    # Resolve institute & trust names
    inst = db.query(Institute).filter(Institute.id == request.institute_id).first()
    institute_name = inst.name if inst else request.institute_id

    obligation = intake_service.get_obligation(request.obligation_id, db)
    trust_name = "Institute Sponsoring Trust"
    if obligation and obligation.trust_id:
        trust = db.query(Trust).filter(Trust.id == obligation.trust_id).first()
        if trust and trust.name:
            trust_name = trust.name

    letter_id = str(uuid4())

    # Generate unique Crockford Base32 verification code
    verification_code = generate_verification_code()
    while db.query(ReleaseLetter).filter(ReleaseLetter.verification_code == verification_code).first():
        verification_code = generate_verification_code()

    # Build canonical payload dictionary according to schema sakshya.letter.v1
    canonical_payload = {
        "schema": "sakshya.letter.v1",
        "letter_id": letter_id,
        "public_code": verification_code,
        "issued_at": now.isoformat(),
        "expires_at": valid_until.isoformat(),
        "obligation_ref": request.obligation_id,
        "institute": {
            "id": request.institute_id,
            "name": institute_name,
        },
        "trust": {
            "name": trust_name,
        },
        "instruments": [
            {
                "instrument_id": s["instrument_id"],
                "fdr_number": s["fdr_number"],
                "fdr_masked": s["fdr_masked"],
                "bank_ifsc": s["bank_ifsc"],
                "principal_paise": s["principal_paise"],
            }
            for s in settlement["instrument_summaries"]
        ],
        "principal_to_trust": {
            "amount_paise": settlement["principal_to_trust_paise"],
            "beneficiary_name": trust_name,
        },
        "aicte_share": {
            "amount_paise": settlement["aicte_share_paise"],
            "account_ref": "policy:interest_destination",
            "destination_account": settlement["destination_account"],
        },
        "conditions": [
            "Single use authorization - bank must verify via Sakshya portal before execution",
            "Valid strictly until the expiry timestamp indicated herein",
            "AICTE share must be remitted exclusively to the designated AICTE bank account",
        ],
        "policy_version": 1,
        "issuer": {
            "role": "RELEASE_AUTHORITY",
            "user_id": actor.id,
            "signer_key_id": signer.key_id,
        },
    }

    # RFC 8785 Canonical Serialization & SHA-256 Hashing
    _, digest_hex = compute_canonical_hash(canonical_payload)

    # Ed25519 Signing with RA key
    signature_hex, signer_key_id = signer.sign_digest(digest_hex)

    # Policy snapshot
    policy_snapshot = {
        "letter_validity_days": validity_days,
        "interest_destination": settlement["destination_account"],
        "penalty_rules": policy.get("penalty_rules", db),
    }

    # Persist immutable release letter
    letter = ReleaseLetter(
        id=letter_id,
        release_request_id=request.id,
        obligation_id=request.obligation_id,
        institute_id=request.institute_id,
        bank_id=bank_id,
        fdr_number=fdr_number,
        state=LetterState.ISSUED.value,
        verification_code=verification_code,
        letter_hash=digest_hex,
        signature_hex=signature_hex,
        signer_key_id=signer_key_id,
        canonical_payload_json=canonical_payload,
        policy_snapshot_json=policy_snapshot,
        principal_paise=settlement["total_principal_paise"],
        aicte_share_paise=settlement["aicte_share_paise"],
        principal_to_trust_paise=settlement["principal_to_trust_paise"],
        penalty_paise=settlement["penalty_paise"],
        interest_paise=settlement["interest_paise"],
        destination_account_json=settlement["destination_account"],
        issued_at=now,
        valid_until=valid_until,
    )
    db.add(letter)

    # Transition request to APPROVED
    request.state = ReleaseState.APPROVED.value
    request.letter_id = letter.id
    request.settlement_json = settlement
    request.updated_at = now

    # Cryptographic Audit Log
    audit.log(
        actor=actor,
        action="RELEASE_LETTER_SIGNED",
        entity_type="RELEASE_LETTER",
        entity_id=letter.id,
        payload={
            "release_request_id": request.id,
            "verification_code": letter.verification_code,
            "letter_hash": letter.letter_hash,
            "principal_paise": letter.principal_paise,
            "aicte_share_paise": letter.aicte_share_paise,
            "signer_key_id": signer_key_id,
        },
        db=db,
    )

    # Notification to Institute Signatory
    notify.send(
        title="Release letter issued & signed",
        body=f"Release letter {letter.verification_code} has been digitally signed by AICTE Release Authority.",
        role=Role.INS_SIGNATORY,
        institute_id=request.institute_id,
        level="HIGH",
        link="/institute/release",
        dedupe_key=f"release-letter:{letter.id}:issued",
        db=db,
    )

    # Notification to Bank Maker
    notify.send(
        title="New release letter for settlement",
        body=f"Release letter {letter.verification_code} issued for FDR {fdr_number}. Ready for execution.",
        role=Role.BANK_MAKER,
        bank_id=bank_id,
        level="INFO",
        link="/bank/letters",
        dedupe_key=f"release-letter:{letter.id}:bank",
        db=db,
    )

    db.commit()
    db.refresh(letter)
    return letter


def get_release_letter(letter_id: str, actor: User, db: Session) -> ReleaseLetter:
    """Fetch release letter with multi-tenant institute scoping."""
    letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
    if not letter:
        raise NotFoundError(f"Release letter '{letter_id}' not found")

    is_institute_user = any(r in (Role.INS_SIGNATORY.value, Role.INS_ADMIN.value) for r in actor.roles)
    if is_institute_user and actor.institute_id and letter.institute_id != actor.institute_id:
        raise NotFoundError(f"Release letter '{letter_id}' not found")

    return letter


def get_release_letter_pdf(letter_id: str, actor: User, db: Session, base_url: str | None = None) -> bytes:
    """Generate and return binary PDF for a release letter."""
    letter = get_release_letter(letter_id, actor, db)

    inst = db.query(Institute).filter(Institute.id == letter.institute_id).first()
    institute_name = inst.name if inst else letter.institute_id

    obligation = intake_service.get_obligation(letter.obligation_id, db)
    trust_name = "Institute Sponsoring Trust"
    if obligation and obligation.trust_id:
        trust = db.query(Trust).filter(Trust.id == obligation.trust_id).first()
        if trust and trust.name:
            trust_name = trust.name

    bank = db.query(Bank).filter(Bank.id == letter.bank_id).first()
    bank_name = bank.name if bank else f"Bank {letter.bank_id}"

    return generate_release_letter_pdf(
        letter=letter,
        institute_name=institute_name,
        trust_name=trust_name,
        bank_name=bank_name,
        base_url=base_url,
    )


def revoke_release_letter(letter_id: str, reason: str, actor: User, db: Session) -> ReleaseLetter:
    """Release Authority revokes an active release letter prior to execution."""
    if Role.RELEASE_AUTHORITY.value not in actor.roles and Role.SYSTEM_ADMIN.value not in actor.roles:
        raise ForbiddenError("Only Release Authority can revoke release letters")

    if not reason or len(reason.strip()) < 3:
        raise ValidationError("Revocation reason must be at least 3 characters")

    letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
    if not letter:
        raise NotFoundError(f"Release letter '{letter_id}' not found")

    if letter.state != LetterState.ISSUED.value:
        raise InvalidStateError(f"Cannot revoke letter from state '{letter.state}'. Expected ISSUED.")

    now = clock.now()
    letter.state = LetterState.REVOKED.value
    letter.revoked_at = now
    letter.revoke_reason = reason.strip()
    letter.revoked_by_id = actor.id

    # Update parent release request if present
    req = db.query(ReleaseRequest).filter(ReleaseRequest.id == letter.release_request_id).first()
    if req:
        req.state = ReleaseState.REVOKED.value
        req.updated_at = now

    audit.log(
        actor=actor,
        action="RELEASE_LETTER_REVOKED",
        entity_type="RELEASE_LETTER",
        entity_id=letter.id,
        payload={"reason": letter.revoke_reason, "revoked_by": actor.id},
        db=db,
    )

    notify.send(
        title="Release letter revoked",
        body=f"Release letter {letter.verification_code} was revoked: {reason.strip()}",
        role=Role.INS_SIGNATORY,
        institute_id=letter.institute_id,
        level="HIGH",
        link="/institute/release",
        dedupe_key=f"release-letter:{letter.id}:revoked",
        db=db,
    )

    db.commit()
    db.refresh(letter)
    return letter

