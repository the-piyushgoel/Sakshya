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

