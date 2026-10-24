# Sakshya — AICTE FDR Portal · Prototype v1.0

Evidence-backed Fixed Deposit Receipt management across the complete instrument lifecycle.

---

## Running Locally

### Prerequisites
- **Python 3.12** — install via `pyenv install 3.12` or download from python.org
- **Node 20+** — for the frontend

---

### Backend

```bash
# 1. Create virtual environment + install deps (first time only)
cd Sakshya
make venv            # creates backend/.venv
make install         # pip install into the venv

# 2. Reset + seed the database (run this every time schema changes)
make reset           # wipes DB, creates tables, seeds demo data

# 3. Start the dev server
make run             # starts at http://localhost:8000
                     # Swagger UI: http://localhost:8000/docs
```

**Windows PowerShell equivalents:**
```powershell
python -m venv backend\.venv
backend\.venv\Scripts\pip install -r backend\requirements.txt
mkdir -p backend\data\files
cd backend; python ..\scripts\seed_all.py; cd ..
cd backend; .\.venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

### Frontend

```bash
cd frontend
npm install
npm run dev           # starts at http://localhost:5173

# After backend is running with stubs (PR-S1):
npm run gen:api       # generates src/api/generated.ts from /openapi.json
```

---

### Demo Credentials

| Username | Role | Note |
|---|---|---|
| `ar_sig` | Institute Signatory | Aryabhatta College |
| `vj_sig` | Institute Signatory | Vidya Jyoti (release path) |
| `na_sig` | Institute Signatory | Nalanda (forgery demo) |
| `ta_sig` | Institute Signatory | Takshashila (maturity demo) |
| `so1`, `so2` | Scrutiny Officer | |
| `ao1` | Scrutiny + Approving Officer | SoD demo — cannot self-activate |
| `ao2` | Approving Officer | |
| `ra1` | Release Authority | Signs letters |
| `fo1` | Finance Officer | Confirms settlements |
| `co1` | Compliance Officer | Holds |
| `lead1` | Leadership | Dashboard |
| `aud1` | Auditor | Audit chain |
| `admin1` | System Admin | Clock + demo panel |
| `brb_mk`, `brb_ck` | Bank Maker/Checker | Bharat Reserve Bank |
| `hcb_mk`, `hcb_ck` | Bank Maker/Checker | Hindustan Commercial Bank |
| `scb_mk`, `scb_ck` | Bank Maker/Checker | Sarvodaya Co-op Bank |

**Password for all accounts:** `demo@123`
**Step-up PIN:** `246810`

---

### Makefile targets

| Target | What it does |
|---|---|
| `make venv` | Create `backend/.venv` (first time only) |
| `make install` | `pip install -r backend/requirements.txt` into venv |
| `make run` | Start FastAPI in reload mode on port 8000 |
| `make reset` | Wipe DB + recreate tables + seed all demo data |
| `make test` | Run pytest (`backend/tests/`) |
| `make smoke` | Run smoke tests (server must be running) |

---

### Adding a new feature page (for teammates)

1. Create `frontend/src/features/<your-feature>/` directory
2. Add `routes.tsx` exporting `routes: FeatureRoute[]`
3. Add `nav.ts` exporting `navItems: FeatureNavItem[]`
4. The shell auto-registers — **no edits to `App.tsx` or `Layout.tsx` needed**

See `frontend/README.md` for detailed instructions.

---

### Architecture

```
backend/app/
  main.py          ← FastAPI + auto-discovery (never edit for new routes)
  core/            ← enums, errors, db, auth, audit, clock, policy, notify, jobs [Premansh]
  modules/
    intake/        ← institutes, obligations, instruments, docs, discrepancies [Piyush]
    bank/          ← directory, requests, checklist, activation hooks [Piyush]
    insights/      ← risk score, queue, KPIs, reports [Mehak]
    monitoring/    ← maturity windows, lapse, alerts [Premansh]
    release/       ← eligibility, holds, letter, execution, settlement [Premansh]
    public/        ← public verify [Premansh]

frontend/src/
  shell/           ← App, Layout, auth, featureRegistry [Payal]
  ui/              ← Design system components [Payal]
  api/             ← client, types, format, generated [Payal]
  features/
    institute/     ← Institute portal [Payal]
    release-desk/  ← RA + Finance workspaces [Payal]
    public/        ← Public verify page [Payal]
    officer/       ← Officer console + queue [Mehak]
    bank/          ← Bank console [Mehak]
    dashboard/     ← Leadership dashboard [Mehak]
    demo/          ← Time-travel panel [Piyush]
    audit/         ← Audit workspace [Piyush]
```

See `OWNERS.md` for folder ownership rules. See `docs/CONTRACT.md` for the frozen API contract.

---

### Ownership rules (short version)

1. **Apne folder ke bahar commit nahi.** Check with `git diff --name-only origin/main`.
2. Never use `datetime.now()` — always use `clock.now()`.
3. Never write to another module's tables — call their service functions (`docs/CONTRACT.md §3.6`).
4. Money = integer paise internally. `formatINR(paise)` for display.
5. Schema changed? Announce "SCHEMA CHANGE: &lt;table&gt;" → everyone does `make reset`.

See `docs/RULES.md` for the full rulebook.
