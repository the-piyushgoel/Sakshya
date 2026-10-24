# Project: Sakshya (AICTE FDR portal) - 4-day SIH prototype
Stack: FastAPI + SQLAlchemy + SQLite (backend/), React+TS+Vite+Tailwind+TanStack Query (frontend/).
Read ONLY what the task needs: docs/CONTRACT.md (enums, endpoints, services), docs/cards/<lane>.md (my tasks), docs/slices/*.txt (SRS extracts). Never open docs/AICTE_Sakshya_SRS.md fully.
Hard rules:
- Edit only my lane's folders (see OWNERS.md). No enum/endpoint/field renames.
- Never write to another module's tables; call their service functions (CONTRACT.md section 3.6).
- Time only via clock.now(); every state change calls audit.log(); config via policy.get().
- Money = integer paise. Errors = {"error":{"code","message","details"}}.
- Output: code + tests, minimal diff, no long explanations.
