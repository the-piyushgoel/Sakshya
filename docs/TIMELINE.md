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

