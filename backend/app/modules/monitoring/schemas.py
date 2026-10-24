"""
Monitoring module schemas (§3.5).
"""
from pydantic import BaseModel, Field

from app.core.enums import AlertType, Severity


class AlertOut(BaseModel):
    id: str
    instrument_id: str
    obligation_id: str | None = None
    fdr_number: str
    institute_id: str
    institute_name: str
    alert_type: AlertType
    window_days: int = Field(..., description="Days to maturity or alert offset")
    severity: Severity = Severity.MEDIUM
    title: str
    message: str
    maturity_date: str
    is_resolved: bool = False
    created_at: str

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    items: list[AlertOut]
    total: int
    page: int
    page_size: int
