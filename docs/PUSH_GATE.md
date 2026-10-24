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

