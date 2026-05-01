/**
 * BrandingContext — Centralized company branding (logo, brand color, company name).
 *
 * Fetches branding once and shares across all screens via context.
 * After logo/color updates, call `invalidateBranding()` to refresh globally
 * so ALL subscribers (home, profile, reports, etc.) get the new data instantly.
 *
 * Settings:
 *   staleTime: 5s  — employees see logo changes within 5 seconds of navigation
 *   refetchInterval: 30s — even if they stay on one screen, it polls every 30s
 */
import React, { createContext, useContext, useMemo } from "react";
import { trpc } from "./trpc";
import { useAppAuth } from "./auth-context";
import { getGlobalQueryClient } from "./query-client-ref";

export interface BrandingData {
  logoUrl: string | null;
  brandColor: string | null;
  companyName: string;
}

interface BrandingContextType {
  branding: BrandingData | null;
  isLoading: boolean;
  /** Call after logo/color update to instantly refresh branding on ALL screens */
  invalidateBranding: () => void;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: null,
  isLoading: false,
  invalidateBranding: () => {},
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { employee } = useAppAuth();
  const companyId = employee?.companyId ?? 0;

  const brandingQ = trpc.branding.get.useQuery(
    undefined,
    {
      enabled: !!companyId,
      // 5-second staleTime: navigating to a new tab will show fresh data within 5s
      staleTime: 5_000,
      // Poll every 30s so employees on the same screen still get updates
      refetchInterval: 30_000,
      // Always refetch when the screen comes into focus (tab switch, app foreground)
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchOnReconnect: true,
    }
  );

  const invalidateBranding = React.useCallback(() => {
    const qc = getGlobalQueryClient();
    if (qc) {
      // Invalidate ALL branding queries across the app — this forces every
      // subscriber to refetch immediately, not wait for staleTime
      qc.invalidateQueries({ queryKey: [["branding", "get"]] });
    }
  }, []);

  const value = useMemo<BrandingContextType>(
    () => ({
      branding: brandingQ.data
        ? {
            logoUrl: brandingQ.data.logoUrl,
            brandColor: brandingQ.data.brandColor,
            companyName: brandingQ.data.companyName,
          }
        : null,
      isLoading: brandingQ.isLoading,
      invalidateBranding,
    }),
    [brandingQ.data, brandingQ.isLoading, invalidateBranding]
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

/**
 * Hook to access company branding from any screen.
 * Returns { branding, isLoading, invalidateBranding }.
 */
export function useBranding() {
  return useContext(BrandingContext);
}
