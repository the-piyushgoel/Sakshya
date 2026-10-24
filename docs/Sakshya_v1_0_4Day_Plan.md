# Sakshya v1.0 — 4-Day Battle Plan (SIH Submission)

> **Team:** Payal · Mehak · Premansh · Piyush  
> **Goal:** 4 din me → (1) full-vision **PPT**, (2) **working prototype v1.0**, (3) **demo video** → submit.  
> **Source:** `AICTE_Sakshya_SRS.md` (SRS-SAK-001). Ye plan SRS ka **4-din ka thin-but-real slice** hai. Baaki sab SRS me hai, submission ke baad scale karenge (§10).  
> **Estimates** AI-assisted hain (Claude Code / Cursor / ChatGPT use karte hue).

---

## 0. TL;DR

1. **v1.0 = "Golden Path" (12 steps, §1.1)** jo `make reset` ke baad **3 baar lagataar bina error** chale. Isse zyada kuch nahi.
2. **Backend logic real** (state machines, trust levels, maker-checker, signed letter, audit chain). **Infra simple** (SQLite, in-process jobs, simulators). SRS Appendix H me ye already "simulated" declared hai, toh judges ko honestly bata sakte hain.
3. **4 lanes, 4 alag folders.** Koi kisi ki file nahi chhoota. Beech ka rasta = **frozen contract** (§3) + **stub-first** APIs.
4. **Din ka flow:** Day 1 foundation + contract freeze → Day 2 first vertical slice (submit → ACTIVE) → Day 3 release + public verify + dashboard, **feature freeze raat ko** → Day 4 bugfix, rehearsal, video, submit.
5. **Recording shuru hone ke baad code freeze.** Video aur build match hone chahiye.

| Lane | Kaun | Naam | Kya own karta hai |
|---|---|---|---|
| A | **Premansh** | **Spine & Release Engine** | Backend core (auth, audit chain, clock, policy, notifications, jobs), monitoring, release eligibility, signed letter, public verify, settlement, **integration owner** |
| B | **Piyush** | **Intake, Forgery & Bank-Trust Chain** | Doc-intel (forgery checks), intake APIs, discrepancy engine, bank confirmation, activation, renewal, demo panel UI, audit UI |
| C | **Mehak** | **Officer Brain & Consoles** | Risk score / priority queue / KPI APIs + Officer console, Bank console, Leadership dashboard |
| D | **Payal** | **Face of the Product** | Design system + app shell, Institute portal, Public verify page, RA + Finance workspaces, **PPT**, **video** |

**Buddy pairs** (koi bimar/atak jaye toh): Premansh ↔ Piyush (backend), Mehak ↔ Payal (frontend).

---

## 1. v1.0 Scope

### 1.1 Golden Path (yehi demo hai, yehi release criteria hai)

Capability tags **C1–C10** = SIH problem statement ki 10 expected capabilities (SRS §9.1): C1 Repository · C2 Document mgmt · C3 Verification & discrepancy · C4 Validity/maturity tracking · C5 Renewal/replacement · C6 Release/refund workflow · C7 Alerts & escalation · C8 Dashboard/reports · C9 Audit & access control · C10 Integration & security. **U1–U8** = USPs (SRS §1.4).

| # | Judge kya dekhega | Capability / USP | Lanes |
|---|---|---|---|
| G1 | Institute (Aryabhatta) login → obligation `PENDING_DEPOSIT`, required vs covered | C1 | D, B |
| G2 | Tampered FDR upload → plain-language flags (QR vs printed amount D-11, favouring D-07). Phir genuine FDR upload → fields auto-extract → submit → sab fields **L0 (claimed)** | C2, C3 · U4 | D, B |
| G3 | Officer queue me **"why this is first"** (risk factors) → case open → **bank confirmation request** (sirf directory contact, document wala contact ignore) | C3 · U7, U2 | C, B |
| G4 | Bank console: maker 12-point checklist bharta hai, checker authorise karta hai → fields **L0 → L2 (bank-confirmed)** badge flip | C3 · U1 | C, B |
| G5 | `ao1` (jisne scrutiny ki) activate try kare → **SOD_VIOLATION**. `ao2` step-up ke saath activate → `ACTIVE`, obligation `COVERED` | C9 | B, D |
| G6 | Leadership dashboard KPIs update (record accuracy, verification TAT, pending aging) | C8 | C |
| G7 | **Time travel**: Takshashila FDR → 180/90/30/7-din alerts → `RENEWAL_DUE` → institute new FDR number se renew → bank re-confirm → coverage continuous. Ek aur FDR `LAPSED` + escalation | C4, C5, C7 | A, B, D, C |
| G8 | Forgery: Nalanda ka duplicate FDR + bank `NOT_FOUND` → `QUARANTINED` + vigilance notification | C3 · U4 | B, A |
| G9 | Vidya Jyoti release request → **INELIGIBLE** (compliance hold, E-06) with fix hint → hold lift → **ELIGIBLE** → AO recommends | C6 | A, C, D |
| G10 | RA **step-up** ke saath sign karta hai → **letter PDF** (hash + QR, 14-din validity) | C6 · U3 | A, D |
| G11 | **Public verify (phone pe QR scan):** VALID → edited copy → NO_MATCH/TAMPERED → bank maker-checker execution (UTR) → EXECUTED → replay rejected | C6, C10 · U3 | D, A, C |
| G12 | Finance AICTE share confirm → `CLOSED`. **Audit: Verify chain = OK → "simulate tamper" → BROKEN at #seq** → repair | C9 · U8 | A, B |

### 1.2 Scope table

| Bucket | Items |
|---|---|
| **P0 — v1.0 me mandatory** | Trust levels L0/L1/L2 per field · intake wizard + doc-intel checks · discrepancy engine · bank maker-checker confirmation · activation (SoD + step-up) · obligation coverage · maturity windows + `RENEWAL_DUE` + `LAPSED` · renewal (same/new number) · risk score + explainable queue · KPI dashboard · time-travel panel · eligibility engine (E-01…E-08, E-12-lite) + holds · signed letter + PDF + QR · public verify (uniform errors + simple rate-limit) · bank execution ack · finance settlement · hash-chained audit + verify + tamper demo · in-app notifications · deterministic seed · smoke script |
| **P1 — sirf agar aage chal rahe ho** | Replacement at another bank · request-changes / institute respond · bank-wise reconciliation (PY-P1) · evidence pack · scanned-FDR OCR (pytesseract) · email outbox viewer · lien mandate pack PDF · Hindi labels |
| **OUT (v1.0 me nahi)** | Postgres/Alembic, Celery/Redis, MinIO, TOTP MFA, OIDC/Parichay, real eSign/DSC, SMS, cash deposit, legacy import, partial/special release, delegation, policy 2-person approval, Regional module, Helm/K8s, observability, perf tests. Ye sab PPT ke **roadmap** slide pe jayega |

### 1.3 Simplified stack (SRS vs v1.0)

| Layer | SRS (production) | **v1.0 (4 din)** | Kyun |
|---|---|---|---|
| DB | PostgreSQL + Alembic | **SQLite + `create_all`** (schema badli → `make reset`) | Zero setup, migration conflicts zero |
| Jobs | Celery + Redis | **In-process job registry + `POST /admin/tick`** | Time-travel demo ke liye better |
| Files | MinIO | Local `data/files/` | |
| Doc-intel | Alag service, Tesseract hin+eng | **Python package `backend/doc_intel`**: PyMuPDF (text + render) + OpenCV QR + metadata heuristics + rapidfuzz | Sab `pip install`, system libs nahi |
| Auth | Argon2 + TOTP + OIDC | Password + JWT + **step-up PIN** | |
| Signing | KMS/HSM, eSign | **Ed25519 software keys** (SimulatedSigner) | SRS Appendix H |
| PDF | WeasyPrint | **reportlab + qrcode** | WeasyPrint ko system libs chahiye (Windows pe dard) |
| Frontend | React + TS + Vite + Tailwind + Radix + Storybook + i18n | React + TS + Vite + Tailwind + TanStack Query + Recharts; `/ui-kit` page (no Storybook) | |
| Bank | Mock-bank service + adapters | **Bank Console = PortalChannel** + seeded bank users | SRS me portal channel hi default hai |

