export const roles = [
  'INS_SIGNATORY',
  'INS_ADMIN',
  'SCRUTINY_OFFICER',
  'APPROVING_OFFICER',
  'RELEASE_AUTHORITY',
  'FINANCE_OFFICER',
  'COMPLIANCE_OFFICER',
  'LEADERSHIP',
  'AUDITOR',
  'SYSTEM_ADMIN',
  'BANK_MAKER',
  'BANK_CHECKER',
] as const;

export type Role = (typeof roles)[number];

export interface User {
  id: string;
  username: string;
  display_name?: string;
  roles: Role[];
  institute_id?: string | null;
  bank_id?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  user?: User;
}

export interface DemoUser {
  username: string;
  roles?: Role[];
  display_name?: string;
  institute_id?: string | null;
  bank_id?: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  read?: boolean;
  created_at?: string;
}

export interface DemoClock {
  now?: string;
  current_time?: string;
  simulated_at?: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}
