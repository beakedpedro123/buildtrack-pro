/**
 * PivotChat — Floating AI assistant for BuildTrack Pro mobile app
 *
 * Role-based access:
 *   owner / logistics  → Full access: voice, files, URLs, business context, cross-tab actions
 *   office_manager          → Full access: voice, files, URLs, payroll/HR focus
 *   foreman            → Voice + text only, field-focused responses
 *   laborer            → Text only, goals and safety focused
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Alert,
  Keyboard,
  Dimensions,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
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
import { useLanguage } from "@/lib/language-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

interface Attachment {
  url: string;
  type: "image" | "pdf" | "document" | "spreadsheet" | "url";
  name: string;
}

type Role = "owner" | "office_manager" | "logistics" | "foreman" | "laborer";

// ─── Role access matrix ───────────────────────────────────────────────────────

const ROLE_ACCESS: Record<Role, {
  canUseChat: boolean;
  canUseVoice: boolean;
  canAttachFiles: boolean;
  label: string;
  placeholder: string;
  suggestions: string[];
  suggestionsEs?: string[];
}> = {
  owner: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "AI Business Assistant",
    placeholder: "Ask Pivot anything...",
    suggestions: [
      "Sup Pivot, what's going on today?",
      "Analyze my labor costs this week",
      "Help me create a KPI",
      "Draft a safety talk",
    ],
  },
  logistics: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "AI Business Assistant",
    placeholder: "Ask Pivot anything...",
    suggestions: [
      "Hey Pivot, what's the plan?",
      "What jobs are active?",
      "Help me schedule crew",
    ],
  },
  office_manager: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "Office Assistant",
    placeholder: "Ask about payroll, hours, reports...",
    suggestions: [
      "Sup Pivot, any payroll issues?",
      "Who has the most hours?",
      "Flag any overtime",
    ],
  },
  foreman: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: false,
    label: "Field Assistant",
    placeholder: "Ask about safety, tasks, techniques...",
    suggestions: [
      "Sup Pivot, what are my goals?",
      "Safety tips for framing",
      "Best practices for steel erection",
    ],
  },
  laborer: {
    canUseChat: true,
    canUseVoice: false,
    canAttachFiles: false,
    label: "Team Assistant",
    placeholder: "Ask about your goals, safety, tasks...",
    suggestions: [
      "Sup Pivot, what are my goals?",
      "Safety tips for today",
      "How do I clock in?",
    ],
    suggestionsEs: [
      "¿Qué onda Pivot, cuáles son mis metas?",
      "Consejos de seguridad para hoy",
      "¿Cómo registro mi entrada?",
    ],
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

let msgCounter = 0;
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

// ─── Modern Robot Avatar ─────────────────────────────────────────────────────

function PivotAvatar({ size = 38 }: { size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: "#1a1a2e",
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: "#D4AF37",
      shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
    }}>
      {/* Robot face */}
      <View style={{ alignItems: "center" }}>
        {/* Eyes */}
        <View style={{ flexDirection: "row", gap: size * 0.15, marginBottom: size * 0.04 }}>
          <View style={{
            width: size * 0.18, height: size * 0.12, borderRadius: size * 0.06,
            backgroundColor: "#D4AF37",
            shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8, shadowRadius: 3,
          }} />
          <View style={{
            width: size * 0.18, height: size * 0.12, borderRadius: size * 0.06,
            backgroundColor: "#D4AF37",
            shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8, shadowRadius: 3,
          }} />
        </View>
        {/* Mouth - thin line */}
        <View style={{
          width: size * 0.3, height: size * 0.04, borderRadius: size * 0.02,
          backgroundColor: "#D4AF3788",
        }} />
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PivotChat() {
  const { employee } = useAppAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const chatMutation = trpc.pivot.chat.useMutation();
  const transcribeMutation = trpc.pivot.transcribeVoice.useMutation();

  // Audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const role = ((employee as any)?.role || "laborer") as Role;
  const access = ROLE_ACCESS[role] || ROLE_ACCESS.laborer;
  const { language } = useLanguage();
  const activeSuggestions = (language === "es" && access.suggestionsEs) ? access.suggestionsEs : access.suggestions;

  // Request mic permission on mount for eligible roles
  useEffect(() => {
    if (!access.canUseVoice) return;
    (async () => {
      await requestRecordingPermissionsAsync();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, [access.canUseVoice]);

  // Track keyboard visibility
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // NO auto-greeting — wait for user to say something first
  // When chat opens, just show suggestions. Pivot speaks only when spoken to.

  // Scroll to bottom when new messages arrive or keyboard shows
  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  // Also scroll when keyboard appears so input stays visible
  useEffect(() => {
    if (keyboardVisible && messages.length > 0) scrollToBottom();
  }, [keyboardVisible, messages.length, scrollToBottom]);

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
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      formData.append("file", { uri, name: `pivot_voice_${Date.now()}.m4a`, type: "audio/m4a" } as any);
      const uploadRes = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();
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
    
    const userMsg: Message = {
      id: nextMsgId(),
      role: "user",
      content: text || "(See attached file)",
      attachments: attachments.length ? attachments : undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingAttachments([]);
    setLoading(true);

    // Don't dismiss keyboard on send — let user keep typing follow-ups
    // Keyboard.dismiss();

    try {
      const result = await chatMutation.mutateAsync({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        employeeId: (employee as any).id,
        attachments: attachments.length ? attachments : undefined,
        context: { currentPage: "mobile-app" },
      });
      setMessages((prev) => [...prev, { id: nextMsgId(), role: "assistant", content: result.message }]);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setMessages((prev) => [...prev, { id: nextMsgId(), role: "assistant", content: "Sorry, I had trouble connecting. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Don't render for roles without chat access ──────────────────────────────

  if (!employee || !access.canUseChat) return null;

  const isRecording = recorderState.isRecording;

  // ─── Render message content with inline image support ─────────────────────────

  const renderMessageContent = (content: string, role: "user" | "assistant") => {
    // Parse markdown images: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let partKey = 0;

    while ((match = imageRegex.exec(content)) !== null) {
      // Add text before the image
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push(
            <Text key={partKey++} style={role === "user" ? s2.userText : [s2.aiText, { color: colors.foreground }]}>
              {textBefore}
            </Text>
          );
        }
      }
      // Add the image
      const altText = match[1];
      const imageUrl = match[2];
      parts.push(
        <TouchableOpacity key={partKey++} onPress={() => Linking.openURL(imageUrl)} activeOpacity={0.8}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: 220, height: 220, borderRadius: 12, marginVertical: 8 }}
            contentFit="contain"
            placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
            transition={300}
          />
          {altText ? <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4, textAlign: "center" }}>{altText}</Text> : null}
        </TouchableOpacity>
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last image
    if (lastIndex < content.length) {
      const remaining = content.slice(lastIndex).trim();
      if (remaining) {
        parts.push(
          <Text key={partKey++} style={role === "user" ? s2.userText : [s2.aiText, { color: colors.foreground }]}>
            {remaining}
          </Text>
        );
      }
    }

    // If no images found, just render as plain text
    if (parts.length === 0) {
      return <Text style={role === "user" ? s2.userText : [s2.aiText, { color: colors.foreground }]}>{content}</Text>;
    }

    return <View>{parts}</View>;
  };

  // Inline text styles for renderMessageContent (defined before StyleSheet.create)
  const s2 = {
    userText: { color: "#000", fontSize: 15, lineHeight: 21 } as const,
    aiText: { fontSize: 15, lineHeight: 22 } as const,
  };

  // ─── Render message item for FlatList ────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => (
    <View>
      {item.attachments?.map((att, ai) => (
        <View key={ai} style={[s.attachmentChip, { alignSelf: item.role === "user" ? "flex-end" : "flex-start" }]}>
          <Text>{getFileIcon(att.type)}</Text>
          <Text style={[s.attachmentChipText, { color: colors.foreground }]} numberOfLines={1}>{att.name}</Text>
        </View>
      ))}
      <View style={item.role === "user" ? s.userBubble : [s.aiBubble, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {item.role === "assistant" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <PivotAvatar size={20} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#D4AF37" }}>Pivot</Text>
          </View>
        )}
        {renderMessageContent(item.content, item.role)}
      </View>
    </View>
  );

  // ─── Styles ───────────────────────────────────────────────────────────────────

  const s = StyleSheet.create({
    fab: {
      position: "absolute",
      bottom: 80,
      right: 16,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#1a1a2e",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#D4AF37",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 8,
      zIndex: 100,
      borderWidth: 2,
      borderColor: "#D4AF37",
    },
    modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    panel: {
      flex: 1,
      backgroundColor: colors.surface,
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
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },
    headerSub: { fontSize: 11, color: "#D4AF37", fontWeight: "500" },
    messages: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: "#D4AF37",
      borderRadius: 18,
      borderBottomRightRadius: 4,
      padding: 12,
      marginBottom: 10,
      maxWidth: "82%",
    },
    userText: { color: "#000", fontSize: 15, lineHeight: 21 },
    aiBubble: {
      alignSelf: "flex-start",
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      padding: 12,
      marginBottom: 10,
      maxWidth: "88%",
      borderWidth: 0.5,
    },
    aiText: { fontSize: 15, lineHeight: 22 },
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
    attachmentChipText: { fontSize: 11, maxWidth: 120 },
    welcomeContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    welcomeText: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.foreground,
      marginTop: 16,
      textAlign: "center",
    },
    welcomeSub: {
      fontSize: 14,
      color: colors.muted,
      marginTop: 8,
      textAlign: "center",
      lineHeight: 20,
    },
    suggestions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 12,
    },
    suggestion: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 0.5,
      borderColor: "#D4AF3744",
    },
    suggestionText: { fontSize: 13, color: colors.muted },
    pendingAtts: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      padding: 10,
      paddingBottom: Platform.OS === "ios" ? 28 : 12,
      gap: 8,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    textInput: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10,
      borderWidth: 0.5,
      borderColor: colors.border,
      maxHeight: 100,
      minHeight: 42,
    },
    iconBtn: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: "center", justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    sendBtn: {
      width: 40, height: 40, borderRadius: 20,
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
      {/* Floating Action Button — Modern Robot */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => {
          setOpen(true);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        activeOpacity={0.85}
      >
        <PivotAvatar size={40} />
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal
        visible={open}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: colors.surface }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <View style={[s.panel, { flex: 1, maxHeight: "100%" }]}>
              {/* Header with safe area padding for status bar */}
              <View style={[s.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
                <PivotAvatar size={42} />
                <View>
                  <Text style={s.headerTitle}>Pivot</Text>
                  <Text style={s.headerSub}>{access.label}</Text>
                </View>
                <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
                  <Text style={{ fontSize: 11, color: colors.muted }}>Online</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setOpen(false); }} style={{ marginLeft: 8, padding: 4 }}>
                    <Text style={{ fontSize: 20, color: colors.muted }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Messages or Welcome Screen */}
              {messages.length === 0 ? (
                <View style={s.welcomeContainer}>
                  <PivotAvatar size={72} />
                  <Text style={s.welcomeText}>Hey, I'm Pivot</Text>
                  <Text style={s.welcomeSub}>
                    {role === "owner" ? "Your AI business assistant. Ask me anything about your projects, costs, or team." :
                     role === "office_manager" ? "Your office assistant. I can help with payroll, hours, and reports." :
                     role === "foreman" ? "Your field assistant. Ask about safety, goals, or construction techniques." :
                     "Your team assistant. I can show you your goals and help with questions."}
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  style={s.messages}
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                  removeClippedSubviews={Platform.OS === "android"}
                  maxToRenderPerBatch={10}
                  windowSize={15}
                  ListFooterComponent={
                    <>
                      {loading && (
                        <View style={[s.aiBubble, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <PivotAvatar size={20} />
                            <ActivityIndicator size="small" color="#D4AF37" />
                            <Text style={{ fontSize: 12, color: colors.muted }}>Thinking...</Text>
                          </View>
                        </View>
                      )}
                      {isTranscribing && (
                        <View style={[s.userBubble, { backgroundColor: "#D4AF3733" }]}>
                          <Text style={{ color: "#D4AF37", fontSize: 13 }}>🎤 Transcribing your voice...</Text>
                        </View>
                      )}
                    </>
                  }
                />
              )}

              {/* Suggestions — show when no messages or only 1 exchange */}
              {messages.length <= 2 && (
                <View style={s.suggestions}>
                  {activeSuggestions.map((sug) => (
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
                      <Text style={[s.attachmentChipText, { color: colors.foreground }]} numberOfLines={1}>{att.name}</Text>
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
                  ref={inputRef}
                  style={s.textInput}
                  value={input}
                  onChangeText={setInput}
                  placeholder={isRecording ? "Recording..." : access.placeholder}
                  placeholderTextColor={colors.muted}
                  multiline
                  editable={!loading && !isRecording && !isTranscribing}
                  returnKeyType="default"
                  blurOnSubmit={false}
                  scrollEnabled={true}
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
