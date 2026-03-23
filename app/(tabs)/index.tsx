import { ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { JobCard } from "@/components/ui/job-card";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

const companyLogo = require("@/assets/images/company-logo.png");

const ROLE_COLORS: Record<string, string> = {
  owner: "#C8A951",
  secretary: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#D4A843",
  laborer: "#22C55E",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  secretary: "Secretary",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

type LaborPeriod = "week" | "month" | "30days";

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
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

function getDateRange(period: LaborPeriod): { startDate: string; endDate: string; label: string } {
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
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString(), label: "Last 30 Days" };
}

export default function DashboardScreen() {
  const colors = useColors();
  const { employee, logout } = useAppAuth();
  const [now, setNow] = useState(new Date());
  const [laborPeriod, setLaborPeriod] = useState<LaborPeriod>("week");

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const role = employee?.role || "laborer";
  const isManagement = role === "owner" || role === "secretary" || role === "logistics";
  const isOwner = role === "owner";
  const isForeman = role === "foreman";
  const isFieldRole = role === "foreman" || role === "laborer";

  const { startDate, endDate, label: periodLabel } = useMemo(() => getDateRange(laborPeriod), [laborPeriod]);

  const { data: activeJobs } = trpc.jobs.listActive.useQuery();
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManagement });
  const { data: clockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { enabled: isManagement });
  const { data: activeEntry } = trpc.clock.activeEntry.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee }
  );
  const { data: myJobs } = trpc.jobs.forEmployee.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee && !isManagement }
  );

  // Budget alerts (owner/management only)
  const { data: budgetAlerts } = trpc.budgetAlerts.getAlerts.useQuery(undefined, { enabled: isOwner });
  const activeAlerts = useMemo(() => (budgetAlerts || []).filter(a => a.alertLevel !== "ok"), [budgetAlerts]);

  // Labor cost data (management only)
  const { data: byJob } = trpc.laborDashboard.byJob.useQuery(
    { startDate, endDate },
    { enabled: isManagement }
  );
  const { data: weeklyTrend } = trpc.laborDashboard.weeklyTrend.useQuery(
    { weeks: 8 },
    { enabled: isManagement }
  );
  const { data: byEmployee } = trpc.laborDashboard.byEmployee.useQuery(
    { startDate, endDate },
    { enabled: isManagement }
  );

  const totalCost = useMemo(() => (byJob || []).reduce((sum, j) => sum + j.totalCost, 0), [byJob]);
  const totalMinutes = useMemo(() => (byJob || []).reduce((sum, j) => sum + j.totalMinutes, 0), [byJob]);

  const maxJobCost = useMemo(() => {
    if (!byJob || byJob.length === 0) return 1;
    return Math.max(...byJob.map(j => isOwner ? j.totalCost : j.totalMinutes)) || 1;
  }, [byJob, isOwner]);

  const maxWeeklyCost = useMemo(() => {
    if (!weeklyTrend || weeklyTrend.length === 0) return 1;
    return Math.max(...weeklyTrend.map(w => isOwner ? w.totalCost : w.totalMinutes)) || 1;
  }, [weeklyTrend, isOwner]);

  const elapsed = activeEntry ? now.getTime() - new Date(activeEntry.clockIn).getTime() : 0;
  const activeJobForEntry = activeJobs?.find((j) => j.id === activeEntry?.jobId);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    greeting: { fontSize: 22, fontWeight: "800", color: colors.foreground },
    roleTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start", marginTop: 4 },
    roleTagText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    kpiRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 16 },
    kpiCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    kpiValue: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    kpiLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10 },
    sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },
    seeAll: { fontSize: 14, color: colors.primary, fontWeight: "600" },
    clockCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border },
    clockStatusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    empRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 12 },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    logoutBtn: { marginHorizontal: 20, marginTop: 8, marginBottom: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    alertBanner: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1.5 },
    alertRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    alertDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    alertJobName: { flex: 1, fontSize: 13, fontWeight: "700" },
    alertPct: { fontSize: 13, fontWeight: "800" },
    alertDetail: { fontSize: 11, marginTop: 2, marginLeft: 16 },
    // Labor cost styles
    periodRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 },
    periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
    periodText: { fontSize: 12, fontWeight: "600" },
    summaryRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 16, gap: 8 },
    summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
    summaryValue: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
    summaryLabel: { fontSize: 10, color: colors.muted, fontWeight: "500" },
    barRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    barLabel: { width: 90, fontSize: 11, color: colors.foreground, fontWeight: "600" },
    barTrack: { flex: 1, height: 20, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden", marginHorizontal: 6 },
    barFill: { height: "100%", borderRadius: 5 },
    barValue: { fontSize: 11, fontWeight: "700", minWidth: 55, textAlign: "right" },
    weeklyChart: { flexDirection: "row", alignItems: "flex-end", height: 100, paddingHorizontal: 20, marginBottom: 6, gap: 3 },
    weekBar: { flex: 1, borderRadius: 3, minWidth: 16 },
    weekLabelsRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 16, gap: 3 },
    laborEmpRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    laborEmpAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  });

  if (!employee) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </ScreenContainer>
    );
  }

  const roleColor = ROLE_COLORS[role] || colors.primary;

  const getRoleColor = (r: string) => {
    switch (r) {
      case "owner": return "#C8A951";
      case "secretary": return "#8B5CF6";
      case "logistics": return "#0EA5E9";
      case "foreman": return "#D4A843";
      case "laborer": return "#22C55E";
      default: return colors.muted;
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Company Logo */}
        <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 2 }}>
          <Image source={companyLogo} style={{ width: 100, height: 100, resizeMode: "contain" }} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={styles.greeting}>
                {now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening"}, {employee.name.split(" ")[0]}
              </Text>
              <View style={[styles.roleTag, { backgroundColor: roleColor }]}>
                <Text style={styles.roleTagText}>{ROLE_LABELS[role]}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          </View>
        </View>

        {/* Management KPIs */}
        {isManagement && (
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{(activeJobs || []).length}</Text>
              <Text style={styles.kpiLabel}>Active Jobs</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: colors.success }]}>{(clockedIn || []).length}</Text>
              <Text style={styles.kpiLabel}>On Site Now</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{(allEmployees || []).filter((e) => e.isActive).length}</Text>
              <Text style={styles.kpiLabel}>Employees</Text>
            </View>
          </View>
        )}

        {/* My Clock Status (field roles only) */}
        {isFieldRole && <View style={styles.clockCard}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <View style={[styles.clockStatusDot, { backgroundColor: activeEntry ? colors.success : colors.muted }]} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: activeEntry ? colors.success : colors.muted }}>
              {activeEntry ? "Currently Clocked In" : "Not Clocked In"}
            </Text>
          </View>
          {activeEntry ? (
            <>
              <Text style={{ fontSize: 32, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>{formatDuration(elapsed)}</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 12 }}>
                {activeJobForEntry?.name || "Unknown Job"} · Since {new Date(activeEntry.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: colors.error, borderRadius: 10, padding: 12, alignItems: "center" }}
                onPress={() => router.push("/clock" as any)}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Clock Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: colors.success, borderRadius: 10, padding: 12, alignItems: "center" }}
              onPress={() => router.push("/clock" as any)}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Clock In</Text>
            </TouchableOpacity>
          )}
        </View>}

        {/* Who's On Site (management) */}
        {isManagement && (clockedIn || []).length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>On Site Now ({(clockedIn || []).length})</Text>
              <TouchableOpacity onPress={() => router.push("/team" as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {(clockedIn || []).slice(0, 5).map((entry: any) => {
              const emp = (allEmployees || []).find((e) => e.id === entry.employeeId);
              const job = (activeJobs || []).find((j) => j.id === entry.jobId);
              const dur = now.getTime() - new Date(entry.clockIn).getTime();
              if (!emp) return null;
              return (
                <View key={entry.id} style={styles.empRow}>
                  <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[emp.role] || colors.primary }]}>
                    <Text style={styles.avatarText}>{getInitials(emp.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{job?.name || "Unknown Job"}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>{formatDuration(dur)}</Text>
                </View>
              );
            })}
            <View style={{ height: 12 }} />
          </>
        )}

        {/* ═══ BUDGET ALERTS (owner only) ═══ */}
        {isOwner && activeAlerts.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 4 }]}>
              <Text style={styles.sectionTitle}>Budget Alerts</Text>
              <View style={{ backgroundColor: colors.error + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>{activeAlerts.length}</Text>
              </View>
            </View>
            {activeAlerts.map((alert) => {
              const alertColors = {
                warning: { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E", dot: "#F59E0B" },
                danger: { bg: "#FFF1F0", border: "#F97316", text: "#9A3412", dot: "#F97316" },
                critical: { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B", dot: "#EF4444" },
                ok: { bg: colors.surface, border: colors.border, text: colors.foreground, dot: colors.success },
              };
              const ac = alertColors[alert.alertLevel];
              return (
                <View key={alert.jobId} style={[styles.alertBanner, { backgroundColor: ac.bg, borderColor: ac.border }]}>
                  <View style={styles.alertRow as any}>
                    <View style={[styles.alertDot, { backgroundColor: ac.dot }]} />
                    <Text style={[styles.alertJobName, { color: ac.text }]} numberOfLines={1}>{alert.jobName}</Text>
                    <Text style={[styles.alertPct, { color: ac.dot }]}>{alert.percentUsed}%</Text>
                  </View>
                  <Text style={[styles.alertDetail, { color: ac.text }]}>
                    {formatCurrency(alert.totalSpend)} of {formatCurrency(alert.totalBudget)} budget used
                  </Text>
                  <View style={{ flexDirection: "row", marginLeft: 16, marginTop: 4, gap: 12 }}>
                    <Text style={{ fontSize: 10, color: ac.text }}>Labor: {formatCurrency(alert.laborCost)}</Text>
                    <Text style={{ fontSize: 10, color: ac.text }}>Overhead: {formatCurrency(alert.overheadCost)}</Text>
                    <Text style={{ fontSize: 10, color: ac.text }}>Expenses: {formatCurrency(alert.expensesCost)}</Text>
                  </View>
                  {/* Progress bar */}
                  <View style={{ height: 4, backgroundColor: ac.border + "33", borderRadius: 2, marginTop: 8, marginHorizontal: 16 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: ac.dot, width: `${Math.min(alert.percentUsed, 100)}%` }} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ═══ LABOR COST DASHBOARD (management only) ═══ */}
        {isManagement && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 4 }]}>
              <Text style={styles.sectionTitle}>Labor Costs</Text>
            </View>

            {/* Period Selector */}
            <View style={styles.periodRow}>
              {(["week", "month", "30days"] as LaborPeriod[]).map((p) => {
                const labels: Record<LaborPeriod, string> = { week: "This Week", month: "This Month", "30days": "Last 30 Days" };
                const active = laborPeriod === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.periodBtn,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + "15" : colors.surface,
                      },
                    ]}
                    onPress={() => {
                      setLaborPeriod(p);
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

            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>
                  {isOwner ? formatCurrency(totalCost) : formatHours(totalMinutes)}
                </Text>
                <Text style={styles.summaryLabel}>
                  {isOwner ? `Total Spend (${periodLabel})` : `Total Hours (${periodLabel})`}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                  {(byJob || []).filter(j => j.totalMinutes > 0).length}
                </Text>
                <Text style={styles.summaryLabel}>Jobs w/ Labor</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                  {(byEmployee || []).length}
                </Text>
                <Text style={styles.summaryLabel}>Workers</Text>
              </View>
            </View>

            {/* Weekly Trend Chart */}
            {weeklyTrend && weeklyTrend.length > 0 && (
              <>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 8 }}>
                  Weekly Trend
                </Text>
                <View style={styles.weeklyChart}>
                  {weeklyTrend.map((w, i) => {
                    const value = isOwner ? w.totalCost : w.totalMinutes;
                    const height = maxWeeklyCost > 0 ? Math.max((value / maxWeeklyCost) * 80, 2) : 2;
                    const isCurrentWeek = i === weeklyTrend.length - 1;
                    return (
                      <View key={i} style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 8, fontWeight: "600", color: colors.muted, marginBottom: 3 }}>
                          {isOwner ? formatCurrency(value) : formatHours(value)}
                        </Text>
                        <View
                          style={[
                            styles.weekBar,
                            { height, backgroundColor: isCurrentWeek ? colors.primary : colors.primary + "60" },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.weekLabelsRow}>
                  {weeklyTrend.map((w, i) => (
                    <View key={i} style={{ flex: 1 }}>
                      <Text style={{ fontSize: 8, color: colors.muted, textAlign: "center", fontWeight: "500" }}>{w.weekLabel}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Per-Job Breakdown */}
            {byJob && byJob.length > 0 && (
              <>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 8 }}>
                  Cost by Job ({periodLabel})
                </Text>
                <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                  {byJob.slice(0, 8).map((job) => {
                    const value = isOwner ? job.totalCost : job.totalMinutes;
                    const pct = maxJobCost > 0 ? (value / maxJobCost) * 100 : 0;
                    const hasOverhead = isOwner && (job.taxRate > 0 || job.workersCompRate > 0 || job.liabilityInsRate > 0);
                    return (
                      <View key={job.jobId} style={{ marginBottom: hasOverhead ? 12 : 0 }}>
                        <View style={styles.barRow}>
                          <Text style={styles.barLabel} numberOfLines={1}>{job.jobName}</Text>
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: colors.primary }]} />
                          </View>
                          <Text style={[styles.barValue, { color: colors.foreground }]}>
                            {isOwner ? formatCurrency(job.totalCost) : formatHours(job.totalMinutes)}
                          </Text>
                        </View>
                        {hasOverhead && (
                          <View style={{ marginLeft: 96, paddingRight: 4 }}>
                            {job.taxRate > 0 && (
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 9, color: colors.muted }}>Tax ({job.taxRate}%)</Text>
                                <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{formatCurrency(job.taxCost)}</Text>
                              </View>
                            )}
                            {job.workersCompRate > 0 && (
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 9, color: colors.muted }}>WC ({job.workersCompRate}%)</Text>
                                <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{formatCurrency(job.workersCompCost)}</Text>
                              </View>
                            )}
                            {job.liabilityInsRate > 0 && (
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 9, color: colors.muted }}>Ins ({job.liabilityInsRate}%)</Text>
                                <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{formatCurrency(job.liabilityInsCost)}</Text>
                              </View>
                            )}
                            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 2, paddingTop: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: colors.foreground }}>Total w/ Overhead</Text>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: colors.primary }}>{formatCurrency(job.totalWithOverhead)}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Per-Employee Breakdown */}
            {byEmployee && byEmployee.length > 0 && (
              <>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 8 }}>
                  By Employee ({periodLabel})
                </Text>
                <View style={{ marginBottom: 16 }}>
                  {byEmployee.slice(0, 8).map((emp) => (
                    <View key={emp.employeeId} style={styles.laborEmpRow}>
                      <View style={[styles.laborEmpAvatar, { backgroundColor: getRoleColor(emp.role) }]}>
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{getInitials(emp.employeeName)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{emp.employeeName}</Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>{emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: "right" }}>{formatHours(emp.totalMinutes)}</Text>
                        {isOwner && (
                          <Text style={{ fontSize: 10, color: colors.muted, textAlign: "right" }}>{formatCurrency(emp.totalCost)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Active Jobs (management) */}
        {isManagement && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Jobs</Text>
              <TouchableOpacity onPress={() => router.push("/jobs" as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              {(activeJobs || []).slice(0, 3).map((job) => (
                <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} />
              ))}
            </View>
          </>
        )}

        {/* My Jobs (laborer/foreman) */}
        {!isManagement && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Jobsites</Text>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              {(myJobs || []).map((job) => (
                <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} />
              ))}
              {(!myJobs || myJobs.length === 0) && (
                <Text style={{ color: colors.muted, fontSize: 14, paddingBottom: 16 }}>No jobs assigned. Contact your manager.</Text>
              )}
            </View>
          </>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
