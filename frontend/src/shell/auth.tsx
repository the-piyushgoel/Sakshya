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

interface AuthContextValue {
  user: User | null;
  loading: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getAccessToken()));
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [demoUsersError, setDemoUsersError] = useState<string | null>(null);

  useEffect(() => {
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
    const result = await api.post<AuthResponse>('/auth/login', { username, password });
    if (!result.access_token) {
      throw new ApiError('Login response did not include an access token', 'INVALID_RESPONSE', 502);
    }
    setAccessToken(result.access_token);
    const currentUser = result.user ?? await api.get<User>('/me');
    setUser(currentUser);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, demoUsers, demoUsersError }),
    [user, loading, login, logout, demoUsers, demoUsersError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
