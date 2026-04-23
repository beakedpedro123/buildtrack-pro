import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { CACHE_KEYS } from "@/lib/data-cache";
import { ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";
import * as Haptics from "expo-haptics";

import { BG_REPORTS as bg_reports } from "@/constants/bg-urls";

type Period = "week" | "biweek" | "month" | "custom";

// ─── Biweekly pay period engine ───────────────────────────────────────────────
// Anchor: April 6, 2026 (first day of current pay period). Repeats every 14 days.
// Pay date is always 4 days after period start (April 10 for the April 6 period).
const PERIOD_ANCHOR_MS = new Date("2026-04-06T00:00:00").getTime();
const PERIOD_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getCurrentPayPeriod(now: Date): { periodStart: Date; periodEnd: Date } {
  const daysSinceAnchor = (now.getTime() - PERIOD_ANCHOR_MS) / MS_PER_DAY;
  const periodsElapsed = daysSinceAnchor >= 0
    ? Math.floor(daysSinceAnchor / PERIOD_DAYS)
    : Math.ceil(daysSinceAnchor / PERIOD_DAYS) - 1;
  const periodStart = new Date(PERIOD_ANCHOR_MS + periodsElapsed * PERIOD_DAYS * MS_PER_DAY);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart.getTime() + (PERIOD_DAYS - 1) * MS_PER_DAY);
  periodEnd.setHours(23, 59, 59, 999);
  return { periodStart, periodEnd };
}

/** Get pay period with offset from current. offset=0 is current, -1 is previous, etc. */
function getPayPeriodByOffset(offset: number): { periodStart: Date; periodEnd: Date } {
  const { periodStart: currentStart } = getCurrentPayPeriod(new Date());
  const periodStart = new Date(currentStart.getTime() + offset * PERIOD_DAYS * MS_PER_DAY);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart.getTime() + (PERIOD_DAYS - 1) * MS_PER_DAY);
  periodEnd.setHours(23, 59, 59, 999);
  return { periodStart, periodEnd };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function getDateRange(period: Period, customStart?: string, customEnd?: string, periodOffset: number = 0): { startDate: string; endDate: string; label: string } {
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart + "T00:00:00");
    const end = new Date(customEnd + "T23:59:59.999");
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: `${fmtDate(start)} – ${fmtDate(end)}`,
    };
  }
  const now = new Date();
  const { periodStart, periodEnd } = getCurrentPayPeriod(now);

  if (period === "week") {
    // Show the current week within the pay period (first 7 days or second 7 days)
    const dayInPeriod = Math.floor((now.getTime() - periodStart.getTime()) / MS_PER_DAY);
    const weekStart = dayInPeriod >= 7
      ? new Date(periodStart.getTime() + 7 * MS_PER_DAY)
      : new Date(periodStart);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    weekEnd.setHours(23, 59, 59, 999);
    return {
      startDate: weekStart.toISOString(),
      endDate: weekEnd.toISOString(),
      label: `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`,
    };
  } else if (period === "biweek") {
    // Pay period with offset navigation (0 = current, -1 = previous, etc.)
    const { periodStart: pStart, periodEnd: pEnd } = getPayPeriodByOffset(periodOffset);
    return {
      startDate: pStart.toISOString(),
      endDate: pEnd.toISOString(),
      label: `${fmtDate(pStart)} – ${fmtDate(pEnd)}`,
    };
  } else {
    // This month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Month" };
  }
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function calcPay(row: { payType?: string; salaryAmount?: string | null; totalMinutes: number; hourlyRate: string | null }): string {
  if (row.payType === "salary") {
    const amt = row.salaryAmount ? parseFloat(row.salaryAmount) : 0;
    return amt > 0 ? `$${amt.toFixed(2)}` : "—";
  }
  if (!row.hourlyRate) return "—";
  const rate = parseFloat(row.hourlyRate);
  if (isNaN(rate)) return "—";
  return `$${((row.totalMinutes / 60) * rate).toFixed(2)}`;
}

function calcPayNum(row: { payType?: string; salaryAmount?: string | null; totalMinutes: number; hourlyRate: string | null }): number {
  if (row.payType === "salary") {
    return row.salaryAmount ? parseFloat(row.salaryAmount) : 0;
  }
  if (!row.hourlyRate) return 0;
  const rate = parseFloat(row.hourlyRate);
  if (isNaN(rate)) return 0;
  return (row.totalMinutes / 60) * rate;
}

