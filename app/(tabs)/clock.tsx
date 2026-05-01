import {
   ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useAppAuth } from "@/lib/auth-context";
import { useOfflineQueue } from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useClockState } from "@/lib/clock-state-context";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_CLOCK as bg_clock } from "@/constants/bg-urls";
import { formatTime12, formatDateTime12, formatTimeForEdit, parse12HrTime } from "@/lib/utils";
import * as Location from "expo-location";
import { useGpsTracking } from "@/hooks/use-gps-tracking";

function formatDuration(ms: number) {
  if (ms <= 0) return "0h 0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Use formatTime12 and formatDateTime12 from @/lib/utils for 12-hour format

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


export default function ClockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const { addClockEntry } = useOfflineQueue();
  const { gpsEnabled } = useGpsTracking();
  const [now, setNow] = useState(new Date());
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Management mode state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // ClockShark-style editing state (clock-in, clock-out, job)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editClockInStr, setEditClockInStr] = useState("");
  const [editClockInAmpm, setEditClockInAmpm] = useState("AM");
  const [editClockOutStr, setEditClockOutStr] = useState("");
  const [editClockOutAmpm, setEditClockOutAmpm] = useState("PM");
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showEditJobPicker, setShowEditJobPicker] = useState(false);

  // Custom clock-in time (managers can set a specific time when clocking someone in)
  const [customClockInTime, setCustomClockInTime] = useState("");
  const [customClockInAmpm, setCustomClockInAmpm] = useState("AM");
  const [useCustomTime, setUseCustomTime] = useState(false);
  // Mid-day job transfer state
  const [showJobTransfer, setShowJobTransfer] = useState(false);
  const [transferJobId, setTransferJobId] = useState<number | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  const role = employee?.role ?? "laborer";
  const isManager = role === "owner" || role === "office_manager" || role === "logistics";
  const isForeman = role === "foreman";
  const canClockCrew = isManager || isForeman;
  const clockTargetId = canClockCrew ? selectedEmployeeId : employee?.id;

  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Update clock every 30 seconds for elapsed time display
  useEffect(() => {
    const interval = setInterval(() => {
      if (mountedRef.current) setNow(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-clear success message
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => { if (mountedRef.current) setSuccessMsg(null); }, 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // ─── New local-first clock state (instant UI updates) ───
  const {
    activeEntry,
    optimisticClockOut,
    optimisticClockIn,
    forceRefresh: clockForceRefresh,
  } = useClockState();

  const [cachedJobs, setCachedJobs] = useState<any[] | null>(null);
  const [cachedEmployees, setCachedEmployees] = useState<any[] | null>(null);

  // Load cached data on mount (for offline use)
  useEffect(() => {
    getCached<any[]>(CACHE_KEYS.ACTIVE_JOBS).then((d) => { if (d) setCachedJobs(d); });
    if (canClockCrew) {
      getCached<any[]>(CACHE_KEYS.ALL_EMPLOYEES).then((d) => { if (d) setCachedEmployees(d); });
    }
  }, [canClockCrew]);

  const { data: jobs, isError: jobsError, refetch: refetchJobs } = trpc.jobs.listActive.useQuery(undefined, { staleTime: 15000, refetchOnMount: "always", retry: 3, retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000) });

  // Auto-retry jobs fetch if it fails — retry up to 5 times with exponential backoff
  const jobsRetryRef = useRef(0);
  useEffect(() => {
    if (jobsError && jobsRetryRef.current < 5) {
      const timer = setTimeout(() => {
        jobsRetryRef.current += 1;
        refetchJobs();
      }, 3000 * (jobsRetryRef.current + 1));
      return () => clearTimeout(timer);
    }
    if (jobs && jobs.length > 0) jobsRetryRef.current = 0;
  }, [jobsError, jobs, refetchJobs]);

  // Cache jobs when fetched from server
  useEffect(() => {
    if (jobs && jobs.length > 0) {
      setCache(CACHE_KEYS.ACTIVE_JOBS, jobs);
      setCachedJobs(jobs);
    }
  }, [jobs]);

  const { data: history, refetch: refetchHistory } = trpc.clock.history.useQuery(
    { employeeId: clockTargetId || 0, since: new Date(Date.now() - 7 * 86400000).toISOString() },
    { enabled: !!clockTargetId, staleTime: 0, refetchOnMount: true }
  );

  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: canClockCrew, staleTime: 15000, refetchOnMount: "always" });

  // Cache employees when fetched from server
  useEffect(() => {
    if (allEmployees && allEmployees.length > 0) {
      setCache(CACHE_KEYS.ALL_EMPLOYEES, allEmployees);
      setCachedEmployees(allEmployees);
    }
  }, [allEmployees]);

  // Use server data if available, fall back to cache
  // Safety: normalize job names — ensure every job has a string name
  const rawJobs = jobs || cachedJobs || [];
  const effectiveJobs = (rawJobs as any[]).filter((j: any) => j && j.id).map((j: any) => ({ ...j, name: String(j.name || j.jobName || `Job #${j.id}`) })).filter((j: any) => j.name.length >= 2);
  const effectiveEmployees = allEmployees || cachedEmployees || [];
  const { data: allClockedIn, refetch: refetchClockedIn } = trpc.clock.allClockedIn.useQuery(
    undefined, { enabled: canClockCrew, refetchInterval: 15000, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always" }
  );

  const activeEmployees = useMemo(() => {
    const active = effectiveEmployees.filter((e: any) => e.isActive);
    // Foremen can only clock in/manage laborers (not themselves, other foremen, or management)
    if (isForeman && employee) {
      return active.filter((e: any) => e.role === "laborer");
    }
    return active;
  }, [effectiveEmployees, isForeman, employee]);

  const selectedEmployee = useMemo(() => {
    if (!canClockCrew) return employee;
    return activeEmployees.find((e: any) => e.id === selectedEmployeeId) || null;
  }, [canClockCrew, employee, activeEmployees, selectedEmployeeId]);

  const clockInMutation = trpc.clock.in.useMutation();
  const clockOutMutation = trpc.clock.out.useMutation();
  const updateEntryMutation = trpc.clock.updateEntry.useMutation();

  const refreshAll = useCallback(async () => {
    try {
      await clockForceRefresh();
      await Promise.all([
        refetchHistory(),
        ...(canClockCrew ? [refetchClockedIn()] : []),
      ]);
    } catch { /* ignore refresh errors */ }
  }, [clockForceRefresh, refetchHistory, canClockCrew, refetchClockedIn]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshAll(); } catch {}
    setRefreshing(false);
  }, [refreshAll]);

  const handleClockIn = useCallback(async () => {
    if (!clockTargetId || !selectedJobId) {
      Alert.alert("Select a Job", "Please select a jobsite before clocking in.");
      return;
    }
    if (loading) return; // Prevent double-tap
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      // GPS capture (non-blocking — don't delay clock-in)
      let gpsLat: number | undefined;
      let gpsLng: number | undefined;
      if (gpsEnabled && Platform.OS !== "web") {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
              new Promise<null>((r) => setTimeout(() => r(null), 5000)),
            ]);
            if (loc) { gpsLat = loc.coords.latitude; gpsLng = loc.coords.longitude; }
          }
        } catch { /* GPS failed — continue without it */ }
      }
      // Calculate clock-in time: use custom time if set, otherwise use current time
      let clockInTime = new Date().toISOString();
      if (useCustomTime && customClockInTime) {
        const parts = customClockInTime.split(":");
        if (parts.length === 2) {
          let hours = parseInt(parts[0], 10);
          const mins = parseInt(parts[1], 10);
          if (!isNaN(hours) && !isNaN(mins)) {
            if (customClockInAmpm === "PM" && hours < 12) hours += 12;
            if (customClockInAmpm === "AM" && hours === 12) hours = 0;
            const customDate = new Date();
            customDate.setHours(hours, mins, 0, 0);
            clockInTime = customDate.toISOString();
          }
        }
      }
      // OPTIMISTIC: update UI immediately before server responds
      // The context sets an 8-second lock so server responses can't overwrite this
      const optimisticEntry = {
        id: -1, // temporary placeholder
        employeeId: clockTargetId,
        jobId: selectedJobId,
        clockIn: clockInTime,
        clockOut: null,
      };
      optimisticClockIn(optimisticEntry);
      if (mountedRef.current) setSuccessMsg("Clocked in!");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // ALWAYS try server first, fall back to offline only on failure
      try {
        await withTimeout(
          clockInMutation.mutateAsync({
            employeeId: clockTargetId,
            jobId: selectedJobId,
            clockIn: clockInTime,
            isOfflineEntry: false,
            ...(gpsLat != null && gpsLng != null ? { clockInLatitude: gpsLat, clockInLongitude: gpsLng } : {}),
          }),
          Platform.OS === "web" ? 20000 : 15000
        );
        // Server confirmed — refresh history
        await refreshAll();
      } catch {
        // Server failed — save to offline queue for later sync
        await addClockEntry({
          employeeId: clockTargetId,
          jobId: selectedJobId,
          clockIn: clockInTime,
        });
        if (mountedRef.current) setSuccessMsg("Clocked in (saved for sync)!");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clockTargetId, selectedJobId, loading, isManager, canClockCrew, clockInMutation, addClockEntry, refreshAll, useCustomTime, customClockInTime, customClockInAmpm, optimisticClockIn, optimisticClockOut]);

  const handleClockOut = useCallback(async () => {
    if (!activeEntry) return;
    if (loading) return; // Prevent double-tap
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    const entryId = activeEntry.id;
    const savedEntry = activeEntry; // save in case we need to revert
    const clockOutTime = new Date().toISOString();

    // GPS capture on clock-out (non-blocking)
    let gpsOutLat: number | undefined;
    let gpsOutLng: number | undefined;
    if (gpsEnabled && Platform.OS !== "web") {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((r) => setTimeout(() => r(null), 5000)),
          ]);
          if (loc) { gpsOutLat = loc.coords.latitude; gpsOutLng = loc.coords.longitude; }
        }
      } catch { /* GPS failed — continue */ }
    }

    // * OPTIMISTIC: update UI to "Clocked Out" IMMEDIATELY — before any server call
    // The context sets an 8-second lock so server responses can't overwrite this
    optimisticClockOut();
    if (mountedRef.current) setSuccessMsg("Clocked out!");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (entryId < 0) {
      // Offline-created entry — queue the complete entry for sync
      await addClockEntry({
        employeeId: savedEntry.employeeId,
        jobId: savedEntry.jobId,
        clockIn: typeof savedEntry.clockIn === 'string' ? savedEntry.clockIn : new Date(savedEntry.clockIn).toISOString(),
        clockOut: clockOutTime,
      });
      if (mountedRef.current) setLoading(false);
      return;
    }
    // ALWAYS try server first, fall back to offline only on failure
    try {
      await withTimeout(
        clockOutMutation.mutateAsync({
          entryId,
          clockOut: clockOutTime,
          ...(gpsOutLat != null && gpsOutLng != null ? { clockOutLatitude: gpsOutLat, clockOutLongitude: gpsOutLng } : {}),
        }),
        Platform.OS === "web" ? 20000 : 15000
      );
      await refreshAll();
    } catch {
      // Server failed — queue with existingEntryId so sync closes the right entry
      await addClockEntry({
        employeeId: savedEntry.employeeId,
        jobId: savedEntry.jobId,
        clockIn: typeof savedEntry.clockIn === 'string' ? savedEntry.clockIn : new Date(savedEntry.clockIn).toISOString(),
        clockOut: clockOutTime,
        existingEntryId: entryId,
      });
      if (mountedRef.current) setSuccessMsg("Clocked out (saved for sync)");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [activeEntry, loading, clockOutMutation, refreshAll, optimisticClockOut, optimisticClockIn, addClockEntry]);

  const handleQuickClockOut = useCallback(async (entryId: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mountedRef.current) setSuccessMsg("Employee clocked out!");
    const clockOutTime = new Date().toISOString();
    // Find entry data for offline queuing
    const entryData = (allClockedIn || []).find((e: any) => e.id === entryId);
    // ALWAYS try server first, fall back to offline only on failure
    try {
      await withTimeout(
        clockOutMutation.mutateAsync({
          entryId,
          clockOut: clockOutTime,
        }),
        Platform.OS === "web" ? 20000 : 15000
      );
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (mountedRef.current) await refreshAll();
    } catch {
      // Server failed — queue with existingEntryId so sync closes the right entry
      if (entryData) {
        await addClockEntry({
          employeeId: entryData.employeeId,
          jobId: entryData.jobId,
          clockIn: typeof entryData.clockIn === 'string' ? entryData.clockIn : new Date(entryData.clockIn).toISOString(),
          clockOut: clockOutTime,
          existingEntryId: entryId > 0 ? entryId : undefined,
        });
      }
      if (mountedRef.current) setSuccessMsg("Clocked out (saved for sync)");
    }
  }, [clockOutMutation, refreshAll, allClockedIn, addClockEntry]);

  /* ─── Mid-day job transfer: clock out of current job, clock in to new job ─── */
  const handleJobTransfer = useCallback(async () => {
    if (!activeEntry || !transferJobId) return;
    if (transferLoading) return;
    setTransferLoading(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const now = new Date().toISOString();

      // ALWAYS try server first, fall back to offline only on failure
      // 1. Clock out of current job
      await clockOutMutation.mutateAsync({
        entryId: activeEntry.id,
        clockOut: now,
      });
      // 2. Clock in to new job
      await clockInMutation.mutateAsync({
        employeeId: clockTargetId!,
        jobId: transferJobId,
        clockIn: now,
        isOfflineEntry: false,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowJobTransfer(false);
      setTransferJobId(null);
      if (mountedRef.current) {
        setSuccessMsg("Transferred to new job!");
        await refreshAll();
      }
    } catch {
      // Server failed — queue both clock-out and new clock-in
      if (clockTargetId && transferJobId) {
        const fallbackNow = new Date().toISOString();
        await addClockEntry({
          employeeId: activeEntry.employeeId,
          jobId: activeEntry.jobId,
          clockIn: typeof activeEntry.clockIn === 'string' ? activeEntry.clockIn : new Date(activeEntry.clockIn).toISOString(),
          clockOut: fallbackNow,
          existingEntryId: activeEntry.id > 0 ? activeEntry.id : undefined,
        });
        await addClockEntry({
          employeeId: clockTargetId,
          jobId: transferJobId,
          clockIn: fallbackNow,
        });
        setShowJobTransfer(false);
        setTransferJobId(null);
        if (mountedRef.current) setSuccessMsg("Transferred (saved for sync)");
      } else {
        Alert.alert("Error", "Could not transfer jobs. Please try again.");
      }
    } finally {
      if (mountedRef.current) setTransferLoading(false);
    }
  }, [activeEntry, transferJobId, transferLoading, clockOutMutation, clockInMutation, clockTargetId, refreshAll, addClockEntry]);

  /* ─── ClockShark-style: Edit clock-in, clock-out, and job ─── */
  const startEditEntry = (entry: any) => {
    const inEdit = formatTimeForEdit(entry.clockIn);
    setEditClockInStr(inEdit.time);
    setEditClockInAmpm(inEdit.ampm);
    if (entry.clockOut) {
      const outEdit = formatTimeForEdit(entry.clockOut);
      setEditClockOutStr(outEdit.time);
      setEditClockOutAmpm(outEdit.ampm);
    } else {
      setEditClockOutStr("");
      setEditClockOutAmpm("PM");
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

    // Parse clock-in (12-hour format)
    const parsedIn = parse12HrTime(editClockInStr, editClockInAmpm);
    if (!parsedIn) {
      Alert.alert("Invalid Clock-In", "Enter time as H:MM (e.g., 7:30)");
      return;
    }
    const newClockIn = new Date(entry.clockIn);
    newClockIn.setHours(parsedIn.hours, parsedIn.minutes, 0, 0);

    // Parse clock-out (optional — only if provided)
    let newClockOut: Date | undefined;
    if (editClockOutStr.trim()) {
      const parsedOut = parse12HrTime(editClockOutStr, editClockOutAmpm);
      if (!parsedOut) {
        Alert.alert("Invalid Clock-Out", "Enter time as H:MM (e.g., 4:30)");
        return;
      }
      const outBase = entry.clockOut ? new Date(entry.clockOut) : new Date(entry.clockIn);
      newClockOut = new Date(outBase);
      newClockOut.setHours(parsedOut.hours, parsedOut.minutes, 0, 0);
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
        // Invalidate all related caches so hours sync everywhere
        refreshAll().catch(() => {});
        utils.payroll.getMyHours.invalidate();
        utils.payroll.getReport.invalidate();
        utils.clock.getDetailedTimecard.invalidate();
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to update entry.");
    } finally {
      if (mountedRef.current) setEditSaving(false);
    }
  };

  const isClockedIn = !!activeEntry;
  const elapsed = activeEntry ? now.getTime() - new Date(activeEntry.clockIn).getTime() : 0;
  const activeJob = effectiveJobs.find((j: any) => j.id === activeEntry?.jobId);

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
      case "office_manager": return "#8B5CF6";
      case "logistics": return "#0EA5E9";
      case "foreman": return colors.success;
      default: return colors.muted;
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ImageBackground source={bg_clock} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.08 }}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
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

        {/* Manager/Foreman: Employee Picker */}
        {canClockCrew && (
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

        {/* Job Transfer Modal */}
        <Modal visible={showJobTransfer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowJobTransfer(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Job</Text>
              <TouchableOpacity onPress={() => setShowJobTransfer(false)}>
                <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
                Currently on: <Text style={{ fontWeight: "700", color: colors.foreground }}>{activeJob?.name || "Unknown Job"}</Text>
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Select New Job</Text>
              {effectiveJobs.filter((j: any) => j.id !== activeEntry?.jobId).map((job: any) => (
                <TouchableOpacity
                  key={job.id}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: transferJobId === job.id ? colors.primary : colors.border, backgroundColor: transferJobId === job.id ? colors.primary + "15" : colors.surface }}
                  onPress={() => setTransferJobId(job.id)}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: transferJobId === job.id ? colors.primary : colors.foreground }}>{String(job.name)}</Text>
                  {job.address && <Text style={{ fontSize: 12, color: colors.muted }}>{job.address}</Text>}
                  {transferJobId === job.id && <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 18, marginLeft: 8 }}>✓</Text>}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 16, marginBottom: 32, opacity: (!transferJobId || transferLoading) ? 0.5 : 1 }}
                onPress={handleJobTransfer}
                disabled={!transferJobId || transferLoading}
              >
                {transferLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Transfer to New Job</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

        {/* Currently Clocked In (Manager/Foreman view) with Edit Time */}
        {canClockCrew && allClockedIn && allClockedIn.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>
              Currently Clocked In ({allClockedIn.length})
            </Text>
            {allClockedIn.map((entry: any) => {
              const emp = activeEmployees.find((e: any) => e.id === entry.employeeId);
              const job = jobs?.find((j: any) => j.id === entry.jobId);
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
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Edit</Text>
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
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            <TextInput
                              style={[styles.editTimeInput, { flex: 1 }]}
                              value={editClockInStr}
                              onChangeText={setEditClockInStr}
                              placeholder="7:30"
                              placeholderTextColor={colors.muted}
                              keyboardType="numbers-and-punctuation"
                            />
                            <TouchableOpacity
                              onPress={() => setEditClockInAmpm(editClockInAmpm === "AM" ? "PM" : "AM")}
                              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center" }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{editClockInAmpm}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK OUT</Text>
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            <TextInput
                              style={[styles.editTimeInput, { flex: 1 }]}
                              value={editClockOutStr}
                              onChangeText={setEditClockOutStr}
                              placeholder={entry.clockOut ? "4:30" : "Still active"}
                              placeholderTextColor={colors.muted}
                              keyboardType="numbers-and-punctuation"
                            />
                            <TouchableOpacity
                              onPress={() => setEditClockOutAmpm(editClockOutAmpm === "AM" ? "PM" : "AM")}
                              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center" }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{editClockOutAmpm}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      {/* Job Picker */}
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>JOB</Text>
                      <TouchableOpacity
                        onPress={() => setShowEditJobPicker(!showEditJobPicker)}
                        style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: showEditJobPicker ? 4 : 10 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                          {effectiveJobs.find((j: any) => j.id === editJobId)?.name || "Select Job"} ▼
                        </Text>
                      </TouchableOpacity>
                      {showEditJobPicker && (
                        <View style={{ marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
                          {effectiveJobs.map((j: any) => (
                            <TouchableOpacity
                              key={j.id}
                              onPress={() => { setEditJobId(j.id); setShowEditJobPicker(false); }}
                              style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: editJobId === j.id ? colors.primary + "15" : "transparent" }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: editJobId === j.id ? "700" : "500", color: editJobId === j.id ? colors.primary : colors.foreground }}>
                                {editJobId === j.id ? "✓ " : ""}{String(j.name)}
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
                  <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>
                    Since {formatTime12(activeEntry!.clockIn)}
                  </Text>
                  {/* Switch Job button */}
                  <TouchableOpacity
                    onPress={() => { setTransferJobId(null); setShowJobTransfer(true); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary + "15", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + "30" }}
                  >
                    
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>Switch Job</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
                {/* Lunch Break button — only when clocked in */}
                {isClockedIn && (
                  <TouchableOpacity
                    style={{
                      width: 64, height: 64, borderRadius: 32,
                      backgroundColor: colors.warning + "20",
                      borderWidth: 2, borderColor: colors.warning,
                      alignItems: "center", justifyContent: "center",
                    }}
                    onPress={() => {
                      Alert.alert(
                        "Start Break",
                        "This will clock you out for a break. Clock back in when you return.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Start Break", onPress: handleClockOut },
                        ]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="restaurant" size={22} color={colors.warning} />
                    <Text style={{ fontSize: 9, fontWeight: "700", color: colors.warning, marginTop: 2 }}>BREAK</Text>
                  </TouchableOpacity>
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
            </View>

            {/* Job Selector (only when clocked out) — full-screen modal picker */}
            {!isClockedIn && (
              <View style={styles.jobSelector}>
                <Text style={styles.sectionTitle}>Select Jobsite</Text>
                <TouchableOpacity
                  onPress={() => setJobsExpanded(true)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
                    backgroundColor: selectedJobId ? colors.primary + "12" : colors.surface,
                    borderWidth: 1.5, borderColor: selectedJobId ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: selectedJobId ? "700" : "500", color: selectedJobId ? colors.primary : colors.muted }} numberOfLines={1}>
                    {selectedJobId ? (effectiveJobs.find((j: any) => j.id === selectedJobId)?.name || "Selected") : "Select a jobsite"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 8, fontWeight: "600" }}>{effectiveJobs.length} sites</Text>
                  <Text style={{ fontSize: 14, color: colors.muted, marginLeft: 8 }}>▼</Text>
                </TouchableOpacity>
                {effectiveJobs.length === 0 && (
                  <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>No active jobs available.</Text>
                )}
                {/* Full-Screen Job Picker Modal */}
                <Modal visible={jobsExpanded} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setJobsExpanded(false)}>
                  <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === "ios" ? insets.top : 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                      <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.foreground }}>Select Jobsite</Text>
                      <TouchableOpacity onPress={() => setJobsExpanded(false)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surface }}>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <FlatList
                      data={effectiveJobs}
                      keyExtractor={(item: any) => String(item.id)}
                      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 20 }}
                      keyboardShouldPersistTaps="handled"
                      ListEmptyComponent={<View style={{ paddingVertical: 40, alignItems: "center" }}><Text style={{ color: colors.muted, fontSize: 15 }}>No jobsites available</Text></View>}
                      renderItem={({ item, index }: { item: any; index: number }) => {
                        const isSelected = selectedJobId === item.id;
                        return (
                          <TouchableOpacity
                            onPress={() => { setSelectedJobId(item.id); setJobsExpanded(false); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                            activeOpacity={0.6}
                            style={{
                              flexDirection: "row", alignItems: "center",
                              paddingVertical: 16, paddingHorizontal: 16,
                              marginTop: index === 0 ? 4 : 0, marginBottom: 6, borderRadius: 12,
                              backgroundColor: isSelected ? colors.primary + "18" : colors.surface,
                              borderWidth: isSelected ? 1.5 : 1, borderColor: isSelected ? colors.primary : colors.border,
                            }}
                          >
                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isSelected ? colors.primary : colors.border + "60", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? "#fff" : colors.muted }}>{index + 1}</Text>
                            </View>
                            <Text style={{ flex: 1, fontSize: 16, fontWeight: isSelected ? "700" : "500", color: isSelected ? colors.primary : colors.foreground, lineHeight: 22 }}>
                              {String(item.name)}
                            </Text>
                            {isSelected && (
                              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
                                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                </Modal>
              </View>
            )}

            {/* Custom Clock-In Time (managers/foremen can set a specific time) */}
            {!isClockedIn && canClockCrew && (
              <View style={{ marginHorizontal: 20, marginTop: 4, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted }}>CLOCK-IN TIME</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setUseCustomTime(!useCustomTime);
                      if (!useCustomTime) {
                        const now2 = new Date();
                        let h = now2.getHours();
                        const m = now2.getMinutes();
                        const ampm = h >= 12 ? "PM" : "AM";
                        if (h > 12) h -= 12;
                        if (h === 0) h = 12;
                        setCustomClockInTime(`${h}:${m.toString().padStart(2, "0")}`);
                        setCustomClockInAmpm(ampm);
                      }
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: useCustomTime ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", alignSelf: useCustomTime ? "flex-end" : "flex-start" }} />
                    </View>
                    <Text style={{ fontSize: 13, color: useCustomTime ? colors.primary : colors.muted, fontWeight: "600" }}>
                      {useCustomTime ? "Custom time" : "Now"}
                    </Text>
                  </TouchableOpacity>
                </View>
                {useCustomTime && (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <TextInput
                      style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.foreground, backgroundColor: colors.surface, fontWeight: "700" }}
                      value={customClockInTime}
                      onChangeText={setCustomClockInTime}
                      placeholder="7:30"
                      placeholderTextColor={colors.muted}
                      keyboardType="numbers-and-punctuation"
                      returnKeyType="done"
                    />
                    <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                      {["AM", "PM"].map((ap) => (
                        <TouchableOpacity
                          key={ap}
                          onPress={() => setCustomClockInAmpm(ap)}
                          style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: customClockInAmpm === ap ? colors.primary : colors.surface }}
                        >
                          <Text style={{ fontWeight: "700", fontSize: 14, color: customClockInAmpm === ap ? "#fff" : colors.muted }}>{ap}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Recent History with Edit capability for managers */}
            <View style={{ marginHorizontal: 20, marginTop: 8 }}>
              <Text style={styles.sectionTitle}>
                Recent Time Entries{canClockCrew && selectedEmployee ? ` — ${selectedEmployee.name}` : ""}
              </Text>
            </View>
            {(history || []).slice(0, 10).map((entry: any) => {
              const job = jobs?.find((j: any) => j.id === entry.jobId);
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
                    {canClockCrew && (
                      <TouchableOpacity
                        onPress={() => startEditEntry(entry)}
                        style={{ marginLeft: 8, padding: 4 }}
                      >
                        <Text style={{ fontSize: 14 }}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {isEditing && (
                    <View style={{ marginHorizontal: 20, marginTop: 4, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: colors.primary + "08", borderWidth: 1, borderColor: colors.primary + "30" }}>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK IN</Text>
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            <TextInput
                              style={[styles.editTimeInput, { flex: 1 }]}
                              value={editClockInStr}
                              onChangeText={setEditClockInStr}
                              placeholder="7:30"
                              placeholderTextColor={colors.muted}
                              keyboardType="numbers-and-punctuation"
                            />
                            <TouchableOpacity
                              onPress={() => setEditClockInAmpm(editClockInAmpm === "AM" ? "PM" : "AM")}
                              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center" }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{editClockInAmpm}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>CLOCK OUT</Text>
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            <TextInput
                              style={[styles.editTimeInput, { flex: 1 }]}
                              value={editClockOutStr}
                              onChangeText={setEditClockOutStr}
                              placeholder={entry.clockOut ? "4:30" : "Still active"}
                              placeholderTextColor={colors.muted}
                              keyboardType="numbers-and-punctuation"
                            />
                            <TouchableOpacity
                              onPress={() => setEditClockOutAmpm(editClockOutAmpm === "AM" ? "PM" : "AM")}
                              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center" }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{editClockOutAmpm}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>JOB</Text>
                      <TouchableOpacity
                        onPress={() => setShowEditJobPicker(!showEditJobPicker)}
                        style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: showEditJobPicker ? 4 : 10 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                          {effectiveJobs.find((j: any) => j.id === editJobId)?.name || "Select Job"} ▼
                        </Text>
                      </TouchableOpacity>
                      {showEditJobPicker && (
                        <View style={{ marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
                          {effectiveJobs.map((j: any) => (
                            <TouchableOpacity
                              key={j.id}
                              onPress={() => { setEditJobId(j.id); setShowEditJobPicker(false); }}
                              style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: editJobId === j.id ? colors.primary + "15" : "transparent" }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: editJobId === j.id ? "700" : "500", color: editJobId === j.id ? colors.primary : colors.foreground }}>
                                {editJobId === j.id ? "✓ " : ""}{String(j.name)}
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
            <MaterialIcons name="schedule" size={40} color={colors.muted} style={{ marginBottom: 12 }} />
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
    </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
