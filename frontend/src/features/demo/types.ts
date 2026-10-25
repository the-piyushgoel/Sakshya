export interface DemoClockState {
  now?: string;
  current_time?: string;
  simulated_at?: string;
  real_now?: string;
  real_time?: string;
  real_date?: string;
  offset_days?: number;
}

export interface DemoAlert {
  id?: string | number;
  type?: string;
  severity?: string;
  instrument?: string | { id?: string; fdr_number?: string };
  instrument_id?: string;
  fdr_number?: string;
  created_at?: string;
}

export type DemoResult = Record<string, unknown>;
