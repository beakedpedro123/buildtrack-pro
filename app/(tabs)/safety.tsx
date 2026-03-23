import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Screen = "list" | "new" | "topics";
type MeetingType = "safety_toolbox" | "daily_goals";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(d: string | Date) {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

export default function SafetyScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();

  const [screen, setScreen] = useState<Screen>("list");
  const [meetingType, setMeetingType] = useState<MeetingType>("safety_toolbox");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("1");
  const [photo, setPhoto] = useState<{ uri: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Topic management (owner/secretary/logistics)
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicContent, setNewTopicContent] = useState("");
  const [newTopicCategory, setNewTopicCategory] = useState("general");
  const [addingTopic, setAddingTopic] = useState(false);

  const isManagement = employee?.role === "owner" || employee?.role === "secretary" || employee?.role === "logistics";
  const isForeman = employee?.role === "foreman";
  const canDocument = isForeman || isManagement;

  const { data: jobs } = trpc.jobs.listActive.useQuery();
  const { data: topics } = trpc.safetyTopics.list.useQuery({ activeOnly: true });
  const { data: allMeetings } = trpc.safetyMeetings.list.useQuery({ limit: 50 });

  // Weekly compliance
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);
  const { data: weekMeetings } = trpc.safetyMeetings.forWeek.useQuery({
    startDate: weekStart.toISOString(),
    endDate: weekEnd.toISOString(),
  });

  const weeklyStats = useMemo(() => {
    if (!weekMeetings) return { safetyCount: 0, goalsCount: 0, safetyTarget: 3, goalsTarget: 5 };
    const safetyCount = weekMeetings.filter(m => m.meetingType === "safety_toolbox").length;
    const goalsCount = weekMeetings.filter(m => m.meetingType === "daily_goals").length;
    return { safetyCount, goalsCount, safetyTarget: 3, goalsTarget: 5 };
  }, [weekMeetings]);

  const createMeeting = trpc.safetyMeetings.create.useMutation();
  const createTopic = trpc.safetyTopics.create.useMutation();
  const deleteTopic = trpc.safetyTopics.delete.useMutation();

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

  const handleSubmit = async () => {
    if (!selectedJobId || !employee) { Alert.alert("Missing Info", "Please select a job."); return; }
    if (!title.trim()) { Alert.alert("Missing Title", "Please enter a meeting title or select a topic."); return; }
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (photo) {
        const url = await uploadPhotoFile(photo.uri);
        if (url) photoUrl = url;
      }
      await createMeeting.mutateAsync({
        topicId: selectedTopicId || undefined,
        jobId: selectedJobId,
        meetingType,
        title: title.trim(),
        notes: notes.trim() || undefined,
        attendees: attendees.trim() || undefined,
        attendeeCount: parseInt(attendeeCount) || 1,
        photoUrl,
        conductedBy: employee.id,
        conductedAt: new Date().toISOString(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      utils.safetyMeetings.list.invalidate();
      utils.safetyMeetings.forWeek.invalidate();
      resetForm();
      setScreen("list");
      Alert.alert("Meeting Documented", `Your ${meetingType === "safety_toolbox" ? "safety toolbox talk" : "daily goals meeting"} has been recorded.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save meeting.");
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setSelectedJobId(null);
    setSelectedTopicId(null);
    setTitle("");
    setNotes("");
    setAttendees("");
    setAttendeeCount("1");
    setPhoto(null);
    setMeetingType("safety_toolbox");
  };

  const handleAddTopic = async () => {
    if (!newTopicTitle.trim() || !employee) return;
    setAddingTopic(true);
    try {
      await createTopic.mutateAsync({
        title: newTopicTitle.trim(),
        content: newTopicContent.trim() || undefined,
        category: newTopicCategory,
        requestingEmployeeId: employee.id,
      });
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
    setTitle(topic.title);
    if (topic.content) setNotes(topic.content);
    setScreen("new");
  };

  const TOPIC_CATEGORIES = ["general", "fall_protection", "electrical", "excavation", "scaffolding", "ppe", "fire", "chemical", "equipment", "heat_stress"];

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    actionRow: { flexDirection: "row", gap: 8 },
    actionBtn: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4 },
    actionBtnText: { fontWeight: "700", fontSize: 13 },
    // Compliance cards
    complianceRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 16 },
    complianceCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1 },
    complianceCount: { fontSize: 28, fontWeight: "800" },
    complianceLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
    complianceTarget: { fontSize: 10, marginTop: 4 },
    // Meeting card
    meetingCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
    meetingHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    meetingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 8 },
    meetingBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
    meetingTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground, flex: 1 },
    meetingMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    meetingNotes: { fontSize: 13, color: colors.foreground, marginTop: 6, lineHeight: 18 },
    meetingPhoto: { width: "100%", height: 160, borderRadius: 8, marginTop: 8 },
    // Form
    section: { paddingHorizontal: 20, paddingTop: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 },
    jobOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginBottom: 8, flexDirection: "row", alignItems: "center" },
    topicCard: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 8 },
    topicTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    topicContent: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 16 },
    topicCategory: { fontSize: 10, fontWeight: "600", color: colors.primary, marginTop: 4, textTransform: "uppercase" },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface },
    textArea: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface, minHeight: 100, textAlignVertical: "top" },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginHorizontal: 20, marginVertical: 20 },
    submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    photoRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 8 },
    photoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
    photoBtnText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    typeRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 16 },
    typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
    typeBtnText: { fontWeight: "700", fontSize: 13 },
    emptyText: { textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: 40 },
  });

  // ─── NEW MEETING FORM ───
  if (screen === "new") {
    return (
      <ScreenContainer>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => { resetForm(); setScreen("list"); }}>
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
            {(["safety_toolbox", "daily_goals"] as MeetingType[]).map((t) => {
              const active = meetingType === t;
              const label = t === "safety_toolbox" ? "Safety Toolbox Talk" : "Daily Goals Review";
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "15" : colors.surface }]}
                  onPress={() => { setMeetingType(t); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.typeBtnText, { color: active ? colors.primary : colors.muted }]}>{label}</Text>
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
          {meetingType === "safety_toolbox" && topics && topics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select a Safety Topic (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {topics.map((topic) => (
                  <TouchableOpacity
                    key={topic.id}
                    style={[styles.topicCard, { width: 200, marginRight: 10, borderColor: selectedTopicId === topic.id ? colors.primary : colors.border }]}
                    onPress={() => selectTopic(topic)}
                  >
                    <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
                    {topic.content && <Text style={styles.topicContent} numberOfLines={3}>{topic.content}</Text>}
                    {topic.category && <Text style={styles.topicCategory}>{topic.category.replace("_", " ")}</Text>}
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
              value={title}
              onChangeText={setTitle}
              placeholder={meetingType === "safety_toolbox" ? "e.g., Fall Protection Awareness" : "e.g., Daily Goals Review — March 22"}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Notes</Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
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

          {/* Photo */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photo (optional)</Text>
          </View>
          {photo && (
            <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
              <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 180, borderRadius: 10 }} />
              <TouchableOpacity onPress={() => setPhoto(null)} style={{ position: "absolute", top: 8, right: 28, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 }}>
                <IconSymbol name="xmark" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <IconSymbol name="camera.fill" size={18} color={colors.primary} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
              <IconSymbol name="photo.fill" size={18} color={colors.primary} />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Meeting Record</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ─── TOPICS MANAGEMENT (management only) ───
  if (screen === "topics" && isManagement) {
    return (
      <ScreenContainer>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => setScreen("list")}>
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Safety Topics</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Add new topic */}
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
              {addingTopic ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Post Topic</Text>}
            </TouchableOpacity>
          </View>

          {/* Existing topics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Topics ({(topics || []).length})</Text>
          </View>
          {(topics || []).map((topic) => (
            <View key={topic.id} style={[styles.topicCard, { marginHorizontal: 20 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={[styles.topicTitle, { flex: 1 }]}>{topic.title}</Text>
                <TouchableOpacity onPress={() => handleDeleteTopic(topic.id)} style={{ padding: 4 }}>
                  <IconSymbol name="trash.fill" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
              {topic.content && <Text style={styles.topicContent}>{topic.content}</Text>}
              {topic.category && <Text style={styles.topicCategory}>{topic.category.replace("_", " ")}</Text>}
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>Posted {formatDate(topic.createdAt)}</Text>
            </View>
          ))}
          {(!topics || topics.length === 0) && (
            <Text style={styles.emptyText}>No safety topics yet. Post one above for your foremen.</Text>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ─── MAIN LIST VIEW ───
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Safety</Text>
        <View style={styles.actionRow}>
          {isManagement && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setScreen("topics")}
            >
              <IconSymbol name="list.bullet" size={16} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>Topics</Text>
            </TouchableOpacity>
          )}
          {canDocument && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setScreen("new")}
            >
              <IconSymbol name="plus" size={16} color="#fff" />
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Weekly Compliance Cards */}
      <View style={styles.complianceRow}>
        <View style={[styles.complianceCard, {
          borderColor: weeklyStats.safetyCount >= weeklyStats.safetyTarget ? colors.success : colors.warning,
          backgroundColor: (weeklyStats.safetyCount >= weeklyStats.safetyTarget ? colors.success : colors.warning) + "10",
        }]}>
          <Text style={[styles.complianceCount, { color: weeklyStats.safetyCount >= weeklyStats.safetyTarget ? colors.success : colors.warning }]}>
            {weeklyStats.safetyCount}/{weeklyStats.safetyTarget}
          </Text>
          <Text style={[styles.complianceLabel, { color: colors.foreground }]}>Safety Talks</Text>
          <Text style={[styles.complianceTarget, { color: colors.muted }]}>3x per week required</Text>
        </View>
        <View style={[styles.complianceCard, {
          borderColor: weeklyStats.goalsCount >= weeklyStats.goalsTarget ? colors.success : colors.warning,
          backgroundColor: (weeklyStats.goalsCount >= weeklyStats.goalsTarget ? colors.success : colors.warning) + "10",
        }]}>
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
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Today's Topics</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 20, marginBottom: 16 }}>
            {topics.map((topic) => (
              <TouchableOpacity
                key={topic.id}
                style={[styles.topicCard, { width: 200, marginRight: 10 }]}
                onPress={() => selectTopic(topic)}
              >
                <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
                {topic.content && <Text style={styles.topicContent} numberOfLines={2}>{topic.content}</Text>}
                {topic.category && <Text style={styles.topicCategory}>{topic.category.replace("_", " ")}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Recent Meetings */}
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Recent Meetings</Text>
      </View>

      <FlatList
        data={allMeetings || []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.emptyText}>No safety meetings documented yet.</Text>}
        renderItem={({ item }) => {
          const isSafety = item.meetingType === "safety_toolbox";
          return (
            <View style={styles.meetingCard}>
              <View style={styles.meetingHeader}>
                <View style={[styles.meetingBadge, { backgroundColor: isSafety ? "#F59E0B" : colors.primary }]}>
                  <Text style={styles.meetingBadgeText}>{isSafety ? "SAFETY" : "GOALS"}</Text>
                </View>
                <Text style={styles.meetingTitle} numberOfLines={1}>{item.title}</Text>
              </View>
              <Text style={styles.meetingMeta}>
                {formatDate(item.conductedAt)} at {formatTime(item.conductedAt)} · {item.attendeeCount || 0} attendees
              </Text>
              {item.attendees && (
                <Text style={[styles.meetingMeta, { marginTop: 2 }]}>Attendees: {item.attendees}</Text>
              )}
              {item.notes && <Text style={styles.meetingNotes} numberOfLines={4}>{item.notes}</Text>}
              {item.photoUrl && (
                <Image source={{ uri: item.photoUrl }} style={styles.meetingPhoto} resizeMode="cover" />
              )}
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}
