import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
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
  View,
} from "react-native";

type Priority = "low" | "medium" | "high";
type GoalStatus = "pending" | "in_progress" | "completed" | "cancelled";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#EF4444",
};

const STATUS_ICONS: Record<GoalStatus, string> = {
  pending: "○",
  in_progress: "◑",
  completed: "●",
  cancelled: "✕",
};

const STATUS_COLORS: Record<GoalStatus, string> = {
  pending: "#9CA3AF",
  in_progress: "#0EA5E9",
  completed: "#22C55E",
  cancelled: "#9CA3AF",
};

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
  colors,
}: {
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
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
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
                width: "14.28%", height: 36, alignItems: "center", justifyContent: "center",
              }}
            >
              <View style={{
                width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
                backgroundColor: sel ? colors.primary : "transparent",
                borderWidth: td && !sel ? 1.5 : 0,
                borderColor: colors.primary,
              }}>
                <Text style={{
                  fontSize: 13, fontWeight: sel || td ? "700" : "400",
                  color: sel ? "#fff" : td ? colors.primary : colors.foreground,
                }}>{day}</Text>
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
          style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{String(hour).padStart(2, "0")}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>:</Text>
        {/* Minute */}
        <TouchableOpacity
          onPress={() => { const m = minute >= 45 ? 0 : minute + 15; handleTimeChange(hour, m, ampm); }}
          style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{String(minute).padStart(2, "0")}</Text>
        </TouchableOpacity>
        {/* AM/PM */}
        <TouchableOpacity
          onPress={() => { const newAmpm = ampm === "AM" ? "PM" : "AM"; handleTimeChange(hour, minute, newAmpm); }}
          style={{ backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.primary }}
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
  const [newGoalAssignee, setNewGoalAssignee] = useState<number | null>(null);
  const [newGoalDeadline, setNewGoalDeadline] = useState<string>("");
  const [filterAssignee, setFilterAssignee] = useState<number | "all">("all");

  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(weekDate);

  const utils = trpc.useUtils();
  const { data: goals, isLoading, refetch } = trpc.goals.list.useQuery({
    weekOf: weekStart.toISOString(),
  });
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
    },
  });
  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: () => {
      utils.goals.list.invalidate();
      setShowEditGoal(false);
      setEditingGoal(null);
    },
  });
  const deleteGoal = trpc.goals.delete.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });

  const resetForm = () => {
    setNewGoalTitle("");
    setNewGoalDescription("");
    setNewGoalPriority("medium");
    setNewGoalAssignee(null);
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

  // Filter goals
  const filteredGoals = useMemo(() => {
    if (!goals) return [];
    let filtered = [...goals];

    if (isOwner) {
      if (filterAssignee !== "all") {
        filtered = filtered.filter((g: any) => g.assignedTo === filterAssignee);
      }
    } else if (isLaborer) {
      // Laborers only see goals assigned to them
      filtered = filtered.filter((g: any) => g.assignedTo === employee?.id);
    } else if (isForeman) {
      // Foreman sees goals assigned to them AND goals they created for laborers
      filtered = filtered.filter((g: any) =>
        g.assignedTo === employee?.id || g.createdBy === employee?.id
      );
    } else {
      // Secretary, logistics — see goals assigned to them
      filtered = filtered.filter((g: any) => g.assignedTo === employee?.id);
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
    priorityBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      marginRight: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.foreground,
      backgroundColor: colors.background,
      marginBottom: 12,
    },
    assigneeChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      marginRight: 8,
      marginBottom: 8,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      marginRight: 6,
    },
  });

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
      completedAt: nextStatus === "completed" ? new Date().toISOString() : undefined,
    });
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
    setNewGoalAssignee(goal.assignedTo || null);
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
      assignedTo: newGoalAssignee || undefined,
      deadline: newGoalDeadline || null,
    });
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
      assignedTo: newGoalAssignee || undefined,
      deadline: newGoalDeadline || undefined,
    });
  };

  const PRIORITIES: Priority[] = ["low", "medium", "high"];

  const getAssigneeName = (id: number | null | undefined): string => {
    if (!id) return "Unassigned";
    return employeeMap[id] || "Unknown";
  };

  const currentAssignees = isForeman ? foremanAssignees : assignableEmployees;

  // ─── Goal Form (shared between Add and Edit) ────────────────────────────────
  const renderGoalForm = (isEdit: boolean) => (
    <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Goal Title *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Complete framing on Unit 38"
        placeholderTextColor={colors.muted}
        value={newGoalTitle}
        onChangeText={setNewGoalTitle}
        autoFocus={!isEdit}
        returnKeyType="next"
      />

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Description (optional)</Text>
      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
        placeholder="Add more details about this goal…"
        placeholderTextColor={colors.muted}
        value={newGoalDescription}
        onChangeText={setNewGoalDescription}
        multiline
        returnKeyType="done"
      />

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>Assign To</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.assigneeChip, {
            borderColor: !newGoalAssignee ? colors.primary : colors.border,
            backgroundColor: !newGoalAssignee ? colors.primary + "18" : "transparent",
          }]}
          onPress={() => setNewGoalAssignee(null)}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: !newGoalAssignee ? colors.primary : colors.muted }}>Everyone</Text>
        </TouchableOpacity>
        {currentAssignees.map((emp: any) => (
          <TouchableOpacity
            key={emp.id}
            style={[styles.assigneeChip, {
              borderColor: newGoalAssignee === emp.id ? colors.primary : colors.border,
              backgroundColor: newGoalAssignee === emp.id ? colors.primary + "18" : "transparent",
            }]}
            onPress={() => setNewGoalAssignee(newGoalAssignee === emp.id ? null : emp.id)}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: newGoalAssignee === emp.id ? colors.primary : colors.muted }}>{emp.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>Priority</Text>
      <View style={{ flexDirection: "row", marginBottom: 20 }}>
        {PRIORITIES.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.priorityBtn, { borderColor: PRIORITY_COLORS[p], backgroundColor: newGoalPriority === p ? PRIORITY_COLORS[p] + "22" : "transparent" }]}
            onPress={() => setNewGoalPriority(p)}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: PRIORITY_COLORS[p], textTransform: "capitalize" }}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>Deadline — Pick Date & Time</Text>
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
        style={[styles.primaryBtn, (createGoal.isPending || updateGoal.isPending) && { opacity: 0.7 }]}
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

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>
          {isLaborer ? "My Goals" : "Weekly Goals"}
        </Text>
        {canManage && (
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
            onPress={() => { resetForm(); setShowAddGoal(true); }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ Goal</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Week Navigator */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
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
              style={[styles.filterChip, {
                borderColor: filterAssignee === "all" ? colors.primary : colors.border,
                backgroundColor: filterAssignee === "all" ? colors.primary + "18" : "transparent",
              }]}
              onPress={() => setFilterAssignee("all")}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: filterAssignee === "all" ? colors.primary : colors.muted }}>All</Text>
            </TouchableOpacity>
            {assignableEmployees.map((emp: any) => (
              <TouchableOpacity
                key={emp.id}
                style={[styles.filterChip, {
                  borderColor: filterAssignee === emp.id ? colors.primary : colors.border,
                  backgroundColor: filterAssignee === emp.id ? colors.primary + "18" : "transparent",
                }]}
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
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>{completedCount}/{totalCount} completed</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.success }}>{Math.round((completedCount / totalCount) * 100)}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.success, width: `${(completedCount / totalCount) * 100}%` }} />
          </View>
        </View>
      )}

      {/* Add Goal Modal */}
      <Modal visible={showAddGoal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddGoal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
          renderItem={({ item }: { item: any }) => {
            const status = item.status as GoalStatus;
            const priority = item.priority as Priority;
            const assigneeName = getAssigneeName(item.assignedTo);
            const canUpdateStatus = isOwnerOrManager || isForeman || item.assignedTo === employee?.id;
            const canEdit = isOwnerOrManager || (isForeman && item.createdBy === employee?.id) || item.assignedTo === employee?.id;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => canEdit ? openEditModal(item) : (canUpdateStatus && handleStatusCycle(item))}
                onLongPress={() => canUpdateStatus && handleStatusCycle(item)}
                activeOpacity={0.75}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  {/* Status icon — tap to cycle */}
                  <TouchableOpacity onPress={() => canUpdateStatus && handleStatusCycle(item)} style={{ paddingTop: 2 }}>
                    <Text style={{ fontSize: 22, color: STATUS_COLORS[status] }}>{STATUS_ICONS[status]}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: status === "completed" ? colors.muted : colors.foreground, textDecorationLine: status === "completed" ? "line-through" : "none" }}>
                      {item.title}
                    </Text>
                    {item.description ? (
                      <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 }}>{item.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <View style={{ backgroundColor: PRIORITY_COLORS[priority] + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: PRIORITY_COLORS[priority], textTransform: "capitalize" }}>{priority}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: STATUS_COLORS[status], fontWeight: "600", textTransform: "capitalize" }}>
                        {status.replace("_", " ")}
                      </Text>
                      {/* Assignee badge */}
                      <View style={{ backgroundColor: item.assignedTo ? colors.primary + "18" : colors.border + "66", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: item.assignedTo ? colors.primary : colors.muted }}>
                          {assigneeName}
                        </Text>
                      </View>

                      {/* Deadline badge */}
                      {item.deadline && (() => {
                        const dl = new Date(item.deadline);
                        const now = new Date();
                        const isOverdue = dl < now && status !== "completed" && status !== "cancelled";
                        const isDueSoon = !isOverdue && dl.getTime() - now.getTime() < 24 * 60 * 60 * 1000 && status !== "completed" && status !== "cancelled";
                        const deadlineColor = isOverdue ? colors.error : isDueSoon ? colors.warning : colors.muted;
                        return (
                          <View style={{ backgroundColor: deadlineColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Text style={{ fontSize: 10 }}>{isOverdue ? "\u23F0" : "\uD83D\uDCC5"}</Text>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: deadlineColor }}>
                              {isOverdue ? "OVERDUE" : isDueSoon ? "Due Soon" : `${dl.toLocaleDateString([], { month: "short", day: "numeric" })} ${dl.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                            </Text>
                          </View>
                        );
                      })()}

                      {/* Edit hint */}
                      {canEdit && (
                        <Text style={{ fontSize: 10, color: colors.muted }}>tap to edit</Text>
                      )}
                    </View>
                  </View>
                  {canManage && (
                    <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: 4 }}>
                      <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>🎯</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                {isLaborer ? "No goals assigned to you this week" : !isOwnerOrManager && !isForeman ? "No goals this week" : "No goals this week"}
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
          contentContainerStyle={{ paddingBottom: 32 }}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}
    </ScreenContainer>
  );
}
