import { useState, useCallback, useMemo } from "react";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { CACHE_KEYS } from "@/lib/data-cache";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { Platform, Alert } from "react-native";
import { useOfflineQueue } from "@/lib/offline-queue";
import { uploadFile, getMimeType, getAttachmentType } from "@/lib/file-upload";
import { downloadAndOpenFile } from "@/lib/file-download";

type TabKey = "inbox" | "sent";

interface AttachmentInfo {
  uri: string;
  name: string;
  mimeType: string;
}

export default function MessagesScreen({ embedded }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const { employee } = useAppAuth();
  const empId = employee?.id ?? 0;

  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [showCompose, setShowCompose] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Compose state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msgType, setMsgType] = useState<"message" | "note" | "alert" | "plan_set">("message");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [isCompanyWide, setIsCompanyWide] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<number[]>([]);
  const [attachment, setAttachment] = useState<AttachmentInfo | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Queries with offline caching
  const inboxQ = trpc.messages.inbox.useQuery({ employeeId: empId }, { enabled: empId > 0 });
  const sentQ = trpc.messages.sent.useQuery({ employeeId: empId }, { enabled: empId > 0 });
  const unread = trpc.messages.unreadCount.useQuery({ employeeId: empId }, { enabled: empId > 0 });
  const allEmployeesQ = trpc.employees.list.useQuery();
  const { data: inboxData, isLoading: inboxLoading } = useOfflineCache(CACHE_KEYS.MESSAGES + "_inbox", inboxQ.data, inboxQ.isLoading);
  const { data: sentData, isLoading: sentLoading } = useOfflineCache(CACHE_KEYS.MESSAGES + "_sent", sentQ.data, sentQ.isLoading);
  const { data: allEmpData } = useOfflineCache(CACHE_KEYS.ALL_EMPLOYEES, allEmployeesQ.data, allEmployeesQ.isLoading);
  // Wrap in compatible shape
  const inbox = { ...inboxQ, data: inboxData, isLoading: inboxLoading, refetch: inboxQ.refetch };
  const sent = { ...sentQ, data: sentData, isLoading: sentLoading, refetch: sentQ.refetch };
  const allEmployees = { ...allEmployeesQ, data: allEmpData };
  const markRead = trpc.messages.markRead.useMutation({
    onSuccess: () => { inbox.refetch(); unread.refetch(); },
  });
  const sendMsg = trpc.messages.send.useMutation({
    onSuccess: () => {
      sent.refetch();
      inbox.refetch();
      unread.refetch();
      resetCompose();
      setShowCompose(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const resetCompose = () => {
    setSubject("");
    setBody("");
    setMsgType("message");
    setPriority("normal");
    setIsCompanyWide(false);
    setSelectedRecipients([]);
    setAttachment(null);
    setSending(false);
    setUploading(false);
  };

  const { addMutation, isOnline } = useOfflineQueue();

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    if (!isCompanyWide && selectedRecipients.length === 0) return;
    setSending(true);

    try {
      // Upload attachment if present
      let attachmentUrl: string | undefined;
      let attachmentType: "image" | "pdf" | "document" | undefined;
      let attachmentName: string | undefined;

      if (attachment) {
        setUploading(true);
        try {
          const result = await uploadFile(attachment.uri, attachment.name, attachment.mimeType);
          attachmentUrl = result.url;
          attachmentType = getAttachmentType(attachment.mimeType);
          attachmentName = attachment.name;
        } catch (err: any) {
          console.error("Upload failed:", err);
          Alert.alert("Upload Failed", "Could not upload the attachment. Send without it?", [
            { text: "Cancel", style: "cancel", onPress: () => setSending(false) },
            { text: "Send Without", onPress: () => doSend(undefined, undefined, undefined) },
          ]);
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      await doSend(attachmentUrl, attachmentType, attachmentName);
    } catch {
      setSending(false);
    }
  };

  const doSend = async (
    attachmentUrl?: string,
    attachmentType?: "image" | "pdf" | "document",
    attachmentName?: string
  ) => {
    const payload = {
      senderId: empId,
      subject: subject.trim(),
      body: body.trim(),
      type: msgType,
      priority,
      isCompanyWide,
      recipientIds: isCompanyWide ? undefined : selectedRecipients,
      attachmentUrl,
      attachmentType,
      attachmentName,
    };
    try {
      await sendMsg.mutateAsync(payload);
    } catch {
      // If send fails (likely offline), queue for later sync
      if (!isOnline) {
        await addMutation("message.send", payload);
        resetCompose();
        setShowCompose(false);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Queued", "Message saved and will be sent when you're back online.");
      }
      setSending(false);
    }
  };

  const toggleRecipient = (id: number) => {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : prev.length < 5 && !isCompanyWide ? [...prev, id] : prev
    );
  };

  const handleExpand = (msgId: number, isRead: boolean) => {
    if (expandedId === msgId) {
      setExpandedId(null);
    } else {
      setExpandedId(msgId);
      if (!isRead && activeTab === "inbox") {
        markRead.mutate({ messageId: msgId, employeeId: empId });
      }
    }
  };

  const handleDownloadAttachment = async (item: any) => {
    if (!item.attachmentUrl) {
      Alert.alert("No File", "This attachment has no downloadable file.");
      return;
    }
    setDownloadingId(item.id);
    try {
      await downloadAndOpenFile(
        item.attachmentUrl,
        item.attachmentName || "attachment",
        undefined
      );
    } catch (err: any) {
      console.error("Download error:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAttachment({
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
        });
      }
    } catch (err: any) {
      console.error("Image picker error:", err);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "application/msword",
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
               "application/vnd.ms-excel",
               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
               "text/plain", "text/csv"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAttachment({
          uri: asset.uri,
          name: asset.name || `document_${Date.now()}`,
          mimeType: asset.mimeType || getMimeType(asset.name || "file"),
        });
      }
    } catch (err: any) {
      console.error("Document picker error:", err);
    }
  };

  const senderName = useCallback(
    (senderId: number) => {
      const emp = allEmployees.data?.find((e: any) => e.id === senderId);
      return emp?.name || "Unknown";
    },
    [allEmployees.data]
  );

  const formatDate = (d: string | Date) => {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);
    if (diffHrs < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m ago`;
    if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
    if (diffHrs < 48) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "alert": return "exclamationmark.triangle.fill" as const;
      case "note": return "doc.text.fill" as const;
      case "plan_set": return "paperclip" as const;
      default: return "envelope.fill" as const;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "alert": return colors.error;
      case "urgent": return colors.warning;
      default: return colors.primary;
    }
  };

  const activeData = activeTab === "inbox" ? inbox.data : sent.data;
  const isLoading = activeTab === "inbox" ? inbox.isLoading : sent.isLoading;

  const unreadCount = unread.data ?? 0;

  const activeEmployees = useMemo(
    () => (allEmployees.data || []).filter((e: any) => e.isActive && e.id !== empId),
    [allEmployees.data, empId]
  );

  const getAttachmentIcon = (type: string | null) => {
    if (type === "image") return "photo.fill" as const;
    if (type === "pdf") return "doc.text.fill" as const;
    return "paperclip" as const;
  };

  const renderMessage = useCallback(
    ({ item }: { item: any }) => {
      const isExpanded = expandedId === item.id;
      const isUnread = activeTab === "inbox" && !item.isRead;
      const accentColor = item.priority === "urgent" ? colors.warning : typeColor(item.type);
      const hasAttachment = !!(item.attachmentUrl || item.attachmentName);
      const isDownloading = downloadingId === item.id;

      return (
        <Pressable
          onPress={() => handleExpand(item.id, item.isRead ?? true)}
          style={({ pressed }) => [
            styles.msgRow,
            {
              backgroundColor: isUnread ? `${colors.primary}10` : "transparent",
              borderLeftColor: isUnread ? accentColor : "transparent",
              borderLeftWidth: isUnread ? 3 : 0,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.msgHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 8 }}>
              <IconSymbol name={typeIcon(item.type)} size={18} color={accentColor} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text
                    style={[styles.msgSubject, { color: colors.foreground, fontWeight: isUnread ? "700" : "500", flex: 1 }]}
                    numberOfLines={1}
                  >
                    {item.subject}
                  </Text>
                  {hasAttachment && (
                    <IconSymbol name="paperclip" size={13} color={colors.muted} />
                  )}
                </View>
                <Text style={[styles.msgMeta, { color: colors.muted }]}>
                  {activeTab === "inbox" ? `From ${senderName(item.senderId)}` : `To ${item.isCompanyWide ? "Everyone" : "Selected"}`}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.msgTime, { color: colors.muted }]}>{formatDate(item.createdAt)}</Text>
              {item.priority === "urgent" && (
                <View style={[styles.urgentBadge, { backgroundColor: colors.warning }]}>
                  <Text style={{ color: "#000", fontSize: 9, fontWeight: "700" }}>URGENT</Text>
                </View>
              )}
            </View>
          </View>
          {isExpanded && (
            <View style={[styles.msgBody, { borderTopColor: colors.border }]}>
              <Text style={[styles.msgBodyText, { color: colors.foreground }]}>{item.body}</Text>
              {hasAttachment && (
                <TouchableOpacity
                  onPress={() => handleDownloadAttachment(item)}
                  activeOpacity={0.6}
                  style={[styles.attachDownloadBtn, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <IconSymbol name={getAttachmentIcon(item.attachmentType)} size={18} color={colors.primary} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                          {item.attachmentName || "Attachment"}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>
                          {item.attachmentUrl ? "Tap to download & open" : "File not available"}
                        </Text>
                      </View>
                      {item.attachmentUrl && (
                        <IconSymbol name="arrow.down.circle.fill" size={24} color={colors.primary} />
                      )}
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </Pressable>
      );
    },
    [expandedId, activeTab, colors, senderName, downloadingId]
  );

  const Wrapper = embedded ? View : ScreenContainer;
  const wrapperProps = embedded ? { style: { flex: 1 } } : { className: "flex-1" };

  return (
    <Wrapper {...(wrapperProps as any)}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
        <TouchableOpacity
          onPress={() => {
            resetCompose();
            setShowCompose(true);
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
        >
          <IconSymbol name="plus" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(["inbox", "sent"] as TabKey[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, { borderBottomColor: activeTab === tab ? colors.primary : "transparent", borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab === "inbox" ? "Inbox" : "Sent"}
            </Text>
            {tab === "inbox" && unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Message List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !activeData || (activeData as any[]).length === 0 ? (
        <View style={styles.center}>
          <IconSymbol name="envelope.fill" size={40} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {activeTab === "inbox" ? "No messages yet" : "No sent messages"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeData as any[]}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* Compose Modal */}
      <Modal visible={showCompose} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCompose(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { resetCompose(); setShowCompose(false); }}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Message</Text>
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || !subject.trim() || !body.trim() || (!isCompanyWide && selectedRecipients.length === 0)}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>
                  {uploading ? "Uploading..." : "Send"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Type */}
            <Text style={[styles.label, { color: colors.muted }]}>Type</Text>
            <View style={styles.typeRow}>
              {(["message", "note", "alert", "plan_set"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setMsgType(t)}
                  style={[
                    styles.typeChip,
                    {
                      borderColor: msgType === t ? colors.primary : colors.border,
                      backgroundColor: msgType === t ? `${colors.primary}15` : "transparent",
                    },
                  ]}
                >
                  <Text style={{ color: msgType === t ? colors.primary : colors.muted, fontSize: 13, fontWeight: "600" }}>
                    {t === "plan_set" ? "Plan Set" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Priority */}
            <Text style={[styles.label, { color: colors.muted }]}>Priority</Text>
            <View style={[styles.typeRow, { marginBottom: 16 }]}>
              {(["normal", "urgent"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.typeChip,
                    {
                      borderColor: priority === p ? (p === "urgent" ? colors.warning : colors.primary) : colors.border,
                      backgroundColor: priority === p ? (p === "urgent" ? `${colors.warning}15` : `${colors.primary}15`) : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: priority === p ? (p === "urgent" ? colors.warning : colors.primary) : colors.muted,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Recipients */}
            <Text style={[styles.label, { color: colors.muted }]}>Recipients</Text>
            <TouchableOpacity
              onPress={() => setIsCompanyWide(!isCompanyWide)}
              style={[
                styles.companyWideBtn,
                {
                  borderColor: isCompanyWide ? colors.primary : colors.border,
                  backgroundColor: isCompanyWide ? `${colors.primary}15` : "transparent",
                },
              ]}
            >
              <IconSymbol name="person.3.fill" size={16} color={isCompanyWide ? colors.primary : colors.muted} />
              <Text style={{ color: isCompanyWide ? colors.primary : colors.muted, fontSize: 13, fontWeight: "600", marginLeft: 8 }}>
                Send to Everyone
              </Text>
            </TouchableOpacity>
            {!isCompanyWide && (
              <View style={styles.recipientGrid}>
                {activeEmployees.map((emp: any) => (
                  <TouchableOpacity
                    key={emp.id}
                    onPress={() => toggleRecipient(emp.id)}
                    style={[
                      styles.recipientChip,
                      {
                        borderColor: selectedRecipients.includes(emp.id) ? colors.primary : colors.border,
                        backgroundColor: selectedRecipients.includes(emp.id) ? `${colors.primary}15` : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selectedRecipients.includes(emp.id) ? colors.primary : colors.muted,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                      numberOfLines={1}
                    >
                      {emp.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Subject */}
            <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject..."
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              returnKeyType="done"
            />

            {/* Body */}
            <Text style={[styles.label, { color: colors.muted }]}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write your message..."
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                styles.bodyInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              multiline
              textAlignVertical="top"
            />

            {/* Attachment */}
            <Text style={[styles.label, { color: colors.muted }]}>Attachment (optional)</Text>
            <View style={styles.attachRow}>
              <TouchableOpacity
                onPress={handlePickImage}
                style={[styles.attachBtn, { borderColor: colors.border }]}
              >
                <IconSymbol name="camera.fill" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, marginLeft: 4 }}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePickDocument}
                style={[styles.attachBtn, { borderColor: colors.border }]}
              >
                <IconSymbol name="paperclip" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, marginLeft: 4 }}>File/PDF</Text>
              </TouchableOpacity>
            </View>
            {attachment ? (
              <View style={[styles.attachPreview, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
                <IconSymbol name={attachment.mimeType.startsWith("image/") ? "photo.fill" : attachment.mimeType === "application/pdf" ? "doc.text.fill" : "paperclip"} size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, flex: 1, marginLeft: 8, fontWeight: "500" }} numberOfLines={1}>
                  {attachment.name}
                </Text>
                <TouchableOpacity onPress={() => setAttachment(null)}>
                  <IconSymbol name="xmark" size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  title: { fontSize: 28, fontWeight: "800" },
  composeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    marginRight: 24,
    gap: 6,
  },
  tabText: { fontSize: 15, fontWeight: "600" },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 15, fontWeight: "500" },
  msgRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  msgHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  msgSubject: { fontSize: 15 },
  msgMeta: { fontSize: 12, marginTop: 2 },
  msgTime: { fontSize: 11 },
  urgentBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 4,
  },
  msgBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
  },
  msgBodyText: { fontSize: 14, lineHeight: 20 },
  attachDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  companyWideBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  recipientGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recipientChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  bodyInput: {
    minHeight: 120,
    paddingTop: 12,
  },
  attachRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  attachPreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
});
