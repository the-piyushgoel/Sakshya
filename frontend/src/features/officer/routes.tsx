import type { FeatureRoute } from '../../shell/featureRegistry';
import { OfficerReleaseWorkspace } from './releases';
import { OfficerConsolePage } from './screens';

export const routes: FeatureRoute[] = [
  {
    path: '/officer/queue',
    element: <OfficerConsolePage />,
    roles: ['SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'COMPLIANCE_OFFICER'],
  },
  {
    path: '/officer/releases',
    element: <OfficerReleaseWorkspace />,
    roles: ['INS_SIGNATORY', 'INS_ADMIN', 'SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'RELEASE_AUTHORITY', 'FINANCE_OFFICER', 'COMPLIANCE_OFFICER', 'LEADERSHIP', 'AUDITOR', 'SYSTEM_ADMIN'],
  },
];
