import type { FeatureRoute } from '../../shell/featureRegistry';
import { BankConsolePage } from './screens';

export const routes: FeatureRoute[] = [
  { path: '/bank/inbox', element: <BankConsolePage />, roles: ['BANK_MAKER', 'BANK_CHECKER'] },
];