### 1.4 Cut Ladder (peeche pad rahe ho toh is order me kaato)

1. PY-P1 Reconciliation → 2. Evidence pack (PDF) → JSON download only → 3. Lien mandate pack → 4. Replacement-at-another-bank → 5. Dashboard charts 6 se 3 → 6. Finance UI → single confirm button → 7. SLA ladder sirf "timeout" tak.

**KABHI NAHI KAATNA:** Trust badges (L0→L2) · bank maker-checker · activation SoD · time-travel + alerts · eligibility + signed letter + public verify · audit chain verify.

---

## 2. Conflict-free Working Model

### 2.1 Repo layout + ownership

```text
sakshya/
├─ backend/
│  ├─ app/
│  │  ├─ main.py                      [Premansh] router auto-discovery, kabhi edit nahi karna
│  │  ├─ core/                        [Premansh] enums, errors, db, auth, sod, audit, clock, policy, notify, jobs
│  │  └─ modules/
│  │     ├─ intake/                   [Piyush]  institutes, obligations, instruments, docs, discrepancies
│  │     ├─ bank/                     [Piyush]  directory, requests, checklist, activation hooks
│  │     ├─ insights/                 [Mehak]   risk, queue, KPI, reports
│  │     ├─ monitoring/               [Premansh] maturity windows, lapse, alerts
│  │     ├─ release/                  [Premansh] eligibility, holds, letter, execution, settlement
│  │     └─ public/                   [Premansh] public verify
│  ├─ doc_intel/                      [Piyush]  standalone package (no app import)
│  ├─ requirements/{core,intake,insights,release}.txt   # har lane ki apni file; requirements.txt unhe -r se jodta hai
│  └─ tests/<module>/
├─ frontend/
│  └─ src/
│     ├─ ui/ · shell/ · api/          [Payal]   design system, layout, API client
│     └─ features/
│        ├─ institute/ public/ release-desk/   [Payal]
│        ├─ officer/ bank/ dashboard/          [Mehak]
│        └─ demo/ audit/                       [Piyush]
├─ samples/                           [Piyush]  sample FDR PDFs
├─ scripts/  seed_all.py, smoke/      [Premansh orchestrator; har lane apni smoke/<lane>.py]
├─ docs/  ppt/ video/ qa/             [Payal; qa/<lane>.md har lane]
└─ README.md · OWNERS.md · KNOWN_ISSUES.md · Makefile
```

**Seed:** har module `seed.py` me `seed()` deta hai. `scripts/seed_all.py` order me call karta hai: core → intake → bank → monitoring → release → insights.

### 2.2 Golden rules (conflict zero)

1. **Apne folder ke bahar commit nahi.** Push se pehle `git diff --name-only origin/main` dekho. Kisi aur ki file me change chahiye → us lane ko message.
2. **Dusre module ki table me direct write nahi.** Sirf unki **service function** call karo (§3.6).
3. **Frontend routes/nav auto-register:** har feature `routes.tsx` + `nav.ts` export karta hai, shell `import.meta.glob` se uthata hai. `App.tsx` / router file kisi ko edit nahi karni.
4. **`frontend/src/ui/` sirf Payal edit karti hai.** Naya component chahiye → apne feature folder me bana lo, ya Payal ko bolo.
5. **`api/generated.ts` commit nahi hota** (gitignored). Pull ke baad `npm run gen:api` chalao (backend local chal raha hona chahiye). TS errors = contract drift ka alarm.
6. **`package-lock.json` hand-merge nahi.** Conflict aaye → `main` ka version lo, `npm install` dobara.
7. **Schema badla?** Group me bolo: "SCHEMA CHANGE: <table>". Sab pull karke `make reset`. (Alembic nahi hai, isliye migration conflict hota hi nahi.)
8. **Time:** `datetime.now()` / `Date.now()` business logic me **banned**. Sirf `clock.now()`. (Time-travel isi pe tikta hai.)

### 2.3 Git rules

- Branch: `feat/<lane>-<task>` (e.g. `feat/piyush-py4-bank`). Chhote PR, **din me kam se kam 2 baar `main` pe merge** (dopahar + raat).
- Merge se pehle: `git pull --rebase origin main` → §6 push gate → PR → buddy 5-min review (buddy nahi mile toh self-merge, gate pass karke).
- `main` pe force-push never. Commit format: `feat(bank): maker-checker checklist`.
- Tags: `contract-v1` (S1), `v1.0-rc1` (S3), `v1.0` (S4).

### 2.4 Contract change protocol

- **Additive** (naya optional field) → free, bas group me likho.
- **Breaking** (field rename, enum value badla, path badla) → **sirf sync points pe**, ya 1 ghante ka notice + sab ke "👍" ke baad. Stub bhi update karo.

### 2.5 AI use + token bachat

- **Poora SRS kabhi paste mat karo** (5700+ lines). Appendix A ka **slice map** use karo: `sed -n '2131,2175p' AICTE_Sakshya_SRS.md`. SRS file ko edit mat karo warna line numbers shift ho jayenge.
- **1 AI session = 1 task card.** Naya task → fresh chat. Purani lambi chat me context bhar jata hai aur tokens jaate hain.
- Prompt me hamesha: *"code + tests, minimal diff, lamba explanation nahi"*.
- **Strong model sirf yahan:** PR-3 (audit chain), PR-6 (eligibility), PR-7 (signing), PY-1 (doc-intel heuristics), PY-4 (bank workflow). Baaki (UI boilerplate, seeds, CSV, tables) → fast/cheap model.
- Bug: error trace + ek file + expected behaviour paste karo. **2 retries ke baad** khud debug karo ya buddy se poochho.
- Din 4 pe "refactor/polish" mat karwao. Sirf bugfix.

**Prompt template:**

```text
ROLE: Senior engineer, project "Sakshya" (AICTE FDR portal), 4-day prototype.
TASK CARD: <is file se apna task card paste karo>
CONTRACT: <§3.2 enums + §3.5 me apne module ke endpoints>
SRS EXTRACT: <Appendix A se sirf zaroori slice>
RULES: sirf <apne folders> me edit. Enum/endpoint rename nahi. clock.now(), audit.log(),
policy.get() use karo. Output: code + tests. Lamba explanation nahi.
```

---

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

## 4. Timeline + Sync Points

