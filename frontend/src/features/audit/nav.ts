import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Audit trail',
    path: '/audit',
    icon: 'audit',
    roles: ['AUDITOR', 'SYSTEM_ADMIN', 'SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'COMPLIANCE_OFFICER',
      'RELEASE_AUTHORITY', 'FINANCE_OFFICER', 'LEADERSHIP'],
  },
];
