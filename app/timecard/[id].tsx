import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

type Period = "week" | "biweek" | "month";

function getDateRange(period: Period) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  if (period === "week") {
    start.setDate(now.getDate() - 6);
  } else if (period === "biweek") {
    start.setDate(now.getDate() - 13);
  } else {
    start.setDate(1);
  }
  start.setHours(0, 0, 0, 0);
  const labels: Record<Period, string> = { week: "This Week", biweek: "2 Weeks", month: "This Month" };
  return { startDate: start.toISOString(), endDate: end.toISOString(), label: labels[period] };
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatTime(dateStr: string | Date) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function calcPay(minutes: number, rate: string | null | undefined): string {
  if (!rate) return "";
  const r = parseFloat(rate);
  if (isNaN(r)) return "";
  return `$${((minutes / 60) * r).toFixed(2)}`;
}

export default function TimecardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const employeeId = parseInt(id || "0", 10);
  const { employee: currentUser } = useAppAuth();
  const [period, setPeriod] = useState<Period>("biweek");
  const range = getDateRange(period);

  const isManagement = currentUser?.role === "owner" || currentUser?.role === "secretary" || currentUser?.role === "logistics";
  const isSelf = currentUser?.id === employeeId;
  const canSeeRates = currentUser?.role === "owner" || currentUser?.role === "secretary";

  const { data, isLoading, refetch } = trpc.clock.getDetailedTimecard.useQuery(
    { employeeId, startDate: range.startDate, endDate: range.endDate },
    { enabled: employeeId > 0 }
  );

  const jobsQuery = trpc.jobs.list.useQuery();
  const adjustMutation = trpc.clock.adjustEntry.useMutation({
    onSuccess: () => {
      refetch();
      setEditModal(null);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  // Edit modal state
  const [editModal, setEditModal] = useState<{
    entryId: number;
    clockIn: string;
    clockOut: string;
    jobId: number;
    jobName: string;
  } | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editJobId, setEditJobId] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [showJobPicker, setShowJobPicker] = useState(false);

  const openEditModal = (entry: any) => {
    if (!isManagement) return;
    setEditModal({
      entryId: entry.id,
      clockIn: new Date(entry.clockIn).toISOString(),
      clockOut: entry.clockOut ? new Date(entry.clockOut).toISOString() : "",
      jobId: entry.jobId,
      jobName: entry.jobName,
    });
    setEditClockIn(formatTimeForInput(new Date(entry.clockIn)));
    setEditClockOut(entry.clockOut ? formatTimeForInput(new Date(entry.clockOut)) : "");
    setEditJobId(entry.jobId);
    setEditReason("");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  function formatTimeForInput(d: Date) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function parseTimeInput(timeStr: string, refDate: Date): Date | null {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    const d = new Date(refDate);
    d.setHours(h, m, 0, 0);
    return d;
  }

  const handleSaveAdjustment = () => {
    if (!editModal || !editReason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason for this adjustment.");
      return;
    }
    const refDate = new Date(editModal.clockIn);
    const updates: any = { entryId: editModal.entryId, adjustedBy: currentUser!.id, reason: editReason.trim() };

    if (editClockIn) {
      const newIn = parseTimeInput(editClockIn, refDate);
      if (newIn) updates.clockIn = newIn.toISOString();
    }
    if (editClockOut) {
      const refOut = editModal.clockOut ? new Date(editModal.clockOut) : refDate;
      const newOut = parseTimeInput(editClockOut, refOut);
      if (newOut) updates.clockOut = newOut.toISOString();
    }
    if (editJobId !== editModal.jobId) {
      updates.jobId = editJobId;
    }

    adjustMutation.mutate(updates);
  };

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "biweek", label: "2 Weeks" },
    { key: "month", label: "Month" },
  ];

  const empName = data?.employee?.name || "Employee";
  const empRole = data?.employee?.role || "";
  const empRate = data?.employee?.hourlyRate;

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: "row" as const, alignItems: "center" as const, marginBottom: 8 },
    periodRow: { flexDirection: "row" as const, paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
    periodBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    periodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodBtnText: { fontSize: 13, fontWeight: "600" as const, color: colors.muted },
    periodBtnTextActive: { color: "#fff" },
    summaryCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    dayHeader: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    entryCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
    adjustmentRow: { backgroundColor: colors.warning + "11", borderRadius: 8, padding: 8, marginTop: 6 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const },
    modalContent: { backgroundColor: colors.background, borderRadius: 16, padding: 20, width: "90%" as any, maxWidth: 400, maxHeight: "80%" as any },
    modalInput: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
    modalLabel: { fontSize: 13, fontWeight: "600" as const, color: colors.muted, marginBottom: 4 },
    saveBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" as const, marginTop: 8 },
    cancelBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" as const, marginTop: 6 },
    jobOption: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  });

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: "600" }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>{empName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <View style={{ backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600", textTransform: "capitalize" }}>{empRole}</Text>
          </View>
          {canSeeRates && empRate && (
            <Text style={{ fontSize: 12, color: colors.muted }}>${empRate}/hr</Text>
          )}
        </View>
      </View>

      {/* Period Selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data?.days || []}
          keyExtractor={(item) => item.date}
          ListHeaderComponent={
            <View style={styles.summaryCard}>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>{range.label} Summary</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View>
                  <Text style={{ fontSize: 32, fontWeight: "800", color: colors.primary }}>
                    {formatDuration(data?.totalMinutes || 0)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {((data?.totalMinutes || 0) / 60).toFixed(1)} hrs total
                  </Text>
                </View>
                {canSeeRates && empRate && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: colors.success }}>
                      {calcPay(data?.totalMinutes || 0, empRate)}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>estimated pay</Text>
                  </View>
                )}
              </View>
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {data?.days?.length || 0} days worked · {data?.days?.reduce((s: number, d: any) => s + d.entries.length, 0) || 0} shifts
                </Text>
              </View>
            </View>
          }
          renderItem={({ item: day }) => (
            <View style={{ marginBottom: 8 }}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                    {formatDay(day.date)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                      {formatDuration(day.totalMinutes)}
                    </Text>
                    {canSeeRates && empRate && (
                      <Text style={{ fontSize: 12, color: colors.success, fontWeight: "600" }}>
                        {calcPay(day.totalMinutes, empRate)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Entries for this day */}
              {day.entries.map((entry: any) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.entryCard}
                  onPress={() => openEditModal(entry)}
                  disabled={!isManagement}
                  activeOpacity={isManagement ? 0.6 : 1}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                        {entry.jobName}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          In: {formatTime(entry.clockIn)}
                        </Text>
                        {entry.clockOut ? (
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            Out: {formatTime(entry.clockOut)}
                          </Text>
                        ) : (
                          <View style={{ backgroundColor: colors.success + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, color: colors.success, fontWeight: "600" }}>ACTIVE</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.primary }}>
                        {entry.durationMinutes > 0 ? formatDuration(entry.durationMinutes) : "—"}
                      </Text>
                      {isManagement && (
                        <Text style={{ fontSize: 10, color: colors.primary, marginTop: 2 }}>Tap to edit</Text>
                      )}
                    </View>
                  </View>

                  {/* Show adjustments history */}
                  {entry.adjustments && entry.adjustments.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      {entry.adjustments.map((adj: any, i: number) => (
                        <View key={i} style={styles.adjustmentRow}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.warning }}>
                              {adj.fieldChanged === "clockIn" ? "Clock In" : adj.fieldChanged === "clockOut" ? "Clock Out" : "Job"} adjusted
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.muted }}>
                              by {adj.adjustedByName}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                            Reason: {adj.reason}
                          </Text>
                          <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>
                            {new Date(adj.createdAt).toLocaleString()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {entry.isOfflineEntry && (
                    <Text style={{ fontSize: 10, color: colors.warning, marginTop: 4 }}>⚡ Synced from offline</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                No hours recorded
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                No clock entries found for this period.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}

      {/* Edit Modal */}
      <Modal visible={!!editModal} transparent animationType="fade" onRequestClose={() => setEditModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
                Adjust Time Entry
              </Text>

              {/* Clock In */}
              <Text style={styles.modalLabel}>Clock In Time (HH:MM)</Text>
              <TextInput
                style={styles.modalInput}
                value={editClockIn}
                onChangeText={setEditClockIn}
                placeholder="e.g. 07:30"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />

              {/* Clock Out */}
              <Text style={styles.modalLabel}>Clock Out Time (HH:MM)</Text>
              <TextInput
                style={styles.modalInput}
                value={editClockOut}
                onChangeText={setEditClockOut}
                placeholder="e.g. 16:00"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />

              {/* Job Site */}
              <Text style={styles.modalLabel}>Job Site</Text>
              <TouchableOpacity
                style={[styles.modalInput, { justifyContent: "center" }]}
                onPress={() => setShowJobPicker(true)}
              >
                <Text style={{ color: colors.foreground, fontSize: 16 }}>
                  {(jobsQuery.data || []).find((j: any) => j.id === editJobId)?.name || editModal?.jobName || "Select job"}
                </Text>
              </TouchableOpacity>

              {/* Reason (required) */}
              <Text style={styles.modalLabel}>Reason for Adjustment *</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 80, textAlignVertical: "top" }]}
                value={editReason}
                onChangeText={setEditReason}
                placeholder="e.g. Employee forgot to clock out, actual departure was 4:30 PM"
                placeholderTextColor={colors.muted}
                multiline
              />

              <TouchableOpacity
                style={[styles.saveBtn, { opacity: adjustMutation.isPending ? 0.6 : 1 }]}
                onPress={handleSaveAdjustment}
                disabled={adjustMutation.isPending}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {adjustMutation.isPending ? "Saving..." : "Save Adjustment"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModal(null)}>
                <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Job Picker Modal */}
      <Modal visible={showJobPicker} transparent animationType="slide" onRequestClose={() => setShowJobPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "60%" as any }]}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              Select Job Site
            </Text>
            <FlatList
              data={jobsQuery.data || []}
              keyExtractor={(item: any) => item.id.toString()}
              renderItem={({ item }: { item: any }) => (
                <TouchableOpacity
                  style={[styles.jobOption, editJobId === item.id && { backgroundColor: colors.primary + "15" }]}
                  onPress={() => {
                    setEditJobId(item.id);
                    setShowJobPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: editJobId === item.id ? "700" : "400", color: colors.foreground }}>
                    {item.name}
                  </Text>
                  {item.address && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.address}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowJobPicker(false)}>
              <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
