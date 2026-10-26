import { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  ChevronDown,
  CircleUserRound,
  Clock3,
  FileText,
  GitBranch,
  Grid2X2,
  Landmark,
  ListTodo,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  Sun,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate } from '../api/format';
import type { DemoClock, NotificationItem } from '../api/types';
import { useAuth } from './auth';
import type { FeatureNavItem } from './featureRegistry';
import { useToasts } from '../ui/Toast';
import { Button, Card, Modal, Skeleton } from '../ui';
import { LanguageToggle, useLanguage } from './language';

const navIcons: Record<NonNullable<FeatureNavItem['icon']>, LucideIcon> = {
  dashboard: Grid2X2,
  obligations: Landmark,
  register: ScrollText,
  bank: Building2,
  release: Landmark,
  discrepancies: TriangleAlert,
  documents: FileText,
  audit: GitBranch,
  verify: ShieldCheck,
};

export function AppShell({ navItems }: { navItems: FeatureNavItem[] }) {
  const { user, logout, demoUsers, login, authBypassed } = useAuth();
  const { language, t, label, translateText } = useLanguage();
  const { pushToast } = useToasts();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [switchUser, setSwitchUser] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const location = useLocation();

  const clockQuery = useQuery({
    queryKey: ['demo-clock'],
    queryFn: () => api.get<DemoClock>('/admin/clock'),
    retry: false,
    enabled: user?.roles.includes('SYSTEM_ADMIN') ?? false,
  });
  const notificationQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationItem[] | { items: NotificationItem[] }>('/notifications'),
    retry: false,
  });
  const instrumentQuery = useQuery({
    queryKey: ['institute', 'instruments'],
    queryFn: async () => {
      const response = await api.get<unknown>('/instruments');
      if (Array.isArray(response)) return response;
      if (typeof response === 'object' && response !== null && 'items' in response && Array.isArray(response.items)) {
        return response.items;
      }
      throw new Error('Instrument list response has an unexpected shape.');
    },
    retry: false,
    enabled: user?.roles.some((role) => role === 'INS_SIGNATORY' || role === 'INS_ADMIN') ?? false,
  });

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const notifications = Array.isArray(notificationQuery.data)
    ? notificationQuery.data
    : notificationQuery.data?.items ?? [];
  const unreadCount = notifications.filter((item) => !item.read).length;
  const discrepancyCount = instrumentQuery.data?.reduce<number>((count, value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return count;
    const instrument = value as { state?: unknown; discrepancies?: unknown };
    if (Array.isArray(instrument.discrepancies)) {
      const open = instrument.discrepancies.filter((entry) => typeof entry !== 'object' || entry === null || !('status' in entry) || entry.status === 'OPEN').length;
      return count + (open || (instrument.state === 'DISCREPANCY' ? 1 : 0));
    }
    return count + (instrument.state === 'DISCREPANCY' ? 1 : 0);
  }, 0) ?? 0;
  const simulatedTime = clockQuery.data?.now ?? clockQuery.data?.current_time ?? clockQuery.data?.simulated_at;

  const selectUser = async () => {
    if (!switchUser || (!authBypassed && !switchPassword)) {
      setSwitchError(t('nav.chooseCredentials'));
      return;
    }
    setSwitching(true);
    setSwitchError('');
    try {
      await login(switchUser, switchPassword);
      setSwitchUser('');
      setSwitchPassword('');
      pushToast({ title: t('nav.userChanged'), description: t('nav.signedInAs', { user: switchUser }), tone: 'success' });
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : t('nav.switchFailed'));
    } finally {
      setSwitching(false);
    }
  };

  const sections = Array.from(new Set(navItems.map((item) => item.section ?? 'institute')));
  const navigation = (
    <nav aria-label={t('nav.main')} className="sidebar-navigation">
      {navItems.length === 0 ? (
        <NavLink to="/ui-kit" className={({ isActive }) => navClass(isActive)}>
          <span className="nav-icon"><Grid2X2 size={16} /></span>
          <span>{t('nav.uiKit')}</span>
        </NavLink>
      ) : sections.map((section) => (
        <div className="nav-section" key={section}>
          <div className="sidebar-label">
            {section === 'support'
              ? t('nav.supportSection')
              : section === 'release'
                ? t('nav.releaseSection')
                : section === 'finance'
                  ? t('nav.financeSection')
                  : section === 'officer'
                    ? t('nav.officerSection')
                    : section === 'bank'
                      ? t('nav.bankSection')
                      : section === 'dashboard'
                        ? t('nav.dashboardSection')
                        : t('nav.instituteSection')}
          </div>
          {navItems.filter((item) => (item.section ?? 'institute') === section).map((item) => {
            const Icon = item.icon ? navIcons[item.icon] : ListTodo;
            const [itemPath, itemHash] = item.path.split('#');
            const active = itemHash
              ? location.pathname === itemPath && location.hash === `#${itemHash}`
              : itemPath === '/institute'
                ? location.pathname === itemPath && !location.hash
                : location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`);
            return item.disabled ? (
              <div key={`${item.label}-${item.path}`} className="nav-link nav-link-disabled" aria-disabled="true" title={t('nav.notAvailableYet')}>
                <span className="nav-icon"><Icon size={15} strokeWidth={1.7} /></span>
                <span>{translateText(item.label)}</span>
                {item.label === 'Discrepancies' && discrepancyCount > 0 && <span className="sidebar-nav-badge">{discrepancyCount}</span>}
              </div>
            ) : (
              <NavLink key={`${item.label}-${item.path}`} to={item.path} end={item.path === '/institute'} className={navClass(active)}>
                <span className="nav-icon"><Icon size={15} strokeWidth={1.7} /></span>
                <span>{translateText(item.label)}</span>
                {item.label === 'Discrepancies' && discrepancyCount > 0 && <span className="sidebar-nav-badge">{discrepancyCount}</span>}
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const sidebarBrand = (
    <Link to={navItems[0]?.path ?? '/ui-kit'} className="sidebar-brand" aria-label={t('nav.home')}>
      <span className="sidebar-seal" aria-hidden="true"><Sun size={27} strokeWidth={1.25} /></span>
      <span className="sidebar-brand-copy">
        <strong>SAKSHYA</strong>
        <small>{t('nav.brandTagline')}</small>
      </span>
    </Link>
  );

  return (
    <div className="app-canvas min-h-screen text-slate-900">
      <aside className="sidebar hidden lg:flex">
        {sidebarBrand}
        {navigation}
      </aside>

      {mobileNavOpen && (
        <div className="mobile-nav-backdrop lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside className="mobile-nav" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between pb-6">
              {sidebarBrand}
              <button className="icon-button" aria-label={t('nav.close')} onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
            </div>
            {navigation}
          </aside>
        </div>
      )}

      <main className="lg:pl-[248px]">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button lg:hidden" aria-label={t('nav.open')} onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
              <Landmark size={16} className="text-slate-400" />
              <span>{t('nav.aictePortal')}</span>
              <span className="text-slate-300">/</span>
              <span className="truncate font-semibold text-navy-800">{translateText(navItems.find((item) => !item.disabled && (location.pathname === item.path.split('#')[0] || location.pathname.startsWith(`${item.path.split('#')[0]}/`)))?.label ?? t('nav.designSystem'))}</span>
            </div>
            <span className="sm:hidden text-sm font-semibold text-navy-800">{t('nav.portal')}</span>
          </div>
          <div className="topbar-actions">
            <div className="sim-date hidden md:flex">
              <Clock3 size={15} />
              <span>{t('nav.simDate')}</span>
              <strong>{!user?.roles.includes('SYSTEM_ADMIN') ? t('nav.adminManaged') : clockQuery.isError ? t('nav.unavailable') : simulatedTime ? formatDate(simulatedTime, language) : <Skeleton className="h-3 w-20" />}</strong>
            </div>
            <LanguageToggle />
            <div className="relative">
              <button className="icon-button notification-button" aria-label={t('nav.notificationsUnread', { count: unreadCount })} onClick={() => setNotificationsOpen(true)}>
                <Bell size={19} />
                {unreadCount > 0 && <span className="notification-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
            </div>
            <label className="role-switcher">
              <span className="role-avatar"><CircleUserRound size={17} /></span>
              <span className="role-user">
                <strong>{user?.display_name ?? user?.username}</strong>
                <small>{label(user?.roles[0] ?? 'USER')}</small>
              </span>
              <select
                aria-label={t('nav.switchUser')}
                value={switchUser}
                onChange={(event) => {
                  setSwitchUser(event.target.value);
                  setSwitchPassword('demo@123');
                  setSwitchError('');
                }}
              >
                <option value="">{t('nav.switchUserOption')}</option>
                {demoUsers.map((demoUser) => (
                  <option key={demoUser.username} value={demoUser.username}>
                    {demoUser.display_name ?? demoUser.username}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="role-chevron" />
            </label>
            {!authBypassed && <button className="icon-button logout-button" aria-label={t('nav.signOut')} onClick={logout}><LogOut size={18} /></button>}
          </div>
        </header>

        {switchUser && (
          <Modal
            open
            title={t('nav.switchDialog')}
            description={authBypassed ? t('nav.previewRoleSelected', { user: switchUser }) : t('nav.passwordVerified', { user: switchUser })}
            onClose={() => {
              setSwitchUser('');
              setSwitchPassword('');
              setSwitchError('');
            }}
            footer={
              <>
                <Button variant="secondary" onClick={() => setSwitchUser('')}>{t('nav.cancel')}</Button>
                <Button onClick={() => void selectUser()} loading={switching}>{authBypassed ? t('nav.selectPreviewRole') : t('nav.signIn')}</Button>
              </>
            }
          >
            <div className="space-y-4">
              {!authBypassed && <label className="field-label">{t('nav.password')}
                <input autoFocus type="password" className="input-control mt-1.5" value={switchPassword} onChange={(event) => setSwitchPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void selectUser()} />
              </label>}
              {switchError && <p role="alert" className="text-sm text-red-700">{switchError}</p>}
            </div>
          </Modal>
        )}

        <Modal open={notificationsOpen} title={t('nav.notifications')} description={t('nav.recentUpdates')} onClose={() => setNotificationsOpen(false)}>
          {notificationQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> :
            notificationQuery.isError ? <Card className="border-red-200 bg-red-50 text-sm text-red-800">{t('nav.notificationError', { error: notificationQuery.error.message })}</Card> :
              notifications.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{t('nav.allCaughtUp')}</p> :
                <ul className="divide-y divide-slate-100">{notifications.map((item) => <li key={item.id} className="py-3"><div className="flex items-start gap-3"><span className={`mt-1.5 h-2 w-2 rounded-full ${item.read ? 'bg-slate-200' : 'bg-saffron'}`} /><div><p className="text-sm font-semibold text-slate-800">{item.title}</p>{item.body && <p className="mt-1 text-sm text-slate-500">{item.body}</p>}</div></div></li>)}</ul>}
        </Modal>

        {authBypassed && (
          <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950 sm:mx-8">
            <strong>{t('nav.previewModeTitle')}</strong> {t('nav.previewModeDescription')}
          </div>
        )}
        {clockQuery.isError && (
          <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-8">
            {t('nav.unavailableClock', { error: clockQuery.error.message })}
          </div>
        )}
        {demoUsers.length === 0 && (
          <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-8">
            {t('nav.demoUsersUnavailable')}
          </div>
        )}
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}

function navClass(active: boolean): string {
  return `nav-link${active ? ' nav-link-active' : ''}`;
}
