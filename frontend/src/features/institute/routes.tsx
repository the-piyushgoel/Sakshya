import type { FeatureRoute } from '../../shell/featureRegistry';
import { DashboardPage, InstrumentDetailPage, InstrumentListPage, NotificationsPage, ReleaseRequestPage, RenewalPage, SubmitFdrPage } from './screens';

const instituteRoles = ['INS_SIGNATORY', 'INS_ADMIN'] as const;

export const routes: FeatureRoute[] = [
  { path: '/institute', element: <DashboardPage />, roles: [...instituteRoles] },
  { path: '/institute/instruments', element: <InstrumentListPage />, roles: [...instituteRoles] },
  { path: '/institute/instruments/:id', element: <InstrumentDetailPage />, roles: [...instituteRoles] },
  { path: '/institute/submit', element: <SubmitFdrPage />, roles: [...instituteRoles] },
  { path: '/institute/renew/:id', element: <RenewalPage />, roles: [...instituteRoles] },
  { path: '/institute/release', element: <ReleaseRequestPage />, roles: [...instituteRoles] },
  { path: '/institute/notifications', element: <NotificationsPage />, roles: [...instituteRoles] },
];
