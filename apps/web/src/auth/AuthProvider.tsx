import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@agri/shared";
import { api, authToken } from "../services/api";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(Boolean(authToken.get()));

  const logout = useCallback(() => {
    authToken.clear();
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener("agri:unauthorized", handleUnauthorized);
    if (authToken.get()) {
      api.getCurrentUser().then(setUser).catch(logout).finally(() => setLoading(false));
    }
    return () => window.removeEventListener("agri:unauthorized", handleUnauthorized);
  }, [logout]);

  const login = useCallback(async (identifier: string, password: string) => {
    const response = await api.login(identifier, password);
    authToken.set(response.token);
    setUser(response.user);
  }, []);

  const register = useCallback(
    async (
      name: string,
      identifier: string,
      password: string,
      role?: "admin" | "user",
      adminCode?: string,
    ) => {
      const response = await api.register(name, identifier, password, role, adminCode);
      authToken.set(response.token);
      setUser(response.user);
    },
    [],
  );

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
