import type { FeatureRoute } from '../../shell/featureRegistry';
import { BankInboxPage, BankRequestDetailPage } from './screens';

const bankRoles = ['BANK_MAKER', 'BANK_CHECKER', 'SYSTEM_ADMIN'] as const;

export const routes: FeatureRoute[] = [
  { path: '/bank', element: <BankInboxPage />, roles: [...bankRoles] },
  { path: '/bank/requests/:id', element: <BankRequestDetailPage />, roles: [...bankRoles] },
];
