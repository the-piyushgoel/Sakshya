import type { FeatureRoute } from '../../shell/featureRegistry';
import { LeadershipDashboard } from './screens';

export const routes: FeatureRoute[] = [
  {
    path: '/leadership/dashboard',
    element: <LeadershipDashboard />,
    roles: ['LEADERSHIP', 'SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'COMPLIANCE_OFFICER', 'AUDITOR', 'SYSTEM_ADMIN'],
  },
];
