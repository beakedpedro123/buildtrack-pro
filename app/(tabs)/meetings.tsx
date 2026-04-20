import {
   ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  isMeetingReminderEnabled,
  toggleMeetingReminder } from "@/lib/notifications";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_REPORTS as bg_reports } from "@/constants/bg-urls";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";

// ─── Types ─────────────────────────────────────────────────────────────────
type MainTab = "management" | "safety";
type MgmtScreen = "list" | "detail" | "room";
type SafetyScreen = "list" | "new" | "topics";
type SafetyMeetingType = "safety_toolbox" | "daily_goals";

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDate(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function formatShortDate(d: string | Date) {
  return new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
// Using formatTime12 from @/lib/utils for 12-hour format
import { formatTime12 } from "@/lib/utils";
function formatDuration(startedAt: string | Date | null, endedAt: string | Date | null): string {
  if (!startedAt || !endedAt) return "";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
function getAutoTitle(): string {
  const now = new Date();
  return `Friday Meeting — ${now.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#0EA5E9",
  recording: "#EF4444",
  processing: "#F59E0B",
  completed: "#22C55E",
  cancelled: "#9CA3AF" };
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  recording: "Recording",
  processing: "Processing…",
  completed: "Completed",
  cancelled: "Cancelled" };
const TOPIC_CATEGORIES = ["general", "fall_protection", "electrical", "excavation", "scaffolding", "ppe", "fire", "chemical", "equipment", "heat_stress"];

// ═══════════════════════════════════════════════════════════════════════════
export default function MeetingsScreen({ embedded }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();

  const role = employee?.role || "laborer";
  const isOwner = role === "owner";
  const isLogistics = role === "logistics";
  const isForeman = role === "foreman";
  const canManage = ["owner", "office_manager", "logistics", "foreman"].includes(role);
  const canManageTopics = isOwner || isLogistics;
  const canDocument = isForeman || canManageTopics;

  // ─── Main tab state ──────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>("management");

  // ─── Management meetings state ───────────────────────────────────────────
  const [mgmtScreen, setMgmtScreen] = useState<MgmtScreen>("list");
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [useAutoTitle, setUseAutoTitle] = useState(true);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [suggestedGoals, setSuggestedGoals] = useState<{ title: string; assignee: string | null; assigneeId: number | null }[]>([]);
  const [pushingGoals, setPushingGoals] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);

  // ─── Safety meetings state ───────────────────────────────────────────────
  const [safetyScreen, setSafetyScreen] = useState<SafetyScreen>("list");
  const [safetyMeetingType, setSafetyMeetingType] = useState<SafetyMeetingType>("safety_toolbox");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [safetyTitle, setSafetyTitle] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("1");
  const [photo, setPhoto] = useState<{ uri: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicContent, setNewTopicContent] = useState("");
  const [newTopicCategory, setNewTopicCategory] = useState("general");
  const [addingTopic, setAddingTopic] = useState(false);

  // ─── Load reminder state ─────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    isMeetingReminderEnabled().then(setReminderEnabled).catch(() => {});
  }, []);

  const handleToggleReminder = async () => {
    if (reminderLoading || !employee) return;
    setReminderLoading(true);
    try {
      const newState = !reminderEnabled;
      const result = await toggleMeetingReminder(employee.role, newState);
      setReminderEnabled(result);
      if (result) {
        Alert.alert("Reminder Set", "You will receive a notification every Friday at 2:45 PM before the management meeting.");
      } else {
        Alert.alert("Reminder Off", "Friday meeting reminder has been disabled.");
      }
    } catch {
      Alert.alert("Error", "Could not update notification settings.");
    } finally {
      setReminderLoading(false);
    }
  };

  // ─── Management meeting queries ──────────────────────────────────────────
  const { data: meetings, isLoading: mgmtLoading, refetch: refetchMgmt } = trpc.meetings.list.useQuery();

  // Offline caching for meetings
  const [cachedMeetings, setCachedMeetings] = useState<any[] | null>(null);
  useEffect(() => {
    getCached<any[]>(CACHE_KEYS.MEETINGS).then((d) => { if (d) setCachedMeetings(d); });
  }, []);
  useEffect(() => {
    if (meetings && meetings.length > 0) { setCache(CACHE_KEYS.MEETINGS, meetings).catch(() => {}); setCachedMeetings(meetings); }
  }, [meetings]);

  const effectiveMeetings = meetings || cachedMeetings || [];
  const selectedMeeting = effectiveMeetings.find((m: any) => m.id === selectedMeetingId) || null;

  const createMeeting = trpc.meetings.create.useMutation({
    onSuccess: (data) => {
      utils.meetings.list.invalidate();
      setShowNewMeeting(false);
      setNewTitle("");
      setUseAutoTitle(true);
      setSelectedMeetingId(data.id);
      setMgmtScreen("detail");
    } });
  const startRecording = trpc.meetings.startRecording.useMutation({
    onSuccess: () => utils.meetings.list.invalidate() });
  const finishRecording = trpc.meetings.finishRecording.useMutation({
    onSuccess: () => utils.meetings.list.invalidate() });
  const transcribeAndSummarize = trpc.meetings.transcribeAndSummarize.useMutation({
    onSuccess: (data) => {
      utils.meetings.list.invalidate();
      setSuggestedGoals((data.suggestedGoals || []) as any);
    } });
  const cancelMeeting = trpc.meetings.cancel.useMutation({
    onSuccess: () => utils.meetings.list.invalidate() });
  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => utils.goals.list.invalidate() });

  // ─── Safety meeting queries ──────────────────────────────────────────────
  const { data: jobs } = trpc.jobs.listActive.useQuery();
  const { data: topics } = trpc.safetyTopics.list.useQuery({ activeOnly: true }, { staleTime: 30000 });
  const { data: allSafetyMeetings } = trpc.safetyMeetings.list.useQuery({ limit: 50 }, { staleTime: 30000 });

  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);
  const { data: weekMeetings } = trpc.safetyMeetings.forWeek.useQuery({
    startDate: weekStart.toISOString(),
    endDate: weekEnd.toISOString() });

  const weeklyStats = useMemo(() => {
    if (!weekMeetings) return { safetyCount: 0, goalsCount: 0, safetyTarget: 3, goalsTarget: 5 };
    const safetyCount = weekMeetings.filter(m => m.meetingType === "safety_toolbox").length;
    const goalsCount = weekMeetings.filter(m => m.meetingType === "daily_goals").length;
    return { safetyCount, goalsCount, safetyTarget: 3, goalsTarget: 5 };
  }, [weekMeetings]);

  const createSafetyMeeting = trpc.safetyMeetings.create.useMutation();
  const createTopic = trpc.safetyTopics.create.useMutation();
  const deleteTopic = trpc.safetyTopics.delete.useMutation();

  // ─── Audio recorder ──────────────────────────────────────────────────────
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return;
      const status = await requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert("Microphone Permission", "Microphone access is required to record meetings.");
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, []);

  const startTimer = () => {
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ─── Management meeting handlers ─────────────────────────────────────────
  const handleStartRecording = async (meetingId: number) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      if (Platform.OS !== "web") {
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
      }
      await startRecording.mutateAsync({ id: meetingId });
      setActiveMeetingId(meetingId);
      startTimer();
      setMgmtScreen("room");
    } catch {
      Alert.alert("Recording Error", "Could not start recording. Please check microphone permissions.");
    }
  };

  const handleStopRecording = async () => {
    if (!activeMeetingId) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopTimer();
    try {
      let audioUrl = "";
      if (Platform.OS !== "web") {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        if (uri) {
          const formData = new FormData();
          // iOS records as .m4a (AAC in MP4 container) — use correct MIME type audio/mp4
          formData.append("file", { uri, name: `meeting_${activeMeetingId}.m4a`, type: "audio/mp4" } as any);
          const apiBase = getApiBaseUrl();
          console.log(`[meeting] Uploading recording for meeting ${activeMeetingId}, duration: ${recordingSeconds}s, platform: ${Platform.OS}`);
          try {
            const uploadRes = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
            if (uploadRes.ok) {
              const json = await uploadRes.json();
              audioUrl = json.url || uri;
              console.log(`[meeting] Upload success: ${audioUrl}`);
            } else {
              console.warn(`[meeting] Upload failed: ${uploadRes.status}`);
              audioUrl = uri;
            }
          } catch (uploadErr: any) {
            console.warn(`[meeting] Upload error: ${uploadErr?.message}`);
            audioUrl = uri;
          }
        }
      }
      const savedId = activeMeetingId;
      await finishRecording.mutateAsync({ id: savedId, audioUrl });
      setActiveMeetingId(null);
      setMgmtScreen("detail");
      setSelectedMeetingId(savedId);
      Alert.alert("Recording Saved", "Your meeting has been recorded. Tap 'Transcribe & Summarize' to generate the AI summary.", [
        { text: "Later", style: "cancel" },
        { text: "Transcribe Now", onPress: () => handleTranscribe(savedId) },
      ]);
    } catch {
      Alert.alert("Error", "Failed to save recording. Please try again.");
    }
  };

  const handleTranscribe = async (meetingId: number) => {
    try {
      await transcribeAndSummarize.mutateAsync({ id: meetingId });
    } catch (err: any) {
      const errMsg = err?.message?.includes("Transcription failed:") 
        ? err.message.replace("Transcription failed: ", "") 
        : "Could not process the recording. Please try again.";
      Alert.alert("Transcription Error", errMsg);
    }
  };

  const handlePushGoalsToWeek = async () => {
    if (!employee || suggestedGoals.length === 0 || !selectedMeetingId) return;
    setPushingGoals(true);
    try {
      const ws = getWeekStart(new Date());
      for (const goal of suggestedGoals) {
        await createGoal.mutateAsync({
          title: goal.title,
          meetingId: selectedMeetingId,
          weekOf: ws.toISOString(),
          priority: "medium",
          createdBy: employee.id,
          assignedTo: goal.assigneeId || undefined });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Goals Created", `${suggestedGoals.length} goals have been added to this week's goals.`);
      setSuggestedGoals([]);
    } catch {
      Alert.alert("Error", "Failed to create some goals. Please try again.");
    } finally { setPushingGoals(false); }
  };

  const handleCreateMeeting = () => {
    const title = useAutoTitle ? getAutoTitle() : newTitle.trim();
    if (!title) { Alert.alert("Title Required", "Please enter a meeting title or use the auto-title option."); return; }
    createMeeting.mutate({ title, createdBy: employee?.id || 0 });
  };

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // ─── Safety meeting handlers ─────────────────────────────────────────────
  const uploadPhotoFile = async (uri: string): Promise<string | null> => {
    try {
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append("file", blob, `safety_${Date.now()}.jpg`);
      } else {
        formData.append("file", { uri, type: "image/jpeg", name: `safety_${Date.now()}.jpg` } as any);
      }
      const response = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!response.ok) return null;
      const data = await response.json();
      return data.url || null;
    } catch { return null; }
  };

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission Needed", "Please allow photo access."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (!result.canceled && result.assets?.length > 0) {
        setPhoto({ uri: result.assets[0].uri });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err: any) { Alert.alert("Error", err?.message || "Failed to pick photo"); }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission Needed", "Please allow camera access."); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.length > 0) {
        setPhoto({ uri: result.assets[0].uri });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err: any) { Alert.alert("Error", err?.message || "Failed to take photo"); }
  };

  const handleSafetySubmit = async () => {
    if (!selectedJobId || !employee) { Alert.alert("Missing Info", "Please select a job."); return; }
    if (!safetyTitle.trim()) { Alert.alert("Missing Title", "Please enter a meeting title or select a topic."); return; }
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (photo) {
        const url = await uploadPhotoFile(photo.uri);
        if (url) photoUrl = url;
      }
      await createSafetyMeeting.mutateAsync({
        topicId: selectedTopicId || undefined,
        jobId: selectedJobId,
        meetingType: safetyMeetingType,
        title: safetyTitle.trim(),
        notes: safetyNotes.trim() || undefined,
        attendees: attendees.trim() || undefined,
        attendeeCount: parseInt(attendeeCount) || 1,
        photoUrl,
        conductedBy: employee.id,
        conductedAt: new Date().toISOString() });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      utils.safetyMeetings.list.invalidate();
      utils.safetyMeetings.forWeek.invalidate();
      resetSafetyForm();
      setSafetyScreen("list");
      Alert.alert("Meeting Documented", `Your ${safetyMeetingType === "safety_toolbox" ? "safety toolbox talk" : "daily goals meeting"} has been recorded.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save meeting.");
    } finally { setSubmitting(false); }
  };

  const resetSafetyForm = () => {
    setSelectedJobId(null);
    setSelectedTopicId(null);
    setSafetyTitle("");
    setSafetyNotes("");
    setAttendees("");
    setAttendeeCount("1");
    setPhoto(null);
    setSafetyMeetingType("safety_toolbox");
  };

  const handleAddTopic = async () => {
    if (!newTopicTitle.trim() || !employee) return;
    setAddingTopic(true);
    try {
      await createTopic.mutateAsync({
        title: newTopicTitle.trim(),
        content: newTopicContent.trim() || undefined,
        category: newTopicCategory,
        requestingEmployeeId: employee.id });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      utils.safetyTopics.list.invalidate();
      setNewTopicTitle("");
      setNewTopicContent("");
      Alert.alert("Topic Added", "Safety topic has been posted for your foremen.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to add topic.");
    } finally { setAddingTopic(false); }
  };

  const handleDeleteTopic = (id: number) => {
    Alert.alert("Delete Topic", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (!employee) return;
        try {
          await deleteTopic.mutateAsync({ id, requestingEmployeeId: employee.id });
          utils.safetyTopics.list.invalidate();
        } catch (e: any) { Alert.alert("Error", e?.message); }
      }},
    ]);
  };

  const selectTopic = (topic: { id: number; title: string; content: string | null }) => {
    setSelectedTopicId(topic.id);
    setSafetyTitle(topic.title);
    if (topic.content) setSafetyNotes(topic.content);
    setSafetyScreen("new");
  };

  // ─── Styles ──────────────────────────────────────────────────────────────
  const styles = StyleSheet.create({
    // Tab bar
    tabBar: { flexDirection: "row", marginHorizontal: 16, marginTop: 8, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 3 },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
    tabBtnActive: { backgroundColor: colors.primary },
    tabBtnText: { fontSize: 13, fontWeight: "700", color: colors.muted },
    tabBtnTextActive: { color: "#fff" },
    // Cards
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    dangerBtn: { backgroundColor: colors.error, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    outlineBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1.5, borderColor: colors.primary },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.background, marginBottom: 10 },
    textArea: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface, minHeight: 100, textAlignVertical: "top" },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, marginBottom: 8 },
    // Safety specific
    section: { paddingHorizontal: 20, paddingTop: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 },
    complianceRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
    complianceCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1 },
    complianceCount: { fontSize: 28, fontWeight: "800" },
    complianceLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
    complianceTarget: { fontSize: 10, marginTop: 4 },
    meetingCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
    meetingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 8 },
    meetingBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
    topicCard: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 8 },
    jobOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginBottom: 8, flexDirection: "row", alignItems: "center" },
    typeRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 16 },
    typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginHorizontal: 20, marginVertical: 20 },
    photoRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 8 },
    photoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
    actionBtn: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4 } });

  const MWrapper = embedded ? View : ScreenContainer;

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT: Recording Room
  // ═══════════════════════════════════════════════════════════════════════════
  if (mainTab === "management" && mgmtScreen === "room") {
    const activeMeeting = meetings?.find((m) => m.id === activeMeetingId);
    return (
      <MWrapper style={embedded ? { flex: 1 } : undefined}>
        <ImageBackground source={bg_reports} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.error + "22", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 32 }}>🎙</Text>
            </View>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            {activeMeeting?.title || "Meeting Recording"}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>Recording in progress</Text>
          <Text style={{ fontSize: 48, fontWeight: "800", color: colors.error, marginTop: 24, fontVariant: ["tabular-nums"] }}>
            {formatRecordingTime(recordingSeconds)}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} />
            <Text style={{ fontSize: 13, color: colors.error, fontWeight: "600" }}>LIVE</Text>
          </View>
          <View style={{ width: "100%", marginTop: 40, gap: 12 }}>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleStopRecording}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Stop Recording</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              All participants should be near this device for best audio quality.
            </Text>
          </View>
        </View>
    </ImageBackground>
    </MWrapper>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT: Meeting Detail
  // ═══════════════════════════════════════════════════════════════════════════
  if (mainTab === "management" && mgmtScreen === "detail" && selectedMeeting) {
    return (
      <MWrapper style={embedded ? { flex: 1 } : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity
            style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center" }}
            onPress={() => { setMgmtScreen("list"); setSuggestedGoals([]); }}
          >
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>← Back to Meetings</Text>
          </TouchableOpacity>

          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>{selectedMeeting.title}</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <View style={{ backgroundColor: STATUS_COLORS[selectedMeeting.status] + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: STATUS_COLORS[selectedMeeting.status] }}>
                  {STATUS_LABELS[selectedMeeting.status]}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted }}>{formatDate(selectedMeeting.createdAt)}</Text>
              {selectedMeeting.startedAt && selectedMeeting.endedAt && (
                <Text style={{ fontSize: 13, color: colors.muted }}>{formatDuration(selectedMeeting.startedAt, selectedMeeting.endedAt)}</Text>
              )}
            </View>
          </View>

          {selectedMeeting.status === "scheduled" && canManage && (
            <View style={{ paddingHorizontal: 16, marginBottom: 16, gap: 10 }}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => handleStartRecording(selectedMeeting.id)} disabled={startRecording.isPending}>
                {startRecording.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>🎙 Start Recording</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.error }]}
                onPress={() => {
                  Alert.alert("Cancel Meeting", "Are you sure?", [
                    { text: "No", style: "cancel" },
                    { text: "Yes", style: "destructive", onPress: () => { cancelMeeting.mutate({ id: selectedMeeting.id }); setMgmtScreen("list"); } },
                  ]);
                }}
              >
                <Text style={{ color: colors.error, fontWeight: "600" }}>Cancel Meeting</Text>
              </TouchableOpacity>
            </View>
          )}

          {selectedMeeting.status === "processing" && (
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => handleTranscribe(selectedMeeting.id)} disabled={transcribeAndSummarize.isPending}>
                {transcribeAndSummarize.isPending ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Processing…</Text>
                  </View>
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>🤖 Transcribe & Summarize</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {selectedMeeting.summary && (
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, marginBottom: 8 }}>AI Meeting Summary</Text>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22 }}>{selectedMeeting.summary}</Text>
            </View>
          )}

          {suggestedGoals.length > 0 && (
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.warning, marginBottom: 8 }}>Suggested Weekly Goals</Text>
              {suggestedGoals.map((goal, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: colors.primary }}>•</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>{goal.title}</Text>
                    {goal.assignee && <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>→ {goal.assignee}</Text>}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 12 }, pushingGoals && { opacity: 0.7 }]}
                onPress={handlePushGoalsToWeek}
                disabled={pushingGoals}
              >
                {pushingGoals ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Creating Goals…</Text>
                  </View>
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>🎯 Push {suggestedGoals.length} Goals to This Week</Text>
                )}
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, textAlign: "center" }}>Goals will appear in the Goals tab for this week.</Text>
            </View>
          )}

          {selectedMeeting.status === "completed" && selectedMeeting.summary && suggestedGoals.length === 0 && canManage && (
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => handleTranscribe(selectedMeeting.id)} disabled={transcribeAndSummarize.isPending}>
                {transcribeAndSummarize.isPending ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>Regenerating…</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>🔄 Regenerate Summary & Goals</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {selectedMeeting.transcript && (
            <View style={styles.card}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 8 }}>Full Transcript</Text>
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>{selectedMeeting.transcript}</Text>
            </View>
          )}
        </ScrollView>
      </MWrapper>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY: New Meeting Form
  // ═══════════════════════════════════════════════════════════════════════════
  if (mainTab === "safety" && safetyScreen === "new") {
    return (
      <MWrapper style={embedded ? { flex: 1 } : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => { resetSafetyForm(); setSafetyScreen("list"); }}>
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Document Meeting</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Meeting Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Type</Text>
          </View>
          <View style={styles.typeRow}>
            {(["safety_toolbox", "daily_goals"] as SafetyMeetingType[]).map((t) => {
              const active = safetyMeetingType === t;
              const label = t === "safety_toolbox" ? "Safety Toolbox Talk" : "Daily Goals Review";
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "15" : colors.surface }]}
                  onPress={() => { setSafetyMeetingType(t); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={{ fontWeight: "700", fontSize: 13, color: active ? colors.primary : colors.muted }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Select Job */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Site</Text>
            {(jobs || []).map((job) => {
              const active = selectedJobId === job.id;
              return (
                <TouchableOpacity
                  key={job.id}
                  style={[styles.jobOption, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "10" : colors.surface }]}
                  onPress={() => { setSelectedJobId(job.id); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, backgroundColor: active ? colors.primary : "transparent", marginRight: 10, alignItems: "center", justifyContent: "center" }}>
                    {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: active ? colors.primary : colors.foreground }}>{job.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Select Topic (for safety toolbox) */}
          {safetyMeetingType === "safety_toolbox" && topics && topics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select a Safety Topic (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {topics.map((topic) => (
                  <TouchableOpacity
                    key={topic.id}
                    style={[styles.topicCard, { width: 200, marginRight: 10, borderColor: selectedTopicId === topic.id ? colors.primary : colors.border }]}
                    onPress={() => selectTopic(topic)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={2}>{topic.title}</Text>
                    {topic.content && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 16 }} numberOfLines={3}>{topic.content}</Text>}
                    {topic.category && <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary, marginTop: 4, textTransform: "uppercase" }}>{topic.category.replace("_", " ")}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Title</Text>
            <TextInput
              style={styles.input}
              value={safetyTitle}
              onChangeText={setSafetyTitle}
              placeholder={safetyMeetingType === "safety_toolbox" ? "e.g., Fall Protection Awareness" : "e.g., Daily Goals Review — March 22"}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Notes</Text>
            <TextInput
              style={styles.textArea}
              value={safetyNotes}
              onChangeText={setSafetyNotes}
              placeholder="What was discussed? Key takeaways, action items..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={5}
            />
          </View>

          {/* Attendees */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attendees</Text>
            <TextInput
              style={styles.input}
              value={attendees}
              onChangeText={setAttendees}
              placeholder="Names of attendees (comma separated)"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>Crew Count:</Text>
              <TextInput
                style={[styles.input, { width: 60, textAlign: "center" }]}
                value={attendeeCount}
                onChangeText={setAttendeeCount}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Photo — only for safety toolbox talks */}
          {safetyMeetingType === "safety_toolbox" && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Photo (optional)</Text>
              </View>
              {photo && (
                <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                  <Image source={{ uri: photo.uri }} style={{ width: "100%" as any, height: 180, borderRadius: 10 }} />
                  <TouchableOpacity onPress={() => setPhoto(null)} style={{ position: "absolute", top: 8, right: 28, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 }}>
                    <IconSymbol name="xmark" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                  <IconSymbol name="camera.fill" size={18} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
                  <IconSymbol name="photo.fill" size={18} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSafetySubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Submit Meeting Record</Text>}
          </TouchableOpacity>
        </ScrollView>
      </MWrapper>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY: Topics Management
  // ═══════════════════════════════════════════════════════════════════════════
  if (mainTab === "safety" && safetyScreen === "topics" && canManageTopics) {
    return (
      <MWrapper style={embedded ? { flex: 1 } : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => setSafetyScreen("list")}>
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Safety Topics</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Post New Topic</Text>
            <TextInput
              style={[styles.input, { marginBottom: 10 }]}
              value={newTopicTitle}
              onChangeText={setNewTopicTitle}
              placeholder="Topic title"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
            <TextInput
              style={[styles.textArea, { marginBottom: 10 }]}
              value={newTopicContent}
              onChangeText={setNewTopicContent}
              placeholder="Talking points, key safety reminders..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
            />
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {TOPIC_CATEGORIES.map((cat) => {
                const active = newTopicCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "15" : colors.surface, marginRight: 8 }}
                    onPress={() => setNewTopicCategory(cat)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: active ? colors.primary : colors.muted }}>{cat.replace("_", " ")}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.submitBtn, { marginHorizontal: 0 }, addingTopic && { opacity: 0.6 }]}
              onPress={handleAddTopic}
              disabled={addingTopic || !newTopicTitle.trim()}
            >
              {addingTopic ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Post Topic</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Topics ({(topics || []).length})</Text>
          </View>
          {(topics || []).map((topic) => (
            <View key={topic.id} style={[styles.topicCard, { marginHorizontal: 20 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, flex: 1 }}>{topic.title}</Text>
                <TouchableOpacity onPress={() => handleDeleteTopic(topic.id)} style={{ padding: 4 }}>
                  <IconSymbol name="trash.fill" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
              {topic.content && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 16 }}>{topic.content}</Text>}
              {topic.category && <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary, marginTop: 4, textTransform: "uppercase" }}>{topic.category.replace("_", " ")}</Text>}
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>Posted {formatShortDate(topic.createdAt)}</Text>
            </View>
          ))}
          {(!topics || topics.length === 0) && (
            <Text style={{ textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: 40 }}>No safety topics yet. Post one above for your foremen.</Text>
          )}
        </ScrollView>
      </MWrapper>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN VIEW — Tabbed: Management | Safety & Huddles
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <MWrapper style={embedded ? { flex: 1 } : undefined}>
    <ImageBackground source={bg_reports} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>Meetings</Text>
        {/* Reminder bell for management meetings */}
        {mainTab === "management" && canManage && Platform.OS !== "web" && (
          <TouchableOpacity
            style={{ backgroundColor: reminderEnabled ? colors.primary + "22" : colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: reminderEnabled ? colors.primary : colors.border, flexDirection: "row", alignItems: "center", gap: 4 }}
            onPress={handleToggleReminder}
            disabled={reminderLoading}
          >
            <Text style={{ fontSize: 15 }}>{reminderEnabled ? "🔔" : "🔕"}</Text>
            <Text style={{ fontSize: 12, color: reminderEnabled ? colors.primary : colors.muted, fontWeight: "600" }}>{reminderEnabled ? "On" : "Off"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, mainTab === "management" && styles.tabBtnActive]}
          onPress={() => { setMainTab("management"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.tabBtnText, mainTab === "management" && styles.tabBtnTextActive]}>Management</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, mainTab === "safety" && styles.tabBtnActive]}
          onPress={() => { setMainTab("safety"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.tabBtnText, mainTab === "safety" && styles.tabBtnTextActive]}>Safety & Huddles</Text>
        </TouchableOpacity>
      </View>

      {/* ─── MANAGEMENT TAB CONTENT ─────────────────────────────────────────── */}
      {mainTab === "management" && (
        <>
          {/* + New button */}
          {canManage && (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, marginBottom: 8 }}>
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                onPress={() => setShowNewMeeting(true)}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ New Meeting</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* New Meeting Modal */}
          <Modal visible={showNewMeeting} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewMeeting(false)}>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Schedule Meeting</Text>
                <TouchableOpacity onPress={() => { setShowNewMeeting(false); setNewTitle(""); setUseAutoTitle(true); }}>
                  <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 }]}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Auto-title</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{getAutoTitle()}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: useAutoTitle ? colors.primary : colors.border, borderRadius: 14, width: 48, height: 28, justifyContent: "center", paddingHorizontal: 3 }}
                    onPress={() => setUseAutoTitle(!useAutoTitle)}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignSelf: useAutoTitle ? "flex-end" : "flex-start" }} />
                  </TouchableOpacity>
                </View>
                {!useAutoTitle && (
                  <>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Meeting Title</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Friday Management Meeting"
                      placeholderTextColor={colors.muted}
                      value={newTitle}
                      onChangeText={setNewTitle}
                      autoFocus
                      returnKeyType="done"
                    />
                  </>
                )}
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16, lineHeight: 18 }}>
                  After scheduling, tap the meeting to open it and start recording. All attendees should gather around the device.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, createMeeting.isPending && { opacity: 0.7 }]}
                  onPress={handleCreateMeeting}
                  disabled={createMeeting.isPending}
                >
                  {createMeeting.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Schedule & Open Meeting</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.outlineBtn, { marginTop: 10 }]}
                  onPress={async () => {
                    const title = useAutoTitle ? getAutoTitle() : newTitle.trim();
                    if (!title) { Alert.alert("Title Required", "Please enter a title or use auto-title."); return; }
                    const result = await createMeeting.mutateAsync({ title, createdBy: employee?.id || 0 });
                    setTimeout(() => handleStartRecording(result.id), 400);
                  }}
                  disabled={createMeeting.isPending}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>🎙 Start Recording Now</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </Modal>

          {mgmtLoading && !cachedMeetings ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={effectiveMeetings}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => { setSelectedMeetingId(item.id); setMgmtScreen("detail"); setSuggestedGoals([]); }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{item.title}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                        {formatDate(item.createdAt)}
                        {item.startedAt && item.endedAt ? ` · ${formatDuration(item.startedAt, item.endedAt)}` : ""}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: STATUS_COLORS[item.status] + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLORS[item.status] }}>{STATUS_LABELS[item.status]}</Text>
                    </View>
                  </View>
                  {item.summary && (
                    <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 18 }} numberOfLines={2}>{item.summary}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", padding: 40 }}>
                  <Text style={{ fontSize: 40 }}>📅</Text>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>No meetings yet</Text>
                  <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                    Tap "+ New Meeting" to schedule your first Friday management meeting.
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 32 }}
              onRefresh={refetchMgmt}
              refreshing={mgmtLoading}
            />
          )}
        </>
      )}

      {/* ─── SAFETY & HUDDLES TAB CONTENT ───────────────────────────────────── */}
      {mainTab === "safety" && (
        <>
          {/* Action buttons */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, marginBottom: 8, gap: 8 }}>
            {canManageTopics && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setSafetyScreen("topics")}
              >
                <IconSymbol name="list.bullet" size={16} color={colors.primary} />
                <Text style={{ fontWeight: "700", fontSize: 13, color: colors.primary }}>Topics</Text>
              </TouchableOpacity>
            )}
            {canDocument && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => setSafetyScreen("new")}
              >
                <IconSymbol name="plus" size={16} color="#fff" />
                <Text style={{ fontWeight: "700", fontSize: 13, color: "#fff" }}>New</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Weekly Compliance Cards */}
          <View style={styles.complianceRow}>
            <View style={[styles.complianceCard, {
              borderColor: weeklyStats.safetyCount >= weeklyStats.safetyTarget ? colors.success : colors.warning,
              backgroundColor: (weeklyStats.safetyCount >= weeklyStats.safetyTarget ? colors.success : colors.warning) + "10" }]}>
              <Text style={[styles.complianceCount, { color: weeklyStats.safetyCount >= weeklyStats.safetyTarget ? colors.success : colors.warning }]}>
                {weeklyStats.safetyCount}/{weeklyStats.safetyTarget}
              </Text>
              <Text style={[styles.complianceLabel, { color: colors.foreground }]}>Safety Talks</Text>
              <Text style={[styles.complianceTarget, { color: colors.muted }]}>3x per week required</Text>
            </View>
            <View style={[styles.complianceCard, {
              borderColor: weeklyStats.goalsCount >= weeklyStats.goalsTarget ? colors.success : colors.warning,
              backgroundColor: (weeklyStats.goalsCount >= weeklyStats.goalsTarget ? colors.success : colors.warning) + "10" }]}>
              <Text style={[styles.complianceCount, { color: weeklyStats.goalsCount >= weeklyStats.goalsTarget ? colors.success : colors.warning }]}>
                {weeklyStats.goalsCount}/{weeklyStats.goalsTarget}
              </Text>
              <Text style={[styles.complianceLabel, { color: colors.foreground }]}>Goals Reviews</Text>
              <Text style={[styles.complianceTarget, { color: colors.muted }]}>Daily required (M-F)</Text>
            </View>
          </View>

          {/* Available Topics (for foreman) */}
          {isForeman && topics && topics.length > 0 && (
            <>
              <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Today's Topics</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16, marginBottom: 16 }}>
                {topics.map((topic) => (
                  <TouchableOpacity
                    key={topic.id}
                    style={[styles.topicCard, { width: 200, marginRight: 10 }]}
                    onPress={() => selectTopic(topic)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={2}>{topic.title}</Text>
                    {topic.content && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 16 }} numberOfLines={2}>{topic.content}</Text>}
                    {topic.category && <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary, marginTop: 4, textTransform: "uppercase" }}>{topic.category.replace("_", " ")}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Recent Safety Meetings */}
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Recent Meetings</Text>
          </View>

          <FlatList
            data={allSafetyMeetings || []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: 40 }}>No safety meetings documented yet.</Text>}
            renderItem={({ item }) => {
              const isSafety = item.meetingType === "safety_toolbox";
              return (
                <View style={styles.meetingCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <View style={[styles.meetingBadge, { backgroundColor: isSafety ? "#F59E0B" : colors.primary }]}>
                      <Text style={styles.meetingBadgeText}>{isSafety ? "SAFETY" : "GOALS"}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, flex: 1 }} numberOfLines={1}>{item.title}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {formatShortDate(item.conductedAt)} at {formatTime12(item.conductedAt)} · {item.attendeeCount || 0} attendees
                  </Text>
                  {item.attendees && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Attendees: {item.attendees}</Text>
                  )}
                  {item.notes && <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 6, lineHeight: 18 }} numberOfLines={4}>{item.notes}</Text>}
                  {item.photoUrl && (
                    <Image source={{ uri: item.photoUrl }} style={{ width: "100%" as any, height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                  )}
                </View>
              );
            }}
          />
        </>
      )}
    </ImageBackground>
    </MWrapper>
  );
}
