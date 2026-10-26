import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Bank inbox',
    path: '/bank',
    icon: 'bank',
    section: 'bank',
    roles: ['BANK_MAKER', 'BANK_CHECKER', 'SYSTEM_ADMIN'],
  },
];
