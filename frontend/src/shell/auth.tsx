import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, getAccessToken, setAccessToken } from '../api/client';
import type { AuthResponse, DemoUser, User } from '../api/types';

const AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS !== 'false';

const previewUsers: DemoUser[] = [
  { username: 'preview_signatory', display_name: 'Institute Signatory', roles: ['INS_SIGNATORY'] },
  { username: 'preview_institute_admin', display_name: 'Institute Admin', roles: ['INS_ADMIN'] },
  { username: 'preview_scrutiny', display_name: 'Scrutiny Officer', roles: ['SCRUTINY_OFFICER'] },
  { username: 'preview_approver', display_name: 'Approving Officer', roles: ['APPROVING_OFFICER'] },
  { username: 'preview_release', display_name: 'Release Authority', roles: ['RELEASE_AUTHORITY'] },
  { username: 'preview_finance', display_name: 'Finance Officer', roles: ['FINANCE_OFFICER'] },
  { username: 'preview_compliance', display_name: 'Compliance Officer', roles: ['COMPLIANCE_OFFICER'] },
  { username: 'preview_leadership', display_name: 'Leadership', roles: ['LEADERSHIP'] },
  { username: 'preview_auditor', display_name: 'Auditor', roles: ['AUDITOR'] },
  { username: 'preview_admin', display_name: 'System Admin', roles: ['SYSTEM_ADMIN'] },
  { username: 'preview_bank_maker', display_name: 'Bank Maker', roles: ['BANK_MAKER'] },
  { username: 'preview_bank_checker', display_name: 'Bank Checker', roles: ['BANK_CHECKER'] },
];

const previewUser: User = {
  id: 'preview-user',
  username: 'preview_signatory',
  display_name: 'Institute Signatory',
  roles: ['INS_SIGNATORY'],
};

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authBypassed: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  demoUsers: DemoUser[];
  demoUsersError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeDemoUsers(data: unknown): DemoUser[] {
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && 'items' in data && Array.isArray(data.items)
      ? data.items
      : typeof data === 'object' && data !== null && 'users' in data && Array.isArray(data.users)
        ? data.users
        : null;
  if (!list) throw new Error('Demo user response has an unexpected shape');
  return list as DemoUser[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(AUTH_BYPASS ? previewUser : null);
  const [loading, setLoading] = useState(!AUTH_BYPASS && Boolean(getAccessToken()));
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>(AUTH_BYPASS ? previewUsers : []);
  const [demoUsersError, setDemoUsersError] = useState<string | null>(null);

  useEffect(() => {
    if (AUTH_BYPASS) {
      setAccessToken(null);
      return;
    }
    let active = true;
    api.get<unknown>('/demo/users')
      .then((data) => {
        if (active) setDemoUsers(normalizeDemoUsers(data));
      })
      .catch((error: unknown) => {
        if (active) {
          setDemoUsersError(error instanceof Error ? error.message : 'Could not load demo users');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) return;
    if (!getAccessToken()) return;
    let active = true;
    api.get<User>('/me')
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status !== 401) {
          setDemoUsersError(error.message);
        }
        setAccessToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (AUTH_BYPASS) {
      const selectedUser = previewUsers.find((candidate) => candidate.username === username);
      if (!selectedUser?.roles?.length) {
        throw new Error('Choose a preview role to continue.');
      }
      setUser({
        id: `preview-${selectedUser.username}`,
        username: selectedUser.username,
        display_name: selectedUser.display_name,
        roles: selectedUser.roles,
      });
      return;
    }
    const result = await api.post<AuthResponse>('/auth/login', { username, password });
    if (!result.access_token) {
      throw new ApiError('Login response did not include an access token', 'INVALID_RESPONSE', 502);
    }
    setAccessToken(result.access_token);
    const currentUser = result.user ?? await api.get<User>('/me');
    setUser(currentUser);
  }, []);

  const logout = useCallback(() => {
    if (AUTH_BYPASS) {
      setUser(previewUser);
      return;
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, authBypassed: AUTH_BYPASS, login, logout, demoUsers, demoUsersError }),
    [user, loading, login, logout, demoUsers, demoUsersError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
