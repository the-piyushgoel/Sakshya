import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Bank Console',
    path: '/bank/inbox',
    icon: 'bank',
    section: 'bank',
    roles: ['BANK_MAKER', 'BANK_CHECKER'],
  },
];
