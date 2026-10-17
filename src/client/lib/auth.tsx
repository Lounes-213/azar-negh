import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../../shared/types";
import { api, setCsrfToken } from "./api";

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  phone: string;
  wilayaId: number;
  phonePublic?: boolean;
  whatsappPublic?: boolean;
}

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  loginWithGoogle: (payload: { credential?: string; email?: string; name?: string }) => Promise<SessionUser>;
  register: (payload: RegisterPayload) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (user: SessionUser) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback((next: SessionUser | null) => {
    setUser(next);
    setCsrfToken(next?.csrfToken ?? null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser | null }>("/auth/me");
      applyUser(data.user);
    } catch {
      applyUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{ user: SessionUser }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  const loginWithGoogle = useCallback(
    async (payload: { credential?: string; email?: string; name?: string }) => {
      const data = await api<{ user: SessionUser }>("/auth/google", {
        method: "POST",
        body: payload,
      });
      applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const data = await api<{ user: SessionUser }>("/auth/register", {
        method: "POST",
        body: payload,
      });
      applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      applyUser(null);
    }
  }, [applyUser]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      refresh,
      updateUser: applyUser,
    }),
    [user, loading, login, loginWithGoogle, register, logout, refresh, applyUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
