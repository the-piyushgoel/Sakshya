import hashlib
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "samples"))
sys.path.insert(0, str(ROOT / "backend"))

from doc_intel import analyze
from generate_samples import SAMPLES, generate_samples
from sample_constants import (
    ALLOWED_FAVOURING,
    BANK_IFSC,
    HOLDERS,
    INTEREST_RATE,
    ISSUE_DATE,
    MATURITY_DATE,
    PRINCIPAL_RUPEES,
)


def entered_for(number, amount, favouring):
    return {"fdr_number": number, "bank_ifsc": BANK_IFSC,
            "principal_paise": int(float(amount) * 100), "issue_date": ISSUE_DATE,
            "maturity_date": MATURITY_DATE, "interest_rate_pct": float(INTEREST_RATE),
            "favouring": favouring, "holder_names": HOLDERS}


@pytest.fixture(scope="module")
def sample_files(tmp_path_factory):
    directory = tmp_path_factory.mktemp("pdfs")
    generate_samples(directory)
    return directory


@pytest.mark.parametrize(("filename", "number", "qr_amount", "printed_amount", "favouring", "flags"), [
    ("fdr_genuine_aryabhatta.pdf", *SAMPLES["fdr_genuine_aryabhatta.pdf"], []),
    ("fdr_tampered_amount.pdf", *SAMPLES["fdr_tampered_amount.pdf"], ["D-11"]),
    ("fdr_wrong_favouring.pdf", *SAMPLES["fdr_wrong_favouring.pdf"], ["D-07"]),
    ("fdr_duplicate_vidyajyoti.pdf", *SAMPLES["fdr_duplicate_vidyajyoti.pdf"], []),
    ("fdr_edited_incremental.pdf", "BRB-FDR-2024-000101", PRINCIPAL_RUPEES, PRINCIPAL_RUPEES,
     ALLOWED_FAVOURING, ["D-12"]),
])
def test_sample_flags_and_speed(sample_files, filename, number, qr_amount, printed_amount, favouring, flags):
    entered = entered_for(number, printed_amount, favouring)
    data = (sample_files / filename).read_bytes()
    start = time.perf_counter()
    result = analyze(data, entered)
    assert time.perf_counter() - start < 3
    assert result["flags"] == flags
    if filename == "fdr_genuine_aryabhatta.pdf":
        assert len(result["extracted"]) >= 7


@pytest.mark.parametrize("data", [b"", b"not a pdf", b"%PDF-corrupt"])
def test_invalid_input_returns_error(data):
    result = analyze(data, {})
    assert result["extracted"] == {}
    assert result["flags"] == []
    assert result["checks"][0]["outcome"] == "ERROR"


def test_generator_is_deterministic(tmp_path):
    first, second = tmp_path / "first", tmp_path / "second"
    generate_samples(first)
    generate_samples(second)
    def hashes(directory):
        return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.glob("*.pdf")}

    assert hashes(first) == hashes(second)
