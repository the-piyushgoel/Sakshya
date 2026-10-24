"""
Release module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  POST /release/requests
  GET  /release/requests
  GET  /release/requests/{id}
  POST /release/requests/{id}/resubmit
  POST /release/requests/{id}/recommend
  POST /release/requests/{id}/reject
  POST /release/requests/{id}/sign       (step-up)
  POST /release/letters/{id}/revoke
  GET  /release/letters/{id}
  GET  /release/letters/{id}/pdf
  GET  /holds
  POST /holds
  POST /holds/{id}/lift
  GET  /bank/letters
  POST /bank/letters/{id}/execute-maker
  POST /bank/letters/{id}/execute-checker
  GET  /finance/settlements
  POST /finance/settlements/{release_id}/confirm
"""
from fastapi import APIRouter

router = APIRouter(tags=["release"])

# Stubs added in PR-S1 (Premansh, Day 1 night)
# Real implementations in PR-6 / PR-7 / PR-8 (Premansh, Day 2-3)