const ROLE_ORDER = ["owner", "office_manager", "logistics", "foreman", "laborer"];

// Simple date input component
function DateInput({ label, value, onChange, colors }: { label: string; value: string; onChange: (v: string) => void; colors: any }) {
  // value is YYYY-MM-DD format
  const [month, setMonth] = useState(value ? value.slice(5, 7) : "");
  const [day, setDay] = useState(value ? value.slice(8, 10) : "");
  const [year, setYear] = useState(value ? value.slice(0, 4) : "");

  const update = (m: string, d: string, y: string) => {
    if (m.length === 2 && d.length === 2 && y.length === 4) {
      const mm = parseInt(m); const dd = parseInt(d); const yy = parseInt(y);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yy >= 2020 && yy <= 2030) {
        onChange(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
      }
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          style={{
            backgroundColor: colors.surface,
            borderRadius: 10,
            padding: 12,
            fontSize: 16,
            color: colors.foreground,
            borderWidth: 1,
            borderColor: colors.border,
            width: 56,
            textAlign: "center",
          }}
          placeholder="MM"
          placeholderTextColor={colors.muted}
          value={month}
          onChangeText={(v) => { const clean = v.replace(/\D/g, "").slice(0, 2); setMonth(clean); update(clean, day, year); }}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={{ fontSize: 18, color: colors.muted }}>/</Text>
        <TextInput
          style={{
            backgroundColor: colors.surface,
            borderRadius: 10,
            padding: 12,
            fontSize: 16,
            color: colors.foreground,
            borderWidth: 1,
            borderColor: colors.border,
            width: 56,
            textAlign: "center",
          }}
          placeholder="DD"
          placeholderTextColor={colors.muted}
          value={day}
          onChangeText={(v) => { const clean = v.replace(/\D/g, "").slice(0, 2); setDay(clean); update(month, clean, year); }}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={{ fontSize: 18, color: colors.muted }}>/</Text>
        <TextInput
          style={{
            backgroundColor: colors.surface,
            borderRadius: 10,
            padding: 12,
            fontSize: 16,
            color: colors.foreground,
            borderWidth: 1,
            borderColor: colors.border,
            width: 72,
            textAlign: "center",
          }}
          placeholder="YYYY"
          placeholderTextColor={colors.muted}
          value={year}
          onChangeText={(v) => { const clean = v.replace(/\D/g, "").slice(0, 4); setYear(clean); update(month, day, clean); }}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
    </View>
  );
}

export default function PayrollScreen({ embedded }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const router = useRouter();
  const { employee } = useAppAuth();
  const [period, setPeriod] = useState<Period>("biweek");
  const [periodOffset, setPeriodOffset] = useState(0); // 0=current, -1=previous, -2=two ago, etc.
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [reportType, setReportType] = useState<"full" | "payroll" | "jobcost" | "employee">("full");
  const [showReportPicker, setShowReportPicker] = useState(false);
  const [billingRate, setBillingRate] = useState<number | null>(null);
  const [showBillingPicker, setShowBillingPicker] = useState(false);
  const [filterJobId, setFilterJobId] = useState<number | null>(null);
  const [showJobPicker, setShowJobPicker] = useState(false);

  // Custom date range state
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 13);
  const [customStart, setCustomStart] = useState(twoWeeksAgo.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(today.toISOString().slice(0, 10));

  const range = getDateRange(period, customStart, customEnd, periodOffset);

  // RBAC: payroll screen is for owner/office_manager/logistics only
  const canAccessPayroll = employee?.role === "owner" || employee?.role === "office_manager";
  const canSeeRates = employee?.role === "owner" || employee?.role === "office_manager";

  const PWrapper = embedded ? View : ScreenContainer;
  if (!canAccessPayroll) {
    return (
      <PWrapper style={embedded ? { flex: 1 } : undefined}>
        <ImageBackground source={bg_reports} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.08 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            Access Restricted
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>
            Payroll reports are only available to management.
          </Text>
        </View>
          </ImageBackground>
    </PWrapper>
    );
  }

  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await utils.invalidate(); } catch {}
    setRefreshing(false);
  }, [utils]);
  const reportQ = trpc.payroll.getReport.useQuery({
    startDate: range.startDate,
    endDate: range.endDate });
  const jobsQ = trpc.jobs.listActive.useQuery();
  const { data, isLoading } = useOfflineCache(`${CACHE_KEYS.PAYROLL_DATA}_${range.startDate}_${range.endDate}`, reportQ.data, reportQ.isLoading);
  const { data: jobsData } = useOfflineCache(CACHE_KEYS.ACTIVE_JOBS, jobsQ.data, jobsQ.isLoading);
  const refetch = reportQ.refetch;

  const styles = StyleSheet.create({
    periodBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8 },
    periodBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary },
    periodBtnText: { fontSize: 13, fontWeight: "600", color: colors.muted },
    periodBtnTextActive: { color: "#fff" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginHorizontal: 20,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border },
    pdfBtn: {
      backgroundColor: "#D4AF37",
      borderRadius: 12,
      paddingVertical: 14,
      marginHorizontal: 20,
      marginBottom: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8 } });

  const sortedRows = [...(data?.rows || [])].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  const totalPayroll = canSeeRates
    ? sortedRows.reduce((sum, r) => sum + calcPayNum(r), 0)
    : 0;

  const REPORT_TYPES: { key: typeof reportType; label: string; desc: string }[] = [
    { key: "full", label: "Full Report", desc: "Payroll + Job Costs + Employee Detail" },
    { key: "payroll", label: "Payroll Summary", desc: "Employee hours & pay totals" },
    { key: "jobcost", label: "Job Cost Report", desc: "Per-job hours & labor costs" },
    { key: "employee", label: "Employee Detail", desc: "Daily timecards per employee" },
  ];

  const handleDownloadPDF = async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDownloadingPDF(true);
    try {
      const apiBase = getApiBaseUrl();
      let url = `${apiBase}/api/payroll-pdf?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}&reportType=${reportType}`;
      if (billingRate) url += `&billingRate=${billingRate}`;
      if (filterJobId) url += `&jobId=${filterJobId}`;
      if (Platform.OS === "web") {
        window.open(url, "_blank");
      } else {
        await Linking.openURL(url);
      }
    } catch (err: any) {
      Alert.alert("Error", `Failed to download PDF: ${err?.message || "Unknown error"}`);
    } finally {
      setDownloadingPDF(false);
    }
  };

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "This Week" },
    { key: "biweek", label: "Pay Period" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  const handlePeriodPress = (key: Period) => {
    if (key === "custom") {
      setShowDatePicker(true);
    } else {
      setPeriod(key);
      if (key !== "biweek") setPeriodOffset(0); // reset offset when leaving biweek
    }
  };

  return (
    <PWrapper style={embedded ? { flex: 1 } : undefined}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>
            Payroll Report
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
            {new Date(range.startDate).toLocaleDateString()} –{" "}
            {new Date(range.endDate).toLocaleDateString()}
          </Text>
          {period === "biweek" && (() => {
            const { periodStart } = getPayPeriodByOffset(periodOffset);
            const payDate = new Date(periodStart.getTime() + 4 * MS_PER_DAY);
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                  Pay Date: {payDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
                {periodOffset === 0 && (
                  <View style={{ backgroundColor: colors.success + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.success }}>Current Period</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        {/* Pay Period Navigation — only when biweek is selected */}
        {period === "biweek" && (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginHorizontal: 20,
            marginBottom: 12,
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: periodOffset === 0 ? colors.primary + "40" : colors.border,
            padding: 10,
          }}>
            <TouchableOpacity
              onPress={() => {
                setPeriodOffset((prev) => prev - 1);
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.primary + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 18, color: colors.primary, fontWeight: "700" }}>{"\u2190"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (periodOffset !== 0) {
                  setPeriodOffset(0);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
              }}
              style={{ flex: 1, alignItems: "center", paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                {periodOffset === 0
                  ? "Current Pay Period"
                  : periodOffset === -1
                    ? "Previous Pay Period"
                    : periodOffset === 1
                      ? "Next Pay Period"
                      : `${Math.abs(periodOffset)} Periods ${periodOffset < 0 ? "Ago" : "Ahead"}`}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {range.label}
              </Text>
              {periodOffset !== 0 && (
                <Text style={{ fontSize: 11, color: colors.primary, marginTop: 2, fontWeight: "600" }}>
                  Tap to return to current
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (periodOffset < 0) {
                  setPeriodOffset((prev) => prev + 1);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: periodOffset < 0 ? colors.primary + "15" : colors.border + "40",
                alignItems: "center",
                justifyContent: "center",
                opacity: periodOffset < 0 ? 1 : 0.4,
              }}
            >
              <Text style={{ fontSize: 18, color: periodOffset < 0 ? colors.primary : colors.muted, fontWeight: "700" }}>{"\u2192"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Period Selector */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingBottom: 16, flexWrap: "wrap", gap: 4 }}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => handlePeriodPress(p.key)}
            >
              <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom date range display */}
        {period === "custom" && (
          <TouchableOpacity
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              backgroundColor: colors.primary + "15",
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: colors.primary + "40",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onPress={() => setShowDatePicker(true)}
          >
            <View>
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>Custom Date Range</Text>
              <Text style={{ fontSize: 15, color: colors.foreground, fontWeight: "700", marginTop: 2 }}>
                {new Date(customStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – {new Date(customEnd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.primary }}>✏️ Edit</Text>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <View style={{ alignItems: "center", padding: 40 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Summary Card */}
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
                {range.label} Summary
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: colors.primary }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                    {sortedRows.length}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>employees</Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                    {formatDuration(sortedRows.reduce((s, r) => s + r.totalMinutes, 0))}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>total hours</Text>
                </View>
                {canSeeRates && (
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: colors.success }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                      ${totalPayroll.toFixed(0)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>est. payroll</Text>
                  </View>
                )}
              </View>
            </View>

            {canSeeRates && (
              <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
                {/* Report Type Selector */}
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                  onPress={() => setShowReportPicker(true)}
                >
                  <View>
                    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>Report Type</Text>
                    <Text style={{ fontSize: 15, color: colors.foreground, fontWeight: "700", marginTop: 2 }}>
                      {REPORT_TYPES.find(r => r.key === reportType)?.label || "Full Report"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                      {REPORT_TYPES.find(r => r.key === reportType)?.desc}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: colors.primary }}>▼</Text>
                </TouchableOpacity>

                {/* Billing Rate Selector */}
                <TouchableOpacity
                  style={{
                    backgroundColor: billingRate ? "#D4AF3715" : colors.surface,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: billingRate ? "#D4AF37" : colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                  onPress={() => setShowBillingPicker(true)}
                >
                  <View>
                    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>Hourly Billing Rate</Text>
                    <Text style={{ fontSize: 15, color: billingRate ? "#D4AF37" : colors.foreground, fontWeight: "700", marginTop: 2 }}>
                      {billingRate ? `$${billingRate}/hr` : "None (internal payroll only)"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                      {billingRate ? "Applies to hourly/no-budget jobs" : "Select to add billing rate for contractors"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: colors.primary }}>▼</Text>
                </TouchableOpacity>

                {/* Job Filter Selector */}
                <TouchableOpacity
                  style={{
                    backgroundColor: filterJobId ? colors.primary + "15" : colors.surface,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: filterJobId ? colors.primary : colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                  onPress={() => setShowJobPicker(true)}
                >
                  <View>
                    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>Filter by Job</Text>
                    <Text style={{ fontSize: 15, color: colors.foreground, fontWeight: "700", marginTop: 2 }}>
                      {filterJobId
                        ? (jobsData || []).find((j: any) => j.id === filterJobId)?.name || `Job #${filterJobId}`
                        : "All Jobs"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                      {filterJobId ? "Report for this job only" : "Download report for all jobs or select one"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: colors.primary }}>▼</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPDF} disabled={downloadingPDF}>
                  {downloadingPDF ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                      📄 Download {filterJobId ? "Job Report" : (REPORT_TYPES.find(r => r.key === reportType)?.label || "Report")}
                      {billingRate ? ` @ $${billingRate}/hr` : ""}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Employee Rows */}
            {sortedRows.length === 0 ? (
              <View style={{ alignItems: "center", padding: 40 }}>
                <Text style={{ fontSize: 40 }}>📋</Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                  No hours recorded
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                  No clock entries found for this period.
                </Text>
              </View>
            ) : (
              sortedRows.map((row) => (
                <TouchableOpacity key={row.employeeId} style={styles.card} onPress={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/timecard/${row.employeeId}` as any); }} activeOpacity={0.6}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>
                        {row.name}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <View
                          style={{
                            backgroundColor: colors.primary + "22",
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 2 }}
                        >
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600", textTransform: "capitalize" }}>
                            {row.role?.replace("_", " ")}
                          </Text>
                        </View>
                        {canSeeRates && row.payType === "salary" && (
                          <View style={{ backgroundColor: "#D4AF3722", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: "#D4AF37", fontWeight: "700" }}>
                              SALARY · ${row.salaryAmount}/period
                            </Text>
                          </View>
                        )}
                        {canSeeRates && row.payType !== "salary" && row.hourlyRate && (
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            ${row.hourlyRate}/hr
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {row.payType === "salary" ? (
                        <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic" }}>salaried</Text>
                      ) : (
                        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.primary }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                          {formatDuration(row.totalMinutes)}
                        </Text>
                      )}
                      {canSeeRates && (
                        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.success, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                          {calcPay(row)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      flexDirection: "row",
                      justifyContent: "space-between" }}
                  >
                    {row.payType === "salary" ? (
                      <Text style={{ fontSize: 12, color: colors.muted }}>Biweekly salary — no clock-in required</Text>
                    ) : (
                      <>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {row.entries.length} shifts
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {(row.totalMinutes / 60).toFixed(1)} hrs total
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Custom Date Range Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 24 }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 20 }}>
              Select Date Range
            </Text>

            <DateInput label="Start Date" value={customStart} onChange={setCustomStart} colors={colors} />
            <DateInput label="End Date" value={customEnd} onChange={setCustomEnd} colors={colors} />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 2,
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
                onPress={() => {
                  setPeriod("custom");
                  setShowDatePicker(false);
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Apply Range</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report Type Picker Modal */}
      <Modal visible={showReportPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 24 }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
              Choose Report Type
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>
              Select which sections to include in the PDF
            </Text>

            {REPORT_TYPES.map((rt) => (
              <TouchableOpacity
                key={rt.key}
                style={{
                  backgroundColor: reportType === rt.key ? colors.primary + "15" : colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: reportType === rt.key ? colors.primary : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                onPress={() => {
                  setReportType(rt.key);
                  setShowReportPicker(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                    {rt.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {rt.desc}
                  </Text>
                </View>
                {reportType === rt.key && (
                  <Text style={{ fontSize: 20, color: colors.primary, marginLeft: 12 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              onPress={() => setShowReportPicker(false)}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Billing Rate Picker Modal */}
      <Modal visible={showBillingPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 24 }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
              Hourly Billing Rate
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>
              Select the rate to charge contractors for hourly/no-budget jobs
            </Text>

            {[null, 45, 50, 55, 60].map((rate) => (
              <TouchableOpacity
                key={rate ?? "none"}
                style={{
                  backgroundColor: billingRate === rate ? "#D4AF3720" : colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: billingRate === rate ? "#D4AF37" : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                onPress={() => {
                  setBillingRate(rate);
                  setShowBillingPicker(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: rate ? "#D4AF37" : colors.foreground }}>
                    {rate ? `$${rate}/hr` : "None"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {rate ? `Charge contractors $${rate} per man hour` : "Internal payroll only — no billing rate"}
                  </Text>
                </View>
                {billingRate === rate && (
                  <Text style={{ fontSize: 20, color: "#D4AF37", marginLeft: 12 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              onPress={() => setShowBillingPicker(false)}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Job Filter Picker Modal */}
      <Modal visible={showJobPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 24, maxHeight: "70%" }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
              Filter by Job
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>
              Download a report for a specific job or all jobs
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: !filterJobId ? colors.primary + "15" : colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: !filterJobId ? colors.primary : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                onPress={() => {
                  setFilterJobId(null);
                  setShowJobPicker(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>All Jobs</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Full report across all job sites</Text>
                </View>
                {!filterJobId && <Text style={{ fontSize: 20, color: colors.primary, marginLeft: 12 }}>✓</Text>}
              </TouchableOpacity>

              {(jobsData || []).map((job: any) => (
                <TouchableOpacity
                  key={job.id}
                  style={{
                    backgroundColor: filterJobId === job.id ? colors.primary + "15" : colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: filterJobId === job.id ? colors.primary : colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onPress={() => {
                    setFilterJobId(job.id);
                    setShowJobPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{job.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {job.totalBudget && parseFloat(job.totalBudget) > 0 ? `Budget: $${parseFloat(job.totalBudget).toLocaleString()}` : "Hourly Job (no budget)"}
                    </Text>
                  </View>
                  {filterJobId === job.id && <Text style={{ fontSize: 20, color: colors.primary, marginLeft: 12 }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              onPress={() => setShowJobPicker(false)}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </PWrapper>
  );
}
