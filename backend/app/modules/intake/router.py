"""
Intake module router — owned by Piyush (Lane B).

Endpoints from §3.5:
  GET  /institutes/me
  GET  /obligations
  GET  /obligations/{id}
  POST /documents/preview
  POST /instruments
  GET  /instruments
  GET  /instruments/{id}
  GET  /instruments/{id}/timeline
  GET  /instruments/{id}/document
  GET  /discrepancies
  POST /discrepancies/{id}/resolve
  POST /instruments/{id}/quarantine
  POST /instruments/{id}/reject
  POST /instruments/{id}/renew
  POST /instruments/{id}/activate
"""
from fastapi import APIRouter

router = APIRouter(tags=["intake"])

# Stubs added in PY-S0 (Piyush, Day 1 PM)
# Real implementations in PY-2b and PY-3 (Piyush, Day 2)

