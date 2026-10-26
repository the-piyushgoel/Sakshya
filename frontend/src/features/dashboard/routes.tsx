import type { FeatureRoute } from '../../shell/featureRegistry';
import { DashboardPage } from './screens';

export const routes: FeatureRoute[] = [
  {
    path: '/dashboard',
    element: <DashboardPage />,
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
