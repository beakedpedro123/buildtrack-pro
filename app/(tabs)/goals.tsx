import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState, useMemo } from "react";
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

type Priority = "low" | "medium" | "high";
type GoalStatus = "pending" | "in_progress" | "completed" | "cancelled";

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

// Accent gradient-like left strip colors for flashcards
const PRIORITY_STRIP: Record<Priority, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#EF4444" };

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
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
      {/* Month/Year Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>{monthNames[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day names */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {dayNames.map(d => (
          <View key={d} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
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
              style={{
                width: "14.28%", height: 36, alignItems: "center", justifyContent: "center" }}
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

      {/* Time Picker */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12, gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600", marginRight: 4 }}>Time:</Text>
        {/* Hour */}
        <TouchableOpacity
          onPress={() => { const h = hour >= 12 ? 1 : hour + 1; handleTimeChange(h, minute, ampm); }}
          style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{String(hour).padStart(2, "0")}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>:</Text>
        {/* Minute */}
        <TouchableOpacity
          onPress={() => { const m = minute >= 45 ? 0 : minute + 15; handleTimeChange(hour, m, ampm); }}
          style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{String(minute).padStart(2, "0")}</Text>
        </TouchableOpacity>
        {/* AM/PM */}
        <TouchableOpacity
          onPress={() => { const newAmpm = ampm === "AM" ? "PM" : "AM"; handleTimeChange(hour, minute, newAmpm); }}
          style={{ backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>{ampm}</Text>
        </TouchableOpacity>
      </View>

      {/* Clear button */}
      <TouchableOpacity onPress={() => { setSelectedDay(0); onChange(""); }} style={{ alignSelf: "center", marginTop: 8, padding: 6 }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>Clear Deadline</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState<Priority>("medium");
  const [newGoalAssignees, setNewGoalAssignees] = useState<number[]>([]);
  const [newGoalDeadline, setNewGoalDeadline] = useState<string>("");
  const [filterAssignee, setFilterAssignee] = useState<number | "all">("all");

  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(weekDate);

  const utils = trpc.useUtils();
  const { data: goals, isLoading, refetch } = trpc.goals.list.useQuery({
    weekOf: weekStart.toISOString(),
    employeeId: employee?.id,
    employeeRole: employee?.role });
  const { data: allEmployees } = trpc.employees.list.useQuery();

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
  };

  // Roles
  const isOwner = employee?.role === "owner";
  const isOwnerOrManager = ["owner", "secretary", "logistics"].includes(employee?.role || "");
  const isForeman = employee?.role === "foreman";
  const isLaborer = employee?.role === "laborer";

  // Foreman can now create goals for laborers; management can create for anyone
  const canView = true; // Everyone can view their goals
  const canManage = isOwnerOrManager || isForeman; // Foreman can create goals too

  // Filter goals — privacy is also enforced server-side
  const filteredGoals = useMemo(() => {
    if (!goals) return [];
    let filtered = [...goals];

    const isGoalForMe = (g: any) => {
      if (g.assignedToList) {
        const ids = String(g.assignedToList).split(",").map(Number);
        return ids.includes(employee?.id || 0);
      }
      if (g.assignedTo) return g.assignedTo === employee?.id;
      return true; // no assignment = everyone
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

  // Foreman can only assign to laborers and themselves
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
    // Restore multi-assign from assignedToList or fallback to single assignedTo
    if (goal.assignedToList) {
      setNewGoalAssignees(String(goal.assignedToList).split(",").map(Number));
    } else if (goal.assignedTo) {
      setNewGoalAssignees([goal.assignedTo]);
    } else {
      setNewGoalAssignees([]);
    }
    setNewGoalDeadline(goal.deadline || "");
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
      deadline: newGoalDeadline || null });
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
      deadline: newGoalDeadline || undefined });
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

  // ─── Goal Form (shared between Add and Edit) ────────────────────────────────
  const renderGoalForm = (isEdit: boolean) => (
    <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "500" }}>Goal Title *</Text>
      <TextInput
        style={{
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 15,
          color: colors.foreground,
          backgroundColor: colors.surface,
          marginBottom: 16,
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
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 15,
          color: colors.foreground,
          backgroundColor: colors.surface,
          marginBottom: 16,
          minHeight: 80,
          textAlignVertical: "top",
        }}
        placeholder="Add more details about this goal…"
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
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            marginRight: 8,
            marginBottom: 8,
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
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                marginRight: 8,
                marginBottom: 8,
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
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 20,
              backgroundColor: newGoalPriority === p ? PRIORITY_COLORS[p] + "22" : colors.surface,
            }}
            onPress={() => setNewGoalPriority(p)}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: PRIORITY_COLORS[p], textTransform: "capitalize" }}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10, fontWeight: "500" }}>Deadline — Pick Date & Time</Text>
      <DateTimePicker value={newGoalDeadline} onChange={setNewGoalDeadline} colors={colors} />

      {newGoalDeadline ? (
        <Text style={{ fontSize: 13, color: colors.primary, marginTop: 10, marginBottom: 8, fontWeight: "700", textAlign: "center" }}>
          Due: {new Date(newGoalDeadline).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at {new Date(newGoalDeadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      ) : null}

      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, marginBottom: 16 }}>
        Week: {formatWeekLabel(weekDate)}
      </Text>

      <TouchableOpacity
        style={{
          backgroundColor: colors.primary,
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: "center",
          ...(Platform.OS === "ios" ? {
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
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
          onPress={() => {
            setShowEditGoal(false);
            setEditingGoal(null);
            resetForm();
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  // ─── Flashcard Goal Item ────────────────────────────────────────────────────
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

    // Deadline info
    const dl = item.deadline ? new Date(item.deadline) : null;
    const now = new Date();
    const isOverdue = dl && dl < now && !isCompleted && !isCancelled;
    const isDueSoon = dl && !isOverdue && dl.getTime() - now.getTime() < 24 * 60 * 60 * 1000 && !isCompleted && !isCancelled;

    return (
      <TouchableOpacity
        onPress={() => canEdit ? openEditModal(item) : (canUpdateStatus && handleStatusCycle(item))}
        onLongPress={() => canUpdateStatus && handleStatusCycle(item)}
        activeOpacity={0.8}
        style={{
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 16,
          backgroundColor: colors.surface,
          overflow: "hidden",
          ...(Platform.OS === "ios" ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
          } : { elevation: 2 }),
        }}
      >
        <View style={{ flexDirection: "row" }}>
          {/* Priority accent strip — left edge */}
          <View style={{
            width: 4,
            backgroundColor: isCompleted ? colors.muted + "44" : PRIORITY_STRIP[priority],
            borderTopLeftRadius: 16,
            borderBottomLeftRadius: 16,
          }} />

          {/* Card content */}
          <View style={{ flex: 1, padding: 16 }}>
            {/* Top row: status + title + delete */}
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              {/* Status circle — tap to cycle */}
              <TouchableOpacity
                onPress={() => canUpdateStatus && handleStatusCycle(item)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: STATUS_COLORS[status] + "18",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                  marginTop: 1,
                }}
              >
                <Text style={{ fontSize: 16, color: STATUS_COLORS[status], fontWeight: "700" }}>
                  {STATUS_ICONS[status]}
                </Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 15,
                  fontWeight: "700",
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
              </View>

              {canManage && (
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.error + "0D",
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.muted }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Bottom row: metadata pills */}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* Priority pill */}
              <View style={{
                backgroundColor: PRIORITY_COLORS[priority] + "14",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: PRIORITY_COLORS[priority], textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {priority}
                </Text>
              </View>

              {/* Status pill */}
              <View style={{
                backgroundColor: STATUS_COLORS[status] + "14",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: STATUS_COLORS[status], textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {status.replace("_", " ")}
                </Text>
              </View>

              {/* Assignee pill(s) */}
              <View style={{
                backgroundColor: (item.assignedTo || item.assignedToList) ? colors.primary + "14" : colors.muted + "14",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                maxWidth: "60%",
              }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: (item.assignedTo || item.assignedToList) ? colors.primary : colors.muted }} numberOfLines={1}>
                  {assigneeName}
                </Text>
              </View>

              {/* Deadline pill */}
              {dl && (() => {
                const deadlineColor = isOverdue ? colors.error : isDueSoon ? colors.warning : colors.muted;
                return (
                  <View style={{
                    backgroundColor: deadlineColor + "14",
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                  }}>
                    <Text style={{ fontSize: 9 }}>{isOverdue ? "\u23F0" : "\uD83D\uDCC5"}</Text>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: deadlineColor }}>
                      {isOverdue ? "OVERDUE" : isDueSoon ? "Due Soon" : `${dl.toLocaleDateString([], { month: "short", day: "numeric" })}`}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
        <ImageBackground source={bg_jobs} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>
          {isLaborer ? "My Goals" : "Weekly Goals"}
        </Text>
        {canManage && (
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              ...(Platform.OS === "ios" ? {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
              } : { elevation: 3 }),
            }}
            onPress={() => { resetForm(); setShowAddGoal(true); }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>+ Goal</Text>
          </TouchableOpacity>
        )}
      </View>

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

      {/* Filter by Assignee (only for owner) */}
      {isOwner && assignableEmployees.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 16,
                marginRight: 6,
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
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 16,
                  marginRight: 6,
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

      {/* Progress Bar — sleek minimal */}
      {totalCount > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}>{completedCount}/{totalCount} completed</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>{Math.round((completedCount / totalCount) * 100)}%</Text>
          </View>
          <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2 }}>
            <View style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.success,
              width: `${(completedCount / totalCount) * 100}%`,
            }} />
          </View>
        </View>
      )}

      {/* Add Goal Modal */}
      <Modal visible={showAddGoal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddGoal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
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
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Edit Goal</Text>
            <TouchableOpacity onPress={() => { setShowEditGoal(false); setEditingGoal(null); resetForm(); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </View>
          {renderGoalForm(true)}
        </KeyboardAvoidingView>
      </Modal>

      {isLoading ? (
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
    </ImageBackground>
    </ScreenContainer>
  );
}
