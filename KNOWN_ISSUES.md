# Known Issues (append only)

- **Doc-Intel / Samples (Lane B)**: In `samples/generate_samples.py`, `test_generator_is_deterministic` can intermittently fail because PyMuPDF incremental trailer `/ID` serialization occasionally outputs literal strings `(...)` instead of hex `<...>`, escaping the regex normalization pattern. Recommended fix: Normalize all `/ID [...]` trailer tokens in `_make_incremental`.
