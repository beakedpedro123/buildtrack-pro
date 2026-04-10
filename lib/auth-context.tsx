import AsyncStorage from "@react-native-async-storage/async-storage";
import { getGlobalQueryClient } from "@/lib/query-client-ref";
import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import { trpc } from "./trpc";
import { scheduleFridayMeetingReminder, cancelFridayMeetingReminder } from "./notifications";

export type EmployeeRole = "owner" | "office_manager" | "logistics" | "foreman" | "laborer";

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
  const refreshedRef = useRef(false);

  // tRPC query to refresh employee data from server
  // Only enabled when we have a cached employee and haven't refreshed yet
  const { data: freshEmployee } = trpc.employees.getById.useQuery(
    { id: employee?.id || 0 },
    {
      enabled: !!employee && !refreshedRef.current,
      staleTime: 0,
      retry: 1,
    }
  );

  // Load cached employee from AsyncStorage on mount
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

  // Auto-refresh: when fresh data arrives from server, update cached employee
  // This ensures role changes, name changes, rate changes, etc. are picked up
  // without requiring logout/login
  useEffect(() => {
    if (freshEmployee && employee && !refreshedRef.current) {
      refreshedRef.current = true;

      // Check if the employee was deactivated
      if (!freshEmployee.isActive) {
        // Employee was deactivated — force logout
        setEmployee(null);
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        if (Platform.OS !== "web") {
          cancelFridayMeetingReminder().catch(() => {});
        }
        return;
      }

      // Check if any fields changed
      const hasChanges =
        freshEmployee.role !== employee.role ||
        freshEmployee.name !== employee.name ||
        freshEmployee.phone !== employee.phone ||
        freshEmployee.email !== employee.email ||
        freshEmployee.hourlyRate !== employee.hourlyRate ||
        freshEmployee.isActive !== employee.isActive;

      if (hasChanges) {
        const updated: AuthEmployee = {
          ...employee,
          role: freshEmployee.role as EmployeeRole,
          name: freshEmployee.name,
          phone: freshEmployee.phone,
          email: freshEmployee.email,
          hourlyRate: freshEmployee.hourlyRate,
          isActive: freshEmployee.isActive,
        };
        setEmployee(updated);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});

        // Re-schedule meeting reminder if role changed
        if (freshEmployee.role !== employee.role && Platform.OS !== "web") {
          scheduleFridayMeetingReminder(freshEmployee.role as EmployeeRole).catch(() => {});
        }
      }
    }
  }, [freshEmployee, employee]);

  const login = useCallback(async (emp: AuthEmployee) => {
    refreshedRef.current = true; // No need to refresh right after login
    setEmployee(emp);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(emp));
    // Schedule Friday meeting reminder for management roles
    if (Platform.OS !== "web") {
      scheduleFridayMeetingReminder(emp.role).catch(() => {});
    }
  }, []);

  const logout = useCallback(async () => {
    refreshedRef.current = false; // Reset for next login
    setEmployee(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    // Clear all React Query cache so next login gets fresh data
    const qc = getGlobalQueryClient();
    if (qc) {
      qc.clear();
    }
    // Cancel meeting reminder on logout
    if (Platform.OS !== "web") {
      cancelFridayMeetingReminder().catch(() => {});
    }
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
