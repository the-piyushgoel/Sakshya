import { useEffect, useState } from 'react';
import { Bell, ChevronDown, CircleUserRound, Clock3, Landmark, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
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

export function AppShell({ navItems }: { navItems: FeatureNavItem[] }) {
  const { user, logout, demoUsers, login } = useAuth();
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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const notifications = Array.isArray(notificationQuery.data)
    ? notificationQuery.data
    : notificationQuery.data?.items ?? [];
  const unreadCount = notifications.filter((item) => !item.read).length;
  const simulatedTime = clockQuery.data?.now ?? clockQuery.data?.current_time ?? clockQuery.data?.simulated_at;

  const selectUser = async () => {
    if (!switchUser || !switchPassword) {
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

  const navigation = (
    <nav aria-label={t('nav.main')} className="space-y-1">
      <NavLink to="/ui-kit" className={({ isActive }) => navClass(isActive)}>
        <span className="nav-icon"><ShieldCheck size={18} /></span>
        <span>{t('nav.uiKit')}</span>
      </NavLink>
      {navItems.map((item) => (
        <NavLink key={item.path} to={item.path} className={({ isActive }) => navClass(isActive)}>
          <span className="nav-icon"><Landmark size={18} /></span>
          <span>{translateText(item.label)}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="app-canvas min-h-screen text-slate-900">
      <aside className="sidebar hidden lg:flex">
        <Link to="/ui-kit" className="brand-lockup" aria-label={t('nav.home')}>
          <span className="brand-mark"><ShieldCheck size={23} /></span>
          <span><strong>Sakshya</strong><small>AICTE · FDR PORTAL</small></span>
        </Link>
        <div className="sidebar-label">{t('nav.workspace')}</div>
        {navigation}
        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={16} /><span>{t('nav.secureEvidence')}</span></div>
          <span className="version-note">{t('nav.demoVersion')}</span>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="mobile-nav-backdrop lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside className="mobile-nav" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between pb-6">
              <div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={22} /></span><strong>Sakshya</strong></div>
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
              <span className="truncate font-semibold text-navy-800">{translateText(navItems.find((item) => item.path === location.pathname)?.label ?? t('nav.designSystem'))}</span>
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
            <button className="icon-button logout-button" aria-label={t('nav.signOut')} onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>

        {switchUser && (
          <Modal
            open
            title={t('nav.switchDialog')}
            description={t('nav.passwordVerified', { user: switchUser })}
            onClose={() => {
              setSwitchUser('');
              setSwitchPassword('');
              setSwitchError('');
            }}
            footer={
              <>
                <Button variant="secondary" onClick={() => setSwitchUser('')}>{t('nav.cancel')}</Button>
                <Button onClick={() => void selectUser()} loading={switching}>{t('nav.signIn')}</Button>
              </>
            }
          >
            <div className="space-y-4">
              <label className="field-label">{t('nav.password')}
                <input autoFocus type="password" className="input-control mt-1.5" value={switchPassword} onChange={(event) => setSwitchPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void selectUser()} />
              </label>
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
