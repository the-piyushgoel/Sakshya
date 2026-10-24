import type { FeatureRoute } from '../../shell/featureRegistry';
import { PublicVerificationPage } from './screens';

export const routes: FeatureRoute[] = [
  { path: '/verify', element: <PublicVerificationPage />, public: true },
  { path: '/verify/:code', element: <PublicVerificationPage />, public: true },
];
