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

