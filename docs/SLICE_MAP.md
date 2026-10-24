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
