## 3. Contract Pack (Day 1 night par freeze → tag `contract-v1`)

### 3.1 Conventions

- Sab API `/api/...`, JSON, `Authorization: Bearer <jwt>`. IDs = `uuid4` string.
- **Paisa:** money API me **integer paise** (`principal_paise`). UI `formatINR(paise)` se dikhata hai. Letter payload me string `"4500000.00"`.
- **Time:** ISO-8601 UTC (`2026-10-24T10:15:00Z`). Dates `YYYY-MM-DD`. Sab `clock.now()` se.
- **Error shape:** `{"error": {"code": "SOD_VIOLATION", "message": "...", "details": {}}}`  
  Codes: `UNAUTHENTICATED, FORBIDDEN, STEP_UP_REQUIRED, SOD_VIOLATION, NOT_FOUND, VALIDATION_ERROR, INVALID_STATE, ELIGIBILITY_FAILED, AMOUNT_MISMATCH, VERIFY_NO_MATCH, RATE_LIMITED, DEPENDENCY_UNAVAILABLE`.
- Pagination: `?page=1&page_size=25` → `{items, total}`.
- Instrument fields (frozen names): `fdr_number, bank_ifsc, principal_paise, issue_date, maturity_date, interest_rate_pct, favouring, holder_names, lien_marked, lien_ref, accrued_interest_paise`. API me har field: `{name, value, trust: L0_CLAIMED|L1_ATTESTED|L2_BANK_CONFIRMED, source, evidence_ref, set_at}`.

### 3.2 `backend/app/core/enums.py` (Premansh paste karega, **frozen**)

```python
from enum import Enum

class Role(str, Enum):
    INS_SIGNATORY="INS_SIGNATORY"; INS_ADMIN="INS_ADMIN"
    SCRUTINY_OFFICER="SCRUTINY_OFFICER"; APPROVING_OFFICER="APPROVING_OFFICER"
    RELEASE_AUTHORITY="RELEASE_AUTHORITY"; FINANCE_OFFICER="FINANCE_OFFICER"
    COMPLIANCE_OFFICER="COMPLIANCE_OFFICER"; LEADERSHIP="LEADERSHIP"
    AUDITOR="AUDITOR"; SYSTEM_ADMIN="SYSTEM_ADMIN"
    BANK_MAKER="BANK_MAKER"; BANK_CHECKER="BANK_CHECKER"

class TrustLevel(str, Enum):
    L0_CLAIMED="L0_CLAIMED"; L1_ATTESTED="L1_ATTESTED"; L2_BANK_CONFIRMED="L2_BANK_CONFIRMED"

class InstrumentState(str, Enum):   # v1 me jo use hote hain; baaki SRS §5.1 me
    SUBMITTED="SUBMITTED"; AUTO_CHECKING="AUTO_CHECKING"; SCRUTINY="SCRUTINY"
    CHANGES_REQUESTED="CHANGES_REQUESTED"; BANK_PENDING="BANK_PENDING"
    DISCREPANCY="DISCREPANCY"; REJECTED="REJECTED"; ACTIVE="ACTIVE"
    RENEWAL_DUE="RENEWAL_DUE"; LAPSED="LAPSED"; SUPERSEDED="SUPERSEDED"
    MATURED="MATURED"; RELEASE_LOCKED="RELEASE_LOCKED"; RELEASED="RELEASED"; CLOSED="CLOSED"
# Overlays (state nahi, boolean/hold): is_quarantined, on_hold

class ObligationState(str, Enum):
    PENDING_DEPOSIT="PENDING_DEPOSIT"; PARTIALLY_COVERED="PARTIALLY_COVERED"; COVERED="COVERED"
    TERM_COMPLETE="TERM_COMPLETE"; RELEASE_IN_PROGRESS="RELEASE_IN_PROGRESS"; CLOSED="CLOSED"

class BankRequestState(str, Enum):
    CREATED="CREATED"; NOTIFIED="NOTIFIED"; ACKNOWLEDGED="ACKNOWLEDGED"
    MAKER_SUBMITTED="MAKER_SUBMITTED"; CONFIRMED="CONFIRMED"
    CONFIRMED_WITH_EXCEPTIONS="CONFIRMED_WITH_EXCEPTIONS"; NOT_FOUND="NOT_FOUND"
    ESCALATED="ESCALATED"; TIMED_OUT="TIMED_OUT"

class BankOutcome(str, Enum):
    ALL_CLEAR="ALL_CLEAR"; EXCEPTIONS="EXCEPTIONS"; NOT_FOUND="NOT_FOUND"

class ReleaseState(str, Enum):
    SUBMITTED="SUBMITTED"; INELIGIBLE="INELIGIBLE"; SCRUTINY="SCRUTINY"; RECOMMENDED="RECOMMENDED"
    APPROVED="APPROVED"; LETTER_EXPIRED="LETTER_EXPIRED"; REVOKED="REVOKED"; EXECUTED="EXECUTED"
    SETTLEMENT_PENDING="SETTLEMENT_PENDING"; CLOSED="CLOSED"; REJECTED="REJECTED"

class LetterState(str, Enum):
    ISSUED="ISSUED"; EXECUTED="EXECUTED"; EXPIRED="EXPIRED"; REVOKED="REVOKED"; SUPERSEDED="SUPERSEDED"

class PublicVerifyStatus(str, Enum):  # public page ka result
    VALID="VALID"; EXPIRED="EXPIRED"; REVOKED="REVOKED"; SUPERSEDED="SUPERSEDED"
    EXECUTED="EXECUTED"; TAMPERED="TAMPERED"      # no-match alag: error VERIFY_NO_MATCH

class Severity(str, Enum):  LOW="LOW"; MEDIUM="MEDIUM"; HIGH="HIGH"
class DiscrepancyStatus(str, Enum):  OPEN="OPEN"; CLEARED="CLEARED"; ESCALATED="ESCALATED"; REJECTED="REJECTED"
class RuleResult(str, Enum):  PASS="PASS"; WARN="WARN"; FAIL="FAIL"; MANUAL="MANUAL"
class EligibilityVerdict(str, Enum):  ELIGIBLE="ELIGIBLE"; INELIGIBLE="INELIGIBLE"; MANUAL_REVIEW="MANUAL_REVIEW"
class DocCheckOutcome(str, Enum):  PASS="PASS"; FLAG="FLAG"; NA="NA"; ERROR="ERROR"
class CaseType(str, Enum):  TERM_COMPLETE="TERM_COMPLETE"      # v1 me sirf yehi
class RenewalMode(str, Enum):  SAME_NUMBER="SAME_NUMBER"; NEW_NUMBER="NEW_NUMBER"; REPLACEMENT="REPLACEMENT"

class AlertType(str, Enum):
    MATURITY_180="MATURITY_180"; MATURITY_90="MATURITY_90"; MATURITY_30="MATURITY_30"; MATURITY_7="MATURITY_7"
    LAPSED="LAPSED"; LAPSE_ESCALATED="LAPSE_ESCALATED"
    BANK_REMINDER_3="BANK_REMINDER_3"; BANK_REMINDER_7="BANK_REMINDER_7"
    BANK_ESCALATION_14="BANK_ESCALATION_14"; BANK_ESCALATION_21="BANK_ESCALATION_21"; BANK_TIMEOUT_30="BANK_TIMEOUT_30"
    LETTER_EXPIRED="LETTER_EXPIRED"; QUARANTINE_VIGILANCE="QUARANTINE_VIGILANCE"
```

