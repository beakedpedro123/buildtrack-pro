/**
 * PivotChat — Premium AI assistant for BuildTrack Pro
 *
 * Redesigned with seamless, high-end UI inspired by Apple Intelligence & ChatGPT:
 * - Full-screen modal with smooth slide-up transition
 * - Sleek "P" icon FAB with gold glow ring
 * - Dark premium header with gradient accent
 * - Voice-first design with prominent mic button
 * - Camera button for picture recognition (drawings/sketches)
 * - Quick action chips for construction math
 * - Formatted math result cards
 * - Inline markdown rendering (bold, headers, bullets, code, images)
 *
 * Role-based access:
 *   owner / logistics  → Full access: voice, files, URLs, business context, cross-tab actions
 *   office_manager     → Full access: voice, files, URLs, payroll/HR focus
 *   foreman            → Voice + text + files, field-focused responses
 *   laborer            → Text + files, goals and safety focused
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
  Alert,
  Keyboard,
  Linking,
  StatusBar,
  Animated as RNAnimated,
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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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

// ─── Premium Color Palette ──────────────────────────────────────────────────

const GOLD = "#D4AF37";
const GOLD_DIM = "#D4AF3766";
const GOLD_GLOW = "#D4AF3740";
const DARK_BG = "#0A0A12";
const DARK_SURFACE = "#12121E";
const DARK_CARD = "#1A1A2A";
const DARK_INPUT = "#16162A";
const DARK_BORDER = "#2A2A3E";
const TEXT_PRIMARY = "#F0F0F5";
const TEXT_SECONDARY = "#8888A0";
const ACCENT_GREEN = "#22C55E";
const RECORDING_RED = "#EF4444";

// ─── Role access matrix ───────────────────────────────────────────────────────

const ROLE_ACCESS: Record<Role, {
  canUseChat: boolean;
  canUseVoice: boolean;
  canAttachFiles: boolean;
  label: string;
  labelEs?: string;
  placeholder: string;
  placeholderEs?: string;
  suggestions: string[];
  suggestionsEs?: string[];
  quickActions: { icon: string; label: string; prompt: string }[];
  quickActionsEs?: { icon: string; label: string; prompt: string }[];
}> = {
  owner: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "AI Business Partner",
    placeholder: "Ask Pivot anything...",
    suggestions: [
      "Sup Pivot, what's going on today?",
      "Analyze my labor costs this week",
      "Draft a safety talk for the crew",
      "What jobs need attention?",
    ],
    quickActions: [
      { icon: "architecture", label: "Roof Pitch", prompt: "Help me calculate a roof pitch angle" },
      { icon: "straighten", label: "Rafter", prompt: "Calculate rafter length for me" },
      { icon: "calculate", label: "Compound", prompt: "Help me with a compound angle calculation" },
      { icon: "stairs", label: "Stairs", prompt: "Help me calculate stair stringers" },
    ],
    quickActionsEs: [
      { icon: "architecture", label: "Techo", prompt: "Ayúdame a calcular el ángulo del techo" },
      { icon: "straighten", label: "Viga", prompt: "Calcula la longitud de la viga" },
      { icon: "calculate", label: "Ángulo", prompt: "Ayúdame con un cálculo de ángulo compuesto" },
      { icon: "stairs", label: "Escaleras", prompt: "Ayúdame a calcular las zancas de escalera" },
    ],
  },
  logistics: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "AI Business Partner",
    placeholder: "Ask Pivot anything...",
    suggestions: [
      "Hey Pivot, what's the plan?",
      "What jobs are active?",
      "Help me schedule crew",
    ],
    quickActions: [
      { icon: "architecture", label: "Roof Pitch", prompt: "Help me calculate a roof pitch angle" },
      { icon: "straighten", label: "Rafter", prompt: "Calculate rafter length for me" },
      { icon: "calculate", label: "Compound", prompt: "Help me with a compound angle calculation" },
    ],
  },
  office_manager: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "Office Assistant",
    labelEs: "Asistente de Oficina",
    placeholder: "Ask about payroll, hours, reports...",
    placeholderEs: "Pregunta sobre nómina, horas, reportes...",
    suggestions: [
      "Sup Pivot, any payroll issues?",
      "Who has the most hours?",
      "Flag any overtime this week",
    ],
    suggestionsEs: [
      "¿Qué onda Pivot, hay problemas con la nómina?",
      "¿Quién tiene más horas?",
      "Marca cualquier tiempo extra esta semana",
    ],
    quickActions: [
      { icon: "calculate", label: "Calculate", prompt: "Help me with a calculation" },
    ],
  },
  foreman: {
    canUseChat: true,
    canUseVoice: true,
    canAttachFiles: true,
    label: "Field Assistant",
    labelEs: "Asistente de Campo",
    placeholder: "Ask about safety, tasks, calculations...",
    placeholderEs: "Pregunta sobre seguridad, tareas, cálculos...",
    suggestions: [
      "Sup Pivot, what are my goals?",
      "Safety tips for framing today",
      "Calculate rafter length for 8/12 pitch",
      "Best practices for steel erection",
    ],
    suggestionsEs: [
      "¿Qué onda Pivot, cuáles son mis metas?",
      "Consejos de seguridad para enmarcar hoy",
      "Calcula la longitud de viga para techo 8/12",
      "Mejores prácticas para montaje de acero",
    ],
    quickActions: [
      { icon: "architecture", label: "Roof Pitch", prompt: "Help me calculate a roof pitch angle" },
      { icon: "straighten", label: "Rafter", prompt: "Calculate rafter length for me" },
      { icon: "calculate", label: "Compound", prompt: "Help me with a compound angle calculation" },
      { icon: "stairs", label: "Stairs", prompt: "Help me calculate stair stringers" },
    ],
    quickActionsEs: [
      { icon: "architecture", label: "Techo", prompt: "Ayúdame a calcular el ángulo del techo" },
      { icon: "straighten", label: "Viga", prompt: "Calcula la longitud de la viga" },
      { icon: "calculate", label: "Ángulo", prompt: "Ayúdame con un cálculo de ángulo compuesto" },
      { icon: "stairs", label: "Escaleras", prompt: "Ayúdame a calcular las zancas de escalera" },
    ],
  },
  laborer: {
    canUseChat: true,
    canUseVoice: false,
    canAttachFiles: true,
    label: "Team Assistant",
    labelEs: "Asistente de Equipo",
    placeholder: "Ask about your goals, safety, tasks...",
    placeholderEs: "Pregunta sobre tus metas, seguridad, tareas...",
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
    quickActions: [
      { icon: "calculate", label: "Math", prompt: "Help me with a calculation" },
    ],
    quickActionsEs: [
      { icon: "calculate", label: "Cálculo", prompt: "Ayúdame con un cálculo" },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileIconName(type: Attachment["type"]): "image" | "picture-as-pdf" | "description" | "table-chart" | "link" | "attach-file" {
  switch (type) {
    case "image": return "image";
    case "pdf": return "picture-as-pdf";
    case "document": return "description";
    case "spreadsheet": return "table-chart";
    case "url": return "link";
    default: return "attach-file";
  }
}

let msgCounter = 0;
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

// ─── Pivot Avatar ─────────────────────────────────────────────────────────────

const PIVOT_ICON_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663449841780/dNJxctHZxj6wCg3jq4j4kh/pivot-icon_83666431.png";

function PivotAvatar({ size = 38 }: { size?: number }) {
  return (
    <Image
      source={{ uri: PIVOT_ICON_URL }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: GOLD,
      }}
      contentFit="cover"
    />
  );
}

// ─── Typing Dots Animation ────────────────────────────────────────────────────

function TypingDots() {
  const dot1 = useRef(new RNAnimated.Value(0.3)).current;
  const dot2 = useRef(new RNAnimated.Value(0.3)).current;
  const dot3 = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: RNAnimated.Value, delay: number) => {
      return RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(delay),
          RNAnimated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          RNAnimated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    };
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <RNAnimated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: GOLD,
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

// ─── Voice Waveform Animation ─────────────────────────────────────────────────

function VoiceWaveform() {
  const bars = useRef(Array.from({ length: 5 }, () => new RNAnimated.Value(0.3))).current;

  useEffect(() => {
    const animations = bars.map((bar, i) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(i * 80),
          RNAnimated.timing(bar, { toValue: 1, duration: 300, useNativeDriver: true }),
          RNAnimated.timing(bar, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [bars]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 24 }}>
      {bars.map((bar, i) => (
        <RNAnimated.View
          key={i}
          style={{
            width: 3,
            height: 20,
            borderRadius: 1.5,
            backgroundColor: RECORDING_RED,
            transform: [{ scaleY: bar }],
          }}
        />
      ))}
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const pendingVoiceRef = useRef<string | null>(null);
  const fabPulse = useRef(new RNAnimated.Value(1)).current;

  const chatMutation = trpc.pivot.chat.useMutation();
  const transcribeMutation = trpc.pivot.transcribeVoice.useMutation();

  // Audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const role = ((employee as any)?.role || "laborer") as Role;
  const access = ROLE_ACCESS[role] || ROLE_ACCESS.laborer;
  const { language } = useLanguage();
  const activeSuggestions = (language === "es" && access.suggestionsEs) ? access.suggestionsEs : access.suggestions;
  const activeQuickActions = (language === "es" && access.quickActionsEs) ? access.quickActionsEs : access.quickActions;
  const activePlaceholder = (language === "es" && access.placeholderEs) ? access.placeholderEs : access.placeholder;
  const activeLabel = (language === "es" && access.labelEs) ? access.labelEs : access.label;

  // FAB subtle pulse animation
  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(fabPulse, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
        RNAnimated.timing(fabPulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [fabPulse]);

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

  // Scroll to bottom when new messages arrive or keyboard shows
  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

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
    } catch (err: any) {
      console.warn("Recording start error:", err?.message || err);
      Alert.alert("Recording Error", "Could not start recording. Please close and reopen Pivot, then try again.");
    }
  }, [access.canUseVoice, audioRecorder]);

  const stopRecording = useCallback(async () => {
    if (!recorderState.isRecording) return;
    try {
      await audioRecorder.stop();
    } catch (err: any) {
      console.warn("Recording stop error:", err?.message || err);
    }
    const uri = audioRecorder.uri;
    if (!uri) {
      Alert.alert("Recording Error", "No audio was captured. Please try recording again.");
      return;
    }
    const durationMs = recorderState.durationMillis || 0;
    if (durationMs < 800) {
      Alert.alert("Recording Too Short", "Please hold the mic button longer and speak clearly.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsTranscribing(true);
    try {
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      const ext = Platform.OS === "ios" ? "m4a" : "mp4";
      const mimeType = "audio/mp4";
      formData.append("file", { uri, name: `pivot_voice_${Date.now()}.${ext}`, type: mimeType } as any);
      console.log(`[voice] Uploading ${ext} file, duration: ${durationMs}ms, platform: ${Platform.OS}`);
      const uploadRes = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        console.warn(`[voice] Upload failed: ${uploadRes.status} ${errText}`);
        throw new Error(`Upload failed: ${uploadRes.status} ${errText}`);
      }
      const { url } = await uploadRes.json();
      console.log(`[voice] Uploaded to: ${url}`);
      const result = await transcribeMutation.mutateAsync({ audioUrl: url });
      if (result.text?.trim()) {
        const transcribedText = result.text.trim();
        console.log(`[voice] Transcribed: ${transcribedText.substring(0, 50)}...`);
        setInput(transcribedText);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        pendingVoiceRef.current = transcribedText;
      } else {
        Alert.alert("Voice Input", "Could not understand the audio. Please try again or speak more clearly and closer to the microphone.");
      }
    } catch (err: any) {
      console.warn("Transcription error:", err?.message || err);
      const errMsg = err?.message?.includes("Transcription failed:")
        ? err.message.replace("Transcription failed: ", "")
        : "Could not transcribe your voice. Please try again or type your message.";
      Alert.alert("Transcription Failed", errMsg);
    } finally {
      setIsTranscribing(false);
    }
  }, [recorderState.isRecording, recorderState.durationMillis, audioRecorder, transcribeMutation]);

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

  const takePhoto = async () => {
    if (!access.canAttachFiles) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Camera Permission", "Please allow camera access in your device settings to snap photos for Pivot.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const name = asset.fileName || `photo_${Date.now()}.jpg`;
      await uploadAndAddAttachment(asset.uri, name, asset.mimeType || "image/jpeg");
    } catch {
      Alert.alert("Error", "Could not open camera.");
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

  // Auto-send voice transcription
  useEffect(() => {
    if (pendingVoiceRef.current && !loading && !isTranscribing) {
      const text = pendingVoiceRef.current;
      pendingVoiceRef.current = null;
      setTimeout(() => sendMessage(text), 400);
    }
  }, [isTranscribing, loading]);

  // ─── Don't render for roles without chat access ──────────────────────────────

  if (!employee || !access.canUseChat) return null;

  const isRecording = recorderState.isRecording;

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const s2 = {
    userText: { color: "#000", fontSize: 15, lineHeight: 21 } as const,
    aiText: { fontSize: 15, lineHeight: 22, color: TEXT_PRIMARY } as const,
  };

  const renderStyledLine = (line: string, baseStyle: any, key: number) => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g;
    let last = 0;
    let m;
    let pk = 0;
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) parts.push(<Text key={`${key}-${pk++}`} style={baseStyle}>{line.slice(last, m.index)}</Text>);
      if (m[2]) {
        parts.push(<Text key={`${key}-${pk++}`} style={[baseStyle, { fontWeight: "800" }]}>{m[2]}</Text>);
      } else if (m[4]) {
        parts.push(<Text key={`${key}-${pk++}`} style={[baseStyle, { fontFamily: "monospace", backgroundColor: DARK_CARD, paddingHorizontal: 4, borderRadius: 4, fontSize: 13 }]}>{m[4]}</Text>);
      }
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(<Text key={`${key}-${pk++}`} style={baseStyle}>{line.slice(last)}</Text>);
    if (parts.length === 0) return <Text key={key} style={baseStyle}>{line}</Text>;
    return <Text key={key}>{parts}</Text>;
  };

  const renderMarkdownBlock = (text: string, msgRole: "user" | "assistant", blockKey: number) => {
    const baseStyle = msgRole === "user" ? s2.userText : s2.aiText;
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let lineKey = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        elements.push(<View key={`${blockKey}-${lineKey++}`} style={{ height: 8 }} />);
        continue;
      }
      if (trimmed.startsWith("### ")) {
        elements.push(
          <Text key={`${blockKey}-${lineKey++}`} style={[baseStyle, { fontWeight: "800", fontSize: 15, marginTop: 8, marginBottom: 4 } as any]}>
            {trimmed.slice(4)}
          </Text>
        );
      } else if (trimmed.startsWith("## ")) {
        elements.push(
          <Text key={`${blockKey}-${lineKey++}`} style={[baseStyle, { fontWeight: "800", fontSize: 16, marginTop: 10, marginBottom: 4 } as any]}>
            {trimmed.slice(3)}
          </Text>
        );
      } else if (trimmed.startsWith("# ")) {
        elements.push(
          <Text key={`${blockKey}-${lineKey++}`} style={[baseStyle, { fontWeight: "800", fontSize: 17, marginTop: 10, marginBottom: 4 } as any]}>
            {trimmed.slice(2)}
          </Text>
        );
      } else if (/^[-*]\s/.test(trimmed)) {
        elements.push(
          <View key={`${blockKey}-${lineKey++}`} style={{ flexDirection: "row", paddingLeft: 8, marginBottom: 3 }}>
            <Text style={[baseStyle, { marginRight: 6 } as any]}>{"\u2022"}</Text>
            <View style={{ flex: 1 }}>{renderStyledLine(trimmed.slice(2), baseStyle, lineKey)}</View>
          </View>
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)\.\s/);
        const rest = trimmed.replace(/^\d+\.\s/, "");
        elements.push(
          <View key={`${blockKey}-${lineKey++}`} style={{ flexDirection: "row", paddingLeft: 8, marginBottom: 3 }}>
            <Text style={[baseStyle, { marginRight: 6, fontWeight: "700" } as any]}>{num ? num[1] + "." : ""}</Text>
            <View style={{ flex: 1 }}>{renderStyledLine(rest, baseStyle, lineKey)}</View>
          </View>
        );
      } else {
        elements.push(
          <View key={`${blockKey}-${lineKey++}`} style={{ marginBottom: 2 }}>
            {renderStyledLine(trimmed, baseStyle, lineKey)}
          </View>
        );
      }
    }

    return <View key={blockKey}>{elements}</View>;
  };

  const renderMessageContent = (content: string, msgRole: "user" | "assistant") => {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let partKey = 0;

    while ((match = imageRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index).trim();
        if (textBefore) parts.push(renderMarkdownBlock(textBefore, msgRole, partKey++));
      }
      const altText = match[1];
      let imageUrl = match[2];
      if (imageUrl.startsWith("/api/")) imageUrl = `${getApiBaseUrl()}${imageUrl}`;
      parts.push(
        <TouchableOpacity key={partKey++} onPress={() => Linking.openURL(imageUrl)} activeOpacity={0.8}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: 220, height: 220, borderRadius: 12, marginVertical: 8 }}
            contentFit="contain"
            placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
            transition={300}
          />
          {altText ? <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4, textAlign: "center" }}>{altText}</Text> : null}
        </TouchableOpacity>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const remaining = content.slice(lastIndex).trim();
      if (remaining) parts.push(renderMarkdownBlock(remaining, msgRole, partKey++));
    }

    if (parts.length === 0) return renderMarkdownBlock(content, msgRole, 0);
    return <View>{parts}</View>;
  };

  // ─── Render message item ────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={{ marginBottom: 16 }}>
      {/* Attachments */}
      {item.attachments?.map((att, ai) => (
        <View key={ai} style={[styles.attachChip, { alignSelf: item.role === "user" ? "flex-end" : "flex-start" }]}>
          <MaterialIcons name={getFileIconName(att.type)} size={14} color={GOLD} />
          <Text style={styles.attachChipText} numberOfLines={1}>{att.name}</Text>
        </View>
      ))}
      {/* Message bubble */}
      {item.role === "user" ? (
        <View style={styles.userBubble}>
          {renderMessageContent(item.content, "user")}
        </View>
      ) : (
        <View style={styles.aiBubbleRow}>
          <PivotAvatar size={28} />
          <View style={styles.aiBubble}>
            {renderMessageContent(item.content, "assistant")}
          </View>
        </View>
      )}
    </View>
  );

  // ─── Welcome Screen ─────────────────────────────────────────────────────────

  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      <View style={styles.welcomeAvatarRing}>
        <Image
          source={{ uri: PIVOT_ICON_URL }}
          style={{ width: 80, height: 80, borderRadius: 40 }}
          contentFit="cover"
        />
      </View>
      <Text style={styles.welcomeTitle}>
        {language === "es" ? "Hola, soy Pivot" : "Hey, I'm Pivot"}
      </Text>
      <Text style={styles.welcomeSubtitle}>
        {role === "owner"
          ? (language === "es" ? "Tu socio de negocios con IA. Pregúntame sobre proyectos, costos, equipo o construcción." : "Your AI business partner. Ask me anything about your projects, costs, team, or construction math.")
          : role === "office_manager"
          ? (language === "es" ? "Tu asistente de oficina. Puedo ayudar con nómina, horas y reportes." : "Your office assistant. I can help with payroll, hours, reports, and team management.")
          : role === "foreman"
          ? (language === "es" ? "Tu asistente de campo. Pregunta sobre seguridad, metas, cálculos o técnicas." : "Your field assistant. Ask about safety, goals, roof math, or construction techniques.")
          : (language === "es" ? "Tu asistente de equipo. Puedo mostrarte tus metas, seguridad y ayudarte." : "Your team assistant. I can show you your goals, safety tips, and help with questions.")}
      </Text>

      {/* Quick Action Chips */}
      {activeQuickActions.length > 0 && (
        <View style={styles.quickActionsRow}>
          {activeQuickActions.map((qa, i) => (
            <TouchableOpacity
              key={i}
              style={styles.quickActionChip}
              onPress={() => sendMessage(qa.prompt)}
              activeOpacity={0.7}
            >
              <MaterialIcons name={qa.icon as any} size={18} color={GOLD} />
              <Text style={styles.quickActionLabel}>{qa.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Suggestion pills */}
      <View style={styles.suggestionsContainer}>
        {activeSuggestions.map((sug, i) => (
          <TouchableOpacity
            key={i}
            style={styles.suggestionPill}
            onPress={() => sendMessage(sug)}
            activeOpacity={0.7}
          >
            <Text style={styles.suggestionText}>{sug}</Text>
            <MaterialIcons name="arrow-forward" size={14} color={TEXT_SECONDARY} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <>
      {/* ─── Premium FAB ─── */}
      <RNAnimated.View
        style={[
          styles.fabOuter,
          {
            bottom: 56 + Math.max(insets.bottom, 16) + 28,
            transform: [{ scale: fabPulse }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            setOpen(true);
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          activeOpacity={0.85}
        >
          <Image
            source={{ uri: PIVOT_ICON_URL }}
            style={{ width: 52, height: 52, borderRadius: 26 }}
            contentFit="cover"
          />
        </TouchableOpacity>
      </RNAnimated.View>

      {/* ─── Full-Screen Chat Modal ─── */}
      <Modal
        visible={open}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1, backgroundColor: DARK_BG }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : StatusBar.currentHeight || 0}
        >
          <View style={{ flex: 1 }}>
            {/* ─── Premium Header ─── */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
              <View style={styles.headerLeft}>
                <View style={styles.headerAvatarRing}>
                  <Image
                    source={{ uri: PIVOT_ICON_URL }}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    contentFit="cover"
                  />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Pivot</Text>
                  <View style={styles.headerStatusRow}>
                    <View style={styles.statusDot} />
                    <Text style={styles.headerSubtitle}>{activeLabel}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.headerRight}>
                {messages.length > 0 && (
                  <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={() => {
                      setMessages([]);
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <MaterialIcons name="refresh" size={18} color={TEXT_SECONDARY} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.headerCloseBtn}
                  onPress={() => { Keyboard.dismiss(); setOpen(false); }}
                >
                  <MaterialIcons name="keyboard-arrow-down" size={22} color={TEXT_SECONDARY} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ─── Messages or Welcome ─── */}
            {messages.length === 0 ? (
              renderWelcome()
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                style={styles.messagesList}
                contentContainerStyle={{ paddingVertical: 16 }}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                removeClippedSubviews={Platform.OS === "android"}
                maxToRenderPerBatch={10}
                windowSize={15}
                ListFooterComponent={
                  <>
                    {loading && (
                      <View style={styles.aiBubbleRow}>
                        <PivotAvatar size={28} />
                        <View style={[styles.aiBubble, { paddingVertical: 14 }]}>
                          <TypingDots />
                        </View>
                      </View>
                    )}
                    {isTranscribing && (
                      <View style={[styles.userBubble, { backgroundColor: GOLD_GLOW }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <ActivityIndicator size="small" color={GOLD} />
                          <Text style={{ color: GOLD, fontSize: 13 }}>
                            {language === "es" ? "Transcribiendo tu voz..." : "Transcribing your voice..."}
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                }
              />
            )}

            {/* ─── Quick actions when in conversation ─── */}
            {messages.length > 0 && messages.length <= 4 && !keyboardVisible && (
              <View style={styles.inlineQuickActions}>
                {activeQuickActions.slice(0, 3).map((qa, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.inlineQuickChip}
                    onPress={() => sendMessage(qa.prompt)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name={qa.icon as any} size={14} color={GOLD} />
                    <Text style={styles.inlineQuickLabel}>{qa.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ─── Pending attachments ─── */}
            {pendingAttachments.length > 0 && (
              <View style={styles.pendingAtts}>
                {pendingAttachments.map((att, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.attachChip}
                    onPress={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <MaterialIcons name={getFileIconName(att.type)} size={14} color={GOLD} />
                    <Text style={styles.attachChipText} numberOfLines={1}>{att.name}</Text>
                    <MaterialIcons name="close" size={12} color={TEXT_SECONDARY} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ─── Recording indicator ─── */}
            {isRecording && (
              <View style={styles.recordingBanner}>
                <VoiceWaveform />
                <Text style={styles.recordingText}>
                  {language === "es" ? "Grabando... toca para detener" : "Recording... tap mic to stop"}
                </Text>
              </View>
            )}

            {/* ─── Attachment menu ─── */}
            {attachMenuOpen && access.canAttachFiles && (
              <View style={styles.attachMenu}>
                <TouchableOpacity
                  style={styles.attachMenuItem}
                  onPress={() => { setAttachMenuOpen(false); takePhoto(); }}
                  disabled={uploading}
                >
                  <View style={styles.attachMenuIconCircle}>
                    <MaterialIcons name="camera-alt" size={22} color={GOLD} />
                  </View>
                  <Text style={styles.attachMenuLabel}>
                    {language === "es" ? "Cámara" : "Camera"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachMenuItem}
                  onPress={() => { setAttachMenuOpen(false); pickImage(); }}
                  disabled={uploading}
                >
                  <View style={styles.attachMenuIconCircle}>
                    <MaterialIcons name="photo-library" size={22} color={GOLD} />
                  </View>
                  <Text style={styles.attachMenuLabel}>
                    {language === "es" ? "Galería" : "Gallery"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachMenuItem}
                  onPress={() => { setAttachMenuOpen(false); pickDocument(); }}
                  disabled={uploading}
                >
                  <View style={styles.attachMenuIconCircle}>
                    <MaterialIcons name="insert-drive-file" size={22} color={GOLD} />
                  </View>
                  <Text style={styles.attachMenuLabel}>
                    {language === "es" ? "Archivo" : "File"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── Premium Input Bar ─── */}
            <View style={[styles.inputBar, { paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 12) : 12 }]}>
              {/* Attach button */}
              {access.canAttachFiles && (
                <TouchableOpacity
                  style={[styles.inputIconBtn, attachMenuOpen && { backgroundColor: GOLD }]}
                  onPress={() => setAttachMenuOpen(!attachMenuOpen)}
                  disabled={uploading}
                >
                  {attachMenuOpen ? (
                    <MaterialIcons name="close" size={20} color="#000" />
                  ) : (
                    <MaterialIcons name="add" size={22} color={GOLD} />
                  )}
                </TouchableOpacity>
              )}

              {/* Text input */}
              <View style={styles.inputWrapper}>
                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  value={input}
                  onChangeText={(text) => { setInput(text); if (attachMenuOpen) setAttachMenuOpen(false); }}
                  placeholder={isRecording ? (language === "es" ? "Grabando..." : "Recording...") : activePlaceholder}
                  placeholderTextColor={TEXT_SECONDARY}
                  multiline
                  editable={!loading && !isRecording && !isTranscribing}
                  returnKeyType="default"
                  blurOnSubmit={false}
                  scrollEnabled={true}
                  onFocus={() => { if (attachMenuOpen) setAttachMenuOpen(false); }}
                />
              </View>

              {/* Voice mic button */}
              {access.canUseVoice && (
                <TouchableOpacity
                  style={[
                    styles.micBtn,
                    isRecording && styles.micBtnRecording,
                  ]}
                  onPress={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing || loading}
                >
                  <MaterialIcons
                    name={isTranscribing ? "hourglass-top" : isRecording ? "stop" : "mic"}
                    size={22}
                    color={isRecording ? "#fff" : GOLD}
                  />
                </TouchableOpacity>
              )}

              {/* Send button */}
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (input.trim() || pendingAttachments.length) && !loading
                    ? styles.sendBtnActive
                    : styles.sendBtnInactive,
                ]}
                onPress={() => sendMessage(input)}
                disabled={(!input.trim() && !pendingAttachments.length) || loading || isRecording}
              >
                <MaterialIcons
                  name="arrow-upward"
                  size={20}
                  color={(input.trim() || pendingAttachments.length) && !loading ? "#000" : TEXT_SECONDARY}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // FAB
  fabOuter: {
    position: "absolute",
    right: 16,
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DARK_BG,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: DARK_BG,
    borderBottomWidth: 1,
    borderBottomColor: DARK_BORDER,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: GOLD,
    letterSpacing: 0.5,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_GREEN,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DARK_SURFACE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },
  headerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DARK_SURFACE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },

  // Messages
  messagesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: GOLD,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "82%",
  },
  aiBubbleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    maxWidth: "90%",
  },
  aiBubble: {
    flex: 1,
    backgroundColor: DARK_SURFACE,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },
  attachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: GOLD_GLOW,
    borderWidth: 1,
    borderColor: GOLD_DIM,
    marginBottom: 6,
  },
  attachChipText: {
    fontSize: 11,
    color: TEXT_PRIMARY,
    maxWidth: 120,
  },

  // Welcome
  welcomeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  welcomeAvatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2.5,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    letterSpacing: 0.5,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },

  // Quick Actions
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  quickActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: GOLD_DIM,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GOLD,
  },

  // Suggestions
  suggestionsContainer: {
    marginTop: 20,
    width: "100%",
    gap: 8,
    paddingHorizontal: 8,
  },
  suggestionPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },
  suggestionText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    flex: 1,
  },

  // Inline quick actions (during conversation)
  inlineQuickActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inlineQuickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },
  inlineQuickLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },

  // Pending attachments
  pendingAtts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: DARK_BORDER,
  },

  // Recording
  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
    backgroundColor: `${RECORDING_RED}15`,
    borderTopWidth: 1,
    borderTopColor: `${RECORDING_RED}30`,
  },
  recordingText: {
    fontSize: 13,
    color: RECORDING_RED,
    fontWeight: "500",
  },

  // Attachment menu
  attachMenu: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: DARK_BORDER,
    backgroundColor: DARK_SURFACE,
  },
  attachMenuItem: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  attachMenuIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: DARK_CARD,
    borderWidth: 1,
    borderColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  attachMenuLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: TEXT_SECONDARY,
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: DARK_BORDER,
    backgroundColor: DARK_BG,
  },
  inputIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },
  inputWrapper: {
    flex: 1,
  },
  textInput: {
    fontSize: 15,
    color: TEXT_PRIMARY,
    backgroundColor: DARK_INPUT,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: DARK_BORDER,
    maxHeight: 100,
    minHeight: 42,
  },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_SURFACE,
    borderWidth: 1.5,
    borderColor: GOLD_DIM,
  },
  micBtnRecording: {
    backgroundColor: RECORDING_RED,
    borderColor: RECORDING_RED,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnActive: {
    backgroundColor: GOLD,
  },
  sendBtnInactive: {
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: DARK_BORDER,
  },
});
