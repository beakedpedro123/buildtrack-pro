import {
   ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useAppAuth } from "@/lib/auth-context";
import { useOfflineQueue } from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useEffect, useState, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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

export default function ClockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const { addClockEntry, pendingCount } = useOfflineQueue();
  const [now, setNow] = useState(new Date());
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Management mode state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const role = employee?.role ?? "laborer";
  const isManager = role === "owner" || role === "secretary" || role === "logistics";

  // The employee being clocked: self for field roles, selected employee for managers
  const clockTargetId = isManager ? selectedEmployeeId : employee?.id;

  const utils = trpc.useUtils();

  const { data: activeEntry, refetch: refetchActive } = trpc.clock.activeEntry.useQuery(
    { employeeId: clockTargetId || 0 },
    { enabled: !!clockTargetId }
  );

  const { data: jobs } = trpc.jobs.listActive.useQuery();

  const { data: history } = trpc.clock.history.useQuery(
    { employeeId: clockTargetId || 0, since: new Date(Date.now() - 7 * 86400000).toISOString() },
    { enabled: !!clockTargetId }
  );

  // For managers: get all employees and all currently clocked-in
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManager });
  const { data: allClockedIn, refetch: refetchClockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { enabled: isManager });

  const activeEmployees = useMemo(() => {
    return (allEmployees || []).filter((e: any) => e.isActive);
  }, [allEmployees]);

  const selectedEmployee = useMemo(() => {
    if (!isManager) return employee;
    return activeEmployees.find((e: any) => e.id === selectedEmployeeId) || null;
  }, [isManager, employee, activeEmployees, selectedEmployeeId]);

  const clockInMutation = trpc.clock.in.useMutation({
    onSuccess: () => { refetchActive(); utils.clock.history.invalidate(); if (isManager) refetchClockedIn(); } });

  const clockOutMutation = trpc.clock.out.useMutation({
    onSuccess: () => { refetchActive(); utils.clock.history.invalidate(); if (isManager) refetchClockedIn(); } });

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const handleClockIn = async () => {
    if (!clockTargetId || !selectedJobId) {
      Alert.alert("Select a Job", "Please select a jobsite before clocking in.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const loc = await getLocation();
      const clockInTime = new Date().toISOString();
      try {
        await clockInMutation.mutateAsync({
          employeeId: clockTargetId,
          jobId: selectedJobId,
          clockIn: clockInTime,
          clockInLatitude: loc?.lat,
          clockInLongitude: loc?.lng,
          isOfflineEntry: false });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        if (!isManager) {
          // Offline: queue it (only for self-clock)
          await addClockEntry({
            employeeId: clockTargetId,
            jobId: selectedJobId,
            clockIn: clockInTime,
            clockInLatitude: loc?.lat,
            clockInLongitude: loc?.lng });
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Clocked In (Offline)", "Clock-in was saved locally and will sync when you have service.");
        } else {
          Alert.alert("Error", "Could not clock in. Please check your connection.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const loc = await getLocation();
      await clockOutMutation.mutateAsync({
        entryId: activeEntry.id,
        clockOut: new Date().toISOString(),
        clockOutLatitude: loc?.lat,
        clockOutLongitude: loc?.lng });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", "Could not clock out. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Quick clock out for managers viewing the clocked-in list
  const handleQuickClockOut = async (entryId: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const loc = await getLocation();
      await clockOutMutation.mutateAsync({
        entryId,
        clockOut: new Date().toISOString(),
        clockOutLatitude: loc?.lat,
        clockOutLongitude: loc?.lng });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not clock out. Please try again.");
    }
  };

  const isClockedIn = !!activeEntry;
  const elapsed = activeEntry ? now.getTime() - new Date(activeEntry.clockIn).getTime() : 0;
  const activeJob = jobs?.find((j) => j.id === activeEntry?.jobId);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
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
    clockBtnText: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4 },
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
    // Manager styles
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
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    empListItem: {
      flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20,
      borderBottomWidth: 1, borderBottomColor: colors.border } });

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

        {/* Currently Clocked In (Manager view) */}
        {isManager && allClockedIn && allClockedIn.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>
              Currently Clocked In ({allClockedIn.length})
            </Text>
            {allClockedIn.map((entry: any) => {
              const emp = activeEmployees.find((e: any) => e.id === entry.employeeId);
              const job = jobs?.find((j) => j.id === entry.jobId);
              const dur = now.getTime() - new Date(entry.clockIn).getTime();
              return (
                <View key={entry.id} style={styles.clockedInCard}>
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
              );
            })}
          </View>
        )}

        {/* Clock Button Card — show when employee is selected (or for field roles) */}
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
                style={[styles.clockBtn, { backgroundColor: isClockedIn ? colors.error : colors.success }]}
                onPress={isClockedIn ? handleClockOut : handleClockIn}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="large" />
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

            {/* Recent History */}
            <View style={{ marginHorizontal: 20, marginTop: 8 }}>
              <Text style={styles.sectionTitle}>
                Recent Time Entries{isManager && selectedEmployee ? ` — ${selectedEmployee.name}` : ""}
              </Text>
            </View>
            {(history || []).slice(0, 10).map((entry) => {
              const job = jobs?.find((j) => j.id === entry.jobId);
              const dur = entry.clockOut
                ? new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()
                : null;
              return (
                <View key={entry.id} style={[styles.historyItem, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.historyDate, { color: colors.muted }]}>
                    {new Date(entry.clockIn).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </Text>
                  <Text style={[styles.historyJob, { color: colors.foreground }]} numberOfLines={1}>
                    {job?.name || "Job #" + entry.jobId}
                  </Text>
                  <Text style={[styles.historyDuration, { color: dur ? colors.foreground : colors.success }]}>
                    {dur ? formatDuration(dur) : "Active"}
                  </Text>
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
