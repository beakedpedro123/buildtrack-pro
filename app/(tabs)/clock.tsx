import { ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useAppAuth } from "@/lib/auth-context";
import { useOfflineQueue } from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
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
  const { employee } = useAppAuth();
  const { addClockEntry, pendingCount } = useOfflineQueue();
  const [now, setNow] = useState(new Date());
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();

  const { data: activeEntry, refetch: refetchActive } = trpc.clock.activeEntry.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee }
  );

  const { data: jobs } = trpc.jobs.listActive.useQuery();

  const { data: history } = trpc.clock.history.useQuery(
    { employeeId: employee?.id || 0, since: new Date(Date.now() - 7 * 86400000).toISOString() },
    { enabled: !!employee }
  );

  const clockInMutation = trpc.clock.in.useMutation({
    onSuccess: () => { refetchActive(); utils.clock.history.invalidate(); },
  });

  const clockOutMutation = trpc.clock.out.useMutation({
    onSuccess: () => { refetchActive(); utils.clock.history.invalidate(); },
  });

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
    if (!employee || !selectedJobId) {
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
          employeeId: employee.id,
          jobId: selectedJobId,
          clockIn: clockInTime,
          clockInLatitude: loc?.lat,
          clockInLongitude: loc?.lng,
          isOfflineEntry: false,
        });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Offline: queue it
        await addClockEntry({
          employeeId: employee.id,
          jobId: selectedJobId,
          clockIn: clockInTime,
          clockInLatitude: loc?.lat,
          clockInLongitude: loc?.lng,
        });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Clocked In (Offline)", "Your clock-in was saved locally and will sync when you have service.");
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
        clockOutLongitude: loc?.lng,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", "Could not clock out. Please try again.");
    } finally {
      setLoading(false);
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
      borderColor: colors.border,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 6,
    },
    statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    statusText: { fontSize: 14, fontWeight: "600" },
    elapsedTime: { fontSize: 42, fontWeight: "800", letterSpacing: -1, marginBottom: 4 },
    jobName: { fontSize: 15, fontWeight: "600", marginBottom: 20 },
    clockBtn: {
      width: 140,
      height: 140,
      borderRadius: 70,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
    },
    clockBtnText: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4 },
    clockBtnSub: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10 },
    jobSelector: { marginHorizontal: 20, marginBottom: 16 },
    jobOption: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    jobOptionText: { fontSize: 14, fontWeight: "600", flex: 1 },
    historyItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
    },
    historyDate: { fontSize: 13, fontWeight: "600", width: 80 },
    historyJob: { fontSize: 13, flex: 1 },
    historyDuration: { fontSize: 13, fontWeight: "700" },
  });

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Time Clock</Text>
          <Text style={styles.subtitle}>{employee?.name} · {now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</Text>
        </View>

        {/* Clock Button Card */}
        <View style={styles.clockCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isClockedIn ? colors.success : colors.muted }]} />
            <Text style={[styles.statusText, { color: isClockedIn ? colors.success : colors.muted }]}>
              {isClockedIn ? "Clocked In" : "Clocked Out"}
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
            style={[
              styles.clockBtn,
              { backgroundColor: isClockedIn ? colors.error : colors.success },
            ]}
            onPress={isClockedIn ? handleClockOut : handleClockIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <>
                <Text style={styles.clockBtnText}>{isClockedIn ? "CLOCK\nOUT" : "CLOCK\nIN"}</Text>
              </>
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
                    backgroundColor: selectedJobId === job.id ? colors.primary + "15" : colors.surface,
                  },
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
              <Text style={{ color: colors.muted, fontSize: 14 }}>No active jobs. Contact your manager.</Text>
            )}
          </View>
        )}

        {/* Recent History */}
        <View style={{ marginHorizontal: 20, marginTop: 8 }}>
          <Text style={styles.sectionTitle}>Recent Time Entries</Text>
        </View>
        {(history || []).slice(0, 10).map((entry) => {
          const job = jobs?.find((j) => j.id === entry.jobId);
          const dur = entry.clockOut
            ? new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()
            : null;
          return (
            <View
              key={entry.id}
              style={[styles.historyItem, { borderBottomColor: colors.border }]}
            >
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
        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
