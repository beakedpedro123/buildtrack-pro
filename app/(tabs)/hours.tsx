import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { CACHE_KEYS } from "@/lib/data-cache";
import { ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View, ImageBackground } from "react-native";
import * as Haptics from "expo-haptics";
import { getApiBaseUrl } from "@/constants/oauth";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { BG_CLOCK as bg_clock } from "@/constants/bg-urls";
import { formatTime12 } from "@/lib/utils";
import { useRouter } from "expo-router";
import {
  getCurrentPayrollPeriod,
  getPreviousPeriod,
  getNextPeriod,
  getThisWeekRange,
  getFullPeriodRange,
  getCurrentWeekInPeriod,
  type PayrollPeriod,
} from "@/lib/payroll-periods";

type PeriodView = "week" | "biweek";

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function calcEstimatedPay(totalMinutes: number, hourlyRate: string | null): string {
  if (!hourlyRate) return "—";
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return "—";
  const hours = totalMinutes / 60;
  return `$${(hours * rate).toFixed(2)}`;
}

export default function HoursScreen({ embedded }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const router = useRouter();
  const { employee } = useAppAuth();
  const [periodView, setPeriodView] = useState<PeriodView>("week");
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = current, -1 = previous, etc.

  // Calculate the payroll period based on offset
  const payrollPeriod = useMemo(() => {
    let period = getCurrentPayrollPeriod();
    if (periodOffset < 0) {
      for (let i = 0; i < Math.abs(periodOffset); i++) {
        period = getPreviousPeriod(period);
      }
    } else if (periodOffset > 0) {
      for (let i = 0; i < periodOffset; i++) {
        period = getNextPeriod(period);
      }
    }
    return period;
  }, [periodOffset]);

  // Get the date range based on view selection
  const range = useMemo(() => {
    if (periodView === "week") {
      if (periodOffset === 0) {
        // Current period: show current week
        return getThisWeekRange(payrollPeriod);
      } else {
        // Past/future period: show week 1 by default
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        return {
          startDate: payrollPeriod.week1Start.toISOString(),
          endDate: (now < payrollPeriod.week1End ? now : payrollPeriod.week1End).toISOString(),
          label: "Week 1",
        };
      }
    } else {
      return getFullPeriodRange(payrollPeriod);
    }
  }, [periodView, payrollPeriod, periodOffset]);

  // Only the owner can see their own hourly rate and estimated pay
  const canSeePayRate = employee?.role === "owner" || employee?.role === "office_manager";

  const hoursQ = trpc.payroll.getMyHours.useQuery(
    {
      employeeId: employee?.id || 0,
      startDate: range.startDate,
      endDate: range.endDate },
    { enabled: !!employee, staleTime: 15_000, refetchOnMount: "always" }
  );
  const cacheKey = `${CACHE_KEYS.HOURS_ENTRIES}_${employee?.id}_${range.startDate}_${range.endDate}`;
  const { data, isLoading } = useOfflineCache(cacheKey, hoursQ.data, hoursQ.isLoading);
  const refetch = hoursQ.refetch;

  const currentWeek = getCurrentWeekInPeriod(payrollPeriod);
  const isCurrentPeriod = periodOffset === 0;

  const styles = StyleSheet.create({
    periodBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8 },
    periodBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary },
    periodBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted },
    periodBtnTextActive: {
      color: "#fff" },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border },
    entryRow: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 20,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border },
    navBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    navBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
  });

  const PERIOD_VIEWS: { key: PeriodView; label: string }[] = [
    { key: "week", label: isCurrentPeriod ? `Week ${currentWeek}` : "Week 1" },
    { key: "biweek", label: "2 Weeks" },
  ];

  const Wrapper = embedded ? View : ScreenContainer;
  return (
    <Wrapper style={embedded ? { flex: 1 } : undefined}>
        <ImageBackground source={bg_clock} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.08 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>My Hours</Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
          {employee?.name || "Employee"} · {employee?.role}
        </Text>
      </View>

      {/* Payroll Period Navigation */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => setPeriodOffset(prev => prev - 1)}
        >
          <Text style={styles.navBtnText}>← Previous</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
            {payrollPeriod.label}
          </Text>
          {isCurrentPeriod && (
            <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>Current Payroll</Text>
          )}
        </View>
        {periodOffset < 0 ? (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setPeriodOffset(prev => prev + 1)}
          >
            <Text style={styles.navBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 90 }} />
        )}
      </View>

      {/* Period View Selector (Week / 2 Weeks) */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingBottom: 16 }}>
        {PERIOD_VIEWS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, periodView === p.key && styles.periodBtnActive]}
            onPress={() => setPeriodView(p.key)}
          >
            <Text style={[styles.periodBtnText, periodView === p.key && styles.periodBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data?.entries || []}
          keyExtractor={(item) => item.id.toString()}
          ListHeaderComponent={
            <View style={styles.summaryCard}>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                {periodView === "week" ? range.label : `Payroll Period`} Summary
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View>
                  <Text style={{ fontSize: 36, fontWeight: "800", color: colors.primary }}>
                    {formatDuration(data?.totalMinutes || 0)}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 2 }}>
                    {((data?.totalMinutes || 0) / 60).toFixed(2)} decimal hrs
                  </Text>
                </View>
                {canSeePayRate && data?.employee?.hourlyRate && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: colors.success }}>
                      {calcEstimatedPay(data.totalMinutes, data.employee.hourlyRate)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      @ ${data.employee.hourlyRate}/hr
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {data?.entries.length || 0} shifts recorded
                </Text>
                <TouchableOpacity onPress={() => router.push(`/timecard/${employee?.id}` as any)}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>View Full Timecard ›</Text>
                </TouchableOpacity>
              </View>
              {/* Download My Hours PDF */}
              <TouchableOpacity
                style={{
                  backgroundColor: "#D4AF37",
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: "center",
                  marginTop: 12,
                }}
                onPress={async () => {
                  try {
                    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    const apiBase = getApiBaseUrl();
                    const cId = (employee as any)?.companyId;
                    const url = `${apiBase}/api/timecard-pdf?employeeId=${employee?.id}&startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}${cId ? `&companyId=${cId}` : ""}`;
                    const { downloadAuthenticatedPDF } = await import("@/lib/download-pdf");
                    await downloadAuthenticatedPDF(url, `my_hours_${range.startDate.slice(0, 10)}_to_${range.endDate.slice(0, 10)}.pdf`);
                  } catch (err: any) {
                    Alert.alert("Error", `Failed to download: ${err?.message || "Unknown error"}`);
                  }
                }}
              >
                <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>
                  📄 Download My Hours PDF
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.entryRow}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {formatDate(item.clockIn)}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                  {item.durationMinutes > 0 ? `${formatDuration(item.durationMinutes)} (${(item.durationMinutes / 60).toFixed(2)})` : "In progress"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", marginTop: 4, gap: 16 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  In: {formatTime12(item.clockIn)}
                </Text>
                {item.clockOut && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Out: {formatTime12(item.clockOut)}
                  </Text>
                )}
                {!item.clockOut && (
                  <View style={{ backgroundColor: colors.success + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>Active</Text>
                  </View>
                )}
              </View>
              {item.isOfflineEntry && (
                <View style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.warning }}> Synced from offline</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <MaterialIcons name="schedule" size={40} color={colors.muted} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                No hours recorded
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                {isCurrentPeriod
                  ? "Clock in on a jobsite to start tracking your hours."
                  : "No clock entries found for this payroll period."}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}
    </ImageBackground>
    </Wrapper>
  );
}
