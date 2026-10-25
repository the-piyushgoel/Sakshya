import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Leadership Dashboard',
    path: '/leadership/dashboard',
    icon: 'dashboard',
    roles: ['LEADERSHIP', 'SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'COMPLIANCE_OFFICER', 'AUDITOR', 'SYSTEM_ADMIN'],
  },
];
