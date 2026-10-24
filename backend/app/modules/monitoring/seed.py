"""
Seed data for the monitoring module.

Populates baseline alerts for demo institutions and executes initial scan.
"""
from datetime import timedelta

from app.core import clock
from app.core.db import SessionLocal
from app.core.enums import AlertType, Severity
from app.modules.intake.ids import institute_id, stable_id
from app.modules.monitoring.models import Alert
from app.modules.monitoring.service import scan_maturities


def seed() -> None:
    session = SessionLocal()
    try:
        if session.query(Alert).count() > 0:
            return

        now_dt = clock.now()
        today = now_dt.date()

        # Seed baseline alerts for demo institutes (Aryabhatta, Vidya Jyoti)
        # Note: Takshashila starts at +200d with 0 alerts; alerts trigger upon clock advance.
        baseline_alerts = [
            Alert(
                id=stable_id("alert", "aryabhatta-90"),
                instrument_id=stable_id("instrument", "aryabhatta"),
                obligation_id=stable_id("obligation", "aryabhatta"),
                institute_id=institute_id("aryabhatta"),
                institute_name="Aryabhatta College of Engineering",
                fdr_number="FDR-ARYA-401928",
                alert_type=AlertType.MATURITY_90.value,
                window_days=90,
                severity=Severity.MEDIUM.value,
                title="Maturity Alert (90 Days): Aryabhatta FDR",
                message="Instrument FDR-ARYA-401928 matures in 90 days. Renewal instructions required.",
                maturity_date=today + timedelta(days=90),
                dedupe_key=f"alert:{stable_id('instrument', 'aryabhatta')}:90",
                is_resolved=False,
                created_at=now_dt,
            ),
            Alert(
                id=stable_id("alert", "vidyajyoti-30"),
                instrument_id=stable_id("instrument", "vidyajyoti"),
                obligation_id=stable_id("obligation", "vidyajyoti"),
                institute_id=institute_id("vidyajyoti"),
                institute_name="Vidya Jyoti Institute of Technology",
                fdr_number="BRB-FDR-2021-004711",
                alert_type=AlertType.MATURITY_30.value,
                window_days=30,
                severity=Severity.HIGH.value,
                title="Urgent Alert (30 Days): Vidya Jyoti FDR Approaching Maturity",
                message="FDR BRB-FDR-2021-004711 is 30 days from lapse. Institute and Scrutiny Officer notified.",
                maturity_date=today + timedelta(days=30),
                dedupe_key=f"alert:{stable_id('instrument', 'vidyajyoti')}:30",
                is_resolved=False,
                created_at=now_dt,
            ),
        ]
        session.add_all(baseline_alerts)
        session.commit()

        # Run maturity scan over intake-seeded instruments (Lothal, fillers)
        scan_maturities(session, now_dt)
        session.commit()
    finally:
        session.close()

