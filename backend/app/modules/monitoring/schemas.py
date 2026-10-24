"""
Monitoring module schemas (§3.5).
"""
from pydantic import BaseModel, Field

from app.core.enums import AlertType, Severity


class AlertOut(BaseModel):
    id: str
    instrument_id: str
    fdr_number: str
    institute_id: str
    institute_name: str
    alert_type: AlertType
    window_days: int = Field(..., description="Days to maturity or alert offset")
    severity: Severity = Severity.MEDIUM
    title: str
    message: str
    maturity_date: str
    created_at: str


class AlertListResponse(BaseModel):
    items: list[AlertOut]
    total: int
    page: int
    page_size: int

