"""
Monitoring module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  GET /alerts
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.core.enums import AlertType, Role, Severity
from app.core.models import User
from app.modules.intake.ids import institute_id
from app.modules.monitoring.schemas import AlertListResponse, AlertOut

router = APIRouter(tags=["monitoring"])

_MONITORING_ROLES = [
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.RELEASE_AUTHORITY,
    Role.LEADERSHIP,
    Role.AUDITOR,
    Role.INS_SIGNATORY,
    Role.SYSTEM_ADMIN,
]

_MOCK_ALERTS: list[dict] = [
    {
        "id": "alert-takshashila-180",
        "instrument_id": "inst-takshashila-fdr1",
        "fdr_number": "FDR-TAK-882194",
        "institute_id": institute_id("takshashila"),
        "institute_name": "Takshashila Institute of Technology",
        "alert_type": AlertType.MATURITY_180,
        "window_days": 180,
        "severity": Severity.LOW,
        "title": "Maturity Notice (180 Days): Takshashila FDR",
        "message": "Instrument FDR-TAK-882194 is 180 days from maturity. Renewal due window is open.",
        "maturity_date": "2026-11-15T00:00:00Z",
        "created_at": "2026-05-15T10:00:00Z",
    },
    {
        "id": "alert-aryabhatta-90",
        "instrument_id": "inst-aryabhatta-fdr1",
        "fdr_number": "FDR-ARYA-401928",
        "institute_id": institute_id("aryabhatta"),
        "institute_name": "Aryabhatta College of Engineering",
        "alert_type": AlertType.MATURITY_90,
        "window_days": 90,
        "severity": Severity.MEDIUM,
        "title": "Maturity Alert (90 Days): Aryabhatta FDR",
        "message": "Instrument FDR-ARYA-401928 matures in 90 days. Renewal instructions required.",
        "maturity_date": "2026-08-15T00:00:00Z",
        "created_at": "2026-05-15T10:00:00Z",
    },
    {
        "id": "alert-vidyajyoti-30",
        "instrument_id": "inst-vidyajyoti-fdr1",
        "fdr_number": "FDR-VJ-993810",
        "institute_id": institute_id("vidyajyoti"),
        "institute_name": "Vidya Jyoti Polytechnic Institute",
        "alert_type": AlertType.MATURITY_30,
        "window_days": 30,
        "severity": Severity.HIGH,
        "title": "Urgent Alert (30 Days): Vidya Jyoti FDR Approaching Maturity",
        "message": "FDR-VJ-993810 is 30 days from lapse. Institute and Scrutiny Officer notified.",
        "maturity_date": "2026-06-15T00:00:00Z",
        "created_at": "2026-05-15T10:00:00Z",
    },
]


@router.get("/alerts", response_model=AlertListResponse)
def get_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    window_days: int | None = None,
    current_user: User = Depends(require_roles(*_MONITORING_ROLES)),
    db: Session = Depends(get_db),
):
    """
    List maturity and escalation alerts.
    Institute signatories are scoped strictly to their own institute.
    """
    alerts = _MOCK_ALERTS

    # Scoping: if user is an institute signatory, show only their institute's alerts
    if current_user.institute_id:
        alerts = [a for a in alerts if a["institute_id"] == current_user.institute_id]

    if window_days is not None:
        alerts = [a for a in alerts if a["window_days"] == window_days]

    total = len(alerts)
    start_idx = (page - 1) * page_size
    items = alerts[start_idx : start_idx + page_size]

    return AlertListResponse(
        items=[AlertOut(**a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )
