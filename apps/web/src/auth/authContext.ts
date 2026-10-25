import { createContext, useContext } from "react";
import type { AuthUser } from "@agri/shared";

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (
    name: string,
    identifier: string,
    password: string,
    role?: "admin" | "user",
    adminCode?: string,
  ) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