**Discrepancy codes (strings, SRS §6.11):** `D-01, D-02, D-05, D-07, D-10, D-11, D-12, D-14, D-15, D-17, D-18`.  
**Eligibility rules:** `E-01…E-08, E-12`.

### 3.3 Seed users (password `demo@123`, step-up PIN `246810`)

| Username | Roles | Note |
|---|---|---|
| `vj_sig`, `ar_sig`, `na_sig`, `ta_sig` | INS_SIGNATORY | Vidya Jyoti / Aryabhatta / Nalanda / Takshashila |
| `so1`, `so2` | SCRUTINY_OFFICER | |
| `ao1` | SCRUTINY_OFFICER + APPROVING_OFFICER | **SoD demo ke liye** (khud scrutiny karke khud activate nahi kar sakta) |
| `ao2` | APPROVING_OFFICER | |
| `ra1` | RELEASE_AUTHORITY | Member Secretary; Ed25519 key seed pe banti hai |
| `fo1` / `co1` / `lead1` / `aud1` / `admin1` | FINANCE / COMPLIANCE / LEADERSHIP / AUDITOR / SYSTEM_ADMIN | |
| `brb_mk`, `brb_ck`, `hcb_mk`, `hcb_ck`, `scb_mk`, `scb_ck` | BANK_MAKER / BANK_CHECKER | Fictional banks: BRB (`BRBK`), HCB (`HCBK`), SCB (`SCBK`) |

Users ke `roles` ek list hote hain; bank users ka `bank_id`, institute users ka `institute_id` bound hota hai.

### 3.4 Table ownership (columns owner decide karta hai; table names/FKs ye)

| Owner | Tables |
|---|---|
| Premansh (core) | `user, notification, audit_event, clock_state, policy_version, job_run` |
| Premansh (monitoring) | `alert` |
| Premansh (release) | `release_request, eligibility_result, hold, release_letter, bank_execution, settlement` |
| Piyush (intake) | `institute, trust, obligation, instrument, instrument_version, field_trust, document, doc_check, discrepancy, instrument_state_history` |
| Piyush (bank) | `bank, bank_nodal_contact, bank_request, bank_checklist_item` |
| Mehak (insights) | `risk_score` |

### 3.5 Endpoint catalogue (prefix `/api`)

Stub-first: Day 1 raat tak har endpoint **final response model + example data** ke saath chal raha ho.

