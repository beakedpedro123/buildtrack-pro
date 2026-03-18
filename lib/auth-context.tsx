import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { trpc } from "./trpc";

export type EmployeeRole = "owner" | "secretary" | "logistics" | "foreman" | "laborer";

export interface AuthEmployee {
  id: number;
  name: string;
  role: EmployeeRole;
  pin: string;
  phone?: string | null;
  email?: string | null;
  hourlyRate?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthContextType {
  employee: AuthEmployee | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (employee: AuthEmployee) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  employee: null,
  isAuthenticated: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

const STORAGE_KEY = "buildtrack_employee";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<AuthEmployee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setEmployee(parsed);
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (emp: AuthEmployee) => {
    setEmployee(emp);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(emp));
  }, []);

  const logout = useCallback(async () => {
    setEmployee(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ employee, isAuthenticated: !!employee, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
