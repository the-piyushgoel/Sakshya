import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  { label: 'Release authority desk', path: '/release-desk', icon: 'release', section: 'release', roles: ['RELEASE_AUTHORITY'] },
  { label: 'Finance settlements', path: '/finance/settlements', icon: 'bank', section: 'finance', roles: ['FINANCE_OFFICER'] },
];
