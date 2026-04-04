import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_CLOCK as bg_clock } from "@/constants/bg-urls";
import { useRouter } from "expo-router";

type Period = "week" | "biweek" | "month";

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

function formatDate(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function calcEstimatedPay(totalMinutes: number, hourlyRate: string | null): string {
  if (!hourlyRate) return "—";
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return "—";
  const hours = totalMinutes / 60;
  return `$${(hours * rate).toFixed(2)}`;
}

export default function HoursScreen() {
  const colors = useColors();
  const router = useRouter();
  const { employee } = useAppAuth();
  const [period, setPeriod] = useState<Period>("week");
  const range = getDateRange(period);

  // Only the owner can see their own hourly rate and estimated pay
  const canSeePayRate = employee?.role === "owner" || employee?.role === "secretary";

  const { data, isLoading, refetch } = trpc.payroll.getMyHours.useQuery(
    {
      employeeId: employee?.id || 0,
      startDate: range.startDate,
      endDate: range.endDate },
    { enabled: !!employee }
  );

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
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border },
    entryRow: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border } });

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "This Week" },
    { key: "biweek", label: "2 Weeks" },
    { key: "month", label: "This Month" },
  ];

  return (
    <ScreenContainer>
        <ImageBackground source={bg_clock} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>My Hours</Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
          {employee?.name || "Employee"} · {employee?.role}
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
                {range.label} Summary
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View>
                  <Text style={{ fontSize: 36, fontWeight: "800", color: colors.primary }}>
                    {formatDuration(data?.totalMinutes || 0)}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                    {((data?.totalMinutes || 0) / 60).toFixed(1)} hours total
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
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.entryRow}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {formatDate(item.clockIn)}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                  {item.durationMinutes > 0 ? formatDuration(item.durationMinutes) : "In progress"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", marginTop: 4, gap: 16 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  In: {formatTime(item.clockIn)}
                </Text>
                {item.clockOut && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Out: {formatTime(item.clockOut)}
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
                  <Text style={{ fontSize: 11, color: colors.warning }}>⚡ Synced from offline</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>🕐</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                No hours recorded
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                Clock in on a jobsite to start tracking your hours.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}
    </ImageBackground>
    </ScreenContainer>
  );
}
