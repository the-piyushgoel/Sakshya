import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Officer Console',
    path: '/officer/queue',
    icon: 'dashboard',
    section: 'officer',
    roles: ['SCRUTINY_OFFICER', 'APPROVING_OFFICER'],
  },
  {
    label: 'Release Review & Holds',
    path: '/officer/releases',
    icon: 'release',
    section: 'release',
    roles: ['INS_SIGNATORY', 'INS_ADMIN', 'SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'RELEASE_AUTHORITY', 'FINANCE_OFFICER', 'COMPLIANCE_OFFICER', 'LEADERSHIP', 'AUDITOR', 'SYSTEM_ADMIN'],
  },
];