| | **Premansh** | **Piyush** | **Mehak** | **Payal** |
|---|---|---|---|---|
| **Day 1 AM** | PR-1 scaffold (**jaldi push**), PR-2 | PY-1 doc-intel (standalone, scaffold ka wait nahi) | MK-1 risk functions (pure Python) | PA-1 UI kit + shell (**dopahar tak push**) |
| **Day 1 PM** | PR-3, PR-4 | PY-1 finish, PY-S0 stubs, PY-2a models + seed v0 | MK-3/MK-4 UI **fixtures pe** (UI kit milte hi) | PA-2 wizard UI fixtures pe |
| **Day 1 raat** | PR-S1 stubs | seed v0 push | MK-S1 stubs | `gen:api` chal raha hai |
| **▶ S1** | **Contract freeze** (§4.1) → tag `contract-v1` | | | |
| **Day 2 AM** | PR-5 monitoring | PY-2b real intake APIs | MK-2 insights wiring | PA-2 institute portal **real API pe** |
| **Day 2 PM** | PR-6 release request + eligibility + holds | PY-3, PY-4 bank workflow | MK-3 officer console real, MK-4 bank console real | PA-2 cont., PA-3 public verify |
| **Day 2 raat** | PR-9 smoke skeleton + merge | PY-5a activation, PY-7 demo panel | MK-4 finish, MK-6 start | PA-5 PPT skeleton |
| **▶ S2** | **First vertical slice G1–G6 real APIs pe** (§4.1) | | | |
| **Day 3 AM** | PR-7 letter sign/PDF/QR | PY-5b renewal, PY-6 SLA, PY-8 audit UI | MK-5 release views + holds, MK-6 dashboard | PA-4 RA + Finance |
| **Day 3 PM** | PR-8 verify + execution + settlement | Q&A notes, bugfix, PY-P1 *(agar time ho)* | MK-6 finish | PA-5 PPT diagrams |
| **▶ S3** | **FEATURE FREEZE** (raat) → tag `v1.0-rc1` | | | |
| **Day 4 AM** | bugfix, PR-9 | bugfix, samples | bugfix, demo script segment | PPT finalize (screenshots) |
| **▶ S4 (dopahar)** | **tag `v1.0`** → code freeze | | | |
| **Day 4 PM** | Rehearsal ×2 → **record (chapter-wise)** → edit → PPT/video final → **submit** (upload buffer ke saath) | | | |

### 4.1 Sync point gates

**S1 — Contract Freeze (Day 1 raat):**
☐ Chaaron ne `main` pull karke `make reset && make run` chalaya ☐ `/docs` me §3.5 ke saare endpoints dikhte hain (response models ke saath) ☐ `npm run gen:api` → `tsc` zero errors ☐ har seeded role se login ho raha hai ☐ UI kit v0 `main` pe ☐ `enums.py` §3.2 se exact match ☐ tag `contract-v1`.

**S2 — First vertical slice (Day 2 raat):**
☐ `make smoke` G1–G6 pass ☐ UI se bhi G1–G6 manually (real API, mocks nahi) ☐ `ao1` activate → SOD_VIOLATION dikhta hai ☐ KNOWN_ISSUES.md me jo toota hai likha hai.

**S3 — Feature Freeze (Day 3 raat):**
☐ G1–G12 **UI se** ek baar poora ☐ `make smoke` full green ☐ `v1.0-rc1` tag ☐ **ab sirf bugfix. Naya feature = kuch purana hatao.**

**S4 — v1.0 (Day 4 dopahar):**
☐ `make reset` → Golden Path **3 baar lagataar** clean ☐ §9 checklist ☐ tag `v1.0` ☐ **code freeze** (recording ke baad koi change nahi).

---

## 5. Lane Task Cards

Format: **ID · Din · Est · Priority** → *Build* → **Checks**. "☐" = push se pehle tick karna hai. Saare tasks pe §6 global push gate bhi lagta hai.

---

### 🅰️ PREMANSH — Spine & Release Engine (≈26h)

**Dependencies:** kisi ka wait nahi. Sab tumhare scaffold ka wait karenge, isliye **PR-1 sabse pehle aur jaldi push**.

#### PR-1 · Scaffold + contract base · Day 1 AM · 2h · P0
*Build:* monorepo layout (§2.1) · FastAPI + SQLAlchemy + SQLite · `core/enums.py` (§3.2 paste) · `core/errors.py` (error shape §3.1) · router auto-discovery (`modules/*/router.py` me `router` ho toh include) · khaali router files har module me · `requirements/` split · `/api/health` · CORS · `.env.example` (`DEMO_MODE=true`) · `scripts/seed_all.py` orchestrator · `Makefile` (`run, reset, test, smoke`; Windows ho toh PowerShell equivalents README me) · `README.md`, `OWNERS.md`, `.gitignore`, `.python-version`.  
**Checks:** ☐ **doosre ke laptop pe** fresh clone → setup → `make run` → `/docs` khulta hai (Piyush ko bolo try kare) ☐ `make reset` 2 baar bina error ☐ naya `modules/x/router.py` bina `main.py` edit ke pick hota hai ☐ enums file §3.2 se exact.

#### PR-2 · Auth, roles, SoD, step-up · Day 1 · 2h · P0
*Build:* `user` table + argon2/bcrypt hash · `/auth/login` (JWT with roles, bank_id, institute_id) · `require_roles` · `sod.ensure_different` → `SOD_VIOLATION` · `/auth/step-up {pin}` (TTL `step_up_ttl_minutes` via clock) · `require_step_up` → `STEP_UP_REQUIRED` · `/me`, `/demo/users` · seed users §3.3 (Ed25519 key `ra1` ke liye PR-7 me).  
**Checks:** ☐ pytest: galat role → 403 `FORBIDDEN`; token nahi → 401 ☐ step-up: pehle error, PIN ke baad pass, TTL ke baad (clock advance) phir error ☐ `ensure_different` unit test ☐ DB me password plaintext nahi ☐ `/demo/users` `DEMO_MODE=false` pe 404.

#### PR-3 · Audit chain + Clock + Policy · Day 1 PM · 3h · P0
*Build:*  
**Audit:** `audit_event(seq, ts, actor_id, actor_role, action, entity_type, entity_id, payload_json, prev_hash, hash)`; `hash = sha256(prev_hash + canonical_json(row))`; insert lock se (no seq gaps) · `GET /audit`, `GET /audit/verify → {ok, checked, first_broken_seq}` · `POST /admin/audit/tamper-demo` (DB me ek row ka payload badal deta hai) · `POST /admin/audit/repair-demo`.  
**Clock:** `clock_state(offset_seconds)`, `clock.now()`, `/admin/clock`, `/advance`, `/reset`.  
**Policy:** `policy_version`; seed SRS §6.4 defaults (keys: `deposit_term_years, favouring_names, min_fdr_tenor_months, count_provisional_towards_coverage, letter_validity_days, maturity_alert_days, bank_reminder_days, escalation_days, bank_request_timeout_days, high_risk_threshold, recon_freshness_days, penalty_rules, interest_destination, risk_weights, amount_table, step_up_ttl_minutes` + apna `lapse_escalation_days=15`); `policy.get(key)`, `GET /policy`. Demo amounts **placeholder** hain (VALIDATE).  
**Checks:** ☐ 500 events → verify OK ☐ tamper → `first_broken_seq` bilkul wahi row; repair → OK ☐ 2 threads concurrent insert → seq me gap/duplicate nahi ☐ `grep -rnE "datetime\.(now|utcnow)" backend/app` → sirf `clock.py` me ☐ advance 30d → `now()` +30d; reset → wapas ☐ 5 policy keys SRS §6.4 se match.

#### PR-4 · Notifications + job registry · Day 1 PM/raat · 1.5h · P0 *(Day 2 AM tak slip OK)*
*Build:* `notification` table + `notify.send` + `GET /notifications` + mark-read · `jobs.register` · `POST /admin/tick` sab jobs order me chalata hai, `job_run(job_name, dedupe_key)` se idempotent · `/admin/clock/advance` me `run_tick=true` option.  
**Checks:** ☐ tick 2 baar → duplicate notification nahi ☐ institute user ko officer ke notification nahi dikhte ☐ unread count sahi.

