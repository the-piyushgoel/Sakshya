"""
Monitoring module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  GET /alerts

Jobs registered here:
  maturity_scan  — alert ladder + RENEWAL_DUE + LAPSED + MATURED
  bank_request_sla — (PY-6, Piyush)
"""
from fastapi import APIRouter

router = APIRouter(tags=["monitoring"])

# Real implementation in PR-5 (Premansh, Day 2 AM)

