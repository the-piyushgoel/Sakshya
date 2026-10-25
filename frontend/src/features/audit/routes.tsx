import type { FeatureRoute } from '../../shell/featureRegistry';
import { AuditPage } from './screen';

export const routes: FeatureRoute[] = [
  {
    path: '/audit',
    element: <AuditPage />,
    roles: ['AUDITOR', 'SYSTEM_ADMIN', 'SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'COMPLIANCE_OFFICER',
      'RELEASE_AUTHORITY', 'FINANCE_OFFICER', 'LEADERSHIP'],
  },
];
