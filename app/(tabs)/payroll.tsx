import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";
import * as Haptics from "expo-haptics";

import { BG_REPORTS as bg_reports } from "@/constants/bg-urls";

type Period = "week" | "biweek" | "month" | "custom";

function getDateRange(period: Period, customStart?: string, customEnd?: string): { startDate: string; endDate: string; label: string } {
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart + "T00:00:00");
    const end = new Date(customEnd + "T23:59:59.999");
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    };
  }
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  if (period === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Week" };
  } else if (period === "biweek") {
    start.setDate(now.getDate() - 13);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "Last 2 Weeks" };
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Month" };
  }
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function calcPay(totalMinutes: number, hourlyRate: string | null): string {
  if (!hourlyRate) return "—";
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return "—";
  const hours = totalMinutes / 60;
  return `$${(hours * rate).toFixed(2)}`;
}

function calcPayNum(totalMinutes: number, hourlyRate: string | null): number {
  if (!hourlyRate) return 0;
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return 0;
  return (totalMinutes / 60) * rate;
}

function buildCSV(rows: any[], startDate: string, endDate: string): string {
  const header = ["Employee", "Role", "Hourly Rate", "Total Hours", "Total Minutes", "Estimated Pay"];
  const lines = [
    `Payroll Report: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
    "",
    header.join(","),
    ...rows.map((r) => [
      `"${r.name}"`,
      r.role,
      r.hourlyRate || "N/A",
      (r.totalMinutes / 60).toFixed(2),
      r.totalMinutes,
      calcPay(r.totalMinutes, r.hourlyRate),
    ].join(",")),
    "",
    `Total Payroll,,,,,$${rows.reduce((sum, r) => sum + calcPayNum(r.totalMinutes, r.hourlyRate), 0).toFixed(2)}`,
  ];
  return lines.join("\n");
}

const ROLE_ORDER = ["owner", "secretary", "logistics", "foreman", "laborer"];

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

export default function PayrollScreen() {
  const colors = useColors();
  const router = useRouter();
  const { employee } = useAppAuth();
  const [period, setPeriod] = useState<Period>("biweek");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [reportType, setReportType] = useState<"full" | "payroll" | "jobcost" | "employee">("full");
  const [showReportPicker, setShowReportPicker] = useState(false);

  // Custom date range state
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 13);
  const [customStart, setCustomStart] = useState(twoWeeksAgo.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(today.toISOString().slice(0, 10));

  const range = getDateRange(period, customStart, customEnd);

  // RBAC: payroll screen is for owner/secretary/logistics only
  const canAccessPayroll = employee?.role === "owner" || employee?.role === "secretary" || employee?.role === "logistics";
  const canSeeRates = employee?.role === "owner" || employee?.role === "secretary";

  if (!canAccessPayroll) {
    return (
      <ScreenContainer>
        <ImageBackground source={bg_reports} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
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
    </ScreenContainer>
    );
  }

  const { data, isLoading, refetch } = trpc.payroll.getReport.useQuery({
    startDate: range.startDate,
    endDate: range.endDate });

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
      marginHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border },
    exportBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginBottom: 8,
      alignItems: "center" },
    pdfBtn: {
      backgroundColor: "#D4AF37",
      borderRadius: 12,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginBottom: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8 } });

  const sortedRows = [...(data?.rows || [])].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  const totalPayroll = canSeeRates
    ? sortedRows.reduce((sum, r) => sum + calcPayNum(r.totalMinutes, r.hourlyRate), 0)
    : 0;

  const handleExportCSV = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const csv = buildCSV(sortedRows, range.startDate, range.endDate);
    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_${range.label.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert(
        "Export Payroll Report",
        `Payroll CSV for ${range.label}:\n\n${csv.slice(0, 400)}...\n\nOn mobile, share this via email or save to Files.`,
        [{ text: "OK" }]
      );
    }
  };

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
      const url = `${apiBase}/api/payroll-pdf?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}&reportType=${reportType}`;
      if (Platform.OS === "web") {
        // Web: open in new tab to trigger download
        window.open(url, "_blank");
      } else {
        // Native: open URL in browser to download
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
    { key: "biweek", label: "2 Weeks" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  const handlePeriodPress = (key: Period) => {
    if (key === "custom") {
      setShowDatePicker(true);
    } else {
      setPeriod(key);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>
            Payroll Report
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
            {new Date(range.startDate).toLocaleDateString()} –{" "}
            {new Date(range.endDate).toLocaleDateString()}
          </Text>
        </View>

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
              marginHorizontal: 16,
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
                <View>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: colors.primary }}>
                    {sortedRows.length}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>employees</Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>
                    {formatDuration(sortedRows.reduce((s, r) => s + r.totalMinutes, 0))}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>total hours</Text>
                </View>
                {canSeeRates && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: colors.success }}>
                      ${totalPayroll.toFixed(0)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>est. payroll</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Export Buttons */}
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                ⬇ Export CSV
              </Text>
            </TouchableOpacity>

            {canSeeRates && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
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

                <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPDF} disabled={downloadingPDF}>
                  {downloadingPDF ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                      📄 Download {REPORT_TYPES.find(r => r.key === reportType)?.label || "Report"}
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
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                        <View
                          style={{
                            backgroundColor: colors.primary + "22",
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 2 }}
                        >
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600", textTransform: "capitalize" }}>
                            {row.role}
                          </Text>
                        </View>
                        {canSeeRates && row.hourlyRate && (
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            ${row.hourlyRate}/hr
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.primary }}>
                        {formatDuration(row.totalMinutes)}
                      </Text>
                      {canSeeRates && (
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success, marginTop: 2 }}>
                          {calcPay(row.totalMinutes, row.hourlyRate)}
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
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {row.entries.length} shifts
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {(row.totalMinutes / 60).toFixed(1)} hrs total
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Custom Date Range Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
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
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
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
    </ScreenContainer>
  );
}
