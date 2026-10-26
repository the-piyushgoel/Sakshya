import type { FeatureRoute } from '../../shell/featureRegistry';
import { OfficerQueuePage, CaseWorkspacePage } from './screens';

const officerRoles = ['SCRUTINY_OFFICER', 'APPROVING_OFFICER', 'SYSTEM_ADMIN'] as const;

export const routes: FeatureRoute[] = [
  { path: '/officer', element: <OfficerQueuePage />, roles: [...officerRoles] },
  { path: '/officer/cases/:id', element: <CaseWorkspacePage />, roles: [...officerRoles] },
];
