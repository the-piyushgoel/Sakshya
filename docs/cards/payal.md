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