#### PR-S1 · Stub routers (core + release + public) · Day 1 raat · 1h · P0
*Build:* §3.5 me tumhare saare endpoints, final Pydantic response models + realistic example data.  
**Checks:** ☐ `/docs` me sab dikhte ☐ Payal ka `gen:api` chal gaya ☐ Mehak/Payal ne ek-ek endpoint hit karke dekha.

#### PR-5 · Monitoring: maturity windows, lapse · Day 2 AM · 2h · P0
*Build:* job `maturity_scan` (`ACTIVE/RENEWAL_DUE`): `days_to_maturity` vs `maturity_alert_days` → har window pe **ek** `alert` (dedupe `instrument:window`); notify ladder SRS §7.8: 180 → institute · 90 → institute · 30 → institute + SO · 7 → institute + SO + AO · `days ≤ 180` → `intake.service.transition(RENEWAL_DUE)` · maturity nikal gayi bina renewal → `LAPSED` + breach alert + `recompute_coverage` · `lapse_escalation_days` baad RA ko alert · term complete + maturity reached → `MATURED`; obligation `TERM_COMPLETE` (intake.service se) · `GET /alerts`.  
**Checks:** ☐ Takshashila seed (maturity +200d): +20d → 180 alert; +90d → 90 alert … maturity+1 → `LAPSED` ☐ tick 5 baar → har window pe exactly ek alert ☐ har transition audit me ☐ LAPSED pe obligation coverage recompute ☐ pytest with clock fixture.

#### PR-6 · Release request + eligibility + holds · Day 2 PM · 4h · P0
*Build:* `release_request` state machine (SRS §5.2 ka v1 subset) · eligibility rules **E-01…E-08 + E-12-lite** (SRS §7.4): har rule `{rule_id, result, message, fix_hint}` store hota hai · E-08 → `bank.service.latest_confirmation` vs `recon_freshness_days` · E-04 release lock (`RELEASE_LOCKED`) · `hold` table + CO endpoints (E-06) · endpoints: create/list/get/resubmit/recommend/reject · AO recommend, RA alag step.  
**Checks:** ☐ table-driven unit test: har rule ka PASS + FAIL case ☐ hold present → `INELIGIBLE` with E-06 reason + hint; hold lift + resubmit → `ELIGIBLE` ☐ 2 concurrent requests same instrument → doosri E-04 se block ☐ confirmation >90 din purani → `MANUAL_REVIEW` (E-08) ☐ har transition audit me ☐ role checks (INS_SIGNATORY recommend nahi kar sakta).

#### PR-7 · Letter: canonical + hash + sign + PDF + QR · Day 3 AM · 3.5h · P0
*Build (SRS §7.2):* `settlement.compute(release_request)` → `principal_to_trust`, `aicte_share` (accrued interest bank confirmation se + penalty policy se; TERM_COMPLETE me penalty 0) · payload JSON → canonical (`json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False)`; RFC 8785 ka close approximation, production me proper JCS) · `sha256` · Ed25519 sign (`ra1` key) **step-up ke baad** · store immutable payload+hash+signature+key_id+policy snapshot · `public_code` (`XXXX-XXXX-XXXX`, no `0/O/1/I`) · PDF (reportlab): details table, hash prefix, QR → `PUBLIC_BASE_URL/verify/{code}?h={hash8}`, watermark "DEMO · SIMULATED SIGNATURE" · `/pdf` · job `letter_expiry` (validity `letter_validity_days` clock se) · revoke · supersede.  
**Checks:** ☐ sign bina step-up → `STEP_UP_REQUIRED` ☐ payload ka ek byte badlo → signature verify fail ☐ same input → same hash (deterministic test) ☐ PDF khulta hai, QR decode karke sahi URL (OpenCV se test) ☐ clock +15d → EXPIRED ☐ revoke → REVOKED ☐ public_code unique ☐ hash screen/DB/PDF teeno me same.

#### PR-8 · Public verify + bank execution + settlement · Day 3 PM · 3.5h · P0
*Build:* **Verify** (SRS §7.2 flowchart): code se lookup → FDR number (HMAC fingerprint) + IFSC match → hash recompute + signature verify → status. Koi bhi mismatch → **uniform `VERIFY_NO_MATCH`** (same body, same shape) · AICTE account **policy snapshot se**, kabhi input se nahi · in-memory rate limit (10/min/IP → `RATE_LIMITED`) · attempts audit me.  
**Execution:** `execute-maker` (UTR, amounts) → `execute-checker` (maker ≠ checker) · amounts letter se match nahi → `AMOUNT_MISMATCH` · expired/revoked letter reject · success → letter `EXECUTED`, instruments `RELEASED`, request `SETTLEMENT_PENDING`.  
**Finance:** `GET /finance/settlements`, `confirm` (credited ≠ AICTE share → 409 `AMOUNT_MISMATCH` jab tak `override_note`) → request `CLOSED`, instruments `CLOSED`, obligation `CLOSED`.  
**Checks:** ☐ galat FDR/IFSC aur galat code ka response JSON **bilkul same** ☐ DB me payload edit → status `TAMPERED` ☐ 11vi request/min → 429 ☐ executed letter replay → `INVALID_STATE` ☐ maker = checker → `SOD_VIOLATION` ☐ finance mismatch handled ☐ CLOSED ke baad obligation + instruments CLOSED aur audit me poori chain ☐ response ka AICTE account == policy.

#### PR-9 · Integration owner · Day 2 → Day 4 · 3h · P0
*Build:* `scripts/smoke/` (httpx se Golden Path API-level; har lane apni `smoke/<lane>.py` me steps jodta hai) · `make smoke` · merge windows (dopahar + raat) · `KNOWN_ISSUES.md` · tags `contract-v1`, `v1.0-rc1`, `v1.0`.  
**Checks:** ☐ `make reset && make smoke` green ☐ har merge ke baad: smoke + `/docs` + FE `npm run build` ☐ tag push hua ☐ KNOWN_ISSUES updated.

---

### 🅱️ PIYUSH — Intake, Forgery & Bank-Trust Chain (≈24.5h)

**Dependencies:** PY-1 aur PY-2a **standalone** (scaffold ka wait nahi). PR-1 milte hi PY-S0.  
**Tum doge:** Payal ko `/documents/preview` + `/instruments` (Day 2 AM). Mehak ko instrument detail shape + bank APIs (Day 2 dopahar). Premansh ko `intake.service` + `bank.service` (Day 2 PM).

#### PY-1 · Doc-intel library + sample FDRs · Day 1 · 4h · P0
*Build:* `backend/doc_intel/` standalone: `analyze(pdf_bytes, entered: dict) -> {extracted: {field: {value, confidence, source: QR|TEXT}}, checks: [{name, outcome, confidence, details}], flags: [codes]}`. PyMuPDF se text + page render; OpenCV `QRCodeDetector` se QR; regex field extraction; consistency validator (entered vs QR vs text; rapidfuzz) → **D-10, D-11, D-07**; tamper-lite → **D-12** (PDF me `%%EOF` markers >1 = incremental edit, Producer/ModDate mismatch).  
`samples/generate_samples.py` (reportlab + qrcode): ① `fdr_genuine_aryabhatta.pdf` (QR + text consistent, favouring "Member Secretary, AICTE", IFSC `BRBK0001234`) ② `fdr_tampered_amount.pdf` (printed ≠ QR → D-11) ③ `fdr_wrong_favouring.pdf` (D-07) ④ `fdr_duplicate_vidyajyoti.pdf` (seed wale FDR number ke saath → D-05 intake me) ⑤ `fdr_edited_incremental.pdf` (D-12) ⑥ *(P1)* low-quality scan → manual entry path. QR payload fictional bank format `{"v":1,"fdr","ifsc","principal","issue","maturity","fav"}`.  
**Checks:** ☐ pytest: har sample ka exact expected flag table (genuine = zero flags, 7+ fields extracted) ☐ <3s/file ☐ network call nahi ☐ corrupt/khaali file → outcome `ERROR` (exception nahi → "manual review", SRS P8) ☐ generator deterministic.

