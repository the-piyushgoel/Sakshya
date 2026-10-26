import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'dashboard',
    section: 'dashboard',
    roles: [
      'LEADERSHIP',
      'SCRUTINY_OFFICER',
      'APPROVING_OFFICER',
      'COMPLIANCE_OFFICER',
      'RELEASE_AUTHORITY',
      'FINANCE_OFFICER',
      'AUDITOR',
      'SYSTEM_ADMIN',
    ],
  },
];
