/**
 * VoiceGoalCreator — Voice-to-goals component
 * 
 * Flow: Tap → Record voice → Transcribe → Pivot summarizes into goals → Confirm → Push to Goals tab
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";

interface ParsedGoal {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  assigneeName?: string;
}

interface VoiceGoalCreatorProps {
  visible: boolean;
  onClose: () => void;
  onGoalsCreated?: () => void;
}

export function VoiceGoalCreator({ visible, onClose, onGoalsCreated }: VoiceGoalCreatorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();

  const [step, setStep] = useState<"record" | "transcribing" | "review" | "confirming" | "done">("record");
  const [transcript, setTranscript] = useState("");
  const [parsedGoals, setParsedGoals] = useState<ParsedGoal[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [manualText, setManualText] = useState("");

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const transcribeMutation = trpc.pivot.transcribeVoice.useMutation();
  const chatMutation = trpc.pivot.chat.useMutation();
  const createGoal = trpc.goals.create.useMutation();
  const { data: employees } = trpc.employees.list.useQuery();
  const utils = trpc.useUtils();

  const resetState = useCallback(() => {
    setStep("record");
    setTranscript("");
    setParsedGoals([]);
    setIsRecording(false);
    setManualText("");
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("Microphone Access", "Please allow microphone access in Settings.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert("Error", "Could not start recording. Please try again.");
    }
  }, [audioRecorder]);

  const stopRecording = useCallback(async () => {
    if (!recorderState.isRecording) return;
    await audioRecorder.stop();
    setIsRecording(false);
    const uri = audioRecorder.uri;
    if (!uri) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("transcribing");

    try {
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      // iOS records as .m4a (AAC in MP4 container) — use correct MIME type audio/mp4
      formData.append("file", { uri, name: `goal_voice_${Date.now()}.m4a`, type: "audio/mp4" } as any);
      const uploadRes = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();
      const result = await transcribeMutation.mutateAsync({ audioUrl: url });
      if (result.text?.trim()) {
        setTranscript(result.text.trim());
        await parseGoalsFromText(result.text.trim());
      } else {
        Alert.alert("No Speech Detected", "Please try again and speak clearly.");
        setStep("record");
      }
    } catch (err) {
      Alert.alert("Transcription Error", "Could not transcribe your voice. Please try again.");
      setStep("record");
    }
  }, [recorderState.isRecording, audioRecorder, transcribeMutation]);

  const parseGoalsFromText = useCallback(async (text: string) => {
    try {
      const result = await chatMutation.mutateAsync({
        employeeId: employee!.id,
        messages: [{
          role: "user" as const,
          content: `SYSTEM: Parse the following text into individual goals. Return ONLY a JSON array of objects with fields: title (short action item), description (detail), priority (low/medium/high), assigneeName (if mentioned, otherwise null). Text: "${text}"`,
        }],
        context: { currentPage: "goal_creation" },
      });

      // Try to extract JSON from the response
      const responseText = result.message || "";
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const goals = JSON.parse(jsonMatch[0]) as ParsedGoal[];
        setParsedGoals(goals.map((g) => ({
          title: g.title || "Untitled Goal",
          description: g.description || "",
          priority: (["low", "medium", "high"].includes(g.priority) ? g.priority : "medium") as "low" | "medium" | "high",
          assigneeName: g.assigneeName || undefined,
        })));
        setStep("review");
      } else {
        // Fallback: create a single goal from the text
        setParsedGoals([{
          title: text.slice(0, 100),
          description: text,
          priority: "medium",
        }]);
        setStep("review");
      }
    } catch (err) {
      // Fallback: create a single goal
      setParsedGoals([{
        title: text.slice(0, 100),
        description: text,
        priority: "medium",
      }]);
      setStep("review");
    }
  }, [chatMutation, employee]);

  const handleSubmitText = useCallback(async () => {
    if (!manualText.trim()) return;
    setStep("transcribing");
    await parseGoalsFromText(manualText.trim());
  }, [manualText, parseGoalsFromText]);

  const handleConfirmGoals = useCallback(async () => {
    setStep("confirming");
    try {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1);
      const weekOf = monday.toISOString().split("T")[0];

      for (const goal of parsedGoals) {
        // Try to find assignee by name
        let assignedTo: number | undefined;
        if (goal.assigneeName && employees) {
          const match = employees.find((e: any) =>
            e.name.toLowerCase().includes(goal.assigneeName!.toLowerCase()) ||
            goal.assigneeName!.toLowerCase().includes(e.name.toLowerCase().split(" ")[0])
          );
          if (match) assignedTo = match.id;
        }

        await createGoal.mutateAsync({
          title: goal.title,
          description: goal.description || undefined,
          priority: goal.priority,
          assignedTo,
          weekOf,
          createdBy: employee!.id,
        });
      }

      utils.goals.list.invalidate();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("done");
      onGoalsCreated?.();
    } catch (err) {
      Alert.alert("Error", "Failed to create some goals. Please try again.");
      setStep("review");
    }
  }, [parsedGoals, employees, employee, createGoal, utils, onGoalsCreated]);

  const removeGoal = (index: number) => {
    setParsedGoals((prev) => prev.filter((_, i) => i !== index));
  };

  const updateGoalPriority = (index: number, priority: "low" | "medium" | "high") => {
    setParsedGoals((prev) => prev.map((g, i) => i === index ? { ...g, priority } : g));
  };

  const PRIORITY_COLORS: Record<string, string> = {
    low: "#22C55E",
    medium: "#F59E0B",
    high: "#EF4444",
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>
              {step === "done" ? "Goals Created!" : "Create Goals"}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>
                {step === "done" ? "Done" : "Cancel"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Step 1: Record */}
            {step === "record" && (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: "center" }}>
                  Tell Pivot your goals
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 32, lineHeight: 20 }}>
                  Tap the mic and describe the goals you want to create. Pivot will summarize them for your approval.
                </Text>

                {/* Mic Button */}
                <TouchableOpacity
                  style={{
                    width: 100, height: 100, borderRadius: 50,
                    backgroundColor: isRecording ? "#EF4444" : "#D4AF37",
                    alignItems: "center", justifyContent: "center",
                    shadowColor: isRecording ? "#EF4444" : "#D4AF37",
                    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
                    elevation: 8,
                  }}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Text style={{ fontSize: 40 }}>{isRecording ? "⏹" : "🎤"}</Text>
                </TouchableOpacity>

                {isRecording && (
                  <Text style={{ fontSize: 14, color: "#EF4444", marginTop: 16, fontWeight: "600" }}>
                    Recording... tap to stop
                  </Text>
                )}

                {/* Divider */}
                <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 32, width: "100%" }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  <Text style={{ marginHorizontal: 12, color: colors.muted, fontSize: 13 }}>or type your goals</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                </View>

                {/* Text Input */}
                <TextInput
                  style={{
                    width: "100%", minHeight: 100, borderWidth: 1, borderColor: colors.border,
                    borderRadius: 12, padding: 14, fontSize: 15, color: colors.foreground,
                    backgroundColor: colors.surface, textAlignVertical: "top",
                  }}
                  placeholder="Type or paste goals here..."
                  placeholderTextColor={colors.muted}
                  multiline
                  value={manualText}
                  onChangeText={setManualText}
                />
                {manualText.trim().length > 0 && (
                  <TouchableOpacity
                    style={{ backgroundColor: "#D4AF37", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 12, width: "100%" }}
                    onPress={handleSubmitText}
                  >
                    <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Process Goals</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Step 2: Transcribing / Processing */}
            {step === "transcribing" && (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <ActivityIndicator size="large" color="#D4AF37" />
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 20 }}>
                  Pivot is processing your goals...
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>
                  Transcribing and organizing into actionable goals
                </Text>
              </View>
            )}

            {/* Step 3: Review Goals */}
            {step === "review" && (
              <View>
                {transcript ? (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Your recording:</Text>
                    <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>{transcript}</Text>
                  </View>
                ) : null}

                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
                  Pivot found {parsedGoals.length} goal{parsedGoals.length !== 1 ? "s" : ""}:
                </Text>

                {parsedGoals.map((goal, i) => (
                  <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }}>{goal.title}</Text>
                      <TouchableOpacity onPress={() => removeGoal(i)} style={{ padding: 4 }}>
                        <Text style={{ color: colors.error, fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    {goal.description ? (
                      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8, lineHeight: 18 }}>{goal.description}</Text>
                    ) : null}
                    {goal.assigneeName ? (
                      <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 6 }}>Assigned to: {goal.assigneeName}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {(["low", "medium", "high"] as const).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                            backgroundColor: goal.priority === p ? PRIORITY_COLORS[p] + "20" : colors.background,
                            borderWidth: 1, borderColor: goal.priority === p ? PRIORITY_COLORS[p] : colors.border,
                          }}
                          onPress={() => updateGoalPriority(i, p)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "600", color: goal.priority === p ? PRIORITY_COLORS[p] : colors.muted, textTransform: "capitalize" }}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}

                {parsedGoals.length > 0 && (
                  <TouchableOpacity
                    style={{ backgroundColor: "#D4AF37", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 12 }}
                    onPress={handleConfirmGoals}
                  >
                    <Text style={{ color: "#000", fontWeight: "800", fontSize: 16 }}>
                      Approve & Push {parsedGoals.length} Goal{parsedGoals.length !== 1 ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={{ alignItems: "center", marginTop: 12, padding: 12 }}
                  onPress={() => { resetState(); }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>Start Over</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 4: Confirming */}
            {step === "confirming" && (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <ActivityIndicator size="large" color="#D4AF37" />
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 20 }}>
                  Pushing goals...
                </Text>
              </View>
            )}

            {/* Step 5: Done */}
            {step === "done" && (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Text style={{ fontSize: 60, marginBottom: 16 }}>✅</Text>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>
                  Goals Created!
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                  {parsedGoals.length} goal{parsedGoals.length !== 1 ? "s have" : " has"} been pushed to the Goals tab.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: "#D4AF37", borderRadius: 12, padding: 14, alignItems: "center", width: "100%" }}
                  onPress={handleClose}
                >
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
