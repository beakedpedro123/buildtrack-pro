import {
   ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useAppAuth } from "@/lib/auth-context";
import { useOfflineQueue } from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_CLOCK as bg_clock } from "@/constants/bg-urls";

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function formatTime(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ─── Timeout wrapper to prevent hanging ─── */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/* ─── Location with timeout (web-optimized) ─── */
async function getLocationSafe(): Promise<{ lat: number; lng: number } | null> {
  // On web, use the browser's native geolocation API for reliability
  if (Platform.OS === "web") {
    try {
      if (!navigator?.geolocation) return null;
      return await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000); // 3s max on web
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
          () => { clearTimeout(timer); resolve(null); },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
        );
      });
    } catch { return null; }
  }
  // Native: use expo-location
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Location timeout")), 5000)),
    ]);
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

export default function ClockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const { addClockEntry, pendingCount } = useOfflineQueue();
  const [now, setNow] = useState(new Date());
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Management mode state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // ClockShark-style editing state (clock-in, clock-out, job)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editClockInStr, setEditClockInStr] = useState("");
  const [editClockOutStr, setEditClockOutStr] = useState("");
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showEditJobPicker, setShowEditJobPicker] = useState(false);

  const role = employee?.role ?? "laborer";
  const isManager = role === "owner" || role === "secretary" || role === "logistics";
  const clockTargetId = isManager ? selectedEmployeeId : employee?.id;

  const utils = trpc.useUtils();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Update clock every 10 seconds for responsive elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      if (mountedRef.current) setNow(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-clear success message
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => { if (mountedRef.current) setSuccessMsg(null); }, 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  const { data: activeEntry, refetch: refetchActive } = trpc.clock.activeEntry.useQuery(
    { employeeId: clockTargetId || 0 },
    { enabled: !!clockTargetId, refetchInterval: 10000, staleTime: 5000 }
  );

  const { data: jobs } = trpc.jobs.listActive.useQuery();

  const { data: history, refetch: refetchHistory } = trpc.clock.history.useQuery(
    { employeeId: clockTargetId || 0, since: new Date(Date.now() - 7 * 86400000).toISOString() },
    { enabled: !!clockTargetId }
  );

  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManager });
  const { data: allClockedIn, refetch: refetchClockedIn } = trpc.clock.allClockedIn.useQuery(
    undefined, { enabled: isManager, refetchInterval: 10000, staleTime: 5000 }
  );

  const activeEmployees = useMemo(() => {
    return (allEmployees || []).filter((e: any) => e.isActive);
  }, [allEmployees]);

  const selectedEmployee = useMemo(() => {
    if (!isManager) return employee;
    return activeEmployees.find((e: any) => e.id === selectedEmployeeId) || null;
  }, [isManager, employee, activeEmployees, selectedEmployeeId]);

  const clockInMutation = trpc.clock.in.useMutation();
  const clockOutMutation = trpc.clock.out.useMutation();
  const updateEntryMutation = trpc.clock.updateEntry.useMutation();

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([
        refetchActive(),
        refetchHistory(),
        ...(isManager ? [refetchClockedIn()] : []),
      ]);
      utils.clock.history.invalidate();
    } catch { /* ignore refresh errors */ }
  }, [refetchActive, refetchHistory, isManager, refetchClockedIn, utils]);

  const handleClockIn = useCallback(async () => {
    if (!clockTargetId || !selectedJobId) {
      Alert.alert("Select a Job", "Please select a jobsite before clocking in.");
      return;
    }
    if (loading) return; // Prevent double-tap
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      // Get location in parallel with a short timeout — don't let it block clock-in
      const clockInTime = new Date().toISOString();
      let loc: { lat: number; lng: number } | null = null;
      try {
        loc = await getLocationSafe();
      } catch { /* location is optional, proceed without it */ }

      try {
        await withTimeout(
          clockInMutation.mutateAsync({
            employeeId: clockTargetId,
            jobId: selectedJobId,
            clockIn: clockInTime,
            clockInLatitude: loc?.lat,
            clockInLongitude: loc?.lng,
            isOfflineEntry: false,
          }),
          Platform.OS === "web" ? 20000 : 15000 // Give web a bit more time
        );
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (mountedRef.current) {
          setSuccessMsg("Clocked in!");
          // Refresh in background — don't block the UI
          refreshAll().catch(() => {});
        }
      } catch {
        if (!isManager) {
          await addClockEntry({
            employeeId: clockTargetId,
            jobId: selectedJobId,
            clockIn: clockInTime,
            clockInLatitude: loc?.lat,
            clockInLongitude: loc?.lng,
          });
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Clocked In (Offline)", "Clock-in was saved locally and will sync when you have service.");
        } else {
          Alert.alert("Error", "Could not clock in. Please check your connection and try again.");
        }
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clockTargetId, selectedJobId, loading, isManager, clockInMutation, addClockEntry, refreshAll]);

  const handleClockOut = useCallback(async () => {
    if (!activeEntry) return;
    if (loading) return; // Prevent double-tap
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    const entryId = activeEntry.id;
    const clockOutTime = new Date().toISOString();
    try {
      // Optimistic: show success immediately on web to avoid perceived lag
      if (Platform.OS === "web" && mountedRef.current) {
        setSuccessMsg("Clocked out!");
      }
      let loc: { lat: number; lng: number } | null = null;
      try {
        loc = await getLocationSafe();
      } catch { /* location is optional */ }

      await withTimeout(
        clockOutMutation.mutateAsync({
          entryId,
          clockOut: clockOutTime,
          clockOutLatitude: loc?.lat,
          clockOutLongitude: loc?.lng,
        }),
        Platform.OS === "web" ? 20000 : 15000
      );
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (mountedRef.current) {
        if (Platform.OS !== "web") setSuccessMsg("Clocked out!");
        // Refresh in background — don't block the UI
        refreshAll().catch(() => {});
      }
    } catch (e) {
      if (mountedRef.current) setSuccessMsg("");
      Alert.alert("Error", "Could not clock out. Please try again.");
      // Refresh to restore correct state
      refreshAll().catch(() => {});
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [activeEntry, loading, clockOutMutation, refreshAll]);

  const handleQuickClockOut = useCallback(async (entryId: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Optimistic: show success immediately on web
    if (Platform.OS === "web" && mountedRef.current) {
      setSuccessMsg("Employee clocked out!");
    }
    try {
      const clockOutTime = new Date().toISOString();
      let loc: { lat: number; lng: number } | null = null;
      try {
        loc = await getLocationSafe();
      } catch { /* optional */ }

      await withTimeout(
        clockOutMutation.mutateAsync({
          entryId,
          clockOut: clockOutTime,
          clockOutLatitude: loc?.lat,
          clockOutLongitude: loc?.lng,
        }),
        Platform.OS === "web" ? 20000 : 15000
      );
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (mountedRef.current) {
        if (Platform.OS !== "web") setSuccessMsg("Employee clocked out!");
        refreshAll().catch(() => {});
      }
    } catch {
      if (mountedRef.current) setSuccessMsg("");
      Alert.alert("Error", "Could not clock out. Please try again.");
      refreshAll().catch(() => {});
    }
  }, [clockOutMutation, refreshAll]);

  /* ─── ClockShark-style: Edit clock-in, clock-out, and job ─── */
  const parseTimeStr = (timeStr: string): { hours: number; mins: number } | null => {
    const parts = timeStr.trim().split(":");
    if (parts.length !== 2) return null;
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return { hours, mins };
  };

  const startEditEntry = (entry: any) => {
    const clockInDate = new Date(entry.clockIn);
    setEditClockInStr(`${clockInDate.getHours().toString().padStart(2, "0")}:${clockInDate.getMinutes().toString().padStart(2, "0")}`);
    if (entry.clockOut) {
      const clockOutDate = new Date(entry.clockOut);
      setEditClockOutStr(`${clockOutDate.getHours().toString().padStart(2, "0")}:${clockOutDate.getMinutes().toString().padStart(2, "0")}`);
    } else {
      setEditClockOutStr("");
    }
    setEditJobId(entry.jobId);
    setEditingEntryId(entry.id);
    setShowEditJobPicker(false);
  };

  const saveEditEntry = async () => {
    if (!editingEntryId) return;
    const allEntries = [...(allClockedIn || []), ...(history || [])];
    const entry = allEntries.find((e: any) => e.id === editingEntryId);
    if (!entry) return;

    // Parse clock-in
    const parsedIn = parseTimeStr(editClockInStr);
    if (!parsedIn) {
      Alert.alert("Invalid Clock-In", "Enter time as HH:MM (e.g., 07:30)");
      return;
    }
    const newClockIn = new Date(entry.clockIn);
    newClockIn.setHours(parsedIn.hours, parsedIn.mins, 0, 0);

    // Parse clock-out (optional — only if provided)
    let newClockOut: Date | undefined;
    if (editClockOutStr.trim()) {
      const parsedOut = parseTimeStr(editClockOutStr);
      if (!parsedOut) {
        Alert.alert("Invalid Clock-Out", "Enter time as HH:MM (e.g., 16:30)");
        return;
      }
      const outBase = entry.clockOut ? new Date(entry.clockOut) : new Date(entry.clockIn);
      newClockOut = new Date(outBase);
      newClockOut.setHours(parsedOut.hours, parsedOut.mins, 0, 0);
      // If clock-out is before clock-in, assume next day
      if (newClockOut <= newClockIn) {
        newClockOut.setDate(newClockOut.getDate() + 1);
      }
    }

    setEditSaving(true);
    try {
      const updatePayload: any = {
        entryId: editingEntryId,
        clockIn: newClockIn.toISOString(),
      };
      if (newClockOut) updatePayload.clockOut = newClockOut.toISOString();
      if (editJobId && editJobId !== entry.jobId) updatePayload.jobId = editJobId;

      await withTimeout(updateEntryMutation.mutateAsync(updatePayload), 15000);
      if (mountedRef.current) {
        setSuccessMsg("Entry updated!");
        setEditingEntryId(null);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refreshAll().catch(() => {});
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to update entry.");
    } finally {
      if (mountedRef.current) setEditSaving(false);
    }
  };

  const isClockedIn = !!activeEntry;
  const elapsed = activeEntry ? now.getTime() - new Date(activeEntry.clockIn).getTime() : 0;
  const activeJob = jobs?.find((j) => j.id === activeEntry?.jobId);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
    successBanner: {
      marginHorizontal: 20, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 14,
      borderRadius: 10, backgroundColor: colors.success + "20",
      flexDirection: "row", alignItems: "center" },
    clockCard: {
      margin: 20,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
    statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    statusText: { fontSize: 14, fontWeight: "600" },
    elapsedTime: { fontSize: 42, fontWeight: "800", letterSpacing: -1, marginBottom: 4 },
    jobName: { fontSize: 15, fontWeight: "600", marginBottom: 20 },
    clockBtn: {
      width: 140, height: 140, borderRadius: 70,
      alignItems: "center", justifyContent: "center",
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
    clockBtnText: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4, textAlign: "center" },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10 },
    jobSelector: { marginHorizontal: 20, marginBottom: 16 },
    jobOption: {
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
      borderWidth: 1.5, marginBottom: 8, flexDirection: "row", alignItems: "center" },
    jobOptionText: { fontSize: 14, fontWeight: "600", flex: 1 },
    historyItem: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1 },
    historyDate: { fontSize: 13, fontWeight: "600", width: 80 },
    historyJob: { fontSize: 13, flex: 1 },
    historyDuration: { fontSize: 13, fontWeight: "700" },
    empPickerBtn: {
      marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 12,
      borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primary + "10",
      flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    empPickerText: { fontSize: 15, fontWeight: "700", color: colors.primary },
    clockedInCard: {
      marginHorizontal: 20, marginBottom: 8, padding: 14, borderRadius: 12,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", alignItems: "center" },
    clockedInAvatar: {
      width: 36, height: 36, borderRadius: 18, alignItems: "center",
      justifyContent: "center", marginRight: 12 },
    clockOutBtn: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
      backgroundColor: colors.error },
    editTimeBtn: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: colors.primary + "20", marginRight: 6 },
    editTimeRow: {
      marginHorizontal: 20, marginTop: 4, marginBottom: 8, padding: 12, borderRadius: 10,
      backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary,
      flexDirection: "row", alignItems: "center" },
    editTimeInput: {
      flex: 1, backgroundColor: colors.surface, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 8, fontSize: 16,
      fontWeight: "700", color: colors.foreground, borderWidth: 1, borderColor: colors.border },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    empListItem: {
      flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20,
      borderBottomWidth: 1, borderBottomColor: colors.border },
  });

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getRoleColor = (r: string) => {
    switch (r) {
      case "owner": return colors.primary;
      case "secretary": return "#6366F1";
      case "logistics": return "#0EA5E9";
      case "foreman": return colors.success;
      default: return colors.muted;
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
        <ImageBackground source={bg_clock} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Time Clock</Text>
          <Text style={styles.subtitle}>
            {isManager ? "Manage team clock in/out" : `${employee?.name} · ${now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}`}
          </Text>
        </View>

        {/* Success Banner */}
        {successMsg && (
          <View style={styles.successBanner}>
            <Text style={{ color: colors.success, fontSize: 14, fontWeight: "700" }}>✓ {successMsg}</Text>
          </View>
        )}

        {/* Manager: Employee Picker */}
        {isManager && (
          <>
            <TouchableOpacity style={styles.empPickerBtn} onPress={() => setShowEmployeePicker(true)}>
              <Text style={styles.empPickerText}>
                {selectedEmployee ? `Clocking: ${selectedEmployee.name}` : "Select Employee to Clock"}
              </Text>
              <Text style={{ color: colors.primary, fontSize: 16 }}>▼</Text>
            </TouchableOpacity>

            {/* Employee Picker Modal */}
            <Modal visible={showEmployeePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmployeePicker(false)}>
              <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Employee</Text>
                  <TouchableOpacity onPress={() => setShowEmployeePicker(false)}>
                    <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Close</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={activeEmployees}
                  keyExtractor={(item: any) => item.id.toString()}
                  renderItem={({ item }: { item: any }) => {
                    const isSelected = selectedEmployeeId === item.id;
                    const clockedEntry = (allClockedIn || []).find((e: any) => e.employeeId === item.id);
                    return (
                      <TouchableOpacity
                        style={[styles.empListItem, isSelected && { backgroundColor: colors.primary + "10" }]}
                        onPress={() => { setSelectedEmployeeId(item.id); setShowEmployeePicker(false); }}
                      >
                        <View style={[styles.clockedInAvatar, { backgroundColor: getRoleColor(item.role) }]}>
                          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{getInitials(item.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{item.name}</Text>
                          <Text style={{ fontSize: 12, color: colors.muted }}>{item.role.charAt(0).toUpperCase() + item.role.slice(1)}</Text>
                        </View>
                        {clockedEntry && (
                          <View style={{ backgroundColor: colors.success + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>Clocked In</Text>
                          </View>
                        )}
                        {isSelected && <Text style={{ color: colors.primary, fontSize: 18, marginLeft: 8 }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </Modal>
          </>
        )}

        {/* Currently Clocked In (Manager view) with Edit Time */}
        {isManager && allClockedIn && allClockedIn.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>
              Currently Clocked In ({allClockedIn.length})
            </Text>
            {allClockedIn.map((entry: any) => {
              const emp = activeEmployees.find((e: any) => e.id === entry.employeeId);
              const job = jobs?.find((j) => j.id === entry.jobId);
              const dur = now.getTime() - new Date(entry.clockIn).getTime();
              const isEditing = editingEntryId === entry.id;
              return (
                <View key={entry.id}>
                  <View style={styles.clockedInCard}>
                    <View style={[styles.clockedInAvatar, { backgroundColor: getRoleColor(emp?.role || "laborer") }]}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                        {emp ? getInitials(emp.name) : "??"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                        {emp?.name || `#${entry.employeeId}`}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {job?.name || `Job #${entry.jobId}`} · {formatDuration(dur)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.editTimeBtn}
                      onPress={() => startEditEntry(entry)}
                    >
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>✏️ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.clockOutBtn}
                      onPress={() => {
                        Alert.alert(
                          "Clock Out",
                          `Clock out ${emp?.name || "this employee"}?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Clock Out", style: "destructive", onPress: () => handleQuickClockOut(entry.id) },
                          ]
                        );
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Clock Out</Text>
                    </TouchableOpacity>
                  </View>
                  {/* ClockShark-style Entry Editor */}
                  {isEditing && (
                    <View style={{ marginHorizontal: 20, marginTop: 4, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: colors.primary + "08", borderWidth: 1, borderColor: colors.primary + "30" }}>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK IN</Text>
                          <TextInput
                            style={styles.editTimeInput}
                            value={editClockInStr}
                            onChangeText={setEditClockInStr}
                            placeholder="07:30"
                            placeholderTextColor={colors.muted}
                            keyboardType="numbers-and-punctuation"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK OUT</Text>
                          <TextInput
                            style={styles.editTimeInput}
                            value={editClockOutStr}
                            onChangeText={setEditClockOutStr}
                            placeholder={entry.clockOut ? "16:30" : "Still active"}
                            placeholderTextColor={colors.muted}
                            keyboardType="numbers-and-punctuation"
                          />
                        </View>
                      </View>
                      {/* Job Picker */}
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>JOB</Text>
                      <TouchableOpacity
                        onPress={() => setShowEditJobPicker(!showEditJobPicker)}
                        style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: showEditJobPicker ? 4 : 10 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                          {jobs?.find(j => j.id === editJobId)?.name || "Select Job"} ▼
                        </Text>
                      </TouchableOpacity>
                      {showEditJobPicker && (
                        <View style={{ marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
                          {(jobs || []).map(j => (
                            <TouchableOpacity
                              key={j.id}
                              onPress={() => { setEditJobId(j.id); setShowEditJobPicker(false); }}
                              style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: editJobId === j.id ? colors.primary + "15" : "transparent" }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: editJobId === j.id ? "700" : "500", color: editJobId === j.id ? colors.primary : colors.foreground }}>
                                {editJobId === j.id ? "✓ " : ""}{j.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {/* Save / Cancel */}
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={saveEditEntry}
                          disabled={editSaving}
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}
                        >
                          {editSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Save Changes</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEditingEntryId(null)}
                          style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 14 }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Clock Button Card */}
        {clockTargetId ? (
          <>
            <View style={styles.clockCard}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isClockedIn ? colors.success : colors.muted }]} />
                <Text style={[styles.statusText, { color: isClockedIn ? colors.success : colors.muted }]}>
                  {isClockedIn ? "Clocked In" : "Clocked Out"}
                  {isManager && selectedEmployee ? ` — ${selectedEmployee.name}` : ""}
                </Text>
              </View>

              {isClockedIn && (
                <>
                  <Text style={[styles.elapsedTime, { color: colors.foreground }]}>
                    {formatDuration(elapsed)}
                  </Text>
                  <Text style={[styles.jobName, { color: colors.muted }]}>
                    {activeJob?.name || "Unknown Job"}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 20 }}>
                    Since {formatTime(activeEntry!.clockIn)}
                  </Text>
                </>
              )}

              <TouchableOpacity
                style={[styles.clockBtn, {
                  backgroundColor: isClockedIn ? colors.error : colors.success,
                  opacity: loading ? 0.7 : 1,
                }]}
                onPress={isClockedIn ? handleClockOut : handleClockIn}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <View style={{ alignItems: "center" }}>
                    <ActivityIndicator color="#fff" size="large" />
                    <Text style={{ color: "#fff", fontSize: 11, marginTop: 6, fontWeight: "600" }}>
                      {isClockedIn ? "Clocking Out..." : "Clocking In..."}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.clockBtnText}>{isClockedIn ? "CLOCK\nOUT" : "CLOCK\nIN"}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Job Selector (only when clocked out) */}
            {!isClockedIn && (
              <View style={styles.jobSelector}>
                <Text style={styles.sectionTitle}>Select Jobsite</Text>
                {(jobs || []).map((job) => (
                  <TouchableOpacity
                    key={job.id}
                    style={[
                      styles.jobOption,
                      {
                        borderColor: selectedJobId === job.id ? colors.primary : colors.border,
                        backgroundColor: selectedJobId === job.id ? colors.primary + "15" : colors.surface },
                    ]}
                    onPress={() => setSelectedJobId(job.id)}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedJobId === job.id ? colors.primary : colors.muted, marginRight: 10 }} />
                    <Text style={[styles.jobOptionText, { color: selectedJobId === job.id ? colors.primary : colors.foreground }]}>
                      {job.name}
                    </Text>
                    {selectedJobId === job.id && <Text style={{ color: colors.primary, fontSize: 18 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
                {(!jobs || jobs.length === 0) && (
                  <Text style={{ color: colors.muted, fontSize: 14 }}>No active jobs available.</Text>
                )}
              </View>
            )}

            {/* Recent History with Edit capability for managers */}
            <View style={{ marginHorizontal: 20, marginTop: 8 }}>
              <Text style={styles.sectionTitle}>
                Recent Time Entries{isManager && selectedEmployee ? ` — ${selectedEmployee.name}` : ""}
              </Text>
            </View>
            {(history || []).slice(0, 10).map((entry: any) => {
              const job = jobs?.find((j) => j.id === entry.jobId);
              const dur = entry.clockOut
                ? new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()
                : null;
              const isEditing = editingEntryId === entry.id;
              return (
                <View key={entry.id}>
                  <View style={[styles.historyItem, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.historyDate, { color: colors.muted }]}>
                      {new Date(entry.clockIn).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                    <Text style={[styles.historyJob, { color: colors.foreground }]} numberOfLines={1}>
                      {job?.name || "Job #" + entry.jobId}
                    </Text>
                    <Text style={[styles.historyDuration, { color: dur ? colors.foreground : colors.success }]}>
                      {dur ? formatDuration(dur) : "Active"}
                    </Text>
                    {isManager && (
                      <TouchableOpacity
                        onPress={() => startEditEntry(entry)}
                        style={{ marginLeft: 8, padding: 4 }}
                      >
                        <Text style={{ fontSize: 14 }}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {isEditing && (
                    <View style={{ marginHorizontal: 20, marginTop: 4, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: colors.primary + "08", borderWidth: 1, borderColor: colors.primary + "30" }}>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK IN</Text>
                          <TextInput
                            style={styles.editTimeInput}
                            value={editClockInStr}
                            onChangeText={setEditClockInStr}
                            placeholder="07:30"
                            placeholderTextColor={colors.muted}
                            keyboardType="numbers-and-punctuation"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK OUT</Text>
                          <TextInput
                            style={styles.editTimeInput}
                            value={editClockOutStr}
                            onChangeText={setEditClockOutStr}
                            placeholder={entry.clockOut ? "16:30" : "Still active"}
                            placeholderTextColor={colors.muted}
                            keyboardType="numbers-and-punctuation"
                          />
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>JOB</Text>
                      <TouchableOpacity
                        onPress={() => setShowEditJobPicker(!showEditJobPicker)}
                        style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: showEditJobPicker ? 4 : 10 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                          {jobs?.find(j => j.id === editJobId)?.name || "Select Job"} ▼
                        </Text>
                      </TouchableOpacity>
                      {showEditJobPicker && (
                        <View style={{ marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
                          {(jobs || []).map(j => (
                            <TouchableOpacity
                              key={j.id}
                              onPress={() => { setEditJobId(j.id); setShowEditJobPicker(false); }}
                              style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: editJobId === j.id ? colors.primary + "15" : "transparent" }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: editJobId === j.id ? "700" : "500", color: editJobId === j.id ? colors.primary : colors.foreground }}>
                                {editJobId === j.id ? "✓ " : ""}{j.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={saveEditEntry}
                          disabled={editSaving}
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}
                        >
                          {editSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Save Changes</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEditingEntryId(null)}
                          style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 14 }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {(!history || history.length === 0) && (
              <Text style={{ color: colors.muted, fontSize: 14, paddingHorizontal: 20, paddingBottom: 20 }}>
                No time entries this week.
              </Text>
            )}
          </>
        ) : isManager ? (
          <View style={{ alignItems: "center", padding: 40 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>⏱️</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>
              Select an employee above to clock them in or out
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>
              You can also clock out anyone from the "Currently Clocked In" list.
            </Text>
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ImageBackground>
    </ScreenContainer>
  );
}