#### PY-S0 · Stub routers (intake + bank) · Day 1 PM · 1h · P0
*Build:* §3.5 ke saare intake/bank endpoints, final models + example data.  
**Checks:** ☐ `/docs` me dikhte ☐ Payal/Mehak ne hit karke dekha.

#### PY-2 · Intake: models, seed, APIs · Day 1 PM → Day 2 AM · 4h · P0
*(a) Day 1:* models (§3.4) + `intake/seed.py` + `bank/seed.py` **seed v0 push at S1**: 4 institutes + trusts + obligations (§7.1), 3 banks + nodal contacts, 4 key instruments, ~15 filler institutes.  
*(b) Day 2 AM:* `POST /documents/preview` · `POST /instruments` (file local `data/files/`, content hash, `doc_intel.analyze`, `field_trust` L0, discrepancies from flags, state `SUBMITTED → AUTO_CHECKING → SCRUTINY`) · duplicate detection (HMAC fingerprint FDR+bank across institutes → **D-05**) · `GET` endpoints · `instrument_state_history` · `intake.service.transition()` (audit + history) · coverage (`count_provisional_towards_coverage=false` → sirf L2 ACTIVE gina jata hai).  
**Checks:** ☐ genuine sample → `SCRUTINY`, zero HIGH flags, 7+ fields L0 ☐ tampered amount → D-11 HIGH ☐ duplicate → D-05 HIGH ☐ >15MB / non-PDF → `VALIDATION_ERROR` ☐ institute A ko institute B ka data nahi dikhta (scoping test) ☐ file content hash stored; doosre upload se nahi badalta ☐ har transition audit + history me.

#### PY-3 · Discrepancy engine + quarantine · Day 2 · 2h · P0
*Build:* `add_discrepancy` central; rules wired: D-01, D-02, D-05, D-07, D-10, D-11, D-12, D-14, D-15, D-17, D-18 (SRS §6.11) · resolve CLEAR/ESCALATE/REJECT (HIGH ke liye note mandatory) · HIGH open → instrument `DISCREPANCY` + activation block · `quarantine` overlay (`is_quarantined`) + `QUARANTINE_VIGILANCE` notification · reject.  
**Checks:** ☐ D-07/D-14 → activation block ☐ quarantine → release/renew block, banner flag API me ☐ resolve bina note (HIGH) → `VALIDATION_ERROR` ☐ audit entries ☐ rule-wise unit tests.

#### PY-4 · Bank directory + confirmation workflow · Day 2 PM · 4h · P0
*Build (SRS §5.4, §7.5, SEQ-03):* `POST /bank-requests` (SO/AO) → route sirf `bank_nodal_contact` directory se (document ka email/phone **ignore**; UI me bhi dikhao ki "directory contact") · state `CREATED → NOTIFIED`; bank user inbox me ye khulte hi `ACKNOWLEDGED` · maker-submit: 12-point checklist (§7.5), outcome `ALL_CLEAR|EXCEPTIONS|NOT_FOUND` · checker `AUTHORISE|RETURN`; **maker ≠ checker** (SoD) · AUTHORISE+ALL_CLEAR → `CONFIRMED`, `field_trust` L2 (principal, maturity, favouring, holder, lien, accrued interest) · EXCEPTIONS → `CONFIRMED_WITH_EXCEPTIONS` + discrepancies (D-14/D-15/D-17) · NOT_FOUND → D-02 HIGH + quarantine suggestion · instrument `SCRUTINY → BANK_PENDING` request pe, discrepancy pe `DISCREPANCY` · bank user sirf **apne bank** ki requests dekhe · response non-directory contact se → **D-13** reject (v1: test-only hook).  
**Checks:** ☐ full flow ALL_CLEAR → L0 fields L2 ban gaye ☐ maker = checker → `SOD_VIOLATION` ☐ BRB ka user HCB ki request nahi dekh sakta (403/404) ☐ NOT_FOUND → D-02 + quarantine suggestion ☐ checklist me ek "No" → exception + discrepancy ☐ RETURN → maker ke paas wapas ☐ audit har step.

#### PY-5 · Activation + renewal chain · Day 2 raat (5a) + Day 3 AM (5b) · 3h · P0
*5a Activation (1.5h):* `POST /instruments/{id}/activate` (AO + step-up) guards (SRS §5.1): L2 on principal/maturity/favouring/lien · no open HIGH · **AO ≠ scrutiny officer** (`instrument.scrutiny_officer_id` pehli SO action pe set) · → `ACTIVE`, `recompute_coverage` → obligation `PARTIALLY_COVERED/COVERED`.  
*5b Renewal (1.5h, SRS SEQ-06):* `POST /instruments/{id}/renew` modes: `SAME_NUMBER` (new version), `NEW_NUMBER` (new instrument `supersedes_id`), `REPLACEMENT` *(P1)* · naya instrument bank-confirm flow se jata hai · activation pe purana `SUPERSEDED` · **coverage me gap nahi** (purana tab tak count hota hai jab tak naya L2 + ACTIVE na ho) · `LAPSED` se late renewal allowed.  
**Checks:** ☐ L2 missing → activate fail ☐ `ao1` (scrutiny kiya) → `SOD_VIOLATION`, `ao2` → pass ☐ step-up bina → error ☐ coverage: activation se pehle/baad numbers sahi ☐ renewal: naya activate hone tak purana count hota hai, phir `SUPERSEDED`, history intact ☐ quarantined instrument renew nahi hota.

#### PY-6 · Bank-request SLA ladder · Day 3 AM · 1.5h · P0-lite
*Build (SRS §7.8):* job `bank_request_sla`: day 3, 7 reminders · 14, 21 escalation (SO, phir AO notify) · 30 → `TIMED_OUT` + D-18; sab policy se; dedupe.  
**Checks:** ☐ clock advance se har checkpoint pe exactly ek alert ☐ tick repeat → duplicate nahi ☐ bank respond kare → ladder ruk jaye ☐ TIMED_OUT pe D-18 + officer re-initiate kar sake.

#### PY-7 · Demo control panel (FE) · Day 2 raat · 1.5h · P0
*Build* `features/demo/`: sim date banner, buttons +1d/+7d/+30d/+90d/custom/Reset, "Run tick", last fired alerts, *(P1)* "Reset demo data". Sirf SYSTEM_ADMIN + DEMO_MODE.  
**Checks:** ☐ advance → banner date turant update ☐ non-admin ko route nahi dikhta ☐ tick ka result dikhta hai.

#### PY-8 · Audit workspace (FE) · Day 3 AM · 2.5h · P0
*Build* `features/audit/`: table + filters (actor/entity/action/date) + expandable JSON · **"Verify chain"** → green "Chain intact (N events)" / red "BROKEN at #seq" · admin-only "Simulate tampering" + "Repair" (DEMO_MODE) · *(P1)* evidence pack button.  
**Checks:** ☐ tamper → red alarm exact seq ke saath, repair → green ☐ AUDITOR read-only (buttons nahi) ☐ 500+ rows pe smooth (pagination).

#### PY-P1 · Reconciliation *(sirf agar aage ho)* · 3h
Bank-wise batch, mock response "lien removed" → D-14 + hold + AO case (SRS §5.5, SEQ-05). Pehle cut-ladder me kat jata hai.

---

### 🅲 MEHAK — Officer Brain & Consoles (≈25.5h)

