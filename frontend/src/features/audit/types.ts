export interface AuditEvent {
  seq: number;
  ts: string | null;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export interface AuditListResponse {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditVerifyResponse {
  ok: boolean;
  checked: number;
  first_broken_seq: number | null;
  reason: string | null;
}

export interface TamperDemoResponse { status: string; tampered_seq: number }
export interface RepairDemoResponse { status: string; repaired_count: number }
