"""
Bank module router — owned by Piyush (Lane B).

Endpoints from §3.5:
  GET  /banks
  GET  /banks/{id}/nodal-contacts
  POST /bank-requests
  GET  /bank-requests
  GET  /bank-requests/{id}
  GET  /bank/inbox
  GET  /bank/requests/{id}
  POST /bank/requests/{id}/maker-submit
  POST /bank/requests/{id}/checker-decision
"""
from fastapi import APIRouter

router = APIRouter(tags=["bank"])

# Stubs added in PY-S0 (Piyush, Day 1 PM)
# Real implementations in PY-4 (Piyush, Day 2 PM)

