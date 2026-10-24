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

