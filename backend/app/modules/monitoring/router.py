"""
Monitoring module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  GET /alerts
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_roles
from app.core.enums import AlertType, Role, Severity
from app.core.models import User
from app.modules.monitoring.models import Alert
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


@router.get("/alerts", response_model=AlertListResponse)
def get_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    window_days: int | None = Query(None, description="Filter by alert offset window"),
    alert_type: AlertType | None = Query(None, description="Filter by alert type"),
    is_resolved: bool | None = Query(None, description="Filter by resolution status"),
    institute_id: str | None = Query(None, description="Filter by institute (admin/officer only)"),
    current_user: User = Depends(require_roles(*_MONITORING_ROLES)),
    db: Session = Depends(get_db),
):
    """
    List maturity and escalation alerts (§3.5, §7.8).

    Institute signatories are scoped strictly to their own institute.
    Officers can inspect all institutes or filter by institute_id.
    """
    query = db.query(Alert)

    # Scoping: institute signatory strictly limited to their own institute
    if current_user.institute_id:
        query = query.filter(Alert.institute_id == current_user.institute_id)
    elif institute_id:
        query = query.filter(Alert.institute_id == institute_id)

    if window_days is not None:
        query = query.filter(Alert.window_days == window_days)

    if alert_type is not None:
        query = query.filter(Alert.alert_type == alert_type.value)

    if is_resolved is not None:
        query = query.filter(Alert.is_resolved == is_resolved)

    total = query.count()
    items = (
        query.order_by(Alert.created_at.desc(), Alert.window_days.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items_out = [
        AlertOut(
            id=a.id,
            instrument_id=a.instrument_id,
            obligation_id=a.obligation_id,
            fdr_number=a.fdr_number,
            institute_id=a.institute_id,
            institute_name=a.institute_name,
            alert_type=AlertType(a.alert_type) if isinstance(a.alert_type, str) else a.alert_type,
            window_days=a.window_days,
            severity=Severity(a.severity) if isinstance(a.severity, str) else a.severity,
            title=a.title,
            message=a.message,
            maturity_date=a.maturity_date.isoformat() if hasattr(a.maturity_date, "isoformat") else str(a.maturity_date),
            is_resolved=a.is_resolved,
            created_at=a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
        )
        for a in items
    ]

    return AlertListResponse(
        items=items_out,
        total=total,
        page=page,
        page_size=page_size,
    )