| Endpoint | Roles | Owner |
|---|---|---|
| `POST /auth/login` · `POST /auth/step-up {pin}` · `GET /me` · `GET /demo/users` (DEMO_MODE) | public / any | Premansh |
| `GET /notifications` · `POST /notifications/{id}/read` | any | Premansh |
| `GET /audit` · `GET /audit/verify` | AUDITOR, SYSTEM_ADMIN, officers | Premansh |
| `POST /admin/audit/tamper-demo` · `POST /admin/audit/repair-demo` | SYSTEM_ADMIN + DEMO_MODE | Premansh |
| `GET /admin/clock` · `POST /admin/clock/advance {days, run_tick}` · `POST /admin/clock/reset` · `POST /admin/tick` | SYSTEM_ADMIN + DEMO_MODE | Premansh |
| `GET /policy` | officers, admin | Premansh |
| `GET /alerts` | officers; institute (scoped) | Premansh |
| `GET /institutes/me` · `GET /obligations` · `GET /obligations/{id}` | INS_*, officers | Piyush |
| `POST /documents/preview` (multipart PDF → extracted fields + checks) | INS_* | Piyush |
| `POST /instruments` (multipart: file + fields → creates `SUBMITTED`, runs pipeline) | INS_SIGNATORY | Piyush |
| `GET /instruments` · `GET /instruments/{id}` (fields+trust, versions, docs, checks, discrepancies, bank requests) · `GET /instruments/{id}/timeline` · `GET /instruments/{id}/document` | role-scoped | Piyush |
| `GET /discrepancies` · `POST /discrepancies/{id}/resolve {action: CLEAR\|ESCALATE\|REJECT, note}` | SO, AO | Piyush |
| `POST /instruments/{id}/quarantine` · `POST /instruments/{id}/reject` | AO (quarantine: AO/CO) | Piyush |
| `POST /instruments/{id}/renew {mode, new fields/file}` | INS_SIGNATORY | Piyush |
| `POST /instruments/{id}/activate` (step-up) | AO | Piyush |
| `GET /banks` · `GET /banks/{id}/nodal-contacts` | officers | Piyush |
| `POST /bank-requests {instrument_id, reason}` · `GET /bank-requests` · `GET /bank-requests/{id}` | SO/AO | Piyush |
| `GET /bank/inbox` · `GET /bank/requests/{id}` · `POST /bank/requests/{id}/maker-submit {checklist[12], outcome, remarks}` · `POST /bank/requests/{id}/checker-decision {decision: AUTHORISE\|RETURN, remarks}` | BANK_MAKER / BANK_CHECKER | Piyush |
| `GET /queue` · `GET /instruments/{id}/risk` | officers | Mehak |
| `GET /kpi/summary` · `GET /kpi/breakdown?by=state\|bank` · `GET /kpi/maturity-ladder` · `GET /reports/export.csv?type=` | LEADERSHIP, officers | Mehak |
| `GET /cases/{type}/{id}/evidence-pack` *(P1)* | AUDITOR, officers | Mehak |
| `POST /release/requests` · `GET /release/requests` · `GET /release/requests/{id}` · `POST .../resubmit` | INS_SIGNATORY / officers | Premansh |
| `POST /release/requests/{id}/recommend` · `.../reject` | AO | Premansh |
| `POST /release/requests/{id}/sign` (step-up) · `POST /release/letters/{id}/revoke` | RA | Premansh |
| `GET /release/letters/{id}` · `GET /release/letters/{id}/pdf` | RA, INS_SIGNATORY, officers | Premansh |
| `GET /holds` · `POST /holds` · `POST /holds/{id}/lift` | COMPLIANCE_OFFICER | Premansh |
| `GET /bank/letters` · `POST /bank/letters/{id}/execute-maker {utr, principal_paise, aicte_share_paise, date}` · `.../execute-checker {decision}` | BANK_MAKER / BANK_CHECKER | Premansh |
| `GET /finance/settlements` · `POST /finance/settlements/{release_id}/confirm {credited_paise, bank_ref, override_note?}` | FINANCE_OFFICER | Premansh |
| `POST /public/verify {code, fdr_number, ifsc}` · `GET /public/verify/{code}` | **public (no login)** | Premansh |

### 3.6 Service interfaces (cross-module calls; sirf yehi use karo)

| Module | Functions |
|---|---|
| `core` | `audit.log(actor, action, entity_type, entity_id, payload)` · `clock.now()` · `policy.get(key)` · `notify.send(to_user|role+scope, type, title, body, entity_ref)` · `jobs.register(name)(fn)` · `sod.ensure_different(user, other_user_id, rule)` · `require_roles(...)` · `require_step_up` |
| `intake.service` | `get_instrument(id)` · `list_instruments(filter)` · `get_fields(id) -> {name: {value, trust}}` · `transition(instrument_id, to_state, actor, reason)` *(single place jahan state badalti hai; audit + history yahin)* · `add_discrepancy(instrument_id, code, severity, details)` · `recompute_coverage(obligation_id)` · `get_obligation(id)` · `set_obligation_state(id, state)` |
| `bank.service` | `create_request(instrument_id, actor, reason)` · `latest_confirmation(instrument_id) -> {confirmed_at, outcome}` (E-08 ke liye) |
| `insights.service` | `rescore(instrument_id)` · `rescore_all()` |
| `release.service` | `get_active_hold(scope, id)` |

---

