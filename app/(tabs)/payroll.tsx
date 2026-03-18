import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

type Period = "week" | "biweek" | "month" | "custom";

function getDateRange(period: Period): { startDate: string; endDate: string; label: string } {
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

export default function PayrollScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const [period, setPeriod] = useState<Period>("biweek");
  const range = getDateRange(period);

  // RBAC: payroll screen is for owner/secretary/logistics only
  const canAccessPayroll = employee?.role === "owner" || employee?.role === "secretary" || employee?.role === "logistics";
  // Only the owner can see individual hourly rates and total payroll cost
  const canSeeRates = employee?.role === "owner";

  if (!canAccessPayroll) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            Access Restricted
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>
            Payroll reports are only available to management.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const { data, isLoading, refetch } = trpc.payroll.getReport.useQuery({
    startDate: range.startDate,
    endDate: range.endDate,
  });

  const styles = StyleSheet.create({
    periodBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
    },
    periodBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    periodBtnText: { fontSize: 13, fontWeight: "600", color: colors.muted },
    periodBtnTextActive: { color: "#fff" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    exportBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginBottom: 12,
      alignItems: "center",
    },
  });

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

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "This Week" },
    { key: "biweek", label: "2 Weeks" },
    { key: "month", label: "This Month" },
  ];

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
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingBottom: 16 }}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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

            {/* Export Button */}
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                ⬇ Export CSV to Computer
              </Text>
            </TouchableOpacity>

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
                <View key={row.employeeId} style={styles.card}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                        {row.name}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                        <View
                          style={{
                            backgroundColor: colors.primary + "22",
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
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
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {row.entries.length} shifts
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {(row.totalMinutes / 60).toFixed(1)} hrs total
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
