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
  KeyboardAvoidingView,
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
import { formatTime12, formatDateTime12, formatTimeForEdit, parse12HrTime } from "@/lib/utils";

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

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TimecardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const employeeId = parseInt(id || "0", 10);
  const { employee: currentUser } = useAppAuth();
  const [period, setPeriod] = useState<Period>("biweek");
  const range = getDateRange(period);

  const isManagement = currentUser?.role === "owner" || currentUser?.role === "office_manager" || currentUser?.role === "logistics";
  const isSelf = currentUser?.id === employeeId;
  const canSeeRates = currentUser?.role === "owner" || currentUser?.role === "office_manager";

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.clock.getDetailedTimecard.useQuery(
    { employeeId, startDate: range.startDate, endDate: range.endDate },
    { enabled: employeeId > 0 }
  );

  const jobsQuery = trpc.jobs.list.useQuery();

  // ── Invalidate all related caches ──
  const invalidateAll = () => {
    refetch();
    utils.clock.history.invalidate();
    utils.clock.activeEntry.invalidate();
    utils.clock.allClockedIn.invalidate();
    utils.payroll.getMyHours.invalidate();
    utils.payroll.getReport.invalidate();
  };

  // ── Adjust Entry Mutation ──
  const adjustMutation = trpc.clock.adjustEntry.useMutation({
    onSuccess: () => {
      invalidateAll();
      setEditModal(null);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  // ── Add Manual Entry Mutation ──
  const addEntryMutation = trpc.clock.addManualEntry.useMutation({
    onSuccess: () => {
      invalidateAll();
      setAddModal(false);
      resetAddForm();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Manual time entry added successfully.");
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  // ── Delete Entry Mutation ──
  const deleteEntryMutation = trpc.clock.deleteEntry.useMutation({
    onSuccess: () => {
      invalidateAll();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Deleted", "Time entry has been removed.");
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  // ── Delete modal state (cross-platform) ──
  const [deleteModal, setDeleteModal] = useState<{ entryId: number; entryInfo: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // ── Edit modal state ──
  const [editModal, setEditModal] = useState<{
    entryId: number;
    clockIn: string;
    clockOut: string;
    jobId: number;
    jobName: string;
  } | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockInAmpm, setEditClockInAmpm] = useState("AM");
  const [editClockOut, setEditClockOut] = useState("");
  const [editClockOutAmpm, setEditClockOutAmpm] = useState("PM");
  const [editJobId, setEditJobId] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [showJobPicker, setShowJobPicker] = useState(false);

  // ── Add Day modal state ──
  const [addModal, setAddModal] = useState(false);
  const [addDate, setAddDate] = useState(formatDateForInput(new Date()));
  const [addClockIn, setAddClockIn] = useState("7:00");
  const [addClockInAmpm, setAddClockInAmpm] = useState("AM");
  const [addClockOut, setAddClockOut] = useState("3:30");
  const [addClockOutAmpm, setAddClockOutAmpm] = useState("PM");
  const [addJobId, setAddJobId] = useState(0);
  const [addReason, setAddReason] = useState("");
  const [showAddJobPicker, setShowAddJobPicker] = useState(false);

  const resetAddForm = () => {
    setAddDate(formatDateForInput(new Date()));
    setAddClockIn("7:00");
    setAddClockInAmpm("AM");
    setAddClockOut("3:30");
    setAddClockOutAmpm("PM");
    setAddJobId(0);
    setAddReason("");
  };

  const openEditModal = (entry: any) => {
    if (!isManagement) return;
    setEditModal({
      entryId: entry.id,
      clockIn: new Date(entry.clockIn).toISOString(),
      clockOut: entry.clockOut ? new Date(entry.clockOut).toISOString() : "",
      jobId: entry.jobId,
      jobName: entry.jobName,
    });
    const inEdit = formatTimeForEdit(entry.clockIn);
    setEditClockIn(inEdit.time);
    setEditClockInAmpm(inEdit.ampm);
    if (entry.clockOut) {
      const outEdit = formatTimeForEdit(entry.clockOut);
      setEditClockOut(outEdit.time);
      setEditClockOutAmpm(outEdit.ampm);
    } else {
      setEditClockOut("");
      setEditClockOutAmpm("PM");
    }
    setEditJobId(entry.jobId);
    setEditReason("");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  function parseTimeInput12(timeStr: string, ampm: string, refDate: Date): Date | null {
    const parsed = parse12HrTime(timeStr, ampm);
    if (!parsed) return null;
    const d = new Date(refDate);
    d.setHours(parsed.hours, parsed.minutes, 0, 0);
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
      const newIn = parseTimeInput12(editClockIn, editClockInAmpm, refDate);
      if (newIn) updates.clockIn = newIn.toISOString();
    }
    if (editClockOut) {
      const refOut = editModal.clockOut ? new Date(editModal.clockOut) : refDate;
      const newOut = parseTimeInput12(editClockOut, editClockOutAmpm, refOut);
      if (newOut) updates.clockOut = newOut.toISOString();
    }
    if (editJobId !== editModal.jobId) {
      updates.jobId = editJobId;
    }

    adjustMutation.mutate(updates);
  };

  const handleAddManualEntry = () => {
    if (!addReason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason for adding this entry (e.g., 'Forgot to clock in').");
      return;
    }
    if (!addJobId) {
      Alert.alert("Job Required", "Please select a job site for this entry.");
      return;
    }
    // Parse the date
    const dateParts = addDate.split("-");
    if (dateParts.length !== 3) {
      Alert.alert("Invalid Date", "Please enter a valid date in YYYY-MM-DD format.");
      return;
    }
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const baseDate = new Date(year, month, day);
    if (isNaN(baseDate.getTime())) {
      Alert.alert("Invalid Date", "Please enter a valid date.");
      return;
    }

    const clockInTime = parseTimeInput12(addClockIn, addClockInAmpm, baseDate);
    const clockOutTime = parseTimeInput12(addClockOut, addClockOutAmpm, baseDate);

    if (!clockInTime || !clockOutTime) {
      Alert.alert("Invalid Time", "Please enter valid clock in and clock out times (e.g., 7:00).");
      return;
    }

    if (clockOutTime <= clockInTime) {
      Alert.alert("Invalid Times", "Clock out time must be after clock in time.");
      return;
    }

    addEntryMutation.mutate({
      employeeId,
      jobId: addJobId,
      clockIn: clockInTime.toISOString(),
      clockOut: clockOutTime.toISOString(),
      addedBy: currentUser!.id,
      reason: addReason.trim(),
    });
  };

  const handleDeleteEntry = (entry: any) => {
    const entryInfo = `${entry.jobName} — ${formatTime12(entry.clockIn)}${entry.clockOut ? ` to ${formatTime12(entry.clockOut)}` : " (active)"}`;
    setDeleteModal({ entryId: entry.id, entryInfo });
    setDeleteReason("");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const confirmDelete = () => {
    if (!deleteModal) return;
    if (!deleteReason.trim()) {
      Alert.alert("Reason Required", "You must provide a reason to delete an entry.");
      return;
    }
    deleteEntryMutation.mutate({
      entryId: deleteModal.entryId,
      deletedBy: currentUser!.id,
      reason: deleteReason.trim(),
    });
    setDeleteModal(null);
    setDeleteReason("");
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
    addDayBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" as const, marginHorizontal: 16, marginBottom: 12 },
    deleteBtn: { backgroundColor: colors.error + "18", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginTop: 8, alignSelf: "flex-start" as const },
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

      {/* Add Day Button (management only) */}
      {isManagement && (
        <TouchableOpacity
          style={styles.addDayBtn}
          onPress={() => {
            setAddModal(true);
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ Add Manual Day Entry</Text>
        </TouchableOpacity>
      )}

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
                <View key={entry.id} style={styles.entryCard}>
                  <TouchableOpacity
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
                            In: {formatTime12(entry.clockIn)}
                          </Text>
                          {entry.clockOut ? (
                            <Text style={{ fontSize: 12, color: colors.muted }}>
                              Out: {formatTime12(entry.clockOut)}
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
                  </TouchableOpacity>

                  {/* Delete button for management */}
                  {isManagement && (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteEntry(entry)}
                    >
                      <Text style={{ fontSize: 12, color: colors.error, fontWeight: "600" }}>🗑 Delete Entry</Text>
                    </TouchableOpacity>
                  )}

                  {/* Show adjustments history */}
                  {entry.adjustments && entry.adjustments.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      {entry.adjustments.map((adj: any, i: number) => (
                        <View key={i} style={styles.adjustmentRow}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.warning }}>
                              {adj.fieldChanged === "clockIn" ? "Clock In" : adj.fieldChanged === "clockOut" ? "Clock Out" : adj.fieldChanged === "delete" ? "Deleted" : adj.fieldChanged === "manual_add" ? "Manual Add" : "Job"} adjusted
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.muted }}>
                              by {adj.adjustedByName}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                            Reason: {adj.reason}
                          </Text>
                          <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>
                            {formatDateTime12(adj.createdAt)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {entry.isOfflineEntry && (
                    <Text style={{ fontSize: 10, color: colors.warning, marginTop: 4 }}>⚡ Synced from offline</Text>
                  )}
                </View>
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

      {/* ── Edit Entry Modal ── */}
      <Modal visible={!!editModal} transparent animationType="fade" onRequestClose={() => setEditModal(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
                Adjust Time Entry
              </Text>

              {/* Clock In */}
              <Text style={styles.modalLabel}>Clock In Time</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  value={editClockIn}
                  onChangeText={setEditClockIn}
                  placeholder="e.g. 7:30"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity
                  onPress={() => setEditClockInAmpm(editClockInAmpm === "AM" ? "PM" : "AM")}
                  style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{editClockInAmpm}</Text>
                </TouchableOpacity>
              </View>

              {/* Clock Out */}
              <Text style={styles.modalLabel}>Clock Out Time</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  value={editClockOut}
                  onChangeText={setEditClockOut}
                  placeholder="e.g. 4:00"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity
                  onPress={() => setEditClockOutAmpm(editClockOutAmpm === "AM" ? "PM" : "AM")}
                  style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{editClockOutAmpm}</Text>
                </TouchableOpacity>
              </View>

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
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Job Picker Modal (for edit) ── */}
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

      {/* ── Add Manual Day Modal ── */}
      <Modal visible={addModal} transparent animationType="fade" onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
                Add Manual Day
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
                Add a time entry for {empName} who forgot to clock in.
              </Text>

              {/* Date */}
              <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalInput}
                value={addDate}
                onChangeText={setAddDate}
                placeholder="2026-04-04"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />

              {/* Clock In */}
              <Text style={styles.modalLabel}>Clock In Time</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  value={addClockIn}
                  onChangeText={setAddClockIn}
                  placeholder="e.g. 7:00"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity
                  onPress={() => setAddClockInAmpm(addClockInAmpm === "AM" ? "PM" : "AM")}
                  style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{addClockInAmpm}</Text>
                </TouchableOpacity>
              </View>

              {/* Clock Out */}
              <Text style={styles.modalLabel}>Clock Out Time</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  value={addClockOut}
                  onChangeText={setAddClockOut}
                  placeholder="e.g. 3:30"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity
                  onPress={() => setAddClockOutAmpm(addClockOutAmpm === "AM" ? "PM" : "AM")}
                  style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{addClockOutAmpm}</Text>
                </TouchableOpacity>
              </View>

              {/* Job Site */}
              <Text style={styles.modalLabel}>Job Site *</Text>
              <TouchableOpacity
                style={[styles.modalInput, { justifyContent: "center" }]}
                onPress={() => setShowAddJobPicker(true)}
              >
                <Text style={{ color: addJobId ? colors.foreground : colors.muted, fontSize: 16 }}>
                  {addJobId ? (jobsQuery.data || []).find((j: any) => j.id === addJobId)?.name || "Select job" : "Select job site..."}
                </Text>
              </TouchableOpacity>

              {/* Reason (required) */}
              <Text style={styles.modalLabel}>Reason for Manual Entry *</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 80, textAlignVertical: "top" }]}
                value={addReason}
                onChangeText={setAddReason}
                placeholder="e.g. Employee forgot to clock in, was on site from 7 AM to 3:30 PM"
                placeholderTextColor={colors.muted}
                multiline
              />

              <TouchableOpacity
                style={[styles.saveBtn, { opacity: addEntryMutation.isPending ? 0.6 : 1 }]}
                onPress={handleAddManualEntry}
                disabled={addEntryMutation.isPending}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {addEntryMutation.isPending ? "Adding..." : "Add Entry"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAddModal(false); resetAddForm(); }}>
                <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delete Confirmation Modal (cross-platform) ── */}
      <Modal visible={!!deleteModal} transparent animationType="fade" onRequestClose={() => setDeleteModal(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.error, marginBottom: 8 }}>
              Delete Entry
            </Text>
            <Text style={{ fontSize: 14, color: colors.foreground, marginBottom: 4 }}>
              Are you sure you want to delete this entry?
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                {deleteModal?.entryInfo}
              </Text>
            </View>

            <Text style={styles.modalLabel}>Reason for Deletion *</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={deleteReason}
              onChangeText={setDeleteReason}
              placeholder="e.g. Duplicate entry, wrong clock-in time"
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.error, opacity: deleteEntryMutation.isPending ? 0.6 : 1 }]}
              onPress={confirmDelete}
              disabled={deleteEntryMutation.isPending}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {deleteEntryMutation.isPending ? "Deleting..." : "Delete Entry"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModal(null)}>
              <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Job Picker Modal (for add) ── */}
      <Modal visible={showAddJobPicker} transparent animationType="slide" onRequestClose={() => setShowAddJobPicker(false)}>
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
                  style={[styles.jobOption, addJobId === item.id && { backgroundColor: colors.primary + "15" }]}
                  onPress={() => {
                    setAddJobId(item.id);
                    setShowAddJobPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: addJobId === item.id ? "700" : "400", color: colors.foreground }}>
                    {item.name}
                  </Text>
                  {item.address && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.address}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddJobPicker(false)}>
              <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
