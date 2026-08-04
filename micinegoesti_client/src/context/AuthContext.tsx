import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { User } from "../api/types";
import {
  clearStoredAuthSession,
  isConfirmedInvalidSession,
  persistAuthSession,
  readStoredAuthSession
} from "../lib/authSession";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  sendCode: (phone: string) => Promise<{ devCode?: string }>;
  verifyCode: (phone: string, code: string, profile?: { name?: string }) => Promise<void>;
  adminLogin: (login: string, password: string) => Promise<void>;
  dummyCustomerLogin: () => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialSession] = useState(readStoredAuthSession);
  const [token, setToken] = useState(initialSession.token);
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [loading, setLoading] = useState(Boolean(token));
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const request = (async () => {
      const stored = readStoredAuthSession();
      if (!stored.token) {
        setUser(null);
        setToken(null);
        setLoading(false);
        return;
      }

      try {
        const response = await api.me();
        persistAuthSession(stored.token, response.user, stored.sessionToken);
        setToken(stored.token);
        setUser(response.user);
      } catch (error) {
        if (isConfirmedInvalidSession(error) && stored.sessionToken) {
          try {
            const response = await api.refreshSession(stored.sessionToken);
            persistAuthSession(response.token, response.user, response.sessionToken);
            setToken(response.token);
            setUser(response.user);
          } catch (refreshError) {
            if (isConfirmedInvalidSession(refreshError)) {
              clearStoredAuthSession();
              setToken(null);
              setUser(null);
            } else {
              setToken(stored.token);
              setUser((current) => current ?? stored.user);
            }
          }
        } else if (isConfirmedInvalidSession(error)) {
          clearStoredAuthSession();
          setToken(null);
          setUser(null);
        } else {
          // Keep the last confirmed session during transient network/server
          // failures. A saved session must not disappear because one refresh
          // request temporarily failed.
          setToken(stored.token);
          setUser((current) => current ?? stored.user);
        }
      } finally {
        setLoading(false);
      }
    })();

    refreshInFlight.current = request;
    void request.finally(() => {
      if (refreshInFlight.current === request) refreshInFlight.current = null;
    });
    return request;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleExpiredSession = () => {
      clearStoredAuthSession();
      setToken(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("mdn:auth-expired", handleExpiredSession);
    return () => window.removeEventListener("mdn:auth-expired", handleExpiredSession);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      sendCode: async (phone) => {
        const response = await api.sendCode(phone);
        return { devCode: response.devCode };
      },
      verifyCode: async (phone, code, profile) => {
        const response = await api.verifyCode(phone, code, profile);
        persistAuthSession(response.token, response.user, response.sessionToken);
        setToken(response.token);
        setUser(response.user);
      },
      adminLogin: async (login, password) => {
        const response = await api.adminLogin(login, password);
        persistAuthSession(response.token, response.user, response.sessionToken);
        setToken(response.token);
        setUser(response.user);
      },
      dummyCustomerLogin: async () => {
        const response = await api.dummyCustomerLogin();
        persistAuthSession(response.token, response.user, response.sessionToken);
        setToken(response.token);
        setUser(response.user);
      },
      logout: () => {
        const stored = readStoredAuthSession();
        clearStoredAuthSession();
        setToken(null);
        setUser(null);
        if (stored.sessionToken) void api.logout(stored.sessionToken).catch(() => undefined);
      },
      refresh
    }),
    [user, token, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
