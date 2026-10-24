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