**Dependencies:** MK-1 standalone. UI kit Payal ka (Day 1 dopahar). Piyush ke stubs (Day 1 PM) → real (Day 2).  
**Tum doge:** Premansh/Payal ko `risk` + KPI numbers; Payal ko "queue" shape (dashboard/institute ke liye).

#### MK-1 · Risk functions (pure Python) · Day 1 AM · 3h · P0
*Build (SRS §7.3):* `score(factors, weights) -> int 0..100` · 7 factors `f_flags, f_aging, f_amount, f_maturity, f_bank, f_inst, f_recon` · `priority = score + 20 if SLA breached + 10 if due ≤2d` · `explain()` → top-3 reasons (human text: "Maturity 12 din me, HIGH flag D-11, 18 din se SCRUTINY me").  
**Checks:** ☐ table-driven tests har factor ke boundary (0, mid, cap) ☐ weights sum = 1.0 ☐ score int ∈ [0,100] ☐ `explain` contribution ke hisaab se sorted ☐ LAPSED → `f_maturity=1`.

#### MK-S1 · Stub routers (insights) · Day 1 raat · 0.5h · P0
**Checks:** ☐ `/docs` me `queue, risk, kpi/*, reports` dikhte ☐ Payal ka `gen:api` pass.

#### MK-2 · Insights wiring + KPI APIs · Day 2 AM · 3h · P0
*Build:* `risk_score(instrument_id, score, factors_json, computed_at)` · job `rescore_all` (tick me, maturity scan ke baad) · `GET /queue` (unified case list `{case_type: INSTRUMENT|RELEASE, id, institute, bank, amount, state, owner_role, age_days, sla_due, score, priority, reasons[]}`; sorted by priority desc) · `GET /instruments/{id}/risk` · KPIs: total/active value, **record accuracy** (% instruments with L2 on critical fields), **verification TAT** (median submit→bank-confirmed, `instrument_state_history` se), renewals on time %, pending aging buckets (0-7/8-14/15-30/30+), automated actions count, discrepancies by code · `kpi/breakdown?by=` · `maturity-ladder` (0-30/31-90/91-180/181-365/>365) · CSV export (audited).  
**Checks:** ☐ KPI numbers seed pe direct SQL count se **equal** (test) ☐ queue priority desc; SLA-breach case +20 ☐ `rescore` idempotent ☐ CSV Excel me khulta, fixed headers ☐ role guard (institute user ko 403).

#### MK-3 · Officer console · Day 1 PM (fixtures) → Day 2 PM (real) · 6h · P0
*Build* `features/officer/`: **Queue** (priority chip, **"why first" popover** with factor bars, filters: state/bank/severity) · **Case workspace** tabs: *Overview* (field table + **TrustBadge** L0/L1/L2, source, evidence) · *Documents & checks* (PDF viewer + check pills) · *Bank confirmation* (request timeline + checklist result) · *Discrepancies* (resolve modal) · *Timeline* (audit slice) · **Action bar:** Request bank confirmation (modal me directory contact read-only + note "documents me diye contacts ignore hote hain"), Activate (StepUpModal), Quarantine, Reject.  
**Checks:** ☐ har screen pe loading/empty/error state ☐ `ao1` se activate → SOD error toast saaf dikhta hai (code ke saath) ☐ bank confirm ke baad TrustBadge **bina reload** flip (query invalidation) ☐ 1366×768 pe theek ☐ raw enum screen pe nahi (label map) ☐ har tab ka screenshot group me.

#### MK-4 · Bank console · Day 1 PM (fixtures) → Day 2 raat · 5h · P0
*Build* `features/bank/`: **Inbox** (apne bank ki requests) · **Request detail**: FDR summary + **12-point checklist** (SRS §7.5) maker form → outcome + remarks → submit · **Checker view**: authorise / return · **Release letters** (Day 3): letter list, execution form (UTR, amounts, date) maker → checker; error states (expired/revoked/amount mismatch).  
**Checks:** ☐ maker aur checker alag users se poora flow ☐ maker khud authorise try → SoD error saaf dikhe ☐ checklist me "No" → exceptions UI me highlight ☐ BRB user ko HCB ka data nahi ☐ release execution: replay error friendly.

#### MK-5 · Officer release views + holds · Day 3 AM · 3h · P0
*Build:* release case detail: **Eligibility report** (rule table E-01…, PASS/WARN/FAIL/MANUAL chips + fix hint) · AO recommend/reject with note · **Compliance Holds page** (place/lift with reason).  
**Checks:** ☐ INELIGIBLE case me fix hint dikhta ☐ hold lift → resubmit → ELIGIBLE flow UI se ☐ only COMPLIANCE_OFFICER hold place/lift ☐ AO recommend ke baad button disable.

#### MK-6 · Leadership dashboard · Day 2 raat → Day 3 · 4h · P0
*Build* `features/dashboard/`: KPI cards · Recharts: state breakdown, by-bank, maturity ladder, risk histogram, aging buckets, discrepancies by code · filters (bank/state) · Export CSV · refresh button (+ 5s polling) tick ke baad.  
**Checks:** ☐ numbers API se match, UI me koi hard-coded nahi ☐ tick/advance ke baad refresh pe change dikhta hai ☐ empty state ☐ LEADERSHIP read-only ☐ chart tooltips + units (₹, count) clear.

---

### 🅳 PAYAL — Face of the Product (≈27h)

**Dependencies:** PA-1 standalone. Backend APIs: Day 1 stubs (S1) → real (Day 2).  
**Tum doge (sabse pehle!):** UI kit + shell **Day 1 dopahar tak** (Mehak, Piyush wait kar rahe hain).

