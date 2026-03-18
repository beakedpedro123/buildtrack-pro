import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import {
  isMeetingReminderEnabled,
  toggleMeetingReminder,
} from "@/lib/notifications";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
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

type Screen = "list" | "detail" | "room";

function formatDate(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startedAt: string | Date | null, endedAt: string | Date | null): string {
  if (!startedAt || !endedAt) return "";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#0EA5E9",
  recording: "#EF4444",
  processing: "#F59E0B",
  completed: "#22C55E",
  cancelled: "#9CA3AF",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  recording: "Recording",
  processing: "Processing…",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function MeetingsScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const [screen, setScreen] = useState<Screen>("list");
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [suggestedGoals, setSuggestedGoals] = useState<string[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);

  // Load current reminder state
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
        Alert.alert(
          "Reminder Set",
          "You will receive a notification every Friday at 2:45 PM before the management meeting.",
        );
      } else {
        Alert.alert("Reminder Off", "Friday meeting reminder has been disabled.");
      }
    } catch {
      Alert.alert("Error", "Could not update notification settings.");
    } finally {
      setReminderLoading(false);
    }
  };

  const utils = trpc.useUtils();
  const { data: meetings, isLoading, refetch } = trpc.meetings.list.useQuery();
  const selectedMeeting = meetings?.find((m) => m.id === selectedMeetingId) || null;

  const createMeeting = trpc.meetings.create.useMutation({
    onSuccess: () => { utils.meetings.list.invalidate(); setShowNewMeeting(false); setNewTitle(""); },
  });
  const startRecording = trpc.meetings.startRecording.useMutation({
    onSuccess: () => utils.meetings.list.invalidate(),
  });
  const finishRecording = trpc.meetings.finishRecording.useMutation({
    onSuccess: () => utils.meetings.list.invalidate(),
  });
  const transcribeAndSummarize = trpc.meetings.transcribeAndSummarize.useMutation({
    onSuccess: (data) => {
      utils.meetings.list.invalidate();
      setSuggestedGoals(data.suggestedGoals || []);
    },
  });
  const cancelMeeting = trpc.meetings.cancel.useMutation({
    onSuccess: () => utils.meetings.list.invalidate(),
  });

  // Audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  useEffect(() => {
    (async () => {
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

  const handleStartRecording = async (meetingId: number) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      await startRecording.mutateAsync({ id: meetingId });
      setActiveMeetingId(meetingId);
      startTimer();
      setScreen("room");
    } catch (err) {
      Alert.alert("Recording Error", "Could not start recording. Please check microphone permissions.");
    }
  };

  const handleStopRecording = async () => {
    if (!activeMeetingId) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopTimer();
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("No recording URI");

      // Upload audio to server storage
      const formData = new FormData();
      formData.append("file", { uri, name: `meeting_${activeMeetingId}.m4a`, type: "audio/m4a" } as any);
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";
      const uploadRes = await fetch(`${apiBase}/trpc/meetings.uploadAudio`, {
        method: "POST",
        body: formData,
      });
      let audioUrl = uri; // fallback to local URI
      if (uploadRes.ok) {
        const json = await uploadRes.json();
        audioUrl = json.url || uri;
      }

      await finishRecording.mutateAsync({ id: activeMeetingId, audioUrl });
      setScreen("detail");
      setSelectedMeetingId(activeMeetingId);
      setActiveMeetingId(null);

      // Auto-trigger transcription
      Alert.alert(
        "Recording Saved",
        "Your meeting has been recorded. Tap 'Transcribe & Summarize' to generate the AI summary.",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Transcribe Now",
            onPress: () => handleTranscribe(activeMeetingId),
          },
        ]
      );
    } catch (err) {
      Alert.alert("Error", "Failed to save recording. Please try again.");
    }
  };

  const handleTranscribe = async (meetingId: number) => {
    try {
      await transcribeAndSummarize.mutateAsync({ id: meetingId });
    } catch (err) {
      Alert.alert("Transcription Error", "Could not process the recording. Please try again.");
    }
  };

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    dangerBtn: {
      backgroundColor: colors.error,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    outlineBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
  });

  const canManage = ["owner", "secretary", "logistics", "foreman"].includes(employee?.role || "");

  // ─── Recording Room ───────────────────────────────────────────────────────
  if (screen === "room") {
    const activeMeeting = meetings?.find((m) => m.id === activeMeetingId);
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          {/* Recording Indicator */}
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: colors.error + "22",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.error,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 32 }}>🎙</Text>
            </View>
          </View>

          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            {activeMeeting?.title || "Meeting Recording"}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>Recording in progress</Text>

          <Text
            style={{
              fontSize: 48,
              fontWeight: "800",
              color: colors.error,
              marginTop: 24,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatRecordingTime(recordingSeconds)}
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} />
            <Text style={{ fontSize: 13, color: colors.error, fontWeight: "600" }}>LIVE</Text>
          </View>

          <View style={{ width: "100%", marginTop: 40, gap: 12 }}>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleStopRecording}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>⏹ Stop Recording</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              All participants should be near this device for best audio quality.
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // ─── Meeting Detail ───────────────────────────────────────────────────────
  if (screen === "detail" && selectedMeeting) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Back */}
          <TouchableOpacity
            style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center" }}
            onPress={() => { setScreen("list"); setSuggestedGoals([]); }}
          >
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>← Back to Meetings</Text>
          </TouchableOpacity>

          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>
              {selectedMeeting.title}
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6, alignItems: "center" }}>
              <View
                style={{
                  backgroundColor: STATUS_COLORS[selectedMeeting.status] + "22",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: STATUS_COLORS[selectedMeeting.status] }}>
                  {STATUS_LABELS[selectedMeeting.status]}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {formatDate(selectedMeeting.createdAt)}
              </Text>
              {selectedMeeting.startedAt && selectedMeeting.endedAt && (
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {formatDuration(selectedMeeting.startedAt, selectedMeeting.endedAt)}
                </Text>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          {selectedMeeting.status === "scheduled" && (
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => handleStartRecording(selectedMeeting.id)}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>🎙 Start Recording</Text>
              </TouchableOpacity>
            </View>
          )}

          {selectedMeeting.status === "processing" && (
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => handleTranscribe(selectedMeeting.id)}
                disabled={transcribeAndSummarize.isPending}
              >
                {transcribeAndSummarize.isPending ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Processing…</Text>
                  </View>
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                    🤖 Transcribe & Summarize
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* AI Summary */}
          {selectedMeeting.summary && (
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, marginBottom: 8 }}>
                AI Meeting Summary
              </Text>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22 }}>
                {selectedMeeting.summary}
              </Text>
            </View>
          )}

          {/* Suggested Goals */}
          {suggestedGoals.length > 0 && (
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.warning, marginBottom: 8 }}>
                Suggested Weekly Goals
              </Text>
              {suggestedGoals.map((goal, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: colors.primary }}>•</Text>
                  <Text style={{ fontSize: 14, color: colors.foreground, flex: 1, lineHeight: 20 }}>
                    {goal}
                  </Text>
                </View>
              ))}
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
                Go to the Goals tab to add these as tracked weekly goals.
              </Text>
            </View>
          )}

          {/* Transcript */}
          {selectedMeeting.transcript && (
            <View style={styles.card}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 8 }}>
                Full Transcript
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>
                {selectedMeeting.transcript}
              </Text>
            </View>
          )}

          {selectedMeeting.status === "scheduled" && (
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.error }]}
                onPress={() => {
                  Alert.alert("Cancel Meeting", "Are you sure?", [
                    { text: "No", style: "cancel" },
                    { text: "Yes", style: "destructive", onPress: () => { cancelMeeting.mutate({ id: selectedMeeting.id }); setScreen("list"); } },
                  ]);
                }}
              >
                <Text style={{ color: colors.error, fontWeight: "600" }}>Cancel Meeting</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ─── Meeting List ─────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
        }}
      >
        <View>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>Meetings</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>Friday 3PM management meetings</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {canManage && Platform.OS !== "web" && (
            <TouchableOpacity
              style={{
                backgroundColor: reminderEnabled ? colors.primary + "22" : colors.surface,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: reminderEnabled ? colors.primary : colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
              onPress={handleToggleReminder}
              disabled={reminderLoading}
            >
              <Text style={{ fontSize: 15 }}>{reminderEnabled ? "🔔" : "🔕"}</Text>
              <Text style={{ fontSize: 12, color: reminderEnabled ? colors.primary : colors.muted, fontWeight: "600" }}>
                {reminderEnabled ? "On" : "Off"}
              </Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
              onPress={() => setShowNewMeeting(true)}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* New Meeting Form */}
      {showNewMeeting && (
        <View style={[styles.card, { marginBottom: 16 }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
            Schedule New Meeting
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: colors.background,
              marginBottom: 10,
            }}
          >
            <Text
              style={{ fontSize: 14, color: newTitle ? colors.foreground : colors.muted }}
              onPress={() => {
                Alert.prompt
                  ? Alert.prompt("Meeting Title", "e.g. Friday Management Meeting 3/21", (text) => setNewTitle(text), "plain-text", newTitle)
                  : Alert.alert("Enter Title", "Use the title field", [{ text: "OK" }]);
              }}
            >
              {newTitle || "Tap to enter meeting title…"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }]}
              onPress={() => {
                if (!newTitle.trim()) {
                  Alert.alert("Title Required", "Please enter a meeting title.");
                  return;
                }
                createMeeting.mutate({
                  title: newTitle.trim(),
                  createdBy: employee?.id || 0,
                });
              }}
              disabled={createMeeting.isPending}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {createMeeting.isPending ? "Saving…" : "Schedule"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineBtn, { flex: 1 }]}
              onPress={() => { setShowNewMeeting(false); setNewTitle(""); }}
            >
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={meetings || []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => { setSelectedMeetingId(item.id); setScreen("detail"); setSuggestedGoals([]); }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                    {formatDate(item.createdAt)}
                    {item.startedAt && item.endedAt
                      ? ` · ${formatDuration(item.startedAt, item.endedAt)}`
                      : ""}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: STATUS_COLORS[item.status] + "22",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLORS[item.status] }}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
              </View>
              {item.summary && (
                <Text
                  style={{ fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 18 }}
                  numberOfLines={2}
                >
                  {item.summary}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>📅</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                No meetings yet
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                Schedule your first Friday management meeting to get started.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}
    </ScreenContainer>
  );
}
