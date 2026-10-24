import type { FeatureRoute } from '../../shell/featureRegistry';
import { FinanceWorkspace, ReleaseAuthorityWorkspace } from './screens';

export const routes: FeatureRoute[] = [
  { path: '/release-desk', element: <ReleaseAuthorityWorkspace />, roles: ['RELEASE_AUTHORITY'] },
  { path: '/finance/settlements', element: <FinanceWorkspace />, roles: ['FINANCE_OFFICER'] },
];