#### PA-1 · Frontend foundation + UI kit · Day 1 AM · 4h · P0
*Build:* Vite + React + TS + Tailwind + TanStack Query + React Router · **feature auto-registration** (`import.meta.glob('./features/*/routes.tsx')`, `nav.ts`) · layout (role-based sidebar, topbar: **role switcher (DEMO), notifications bell, sim-date banner**) · login · API client (token, error → toast with `code`) · `npm run gen:api` (openapi-typescript) · `src/ui/`: Button, Card, Badge/**StatusPill** (saare states ke colours), **TrustBadge** (L0 grey / L1 amber / L2 green + tooltip who/when/evidence), DataTable, Tabs, Modal, **StepUpModal** (PIN → retry), Timeline, StatCard, EmptyState, Skeleton, Toast, FormField, FileDrop · `formatINR(paise)`, `formatDate`, label maps (enum → readable) · `/ui-kit` showcase page · theme: clean govt-portal (navy + subtle saffron/green), 360px tak responsive · `frontend/README.md` ("naya feature page kaise banaye", AI-prompt friendly, 10 lines).  
**Checks:** ☐ `npm run build` zero TS errors ☐ `/ui-kit` me sab components + states ☐ dummy `features/x` folder → route + nav **bina core file edit** ke aate hain ☐ role switcher har seeded user se login ☐ team ko screenshot + README link ☐ **dopahar tak `main` pe**.

#### PA-2 · Institute portal · Day 1 PM (fixtures) → Day 2 · 7h · P0
*Build* `features/institute/`: **Dashboard** (obligation card: required / confirmed / provisional, coverage bar, state pill) · **FDR wizard** (1: PDF upload → `/documents/preview` → extracted fields + confidence + check results; 2: review/edit — edited vs extracted highlight; 3: declaration + submit) · **Instrument detail** (status timeline, field table with TrustBadge, flags in plain language, bank-confirmation status) · **Renewal wizard** (`RENEWAL_DUE/LAPSED` pe, SAME/NEW number) · **Release request** (obligation select → submit → eligibility results + fix hints → status → letter download) · Notifications page.  
**Checks:** ☐ sample genuine PDF **real API pe** end-to-end submit ☐ tampered sample → flags friendly wording me ☐ >15MB / non-PDF friendly error ☐ activation ke baad coverage bar update ☐ 360px pe wizard toota nahi ☐ raw enum nahi dikhta ☐ INS_ADMIN submit button disabled (reason ke saath) *(P1)*.

#### PA-3 · Public verification page · Day 2 PM · 2.5h · P0
*Build* `features/public/` (no login, no sidebar): `/verify` form (code, FDR no, IFSC) · QR landing `/verify/:code?h=` · result card: VALID / EXPIRED / REVOKED / SUPERSEDED / EXECUTED / TAMPERED har ek alag visual · amounts table + "**sirf yahan dikhaye AICTE account me bhugtaan karein**" · hash fingerprint · uniform no-match message · 429 message · mobile-first, print-friendly.  
**Checks:** ☐ **asli phone pe** LAN IP se PDF ka QR scan karke test ☐ 6 statuses ke alag UI (seeded letters se) ☐ NO_MATCH pe koi data leak nahi ☐ incognito me bina console error ☐ 360px.

#### PA-4 · RA + Finance workspaces · Day 3 AM · 3.5h · P0
*Build* `features/release-desk/`: **RA:** pending-signature list · letter preview (payload table, principal vs AICTE share breakdown) · Sign (StepUpModal) → hash fingerprint + PDF link · Revoke with reason · **Finance:** settlement list · breakdown · confirm credit form (amount, ref) + mismatch warning · closed case summary.  
**Checks:** ☐ sign ke baad PDF naye tab me khulta, **screen ka hash == PDF ka hash** ☐ revoke → public verify me turant REVOKED ☐ finance mismatch warning ☐ role guards (RA hi sign, FO hi confirm).

#### PA-5 · PPT · Day 2 raat → Day 4 · 5h · P0 *(AI-assisted)*
Structure aur content §8 me. Day 2: skeleton + text. Day 3: diagrams (SRS Mermaid → mermaid.live → PNG). Day 4: real screenshots + final.  
**Checks:** ☐ har slide ka ek message ☐ numbers pe **(assumed)/(measured)** label ☐ SIH template ke saare required sections cover ☐ PPTX + PDF dono export ☐ **doosre laptop pe khola** (fonts/images) ☐ koi text-wall nahi.

#### PA-6 · Demo script compile + video · Day 3 raat → Day 4 · 4h · P0
Segments har lane ka (§7.2) → tum compile karogi → record → edit.  
**Checks:** §9 me.

#### Z-1 · Lane Q&A note (sab, har lane 1h, Day 3–4)
Har lane `docs/qa/<lane>.md` me 5 sawal-jawab (2–3 line) likhe apne domain ke; Payal compile kare. Topics SRS T-203: bank API availability · lien ka legal basis · forgery detection ki limits · scalability · privacy · govt deployment.

---

## 6. Global Push Gate (har push se pehle, ~5 min)

| # | Check | Command / action |
|---|---|---|
| G1 | **Backend lint + tests** (apna module) | `ruff check backend && pytest -q backend/tests/<module>` |
| G2 | **Frontend types + build** | `npm run gen:api && npm run lint && npm run typecheck && npm run build` |
| G3 | **Clean boot** | `make reset && make run` → seed me error nahi, `/docs` khulta hai |
| G4 | **Audit** | Har naya state change/approval `audit.log` call karta hai (test ya grep) |
| G5 | **Negative test** | Kam se kam ek: galat role → 403 ya SoD violation |
| G6 | **Clock** | `grep -rnE "datetime\.(now\|utcnow)\|Date\.now" backend/app frontend/src` → business logic me nahi |
| G7 | **Smoke** (S2 ke baad) | `make smoke` ke purane steps ab bhi pass |
| G8 | **Screens** | Naye screen pe loading/empty/error state, console me error nahi, screenshot group me |
| G9 | **Hygiene** | `git diff --name-only origin/main` sirf apne folders · `.env`/keys commit nahi · rebase done · commit format sahi |

Task cards ke "Checks" = task-specific gate. **Dono pass → push.**

---

## 7. Demo: Seed data + Video

### 7.1 Seed scenarios (`make reset` ke baad deterministic)

| ID | Institute (fictional) | State | Demo me kaam |
|---|---|---|---|
| S-A | **Aryabhatta College of Engineering** (`ar_sig`) | Obligation `PENDING_DEPOSIT` | Live FDR submission (G1–G6) |
| S-B | **Nalanda Technical Campus** (`na_sig`) | Submits duplicate of S-D's FDR number | Forgery/quarantine (G8) |
| S-C | **Takshashila Institute of Management** (`ta_sig`) | `ACTIVE`, maturity ~ +200 din | Time travel, renewal (G7) |
| S-C2 | Ek aur institute | `ACTIVE`, maturity ~ +40 din, renewal ignore | Lapse + escalation (G7) |
| S-D | **Vidya Jyoti Institute of Technology** (`vj_sig`) | Obligation `TERM_COMPLETE`, FDR `MATURED`, last L2 < 90 din, **compliance hold pre-placed** | Release path (G9–G12) |
| S-E | ~15 filler institutes, mixed states, banks BRB/HCB/SCB | | Dashboard + queue realistic |
| S-F | 200+ pre-existing audit events | | Audit table full dikhe |

Banks fictional: **Bharat Reserve Bank (BRB)**, **Hindustan Commercial Bank (HCB)**, **Sarvodaya Co-op Bank (SCB)**. Amounts placeholders (VALIDATE): PPT me "illustrative" likho.

### 7.2 Video script (~6 min; chapter-wise record karo)

| Time | Chapter | Screen | Lane (segment note likhne wala) |
|---|---|---|---|
| 0:00–0:30 | Problem + one-liner (slide) | PPT | Payal |
| 0:30–1:30 | **G1–G2** institute submit, tampered vs genuine | Institute portal | Piyush |
| 1:30–2:30 | **G3–G5** queue → bank checklist (maker/checker) → badges L0→L2 → SoD block → ACTIVE | Officer + Bank console | Mehak |
| 2:30–3:15 | **G6–G7** dashboard + time-travel alerts + renewal | Demo panel, dashboard | Piyush + Mehak |
| 3:15–3:45 | **G8** forgery → quarantine **[CUT-able]** | Officer | Piyush |
| 3:45–5:15 | **G9–G11** release → letter → **phone pe public verify** → tamper → execution → replay | RA, phone, Bank | Premansh |
| 5:15–5:45 | **G12** finance close, **audit tamper alarm** | Finance, Audit | Premansh |
| 5:45–6:00 | Roadmap + close (slide) | PPT | Payal |

*Organisers ki video-length limit check karo.* Limit kam ho toh **[CUT]** chapters hata do aur G7 chhota karo (3-min cut). Har chapter ke 2-line talking points likhkar rakho.

### 7.3 Recording tips

- Har take se pehle `make reset`. 1080p, browser zoom 110%, bookmarks/notifications band, clean Chrome profile.
- **Chapter-wise record** (galti hui toh sirf wo chapter dobara). Voiceover ek hi insaan, same mic, same language.
- Fallback: `make smoke` ka terminal output + `/docs` ka chhota clip rakho (UI toote toh API-level proof).
- Final mp4 ko 2 jagah save (drive + pen drive) aur **doosre device pe play karke dekho**.

---

## 8. PPT Plan (Payal; content bank = SRS slices)

> SIH ka official template jo sections maangta hai (idea, solution, tech stack, USP, feasibility, impact, references…) unhi me ye content fit karo. **Max ~16 slides + appendix.** Numbers pe *(assumed)/(measured)* label.

| # | Slide | One message | Source (SRS lines) | Visual |
|---|---|---|---|---|
| 1 | Title | Sakshya: evidence-backed FDR management | — | Logo, team, PS title |
| 2 | Problem | Records bikhre, trust gap, yaad pe deadlines, forged-FDR risk | 67–78 | RC-1…RC-6 icons |
| 3 | Idea in one picture | Claim → Bank-confirmed fact → Verifiable release | 5463–5480 | Trust chain flow |
| 4 | Solution = 10 capabilities | Har expected capability ka feature | 5482–5495 | Table C1–C10 |
| 5 | USPs U1–U8 | Kya alag hai | 80–93 | 8 cards |
| 6 | Users & portals | 7 console/portals | 166–185 | Role map |
| 7 | Architecture | Modular, adapters, simulators | 334–377, 505–516 | Container diagram |
| 8 | Workflow 1: Intake → hybrid lien → activation | Bank seedhe AICTE ko confirm karta hai | 1801–1899 | SEQ-02/03/04 simplified |
| 9 | Workflow 2: Monitoring → renewal → escalation | Deadlines system yaad rakhta hai | 2296–2320, 1933–1959 | Ladders |
| 10 | Workflow 3: Release → signed letter → public verify | Forged letter chal hi nahi sakta | 2131–2175, 1960–2023 | Letter flowchart |
| 11 | Forgery & security model | Flags, SoD, audit chain, abuse defences | 303–316, 2264–2288 | Abuse-case table |
| 12 | Prototype v1.0 (screens) | Ye dekhiye live | build | 4–6 screenshots |
| 13 | Feasibility: real vs simulated | Honest scope | 5757–5767 | Appendix H table |
| 14 | Impact & KPIs | 5 measurable improvements | 5508–5516 | KPI table (assumed/measured) |
| 15 | Risks & mitigation | Bank API, legal basis, adoption, policy VALIDATE | 5577–5596 | Risk table |
| 16 | Roadmap + scale | v1.0 → production | §10 | Timeline |
| A | Appendix | Policy as config, test scenarios, team, references | 1444–1475, 5518–5548 | |

---

## 9. Release Checklists

**`v1.0-rc1` (Day 3 raat):** ☐ G1–G12 UI se ek baar ☐ `make smoke` green ☐ KNOWN_ISSUES.md ☐ tag ☐ feature freeze announce.

**`v1.0` (Day 4 dopahar):** ☐ `make reset` → Golden Path **3/3 clean** ☐ phone pe QR verify test ☐ doosre laptop pe fresh clone → run ☐ README me run steps + demo credentials ☐ tag ☐ **code freeze**.

**Submission (Day 4):**
☐ Video recorded, edited, 1080p, length limit ke andar, doosre device pe play ☐ PPT (PPTX + PDF) final, fonts ok ☐ GitHub link/repo access (organisers ki requirement dekho) ☐ file size/upload limits pehle check ☐ **upload ke liye buffer (portal slow ho sakta hai)** — kam se kam 3–4 ghante pehle upload shuru ☐ backup copy (drive + pen drive) ☐ submission confirmation screenshot.

**Risks (short):**

| Risk | Mitigation |
|---|---|
| Day-1 contract drift | stub-first + `gen:api` + enums freeze + S1 gate |
| Merge conflicts | folder ownership + service interfaces |
| Integration late | S2 gate + `make smoke` har merge pe |
| Koi lane atak jaye | buddy pair + cut ladder |
| Demo flaky | deterministic seed, chapter-wise recording, smoke fallback |
| AI tokens khatam | slice map + 1 task = 1 session + strong model sirf 5 tasks pe |
| Env difference (Win/Mac) | `.python-version`, README, 2nd laptop pe PR-1 test |
| Time-zone/time-travel bugs | sab UTC + `clock.now()` + clock fixture tests |
| Scope creep | S2 ke baad naya feature = ek purana hatao |

---

## 10. After Submission (scale-up, SRS task IDs ke saath)

| Area | v1.0 | Next (SRS ref) |
|---|---|---|
| Data layer | SQLite | PostgreSQL + Alembic (T-011) |
| Jobs | in-process | Celery + Redis (T-019) |
| Files | local | MinIO/S3 (T-017) |
| Auth | password + PIN | TOTP MFA, sessions (T-014); OIDC/Parichay (T-143) |
| Doc-intel | PyMuPDF + QR + heuristics | Tesseract hin+eng OCR (T-122), image forensics, eval harness (T-128). **PyMuPDF AGPL hai → production se pehle licence check** |
| Bank channel | portal only | bulk-file + API adapters (T-141), reconciliation (T-053) |
| Signing | software Ed25519 | eSign/DSC adapter (T-142), KMS/HSM |
| Notifications | in-app | email + SMS adapters (T-144) |
| Policy | read-only | 2-person approval + effective dating (T-016, SEQ-12) |
| Release | TERM_COMPLETE | partial, special (E-09, UC-13/14), cash deposit |
| Modules | — | Regional + Compliance (T-113), legacy import (UC-39) |
| Quality/Ops | smoke script | CI (T-005), security programme (T-160…T-164), observability (T-183), deploy/Helm (T-184) |
| Policy values | placeholders | **VALIDATE items** (SRS §2.5) AICTE/mentors se confirm |

---

## Appendix A — SRS Slice Map (AI ko sirf yehi lines do)

`sed -n 'START,ENDp' AICTE_Sakshya_SRS.md`

| Kaam | Lines |
|---|---|
| Problem, root causes, USPs | 67–93 |
| Roles | 166–187 |
| Use cases + abuse cases | 224–316 |
| Architecture (containers, modules) | 334–436 |
| Adapters | 505–516 |
| State machines (instrument, release, letter, bank request, recon, obligation) | 884–1039 |
| Permission matrix | 1045–1088 |
| Policy parameters | 1444–1475 |
| Notification matrix | 1690–1720 |
| Error codes | 1721–1742 |
| **Discrepancy rules** | 1743–1766 |
| SEQ-02 intake · SEQ-03 hybrid lien · SEQ-04 activation | 1801–1833 · 1834–1870 · 1871–1899 |
| SEQ-06 renewal · SEQ-07 release→letter · SEQ-08 verify/ack/settle | 1933–1959 · 1960–1992 · 1993–2023 |
| SEQ-10 forgery · SEQ-11 lapse/escalation | 2056–2082 · 2083–2109 |
| **7.2 Letter** · 7.3 Risk · 7.4 Eligibility | 2131–2175 · 2177–2206 · 2208–2243 |
| 7.5 Bank checklist · 7.6 Doc pipeline · 7.8 Escalation | 2245–2262 · 2264–2288 · 2296–2320 |
| Traceability (10 capabilities) · E2E scenarios | 5482–5517 · 5518–5548 |
| Risk register · Appendix H (simulated vs real) | 5577–5596 · 5757–5767 |

**Lane → kya paste karna hai**

| Task | Paste |
|---|---|
| PR-3 | 2290–2295 (audit chain) + §3.2 enums |
| PR-5 | 2296–2320 + 1444–1475 |
| PR-6 | 926–954 + 2208–2243 |
| PR-7/8 | 955–971 + 2131–2175 + 1993–2023 |
| PY-1 | 2264–2288 + 1743–1766 |
| PY-4 | 972–994 + 2245–2262 + 1834–1870 |
| PY-5 | 884–925 + 1871–1899 + 1933–1959 |
| MK-1/2 | 2177–2206 + 5508–5516 |
| MK-3/4 | 1743–1766 + 2245–2262 |
| PA-5 (PPT) | §8 table ke source lines |
