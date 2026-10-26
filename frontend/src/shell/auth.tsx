import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getAccessToken, setAccessToken } from '../api/client';
import type { AuthResponse, DemoUser, User } from '../api/types';

const AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';
const DEFAULT_DEMO_USERNAME = 'ar_sig';
const DEFAULT_DEMO_PASSWORD = 'demo@123';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authBypassed: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, displayName: string, password: string) => Promise<void>;
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
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(AUTH_BYPASS || Boolean(getAccessToken()));
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
    if (AUTH_BYPASS) {
      let active = true;
      setAccessToken(null);
      api.post<AuthResponse>('/auth/login', {
        username: DEFAULT_DEMO_USERNAME,
        password: DEFAULT_DEMO_PASSWORD,
      })
        .then(async (result) => {
          if (!result.access_token) {
            throw new ApiError('Login response did not include an access token', 'INVALID_RESPONSE', 502);
          }
          if (active) {
            setAccessToken(result.access_token);
            setUser(result.user ?? await api.get<User>('/me'));
          }
        })
        .catch((error: unknown) => {
          if (active) setDemoUsersError(error instanceof Error ? error.message : 'Could not start the demo session');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
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
    const selectedDemoUser = AUTH_BYPASS && !password
      ? demoUsers.find((candidate) => candidate.username === username)
      : undefined;
    if (AUTH_BYPASS && !password && !selectedDemoUser) {
      throw new Error('Choose an available seeded account to start the demo session.');
    }
    const result = await api.post<AuthResponse>('/auth/login', {
      username,
      password: selectedDemoUser ? DEFAULT_DEMO_PASSWORD : password,
    });
    if (!result.access_token) {
      throw new ApiError('Login response did not include an access token', 'INVALID_RESPONSE', 502);
    }
    // A previous institute's records must not remain visible after a user switch.
    queryClient.clear();
    setAccessToken(result.access_token);
    const currentUser = result.user ?? await api.get<User>('/me');
    setUser(currentUser);
  }, [demoUsers, queryClient]);

  const signup = useCallback(async (username: string, displayName: string, password: string) => {
    const result = await api.post<AuthResponse>('/auth/signup', {
      username,
      display_name: displayName,
      password,
    });
    if (!result.access_token) {
      throw new ApiError('Signup response did not include an access token', 'INVALID_RESPONSE', 502);
    }
    queryClient.clear();
    setAccessToken(result.access_token);
    const currentUser = result.user ?? await api.get<User>('/me');
    setUser(currentUser);
  }, [queryClient]);

  const logout = useCallback(() => {
    queryClient.clear();
    setAccessToken(null);
    setUser(null);
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, authBypassed: AUTH_BYPASS, login, signup, logout, demoUsers, demoUsersError }),
    [user, loading, login, signup, logout, demoUsers, demoUsersError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
