/**
 * PivotChat — Floating AI assistant for BuildTrack Pro mobile app
 *
 * Role-based access:
 *   owner / logistics  → Full access: voice, files, URLs, business context, cross-tab actions
 *   secretary          → Full access: voice, files, URLs, payroll/HR focus
 *   foreman            → Voice + text only, field-focused responses
 *   laborer            → No access (component renders null)
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

interface Attachment {
  url: string;
  type: "image" | "pdf" | "document" | "spreadsheet" | "url";
  name: string;
}

type Role = "owner" | "secretary" | "logistics" | "foreman" | "laborer";

// ─── Role access matrix ───────────────────────────────────────────────────────

const ROLE_ACCESS: Record<Role, {
  canUseChat: boolean;
  canUseVoice: boolean;
  canAttachFiles: boolean;
  label: string;
  placeholder: string;
  suggestions: string[];
}> = {
  owner: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "AI Business Assistant",
    placeholder: "Ask Pivot anything...",
    suggestions: [
      "Analyze my labor costs this week",
      "Help me create a KPI",
      "Draft a safety talk",
      "Create a goal for the team",
    ],
  },
  logistics: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "AI Business Assistant",
    placeholder: "Ask Pivot anything...",
    suggestions: [
      "What jobs are active?",
      "Help me schedule crew",
      "Create a team goal",
    ],
  },
  secretary: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "Office Assistant",
    placeholder: "Ask about payroll, hours, reports...",
    suggestions: [
      "Summarize payroll this week",
      "Who has the most hours?",
      "Flag any overtime",
      "Generate a payroll summary",
    ],
  },
  foreman: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: false,
    label: "Field Assistant",
    placeholder: "Ask about safety, tasks, techniques...",
    suggestions: [
      "Safety tips for framing",
      "How do I assign tasks?",
      "Best practices for steel erection",
    ],
  },
  laborer: {
    canUseChat: false,
    canUseVoice: false,
    canAttachFiles: false,
    label: "",
    placeholder: "",
    suggestions: [],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(type: Attachment["type"]): string {
  switch (type) {
    case "image": return "🖼️";
    case "pdf": return "📄";
    case "document": return "📝";
    case "spreadsheet": return "📊";
    case "url": return "🔗";
    default: return "📎";
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PivotChat() {
  const { employee } = useAppAuth();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const chatMutation = trpc.pivot.chat.useMutation();
  const transcribeMutation = trpc.pivot.transcribeVoice.useMutation();

  // Audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const role = ((employee as any)?.role || "laborer") as Role;
  const access = ROLE_ACCESS[role] || ROLE_ACCESS.laborer;

  // Request mic permission on mount for eligible roles
  useEffect(() => {
    if (!access.canUseVoice) return;
    (async () => {
      await requestRecordingPermissionsAsync();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, [access.canUseVoice]);

  // Greeting when chat opens
  useEffect(() => {
    if (open && messages.length === 0 && access.canUseChat) {
      const hour = new Date().getHours();
      const timeGreet = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      const name = (employee as any)?.name?.split(" ")[0] || "there";
      let greeting = "";
      if (role === "secretary") {
        greeting = `Good ${timeGreet}, ${name}! I'm Pivot, your office assistant.\n\nI can help with payroll, hours, and reports. Tap 🎤 to speak to me.`;
      } else if (role === "foreman") {
        greeting = `Good ${timeGreet}, ${name}! I'm Pivot, your field assistant.\n\nAsk me about safety, construction techniques, or how to use the app. Tap 🎤 to speak.`;
      } else {
        greeting = `Good ${timeGreet}, ${name}! I'm Pivot, your AI business assistant.\n\nI have access to your live business data. Ask me anything, or attach a PDF, image, or Excel file. Tap 🎤 to speak.`;
      }
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, open]);

  // ─── Voice recording ─────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!access.canUseVoice) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("Microphone Access", "Please allow microphone access in Settings to use voice input.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert("Recording Error", "Could not start recording. Please try again.");
    }
  }, [access.canUseVoice, audioRecorder]);

  const stopRecording = useCallback(async () => {
    if (!recorderState.isRecording) return;
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsTranscribing(true);
    try {
      // Upload audio file to server storage
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      formData.append("file", { uri, name: `pivot_voice_${Date.now()}.m4a`, type: "audio/m4a" } as any);
      const uploadRes = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      // Transcribe via server
      const result = await transcribeMutation.mutateAsync({ audioUrl: url });
      if (result.text?.trim()) {
        setInput(result.text.trim());
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Voice Input", "Could not understand the audio. Please try again or type your message.");
      }
    } catch {
      Alert.alert("Transcription Failed", "Could not transcribe your voice. Please type your message.");
    } finally {
      setIsTranscribing(false);
    }
  }, [recorderState.isRecording, audioRecorder, transcribeMutation]);

  // ─── File attachment ──────────────────────────────────────────────────────────

  const pickDocument = async () => {
    if (!access.canAttachFiles) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await uploadAndAddAttachment(asset.uri, asset.name || "document", asset.mimeType || "application/octet-stream");
    } catch {
      Alert.alert("Error", "Could not pick document.");
    }
  };

  const pickImage = async () => {
    if (!access.canAttachFiles) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const name = asset.fileName || `image_${Date.now()}.jpg`;
      await uploadAndAddAttachment(asset.uri, name, asset.mimeType || "image/jpeg");
    } catch {
      Alert.alert("Error", "Could not pick image.");
    }
  };

  const uploadAndAddAttachment = async (uri: string, name: string, mimeType: string) => {
    setUploading(true);
    try {
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      formData.append("file", { uri, name, type: mimeType } as any);
      const res = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      let type: Attachment["type"] = "document";
      if (mimeType.startsWith("image/")) type = "image";
      else if (mimeType === "application/pdf") type = "pdf";
      else if (mimeType.includes("sheet") || mimeType.includes("excel") || name.endsWith(".csv")) type = "spreadsheet";
      setPendingAttachments((prev) => [...prev, { url, type, name }]);
    } catch {
      Alert.alert("Upload Failed", "Could not upload file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────────

  const sendMessage = async (text: string, atts?: Attachment[]) => {
    const attachments = atts || pendingAttachments;
    if ((!text.trim() && !attachments.length) || loading || !employee) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: Message = { role: "user", content: text || "(See attached file)", attachments: attachments.length ? attachments : undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingAttachments([]);
    setLoading(true);
    try {
      const result = await chatMutation.mutateAsync({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        employeeId: (employee as any).id,
        attachments: attachments.length ? attachments : undefined,
        context: { currentPage: "mobile-app" },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: result.message }]);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I had trouble connecting. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Don't render for laborers ────────────────────────────────────────────────

  if (!employee || !access.canUseChat) return null;

  const isRecording = recorderState.isRecording;

  // ─── Styles ───────────────────────────────────────────────────────────────────

  const s = StyleSheet.create({
    fab: {
      position: "absolute",
      bottom: 80,
      right: 16,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "#D4AF37",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
      zIndex: 100,
    },
    fabText: { fontSize: 24 },
    modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    panel: {
      height: "75%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      gap: 10,
    },
    avatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: "#D4AF37",
      alignItems: "center", justifyContent: "center",
    },
    headerTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    headerSub: { fontSize: 11, color: "#D4AF37" },
    messages: { flex: 1, padding: 12 },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: "#D4AF37",
      borderRadius: 16,
      borderBottomRightRadius: 4,
      padding: 10,
      marginBottom: 8,
      maxWidth: "85%",
    },
    userText: { color: "#000", fontSize: 14 },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.background,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      padding: 10,
      marginBottom: 8,
      maxWidth: "85%",
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    aiText: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
    attachmentChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: "#D4AF3722",
      borderWidth: 1,
      borderColor: "#D4AF3744",
      marginBottom: 4,
    },
    attachmentChipText: { fontSize: 11, color: colors.foreground, maxWidth: 120 },
    suggestions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      padding: 10,
    },
    suggestion: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    suggestionText: { fontSize: 11, color: colors.muted },
    pendingAtts: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      paddingHorizontal: 12,
      paddingBottom: 6,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      gap: 8,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    textInput: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 0.5,
      borderColor: isRecording ? "#FF4444" : colors.border,
      maxHeight: 100,
    },
    iconBtn: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: "center", justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: "center", justifyContent: "center",
      backgroundColor: "#D4AF37",
    },
    recordingBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 4,
      backgroundColor: "#FF444422",
    },
    recordingDot: {
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: "#FF4444",
    },
    recordingText: { fontSize: 11, color: "#FF4444" },
  });

  return (
    <>
      {/* Floating Action Button */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => {
          setOpen(true);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        activeOpacity={0.85}
      >
        <Text style={s.fabText}>🤖</Text>
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={s.modal} onPress={() => setOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, justifyContent: "flex-end" }}
          >
            <Pressable style={s.panel} onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={s.header}>
                <View style={s.avatar}>
                  <Text style={{ fontSize: 20 }}>🤖</Text>
                </View>
                <View>
                  <Text style={s.headerTitle}>Pivot</Text>
                  <Text style={s.headerSub}>{access.label}</Text>
                </View>
                <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
                  <Text style={{ fontSize: 11, color: colors.muted }}>Online</Text>
                  <TouchableOpacity onPress={() => setOpen(false)} style={{ marginLeft: 8, padding: 4 }}>
                    <Text style={{ fontSize: 18, color: colors.muted }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Messages */}
              <ScrollView
                ref={scrollRef}
                style={s.messages}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((msg, i) => (
                  <View key={i}>
                    {msg.attachments?.map((att, ai) => (
                      <View key={ai} style={[s.attachmentChip, { alignSelf: msg.role === "user" ? "flex-end" : "flex-start" }]}>
                        <Text>{getFileIcon(att.type)}</Text>
                        <Text style={s.attachmentChipText} numberOfLines={1}>{att.name}</Text>
                      </View>
                    ))}
                    <View style={msg.role === "user" ? s.userBubble : s.aiBubble}>
                      <Text style={msg.role === "user" ? s.userText : s.aiText}>{msg.content}</Text>
                    </View>
                  </View>
                ))}
                {loading && (
                  <View style={s.aiBubble}>
                    <ActivityIndicator size="small" color="#D4AF37" />
                  </View>
                )}
                {isTranscribing && (
                  <View style={[s.userBubble, { backgroundColor: "#D4AF3733" }]}>
                    <Text style={{ color: "#D4AF37", fontSize: 13 }}>🎤 Transcribing your voice...</Text>
                  </View>
                )}
              </ScrollView>

              {/* Suggestions */}
              {messages.length <= 1 && (
                <View style={s.suggestions}>
                  {access.suggestions.slice(0, 3).map((sug) => (
                    <TouchableOpacity key={sug} style={s.suggestion} onPress={() => sendMessage(sug)}>
                      <Text style={s.suggestionText}>{sug}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Pending attachments */}
              {pendingAttachments.length > 0 && (
                <View style={s.pendingAtts}>
                  {pendingAttachments.map((att, i) => (
                    <TouchableOpacity
                      key={i}
                      style={s.attachmentChip}
                      onPress={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Text>{getFileIcon(att.type)}</Text>
                      <Text style={s.attachmentChipText} numberOfLines={1}>{att.name}</Text>
                      <Text style={{ fontSize: 10, color: colors.muted }}>✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Recording banner */}
              {isRecording && (
                <View style={s.recordingBanner}>
                  <View style={s.recordingDot} />
                  <Text style={s.recordingText}>Recording... tap 🔴 to stop</Text>
                </View>
              )}

              {/* Input row */}
              <View style={s.inputRow}>
                {/* File attachment buttons — only for eligible roles */}
                {access.canAttachFiles && (
                  <>
                    <TouchableOpacity style={s.iconBtn} onPress={pickImage} disabled={uploading}>
                      <Text style={{ fontSize: 18 }}>🖼️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={pickDocument} disabled={uploading}>
                      <Text style={{ fontSize: 18 }}>📎</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Text input */}
                <TextInput
                  style={s.textInput}
                  value={input}
                  onChangeText={setInput}
                  placeholder={isRecording ? "Recording..." : access.placeholder}
                  placeholderTextColor={colors.muted}
                  multiline
                  editable={!loading && !isRecording && !isTranscribing}
                  returnKeyType="send"
                  onSubmitEditing={() => sendMessage(input)}
                />

                {/* Voice mic button — only for eligible roles */}
                {access.canUseVoice && (
                  <TouchableOpacity
                    style={[s.iconBtn, isRecording && { backgroundColor: "#FF4444", borderColor: "#FF4444" }]}
                    onPress={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing || loading}
                  >
                    <Text style={{ fontSize: 18 }}>{isTranscribing ? "⏳" : isRecording ? "🔴" : "🎤"}</Text>
                  </TouchableOpacity>
                )}

                {/* Send button */}
                <TouchableOpacity
                  style={[s.sendBtn, (!input.trim() && !pendingAttachments.length) && { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border }]}
                  onPress={() => sendMessage(input)}
                  disabled={(!input.trim() && !pendingAttachments.length) || loading || isRecording}
                >
                  <Text style={{ fontSize: 18, color: (input.trim() || pendingAttachments.length) && !loading ? "#000" : colors.muted }}>↑</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}
