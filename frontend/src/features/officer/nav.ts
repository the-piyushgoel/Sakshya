import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Officer queue',
    path: '/officer',
    icon: 'register',
    section: 'officer',
    roles: ['SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'SYSTEM_ADMIN'],
  },
];
