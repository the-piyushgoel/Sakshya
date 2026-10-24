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

