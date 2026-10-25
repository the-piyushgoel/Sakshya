import type { FeatureRoute } from '../../shell/featureRegistry';
import { DemoControlPage } from './screen';

export const routes: FeatureRoute[] = [
  { path: '/demo-panel', element: <DemoControlPage />, roles: ['SYSTEM_ADMIN'] },
];
