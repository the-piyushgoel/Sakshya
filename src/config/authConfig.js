/**
 * Authentication Configuration
 * Provides credentials and role definitions.
 */
export const DEMO_ACCOUNTS = [
  {
    username: "kiet",
    password: "kiet_123.edu",
    role: "college",
    displayName: "KIET Deemed to be University",
    fullName: "Dr. Rameshwar Sharma",
    designation: "Director & College Admin",
    institutionId: "1-394829104",
    email: "director@kiet.edu",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
  },
  {
    username: "aicte_admin",
    password: "admin123",
    role: "aicte",
    displayName: "AICTE Central Regulatory Cell",
    fullName: "Er. V. K. Verma",
    designation: "Senior Scrutiny Officer (FDR & Security Deposits)",
    institutionId: "AICTE-HQ-NEWDELHI",
    email: "vk.verma@aicte-india.org",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80"
  }
];

export const STORAGE_KEYS = {
  AUTH_USER: "sakshya_demo_auth_user",
  FDR_RECORDS: "sakshya_fdr_records_v1",
  BANK_CONFIRMATIONS: "sakshya_bank_confirmations_v1",
  NOTIFICATIONS: "sakshya_notifications_v1"
};
