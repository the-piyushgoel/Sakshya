# Known Issues (append only)

- **Doc-Intel / Samples (Lane B)**: In `samples/generate_samples.py`, `test_generator_is_deterministic` can intermittently fail because PyMuPDF incremental trailer `/ID` serialization occasionally outputs literal strings `(...)` instead of hex `<...>`, escaping the regex normalization pattern. Recommended fix: Normalize all `/ID [...]` trailer tokens in `_make_incremental`.
- **In-Memory Rate Limiting (Lane A / Public)**: The sliding-window IP rate limiter stores attempt timestamps in memory (`_attempts` dictionary). It resets upon server reload or process restart. Production roadmap migration: Redis sliding-window log (SRS T-019).
- **SQLite Single-Writer Concurrency (Core Spine)**: Local development uses SQLite in WAL mode with single-connection serialization. Multiple parallel worker processes may encounter lock contention under high load. Production roadmap migration: PostgreSQL + Alembic (SRS Appendix H, Task T-011).
- **PyMuPDF AGPL Licensing Notice (Doc-Intel)**: PyMuPDF is licensed under AGPL v3. Permissible for SIH submission prototype; production scale-up roadmap replaces PDF parsing with OpenCV + Tesseract OCR and native PDFium (SRS T-122).
