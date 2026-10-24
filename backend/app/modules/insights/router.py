"""
Insights module router — owned by Mehak (Lane C).

Endpoints from §3.5:
  GET /queue
  GET /instruments/{id}/risk
  GET /kpi/summary
  GET /kpi/breakdown
  GET /kpi/maturity-ladder
  GET /reports/export.csv
"""
from fastapi import APIRouter

router = APIRouter(tags=["insights"])

# Stubs added in MK-S1 (Mehak, Day 1 night)
# Real implementations in MK-2 (Mehak, Day 2 AM)

