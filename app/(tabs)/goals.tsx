import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_JOBS as bg_jobs } from "@/constants/bg-urls";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";

type Priority = "low" | "medium" | "high";
type GoalStatus = "pending" | "in_progress" | "completed" | "cancelled";
type SubTab = "goals" | "punchlist";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#EF4444" };

const STATUS_ICONS: Record<GoalStatus, string> = {
  pending: "○",
  in_progress: "◑",
  completed: "●",
  cancelled: "✕" };

const STATUS_COLORS: Record<GoalStatus, string> = {
  pending: "#9CA3AF",
  in_progress: "#0EA5E9",
  completed: "#22C55E",
  cancelled: "#9CA3AF" };

const PRIORITY_STRIP: Record<Priority, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#EF4444" };

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// ─── Date/Time Picker Component ──────────────────────────────────────────────
function DateTimePicker({
  value,
  onChange,
  colors }: {
  value: string;
  onChange: (iso: string) => void;
  colors: any;
}) {
  const parsed = value ? new Date(value) : null;
  const [month, setMonth] = useState(parsed ? parsed.getMonth() : new Date().getMonth());
  const [year, setYear] = useState(parsed ? parsed.getFullYear() : new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState(parsed ? parsed.getDate() : 0);
  const [hour, setHour] = useState(parsed ? parsed.getHours() % 12 || 12 : 5);
  const [minute, setMinute] = useState(parsed ? parsed.getMinutes() : 0);
  const [ampm, setAmpm] = useState(parsed ? (parsed.getHours() >= 12 ? "PM" : "AM") : "PM");

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const handleDayPress = (day: number) => {
    setSelectedDay(day);
    const h24 = ampm === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    const d = new Date(year, month, day, h24, minute, 0, 0);
    onChange(d.toISOString());
  };

  const handleTimeChange = (newHour: number, newMinute: number, newAmpm: string) => {
    setHour(newHour);
    setMinute(newMinute);
    setAmpm(newAmpm);
    if (selectedDay > 0) {
      const h24 = newAmpm === "PM" ? (newHour === 12 ? 12 : newHour + 12) : (newHour === 12 ? 0 : newHour);
      const d = new Date(year, month, selectedDay, h24, newMinute, 0, 0);
      onChange(d.toISOString());
    }
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(0);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(0);
  };

  const today = new Date();
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>{monthNames[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {dayNames.map(d => (
          <View key={d} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <View key={`empty-${i}`} style={{ width: "14.28%", height: 36 }} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const sel = day === selectedDay;
          const td = isToday(day);
          return (
            <TouchableOpacity
              key={day}
              onPress={() => handleDayPress(day)}
              style={{ width: "14.28%", height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{
                width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
                backgroundColor: sel ? colors.primary : "transparent",
                borderWidth: td && !sel ? 1.5 : 0,
                borderColor: colors.primary }}>
                <Text style={{
                  fontSize: 13, fontWeight: sel || td ? "700" : "400",
                  color: sel ? "#fff" : td ? colors.primary : colors.foreground }}>{day}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12, gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600", marginRight: 4 }}>Time:</Text>
        <TouchableOpacity
          onPress={() => { const h = hour >= 12 ? 1 : hour + 1; handleTimeChange(h, minute, ampm); }}
          style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{String(hour).padStart(2, "0")}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>:</Text>
        <TouchableOpacity
          onPress={() => { const m = minute >= 45 ? 0 : minute + 15; handleTimeChange(hour, m, ampm); }}
          style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{String(minute).padStart(2, "0")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { const newAmpm = ampm === "AM" ? "PM" : "AM"; handleTimeChange(hour, minute, newAmpm); }}
          style={{ backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>{ampm}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => { setSelectedDay(0); onChange(""); }} style={{ alignSelf: "center", marginTop: 8, padding: 6 }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>Clear Deadline</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PUNCH LIST SUB-TAB COMPONENT ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function PunchListSubTab({ colors, employee, canManage }: { colors: any; employee: any; canManage: boolean }) {
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();
  const { data: jobs } = trpc.jobs.listActive.useQuery(undefined, { staleTime: 30000 });
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const { data: punchItems, isLoading: loadingItems, refetch: refetchItems } = trpc.punchList.listForJob.useQuery(
    { jobId: selectedJobId! },
    { enabled: !!selectedJobId }
  );
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { staleTime: 30000 });

  const [showAddModal, setShowAddModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [singleTitle, setSingleTitle] = useState("");
  const [singleArea, setSingleArea] = useState("");
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

  const employeeMap = useMemo(() => {
    const map: Record<number, string> = {};
    (allEmployees || []).forEach((e: any) => { map[e.id] = e.name; });
    return map;
  }, [allEmployees]);

  const toggleItem = trpc.punchList.toggle.useMutation({
    onSuccess: () => {
      utils.punchList.listForJob.invalidate({ jobId: selectedJobId! });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const createItem = trpc.punchList.create.useMutation({
    onSuccess: () => {
      utils.punchList.listForJob.invalidate({ jobId: selectedJobId! });
      setSingleTitle("");
      setSingleArea("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createBulk = trpc.punchList.createBulk.useMutation({
    onSuccess: () => {
      utils.punchList.listForJob.invalidate({ jobId: selectedJobId! });
      setBulkText("");
      setShowAddModal(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteItem = trpc.punchList.delete.useMutation({
    onSuccess: () => {
      utils.punchList.listForJob.invalidate({ jobId: selectedJobId! });
    },
  });

  // Group items by area
  const groupedItems = useMemo(() => {
    if (!punchItems) return [];
    const groups: Record<string, any[]> = {};
    for (const item of punchItems as any[]) {
      const area = item.area || "General";
      if (!groups[area]) groups[area] = [];
      groups[area].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [punchItems]);

  const totalItems = punchItems?.length || 0;
  const completedItems = (punchItems as any[] || []).filter((i: any) => i.status === "completed").length;

  const handleAddSingle = () => {
    if (!singleTitle.trim() || !selectedJobId) return;
    createItem.mutate({
      jobId: selectedJobId,
      title: singleTitle.trim(),
      area: singleArea.trim() || undefined,
      createdBy: employee?.id || 0,
    });
  };

  const handleAddBulk = () => {
    if (!bulkText.trim() || !selectedJobId) return;
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;
    const items = lines.map((line, idx) => ({
      jobId: selectedJobId,
      title: line,
      area: singleArea.trim() || undefined,
      createdBy: employee?.id || 0,
      sortOrder: idx,
    }));
    createBulk.mutate({ items });
  };

  const handleDeleteItem = (id: number) => {
    Alert.alert("Delete Item", "Remove this punch list item?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteItem.mutate({ id }) },
    ]);
  };

  // ─── No job selected ─────────────────────────────────────────────────────────
  if (!selectedJobId) {
    return (
      <View style={{ flex: 1, paddingTop: 8 }}>
        <Text style={{ fontSize: 14, color: colors.muted, paddingHorizontal: 16, marginBottom: 12, fontWeight: "500" }}>
          Select a job to view its punch list:
        </Text>
        <FlatList
          data={jobs || []}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity
              onPress={() => setSelectedJobId(item.id)}
              style={{
                marginHorizontal: 20,
                marginBottom: 10,
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                ...(Platform.OS === "ios" ? {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 4,
                } : { elevation: 1 }),
              }}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 10,
                backgroundColor: colors.primary + "18",
                alignItems: "center", justifyContent: "center", marginRight: 14,
              }}>
                <Text style={{ fontSize: 18 }}>📋</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.address || "No address"}</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 12 }}>No Active Jobs</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>Create a job first to add punch list items.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </View>
    );
  }

  // ─── Job selected — show punch list ───────────────────────────────────────────
  const selectedJob = (jobs || []).find((j: any) => j.id === selectedJobId);

  return (
    <View style={{ flex: 1 }}>
      {/* Job header with back button */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <TouchableOpacity
          onPress={() => setSelectedJobId(null)}
          style={{ marginRight: 12, padding: 4 }}
        >
          <Text style={{ fontSize: 22, color: colors.primary, fontWeight: "700" }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
            {selectedJob?.name || "Job"}
          </Text>
          {totalItems > 0 && (
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {completedItems}/{totalItems} completed
            </Text>
          )}
        </View>
        {canManage && (
          <TouchableOpacity
            onPress={() => { setAddMode("single"); setShowAddModal(true); }}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      {totalItems > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8, marginTop: 4 }}>
          <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2 }}>
            <View style={{
              height: 4, borderRadius: 2,
              backgroundColor: colors.success,
              width: `${(completedItems / totalItems) * 100}%`,
            }} />
          </View>
        </View>
      )}

      {/* Quick add inline (always visible for managers) */}
      {canManage && (
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 8, gap: 8 }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 14,
              color: colors.foreground,
            }}
            placeholder="Quick add item..."
            placeholderTextColor={colors.muted}
            value={singleTitle}
            onChangeText={setSingleTitle}
            returnKeyType="done"
            onSubmitEditing={handleAddSingle}
          />
          <TouchableOpacity
            onPress={handleAddSingle}
            disabled={!singleTitle.trim() || createItem.isPending}
            style={{
              backgroundColor: singleTitle.trim() ? colors.primary : colors.surface,
              borderRadius: 10,
              paddingHorizontal: 14,
              justifyContent: "center",
              opacity: singleTitle.trim() ? 1 : 0.5,
            }}
          >
            {createItem.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: singleTitle.trim() ? "#fff" : colors.muted, fontWeight: "700", fontSize: 14 }}>+</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Punch list items grouped by area */}
      {loadingItems ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
          {groupedItems.length === 0 ? (
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 12 }}>
                No punch list items yet
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                {canManage ? "Add items using the quick add bar above, or tap + Add for bulk paste." : "Your foreman or manager will add items here."}
              </Text>
            </View>
          ) : (
            groupedItems.map(([area, items]) => (
              <View key={area} style={{ marginBottom: 16 }}>
                {/* Area header */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {area}
                  </Text>
                </View>
                {/* Items */}
                {items.map((item: any) => {
                  const isCompleted = item.status === "completed";
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => toggleItem.mutate({ id: item.id, completedBy: employee?.id || 0 })}
                      onLongPress={() => canManage && handleDeleteItem(item.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderBottomWidth: 0.5,
                        borderBottomColor: colors.border + "44",
                      }}
                    >
                      {/* Checkbox circle */}
                      <View style={{
                        width: 24, height: 24, borderRadius: 12,
                        borderWidth: 2,
                        borderColor: isCompleted ? colors.success : colors.muted + "66",
                        backgroundColor: isCompleted ? colors.success : "transparent",
                        alignItems: "center", justifyContent: "center",
                        marginRight: 12, marginTop: 1,
                      }}>
                        {isCompleted && (
                          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>✓</Text>
                        )}
                      </View>
                      {/* Item text */}
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 15, lineHeight: 20,
                          color: isCompleted ? colors.muted : colors.foreground,
                          textDecorationLine: isCompleted ? "line-through" : "none",
                          fontWeight: "500",
                        }}>
                          {item.title}
                        </Text>
                        {isCompleted && item.completedBy && (
                          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                            Completed by {employeeMap[item.completedBy] || "Unknown"}
                          </Text>
                        )}
                      </View>
                      {/* Priority dot */}
                      <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: PRIORITY_COLORS[item.priority as Priority] || PRIORITY_COLORS.medium,
                        marginTop: 7, marginLeft: 8,
                      }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Items Modal (bulk paste) */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Add Punch List Items</Text>
            <TouchableOpacity onPress={() => { setShowAddModal(false); setBulkText(""); setSingleArea(""); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* Mode toggle */}
            <View style={{ flexDirection: "row", marginBottom: 16, gap: 8 }}>
              <TouchableOpacity
                onPress={() => setAddMode("single")}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                  backgroundColor: addMode === "single" ? colors.primary + "22" : colors.surface,
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 13, color: addMode === "single" ? colors.primary : colors.muted }}>Single Item</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAddMode("bulk")}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                  backgroundColor: addMode === "bulk" ? colors.primary + "22" : colors.surface,
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 13, color: addMode === "bulk" ? colors.primary : colors.muted }}>Bulk Paste</Text>
              </TouchableOpacity>
            </View>

            {/* Area field */}
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>Area / Section (optional)</Text>
            <TextInput
              style={{
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 15, color: colors.foreground, backgroundColor: colors.surface, marginBottom: 16,
              }}
              placeholder="e.g. Kitchen, 2nd Floor, Back Patio"
              placeholderTextColor={colors.muted}
              value={singleArea}
              onChangeText={setSingleArea}
            />

            {addMode === "single" ? (
              <>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>Item Title *</Text>
                <TextInput
                  style={{
                    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                    fontSize: 15, color: colors.foreground, backgroundColor: colors.surface, marginBottom: 16,
                  }}
                  placeholder="e.g. Install door trim"
                  placeholderTextColor={colors.muted}
                  value={singleTitle}
                  onChangeText={setSingleTitle}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => {
                    handleAddSingle();
                    // Don't close modal so they can add more
                  }}
                  disabled={!singleTitle.trim() || createItem.isPending}
                  style={{
                    backgroundColor: singleTitle.trim() ? colors.primary : colors.surface,
                    borderRadius: 14, paddingVertical: 16, alignItems: "center",
                    opacity: singleTitle.trim() ? 1 : 0.5,
                  }}
                >
                  {createItem.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: singleTitle.trim() ? "#fff" : colors.muted, fontWeight: "800", fontSize: 15 }}>Add Item</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>
                  Paste or type items (one per line)
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>
                  Copy your list from Notes and paste it here. Each line becomes a separate item.
                </Text>
                <TextInput
                  style={{
                    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                    fontSize: 14, color: colors.foreground, backgroundColor: colors.surface,
                    marginBottom: 16, minHeight: 200, textAlignVertical: "top",
                  }}
                  placeholder={"Back patio roof\nMove steel column\nFraming back of garage\nCut door thresholds\n..."}
                  placeholderTextColor={colors.muted + "88"}
                  value={bulkText}
                  onChangeText={setBulkText}
                  multiline
                  autoFocus
                />
                {bulkText.trim() && (
                  <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 12, fontWeight: "600" }}>
                    {bulkText.split("\n").filter(l => l.trim()).length} items will be added
                  </Text>
                )}
                <TouchableOpacity
                  onPress={handleAddBulk}
                  disabled={!bulkText.trim() || createBulk.isPending}
                  style={{
                    backgroundColor: bulkText.trim() ? colors.primary : colors.surface,
                    borderRadius: 14, paddingVertical: 16, alignItems: "center",
                    opacity: bulkText.trim() ? 1 : 0.5,
                  }}
                >
                  {createBulk.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: bulkText.trim() ? "#fff" : colors.muted, fontWeight: "800", fontSize: 15 }}>
                      Add All Items
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("goals");
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState<Priority>("medium");
  const [newGoalAssignees, setNewGoalAssignees] = useState<number[]>([]);
  const [newGoalDeadline, setNewGoalDeadline] = useState<string>("");
  const [newGoalRepeatDaily, setNewGoalRepeatDaily] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<number | "all">("all");

  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(weekDate);

  const utils = trpc.useUtils();
  const { data: goals, isLoading, refetch } = trpc.goals.list.useQuery({
    weekOf: weekStart.toISOString(),
    employeeId: employee?.id,
    employeeRole: employee?.role },
    // CRITICAL: Never fire this query until employee is loaded — prevents data leak
    { enabled: !!employee?.id && !!employee?.role, staleTime: 0 }
  );
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { staleTime: 30000 });

  // Offline cache for goals
  const [cachedGoals, setCachedGoals] = useState<any[] | null>(null);
  useEffect(() => {
    getCached<any[]>(CACHE_KEYS.GOALS).then((d) => { if (d) setCachedGoals(d); });
  }, []);
  useEffect(() => {
    if (goals && goals.length > 0) {
      setCache(CACHE_KEYS.GOALS, goals).catch(() => {});
      setCachedGoals(goals);
    }
  }, [goals]);
  const effectiveGoals = goals || cachedGoals || [];

  const employeeMap = useMemo(() => {
    const map: Record<number, string> = {};
    (allEmployees || []).forEach((e: any) => { map[e.id] = e.name; });
    return map;
  }, [allEmployees]);

  const assignableEmployees = useMemo(() => {
    return (allEmployees || []).filter((e: any) => e.isActive);
  }, [allEmployees]);

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => {
      utils.goals.list.invalidate();
      setShowAddGoal(false);
      resetForm();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } });
  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: () => {
      utils.goals.list.invalidate();
      setShowEditGoal(false);
      setEditingGoal(null);
    } });
  const deleteGoal = trpc.goals.delete.useMutation({
    onSuccess: () => utils.goals.list.invalidate() });

  const resetForm = () => {
    setNewGoalTitle("");
    setNewGoalDescription("");
    setNewGoalPriority("medium");
    setNewGoalAssignees([]);
    setNewGoalDeadline("");
    setNewGoalRepeatDaily(false);
  };

  // Roles
  const isOwner = employee?.role === "owner";
  const isOwnerOrManager = ["owner", "office_manager", "logistics"].includes(employee?.role || "");
  const isForeman = employee?.role === "foreman";
  const isLaborer = employee?.role === "laborer";
  const canManage = isOwnerOrManager || isForeman;

  // Filter goals
  const filteredGoals = useMemo(() => {
    if (!goals && effectiveGoals.length === 0) return [];
    const goalsData = goals || effectiveGoals;
    if (!goalsData || goalsData.length === 0) return [];
    let filtered = [...goalsData];
    // isGoalForMe: returns true ONLY if the goal is explicitly assigned to this employee
    // Goals with no assignee are management-only and must never show to field staff
    const isGoalForMe = (g: any) => {
      if (g.assignedToList) {
        const ids = String(g.assignedToList).split(",").map(Number);
        return ids.includes(employee?.id || 0);
      }
      if (g.assignedTo) return g.assignedTo === employee?.id;
      // No assignee = management-only, do NOT show to field staff
      return false;
    };
    if (isOwner) {
      if (filterAssignee !== "all") {
        filtered = filtered.filter((g: any) => {
          if (g.assignedToList) {
            return String(g.assignedToList).split(",").map(Number).includes(filterAssignee as number);
          }
          return g.assignedTo === filterAssignee;
        });
      }
    } else if (isOwnerOrManager) {
      // office_manager and logistics also see all goals (already filtered by server)
      // just apply assignee filter if set
      if (filterAssignee !== "all") {
        filtered = filtered.filter((g: any) => {
          if (g.assignedToList) {
            return String(g.assignedToList).split(",").map(Number).includes(filterAssignee as number);
          }
          return g.assignedTo === filterAssignee;
        });
      }
    } else if (isLaborer) {
      filtered = filtered.filter(isGoalForMe);
    } else if (isForeman) {
      filtered = filtered.filter((g: any) => isGoalForMe(g) || g.createdBy === employee?.id);
    } else {
      filtered = filtered.filter(isGoalForMe);
    }
    return filtered;
  }, [goals, filterAssignee, isOwner, isForeman, isLaborer, employee?.id]);

  const completedCount = filteredGoals.filter((g: any) => g.status === "completed").length;
  const totalCount = filteredGoals.filter((g: any) => g.status !== "cancelled").length;

  const foremanAssignees = useMemo(() => {
    if (!isForeman) return assignableEmployees;
    return (allEmployees || []).filter((e: any) =>
      e.isActive && (e.role === "laborer" || e.id === employee?.id)
    );
  }, [isForeman, allEmployees, assignableEmployees, employee?.id]);

  const handleStatusCycle = (goal: any) => {
    if (!isOwnerOrManager && !isForeman && goal.assignedTo !== employee?.id) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cycle: GoalStatus[] = ["pending", "in_progress", "completed"];
    const current = goal.status as GoalStatus;
    const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
    const nextStatus = cycle[nextIdx];
    updateGoal.mutate({
      id: goal.id,
      status: nextStatus,
      completedAt: nextStatus === "completed" ? new Date().toISOString() : undefined });
  };

  const handleDelete = (goalId: number) => {
    Alert.alert("Delete Goal", "Remove this goal?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteGoal.mutate({ id: goalId }) },
    ]);
  };

  const openEditModal = (goal: any) => {
    setEditingGoal(goal);
    setNewGoalTitle(goal.title || "");
    setNewGoalDescription(goal.description || "");
    setNewGoalPriority(goal.priority || "medium");
    if (goal.assignedToList) {
      setNewGoalAssignees(String(goal.assignedToList).split(",").map(Number));
    } else if (goal.assignedTo) {
      setNewGoalAssignees([goal.assignedTo]);
    } else {
      setNewGoalAssignees([]);
    }
    setNewGoalDeadline(goal.deadline || "");
    setNewGoalRepeatDaily(!!goal.repeatDaily);
    setShowEditGoal(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = () => {
    if (!editingGoal) return;
    updateGoal.mutate({
      id: editingGoal.id,
      title: newGoalTitle.trim() || undefined,
      description: newGoalDescription.trim() || undefined,
      priority: newGoalPriority,
      assignedTo: newGoalAssignees.length === 1 ? newGoalAssignees[0] : undefined,
      assignedToList: newGoalAssignees.length > 0 ? newGoalAssignees.join(",") : undefined,
      deadline: newGoalDeadline || null,
      repeatDaily: newGoalRepeatDaily });
    resetForm();
  };

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) {
      Alert.alert("Title Required", "Please enter a goal title.");
      return;
    }
    createGoal.mutate({
      title: newGoalTitle.trim(),
      description: newGoalDescription.trim() || undefined,
      priority: newGoalPriority,
      weekOf: weekStart.toISOString(),
      createdBy: employee?.id || 0,
      assignedTo: newGoalAssignees.length === 1 ? newGoalAssignees[0] : undefined,
      assignedToList: newGoalAssignees.length > 0 ? newGoalAssignees.join(",") : undefined,
      deadline: newGoalDeadline || undefined,
      repeatDaily: newGoalRepeatDaily });
  };

  const PRIORITIES: Priority[] = ["low", "medium", "high"];

  const getAssigneeNames = (goal: any): string => {
    if (goal.assignedToList) {
      const ids = String(goal.assignedToList).split(",").map(Number);
      return ids.map(id => employeeMap[id] || "Unknown").join(", ");
    }
    if (goal.assignedTo) return employeeMap[goal.assignedTo] || "Unknown";
    return "Everyone";
  };

  const currentAssignees = isForeman ? foremanAssignees : assignableEmployees;

  // ─── Goal Form ────────────────────────────────────────────────────────────────
  const renderGoalForm = (isEdit: boolean) => (
    <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>Goal Title *</Text>
      <TextInput
        style={{
          borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
          fontSize: 15, color: colors.foreground, backgroundColor: colors.surface, marginBottom: 16,
        }}
        placeholder="e.g. Complete framing on Unit 38"
        placeholderTextColor={colors.muted}
        value={newGoalTitle}
        onChangeText={setNewGoalTitle}
        autoFocus={!isEdit}
        returnKeyType="next"
      />

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>Description (optional)</Text>
      <TextInput
        style={{
          borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
          fontSize: 15, color: colors.foreground, backgroundColor: colors.surface,
          marginBottom: 16, minHeight: 80, textAlignVertical: "top",
        }}
        placeholder="Add more details about this goal..."
        placeholderTextColor={colors.muted}
        value={newGoalDescription}
        onChangeText={setNewGoalDescription}
        multiline
        returnKeyType="done"
      />

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>Assign To (up to 5 people)</Text>
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>
        {newGoalAssignees.length === 0 ? "Everyone" : `${newGoalAssignees.length}/5 selected`}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
        <TouchableOpacity
          style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
            marginRight: 8, marginBottom: 8,
            backgroundColor: newGoalAssignees.length === 0 ? colors.primary + "22" : colors.surface,
          }}
          onPress={() => setNewGoalAssignees([])}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: newGoalAssignees.length === 0 ? colors.primary : colors.muted }}>Everyone</Text>
        </TouchableOpacity>
        {currentAssignees.map((emp: any) => {
          const isSelected = newGoalAssignees.includes(emp.id);
          return (
            <TouchableOpacity
              key={emp.id}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                marginRight: 8, marginBottom: 8,
                backgroundColor: isSelected ? colors.primary + "22" : colors.surface,
                opacity: !isSelected && newGoalAssignees.length >= 5 ? 0.4 : 1,
              }}
              onPress={() => {
                if (isSelected) {
                  setNewGoalAssignees(newGoalAssignees.filter(id => id !== emp.id));
                } else if (newGoalAssignees.length < 5) {
                  setNewGoalAssignees([...newGoalAssignees, emp.id]);
                } else {
                  Alert.alert("Max 5", "You can assign a goal to up to 5 people. Remove someone first.");
                }
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: isSelected ? colors.primary : colors.muted }}>
                {isSelected ? "✓ " : ""}{emp.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10, fontWeight: "500" }}>Priority</Text>
      <View style={{ flexDirection: "row", marginBottom: 20, gap: 8 }}>
        {PRIORITIES.map((p) => (
          <TouchableOpacity
            key={p}
            style={{
              paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
              backgroundColor: newGoalPriority === p ? PRIORITY_COLORS[p] + "22" : colors.surface,
            }}
            onPress={() => setNewGoalPriority(p)}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: PRIORITY_COLORS[p], textTransform: "capitalize" }}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10, fontWeight: "500" }}>Deadline -- Pick Date & Time</Text>
      <DateTimePicker value={newGoalDeadline} onChange={setNewGoalDeadline} colors={colors} />

      {newGoalDeadline ? (
        <Text style={{ fontSize: 13, color: colors.primary, marginTop: 10, marginBottom: 8, fontWeight: "700", textAlign: "center" }}>
          Due: {new Date(newGoalDeadline).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at {new Date(newGoalDeadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      ) : null}

      {/* Repeat Daily Toggle */}
      <TouchableOpacity
        onPress={() => {
          setNewGoalRepeatDaily(!newGoalRepeatDaily);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          backgroundColor: newGoalRepeatDaily ? colors.primary + "15" : colors.surface,
          borderRadius: 12, padding: 14, marginTop: 16, marginBottom: 8,
          borderWidth: newGoalRepeatDaily ? 1.5 : 1,
          borderColor: newGoalRepeatDaily ? colors.primary : colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <Text style={{ fontSize: 20 }}>{newGoalRepeatDaily ? "🔁" : "📅"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: newGoalRepeatDaily ? colors.primary : colors.foreground }}>Repeat Daily</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
              {newGoalRepeatDaily ? "This goal will auto-create every morning" : "One-time goal for this week"}
            </Text>
          </View>
        </View>
        <View style={{
          width: 48, height: 28, borderRadius: 14,
          backgroundColor: newGoalRepeatDaily ? colors.primary : colors.border,
          justifyContent: "center",
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 24, height: 24, borderRadius: 12,
            backgroundColor: "#fff",
            alignSelf: newGoalRepeatDaily ? "flex-end" : "flex-start",
            ...(Platform.OS === "ios" ? {
              shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2, shadowRadius: 2,
            } : { elevation: 2 }),
          }} />
        </View>
      </TouchableOpacity>

      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, marginBottom: 16 }}>
        Week: {formatWeekLabel(weekDate)}
      </Text>

      <TouchableOpacity
        style={{
          backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center",
          ...(Platform.OS === "ios" ? {
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 8,
          } : { elevation: 4 }),
          opacity: (createGoal.isPending || updateGoal.isPending) ? 0.7 : 1,
        }}
        onPress={isEdit ? handleSaveEdit : handleAddGoal}
        disabled={createGoal.isPending || updateGoal.isPending}
      >
        {(createGoal.isPending || updateGoal.isPending) ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{isEdit ? "Save Changes" : "Add Goal"}</Text>
        )}
      </TouchableOpacity>

      {isEdit && (
        <TouchableOpacity
          style={{ marginTop: 12, alignItems: "center", paddingVertical: 12 }}
          onPress={() => { setShowEditGoal(false); setEditingGoal(null); resetForm(); }}
        >
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  // ─── Goal Card ────────────────────────────────────────────────────────────────
  const setGoalStatus = useCallback((goalId: number, newStatus: GoalStatus) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateGoal.mutate({
      id: goalId,
      status: newStatus,
      completedAt: newStatus === "completed" ? new Date().toISOString() : undefined });
  }, [updateGoal]);

  const renderGoalCard = ({ item }: { item: any }) => {
    const status = item.status as GoalStatus;
    const priority = item.priority as Priority;
    const assigneeName = getAssigneeNames(item);
    const assigneeIds = item.assignedToList ? String(item.assignedToList).split(",").map(Number) : (item.assignedTo ? [item.assignedTo] : []);
    const isAssignedToMe = assigneeIds.includes(employee?.id || 0) || (!item.assignedTo && !item.assignedToList);
    const canUpdateStatus = isOwnerOrManager || isForeman || isAssignedToMe;
    const canEdit = isOwnerOrManager || (isForeman && item.createdBy === employee?.id) || isAssignedToMe;
    const isCompleted = status === "completed";
    const isCancelled = status === "cancelled";
    const dl = item.deadline ? new Date(item.deadline) : null;
    const now = new Date();
    const isOverdue = dl && dl < now && !isCompleted && !isCancelled;
    const isDueSoon = dl && !isOverdue && dl.getTime() - now.getTime() < 24 * 60 * 60 * 1000 && !isCompleted && !isCancelled;

    const statusOptions: { key: GoalStatus; label: string }[] = [
      { key: "pending", label: "Not Started" },
      { key: "in_progress", label: "In Progress" },
      { key: "completed", label: "Complete" },
    ];

    return (
      <View
        style={{
          marginHorizontal: 20, marginBottom: 12, borderRadius: 16,
          backgroundColor: colors.surface, overflow: "hidden",
          ...(Platform.OS === "ios" ? {
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06, shadowRadius: 8,
          } : { elevation: 2 }),
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <View style={{
            width: 4,
            backgroundColor: isCompleted ? colors.muted + "44" : PRIORITY_STRIP[priority],
            borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
          }} />
          <View style={{ flex: 1, padding: 16 }}>
            {/* Title row — tap to edit */}
            <TouchableOpacity
              onPress={() => canEdit && openEditModal(item)}
              activeOpacity={canEdit ? 0.7 : 1}
              style={{ flexDirection: "row", alignItems: "flex-start" }}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: STATUS_COLORS[status] + "18",
                alignItems: "center", justifyContent: "center",
                marginRight: 12, marginTop: 1,
              }}>
                <Text style={{ fontSize: 16, color: STATUS_COLORS[status], fontWeight: "700" }}>
                  {STATUS_ICONS[status]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 15, fontWeight: "700",
                  color: isCompleted ? colors.muted : colors.foreground,
                  textDecorationLine: isCompleted ? "line-through" : "none",
                  lineHeight: 20,
                }}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 }} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {canEdit && (
                  <Text style={{ fontSize: 11, color: colors.primary, marginTop: 4, fontWeight: "600" }}>
                    Tap to edit
                  </Text>
                )}
              </View>
              {canManage && (
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: colors.error + "0D",
                    alignItems: "center", justifyContent: "center", marginLeft: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.muted }}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* Info badges */}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <View style={{ backgroundColor: PRIORITY_COLORS[priority] + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: PRIORITY_COLORS[priority], textTransform: "uppercase", letterSpacing: 0.5 }}>{priority}</Text>
              </View>
              <View style={{ backgroundColor: (item.assignedTo || item.assignedToList) ? colors.primary + "14" : colors.muted + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "60%" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: (item.assignedTo || item.assignedToList) ? colors.primary : colors.muted }} numberOfLines={1}>{assigneeName}</Text>
              </View>
              {dl && (() => {
                const deadlineColor = isOverdue ? colors.error : isDueSoon ? colors.warning : colors.muted;
                return (
                  <View style={{ backgroundColor: deadlineColor + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Text style={{ fontSize: 9 }}>{isOverdue ? "\u23F0" : "\uD83D\uDCC5"}</Text>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: deadlineColor }}>
                      {isOverdue ? "OVERDUE" : isDueSoon ? "Due Soon" : `${dl.toLocaleDateString([], { month: "short", day: "numeric" })}`}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Status action buttons — always visible, clearly separated */}
            {canUpdateStatus && !isCancelled && (
              <View style={{
                flexDirection: "row", gap: 8, marginTop: 12,
                paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border + "40",
              }}>
                {statusOptions.map((opt) => {
                  const isActive = status === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => !isActive && setGoalStatus(item.id, opt.key)}
                      activeOpacity={isActive ? 1 : 0.7}
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: isActive ? STATUS_COLORS[opt.key] + "22" : colors.background,
                        borderWidth: isActive ? 1.5 : 1,
                        borderColor: isActive ? STATUS_COLORS[opt.key] : colors.border + "60",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{
                        fontSize: 11, fontWeight: isActive ? "800" : "600",
                        color: isActive ? STATUS_COLORS[opt.key] : colors.muted,
                        letterSpacing: 0.3,
                      }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER ────────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <ScreenContainer>
      <ImageBackground source={bg_jobs} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>

        {/* Header with title */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>
            {isLaborer ? "My Tasks" : "Goals & Tasks"}
          </Text>
          {canManage && activeSubTab === "goals" && (
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary, borderRadius: 12,
                paddingHorizontal: 16, paddingVertical: 10,
                ...(Platform.OS === "ios" ? {
                  shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.25, shadowRadius: 6,
                } : { elevation: 3 }),
              }}
              onPress={() => { resetForm(); setShowAddGoal(true); }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>+ Goal</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ─── Sub-Tab Switcher ─────────────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginTop: 8, marginBottom: 4, gap: 0 }}>
          {(["goals", "punchlist"] as SubTab[]).map((tab) => {
            const isActive = activeSubTab === tab;
            const label = tab === "goals" ? "Goals" : "Punch List";
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveSubTab(tab)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: "center",
                  borderBottomWidth: 2.5,
                  borderBottomColor: isActive ? colors.primary : "transparent",
                }}
              >
                <Text style={{
                  fontSize: 14, fontWeight: isActive ? "800" : "600",
                  color: isActive ? colors.primary : colors.muted,
                }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Goals Sub-Tab Content ─────────────────────────────────────────────── */}
        {activeSubTab === "goals" && (
          <View style={{ flex: 1 }}>
            {/* Week Navigator */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
              <TouchableOpacity style={{ padding: 10 }} onPress={() => setWeekOffset((w) => w - 1)}>
                <Text style={{ fontSize: 22, color: colors.primary, fontWeight: "700" }}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWeekOffset(0)} style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{formatWeekLabel(weekDate)}</Text>
                {weekOffset === 0 ? (
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>This Week</Text>
                ) : (
                  <Text style={{ fontSize: 11, color: colors.muted }}>Tap to return to this week</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ padding: 10 }}
                onPress={() => setWeekOffset((w) => w + 1)}
                disabled={weekOffset >= 0}
              >
                <Text style={{ fontSize: 22, color: weekOffset >= 0 ? colors.border : colors.primary, fontWeight: "700" }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Filter by Assignee (owner only) */}
            {isOwner && assignableEmployees.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginRight: 6,
                      backgroundColor: filterAssignee === "all" ? colors.primary + "22" : colors.surface,
                    }}
                    onPress={() => setFilterAssignee("all")}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: filterAssignee === "all" ? colors.primary : colors.muted }}>All</Text>
                  </TouchableOpacity>
                  {assignableEmployees.map((emp: any) => (
                    <TouchableOpacity
                      key={emp.id}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginRight: 6,
                        backgroundColor: filterAssignee === emp.id ? colors.primary + "22" : colors.surface,
                      }}
                      onPress={() => setFilterAssignee(filterAssignee === emp.id ? "all" : emp.id)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: filterAssignee === emp.id ? colors.primary : colors.muted }}>{emp.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Progress Bar */}
            {totalCount > 0 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}>{completedCount}/{totalCount} completed</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>{Math.round((completedCount / totalCount) * 100)}%</Text>
                </View>
                <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2 }}>
                  <View style={{
                    height: 4, borderRadius: 2, backgroundColor: colors.success,
                    width: `${(completedCount / totalCount) * 100}%`,
                  }} />
                </View>
              </View>
            )}

            {/* Add Goal Modal */}
            <Modal visible={showAddGoal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddGoal(false)}>
              <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>
                    {isForeman ? "Create Goal for Team" : "Add Weekly Goal"}
                  </Text>
                  <TouchableOpacity onPress={() => { setShowAddGoal(false); resetForm(); }}>
                    <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                {renderGoalForm(false)}
              </KeyboardAvoidingView>
            </Modal>

            {/* Edit Goal Modal */}
            <Modal visible={showEditGoal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowEditGoal(false); setEditingGoal(null); resetForm(); }}>
              <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Edit Goal</Text>
                  <TouchableOpacity onPress={() => { setShowEditGoal(false); setEditingGoal(null); resetForm(); }}>
                    <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Close</Text>
                  </TouchableOpacity>
                </View>
                {renderGoalForm(true)}
              </KeyboardAvoidingView>
            </Modal>

            {/* Goals List */}
            {isLoading && !cachedGoals ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredGoals}
                keyExtractor={(item: any) => item.id.toString()}
                keyboardShouldPersistTaps="handled"
                renderItem={renderGoalCard}
                ListEmptyComponent={
                  <View style={{ alignItems: "center", padding: 40 }}>
                    <Text style={{ fontSize: 40 }}>🎯</Text>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 12 }}>
                      {isLaborer ? "No goals assigned to you this week" : "No goals this week"}
                    </Text>
                    {canManage && (
                      <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                        Tap "+ Goal" to add a weekly goal, or generate goals from a meeting summary.
                      </Text>
                    )}
                    {isLaborer && (
                      <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                        Your foreman or manager will assign goals to you here.
                      </Text>
                    )}
                  </View>
                }
                contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
                onRefresh={refetch}
                refreshing={isLoading}
              />
            )}
          </View>
        )}

        {/* ─── Punch List Sub-Tab Content ────────────────────────────────────────── */}
        {activeSubTab === "punchlist" && (
          <PunchListSubTab colors={colors} employee={employee} canManage={canManage} />
        )}

      </ImageBackground>
    </ScreenContainer>
  );
}
