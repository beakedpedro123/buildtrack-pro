import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_REPORTS as bg_reports } from "@/constants/bg-urls";

type Period = "week" | "month" | "30days";

function getDateRange(period: Period): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === "week") {
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Week" };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Month" };
  }
  // 30 days
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString(), label: "Last 30 Days" };
}

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatHours(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export default function LaborCostsScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const role = employee?.role ?? "laborer";
  const canSeeDollars = role === "owner" || role === "office_manager";
  const canAccess = role === "owner" || role === "office_manager" || role === "logistics";

  const [period, setPeriod] = useState<Period>("week");
  const { startDate, endDate, label: periodLabel } = useMemo(() => getDateRange(period), [period]);

  const { data: byJob, isLoading: loadingJobs } = trpc.laborDashboard.byJob.useQuery(
    { startDate, endDate },
    { enabled: canAccess }
  );
  const { data: weeklyTrend, isLoading: loadingTrend } = trpc.laborDashboard.weeklyTrend.useQuery(
    { weeks: 8 },
    { enabled: canAccess }
  );
  const { data: byEmployee, isLoading: loadingEmp } = trpc.laborDashboard.byEmployee.useQuery(
    { startDate, endDate },
    { enabled: canAccess }
  );

  const isLoading = loadingJobs || loadingTrend || loadingEmp;

  // Compute summary stats
  const totalCost = useMemo(() => (byJob || []).reduce((sum, j) => sum + j.totalCost, 0), [byJob]);
  const totalMinutes = useMemo(() => (byJob || []).reduce((sum, j) => sum + j.totalMinutes, 0), [byJob]);
  const activeJobCount = useMemo(() => (byJob || []).filter(j => j.totalMinutes > 0).length, [byJob]);
  const totalEmployees = useMemo(() => (byEmployee || []).length, [byEmployee]);

  // Max cost for bar chart scaling
  const maxJobCost = useMemo(() => {
    if (!byJob || byJob.length === 0) return 1;
    return Math.max(...byJob.map(j => canSeeDollars ? j.totalCost : j.totalMinutes)) || 1;
  }, [byJob, canSeeDollars]);

  const maxWeeklyCost = useMemo(() => {
    if (!weeklyTrend || weeklyTrend.length === 0) return 1;
    return Math.max(...weeklyTrend.map(w => canSeeDollars ? w.totalCost : w.totalMinutes)) || 1;
  }, [weeklyTrend, canSeeDollars]);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
    periodRow: { flexDirection: "row", paddingHorizontal: 20, marginTop: 12, marginBottom: 16, gap: 8 },
    periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
    periodText: { fontSize: 13, fontWeight: "600" },
    summaryRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 20, gap: 10 },
    summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    summaryValue: { fontSize: 22, fontWeight: "800", marginBottom: 2 },
    summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: "500" },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 10 },
    chartContainer: { paddingHorizontal: 20, marginBottom: 24 },
    barRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    barLabel: { width: 100, fontSize: 12, color: colors.foreground, fontWeight: "600" },
    barTrack: { flex: 1, height: 24, backgroundColor: colors.border, borderRadius: 6, overflow: "hidden", marginHorizontal: 8 },
    barFill: { height: "100%", borderRadius: 6 },
    barValue: { fontSize: 12, fontWeight: "700", minWidth: 60, textAlign: "right" },
    weeklyChart: { flexDirection: "row", alignItems: "flex-end", height: 120, paddingHorizontal: 20, marginBottom: 8, gap: 4 },
    weekBar: { flex: 1, borderRadius: 4, minWidth: 20 },
    weekLabel: { fontSize: 9, color: colors.muted, textAlign: "center", fontWeight: "500" },
    weekLabelsRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 20, gap: 4 },
    empRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    empAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
    empName: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    empRole: { fontSize: 11, color: colors.muted, marginTop: 1 },
    empHours: { fontSize: 14, fontWeight: "700", textAlign: "right" },
    empCost: { fontSize: 11, color: colors.muted, textAlign: "right", marginTop: 1 } });

  // Access guard
  if (!canAccess) {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Labor Costs</Text>
          <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8 }}>
            Labor cost tracking is available to management roles only.
          </Text>
        </View>
    </ScreenContainer>
    );
  }

  const getRoleColor = (r: string) => {
    switch (r) {
      case "owner": return colors.primary;
      case "office_manager": return "#6366F1";
      case "logistics": return "#0EA5E9";
      case "foreman": return colors.success;
      case "laborer": return colors.muted;
      default: return colors.muted;
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
        <ImageBackground source={bg_reports} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Labor Costs</Text>
        <Text style={styles.subtitle}>Track labor spend across jobs and employees</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodRow}>
        {(["week", "month", "30days"] as Period[]).map((p) => {
          const labels: Record<Period, string> = { week: "This Week", month: "This Month", "30days": "Last 30 Days" };
          const active = period === p;
          return (
            <TouchableOpacity
              key={p}
              style={[
                styles.periodBtn,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + "15" : colors.surface },
              ]}
              onPress={() => {
                setPeriod(p);
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={[styles.periodText, { color: active ? colors.primary : colors.muted }]}>
                {labels[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {canSeeDollars ? formatCurrency(totalCost) : formatHours(totalMinutes)}
              </Text>
              <Text style={styles.summaryLabel}>
                {canSeeDollars ? "Total Labor Spend" : "Total Hours"}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>{activeJobCount}</Text>
              <Text style={styles.summaryLabel}>Active Jobs</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalEmployees}</Text>
              <Text style={styles.summaryLabel}>Employees</Text>
            </View>
          </View>

          {/* Weekly Trend Chart */}
          <Text style={styles.sectionTitle}>Weekly Trend (8 Weeks)</Text>
          {weeklyTrend && weeklyTrend.length > 0 ? (
            <>
              <View style={styles.weeklyChart}>
                {weeklyTrend.map((w, i) => {
                  const value = canSeeDollars ? w.totalCost : w.totalMinutes;
                  const height = maxWeeklyCost > 0 ? Math.max((value / maxWeeklyCost) * 100, 2) : 2;
                  const isCurrentWeek = i === weeklyTrend.length - 1;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>
                        {canSeeDollars ? formatCurrency(value) : formatHours(value)}
                      </Text>
                      <View
                        style={[
                          styles.weekBar,
                          {
                            height,
                            backgroundColor: isCurrentWeek ? colors.primary : colors.primary + "60" },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <View style={styles.weekLabelsRow}>
                {weeklyTrend.map((w, i) => (
                  <View key={i} style={{ flex: 1 }}>
                    <Text style={styles.weekLabel}>{w.weekLabel}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>No data for the selected period</Text>
            </View>
          )}

          {/* Per-Job Breakdown */}
          <Text style={styles.sectionTitle}>Cost by Job ({periodLabel})</Text>
          {byJob && byJob.length > 0 ? (
            <View style={styles.chartContainer}>
              {byJob.slice(0, 10).map((job) => {
                const value = canSeeDollars ? job.totalCost : job.totalMinutes;
                const pct = maxJobCost > 0 ? (value / maxJobCost) * 100 : 0;
                return (
                  <View key={job.jobId} style={styles.barRow}>
                    <Text style={styles.barLabel} numberOfLines={1}>{job.jobName}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.max(pct, 2)}%`,
                            backgroundColor: colors.primary },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barValue, { color: colors.foreground }]}>
                      {canSeeDollars ? formatCurrency(job.totalCost) : formatHours(job.totalMinutes)}
                    </Text>
                  </View>
                );
              })}
              {byJob.length > 10 && (
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 8 }}>
                  +{byJob.length - 10} more jobs
                </Text>
              )}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>No labor entries for this period</Text>
            </View>
          )}

          {/* Per-Employee Breakdown */}
          <Text style={styles.sectionTitle}>Cost by Employee ({periodLabel})</Text>
          {byEmployee && byEmployee.length > 0 ? (
            <View style={{ marginBottom: 20 }}>
              {byEmployee.map((emp) => (
                <View key={emp.employeeId} style={styles.empRow}>
                  <View style={[styles.empAvatar, { backgroundColor: getRoleColor(emp.role) }]}>
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                      {getInitials(emp.employeeName)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName}>{emp.employeeName}</Text>
                    <Text style={styles.empRole}>{emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}</Text>
                  </View>
                  <View>
                    <Text style={styles.empHours}>{formatHours(emp.totalMinutes)}</Text>
                    {canSeeDollars && (
                      <Text style={styles.empCost}>{formatCurrency(emp.totalCost)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>No employee data for this period</Text>
            </View>
          )}
        </ScrollView>
      )}
    </ImageBackground>
    </ScreenContainer>
  );
}
