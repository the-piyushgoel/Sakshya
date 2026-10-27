import type { FeatureNavItem } from '../../shell/featureRegistry';

export const navItems: FeatureNavItem[] = [
  {
    label: 'Dashboard',
    path: '/institute',
    icon: 'dashboard',
    section: 'institute',
    roles: ['INS_SIGNATORY', 'INS_ADMIN'],
  },
  {
    label: 'Obligations',
    path: '/institute#obligations',
    icon: 'obligations',
    section: 'institute',
    roles: ['INS_SIGNATORY', 'INS_ADMIN'],
  },
  {
    label: 'FDR Register',
    path: '/institute/instruments',
    icon: 'register',
    section: 'institute',
    roles: ['INS_SIGNATORY', 'INS_ADMIN'],
  },
  {
    label: 'Release Letters',
    path: '/institute/release',
    icon: 'release',
    section: 'institute',
    roles: ['INS_SIGNATORY', 'INS_ADMIN'],
  },
];
