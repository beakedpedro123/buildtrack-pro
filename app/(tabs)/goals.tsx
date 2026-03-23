import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState, useMemo } from "react";
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

export default function GoalsScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState<Priority>("medium");
  const [newGoalAssignee, setNewGoalAssignee] = useState<number | null>(null);
  const [newGoalDeadline, setNewGoalDeadline] = useState<string>(""); // ISO date string
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<number | "all">("all");
  const [showFilterPicker, setShowFilterPicker] = useState(false);

  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(weekDate);

  const utils = trpc.useUtils();
  const { data: goals, isLoading, refetch } = trpc.goals.list.useQuery({
    weekOf: weekStart.toISOString(),
  });
  const { data: allEmployees } = trpc.employees.list.useQuery();

  // Build a lookup map for employee names
  const employeeMap = useMemo(() => {
    const map: Record<number, string> = {};
    (allEmployees || []).forEach((e: any) => { map[e.id] = e.name; });
    return map;
  }, [allEmployees]);

  // Assignable employees (foreman, laborer, logistics)
  const assignableEmployees = useMemo(() => {
    return (allEmployees || []).filter((e: any) => e.isActive);
  }, [allEmployees]);

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => {
      utils.goals.list.invalidate();
      setShowAddGoal(false);
      setNewGoalTitle("");
      setNewGoalDescription("");
      setNewGoalPriority("medium");
      setNewGoalAssignee(null);
      setNewGoalDeadline("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });
  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });
  const deleteGoal = trpc.goals.delete.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });

  // Roles that can view/manage goals
  const isOwner = employee?.role === "owner";
  const isOwnerOrManager = ["owner", "secretary", "logistics"].includes(employee?.role || "");
  const isForeman = employee?.role === "foreman";
  // Laborers cannot access goals at all; foreman/logistics/secretary see only their own
  const canView = isOwnerOrManager || isForeman;
  const canManage = isOwnerOrManager; // only owner/secretary/logistics can create/edit/delete

  // Filter goals based on role and filter selection
  const filteredGoals = useMemo(() => {
    if (!goals) return [];
    let filtered = [...goals];

    if (isOwner) {
      // Owner sees all goals, but can filter by assignee
      if (filterAssignee !== "all") {
        filtered = filtered.filter((g: any) => g.assignedTo === filterAssignee);
      }
    } else {
      // Secretary, logistics, foreman — only see goals assigned to them
      filtered = filtered.filter((g: any) => g.assignedTo === employee?.id);
    }

    return filtered;
  }, [goals, filterAssignee, isOwner, employee?.id]);

  const completedCount = filteredGoals.filter((g: any) => g.status === "completed").length;
  const totalCount = filteredGoals.filter((g: any) => g.status !== "cancelled").length;

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
    outlineBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.primary,
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

  if (!canView) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>Access Restricted</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>Weekly goals are visible to management and foremen.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleStatusCycle = (goal: any) => {
    // Foremen and laborers can update status on their own goals
    if (!isOwnerOrManager && goal.assignedTo !== employee?.id) return;
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

  const handleReassign = (goal: any) => {
    if (!isOwnerOrManager) return;
    const buttons = assignableEmployees.map((emp: any) => ({
      text: emp.name,
      onPress: () => updateGoal.mutate({ id: goal.id, assignedTo: emp.id }),
    }));
    buttons.push({ text: "Unassign", onPress: () => updateGoal.mutate({ id: goal.id, assignedTo: undefined as any }) });
    buttons.push({ text: "Cancel", onPress: () => {} });
    Alert.alert("Assign Goal To", "Select a team member:", buttons as any);
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

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>Weekly Goals</Text>
        {canManage && (
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
            onPress={() => setShowAddGoal(true)}
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Add Weekly Goal</Text>
            <TouchableOpacity onPress={() => { setShowAddGoal(false); setNewGoalTitle(""); setNewGoalDescription(""); setNewGoalAssignee(null); setNewGoalDeadline(""); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Goal Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Complete framing on Job #3"
              placeholderTextColor={colors.muted}
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
              autoFocus
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
              {assignableEmployees.map((emp: any) => (
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

            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>Deadline (optional)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {/* Quick deadline buttons */}
              {[
                { label: "No Deadline", value: "" },
                { label: "End of Week", value: (() => { const d = new Date(weekStart); d.setDate(d.getDate() + 4); d.setHours(17, 0, 0, 0); return d.toISOString(); })() },
                { label: "Tomorrow", value: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(17, 0, 0, 0); return d.toISOString(); })() },
                { label: "+3 Days", value: (() => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(17, 0, 0, 0); return d.toISOString(); })() },
                { label: "+1 Week", value: (() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(17, 0, 0, 0); return d.toISOString(); })() },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.assigneeChip, {
                    borderColor: newGoalDeadline === opt.value ? colors.primary : colors.border,
                    backgroundColor: newGoalDeadline === opt.value ? colors.primary + "18" : "transparent",
                  }]}
                  onPress={() => setNewGoalDeadline(opt.value)}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: newGoalDeadline === opt.value ? colors.primary : colors.muted }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {newGoalDeadline ? (
              <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 12, fontWeight: "600" }}>
                Due: {new Date(newGoalDeadline).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </Text>
            ) : null}

            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
              Week: {formatWeekLabel(weekDate)}
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, createGoal.isPending && { opacity: 0.7 }]}
              onPress={handleAddGoal}
              disabled={createGoal.isPending}
            >
              {createGoal.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Add Goal</Text>}
            </TouchableOpacity>
          </ScrollView>
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
            const canUpdateStatus = isOwnerOrManager || item.assignedTo === employee?.id;
            return (
              <TouchableOpacity style={styles.card} onPress={() => canUpdateStatus && handleStatusCycle(item)} activeOpacity={canUpdateStatus ? 0.75 : 1}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <Text style={{ fontSize: 22, color: STATUS_COLORS[status], marginTop: 1 }}>{STATUS_ICONS[status]}</Text>
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
                      <TouchableOpacity
                        onPress={() => isOwnerOrManager && handleReassign(item)}
                        style={{ backgroundColor: item.assignedTo ? colors.primary + "18" : colors.border + "66", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: item.assignedTo ? colors.primary : colors.muted }}>
                          {assigneeName}
                        </Text>
                      </TouchableOpacity>
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
                              {isOverdue ? "OVERDUE" : isDueSoon ? "Due Soon" : dl.toLocaleDateString([], { month: "short", day: "numeric" })}
                            </Text>
                          </View>
                        );
                      })()}
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
                {!isOwnerOrManager ? "No goals assigned to you this week" : "No goals this week"}
              </Text>
              {canManage && (
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                  Tap "+ Goal" to add a weekly goal, or generate goals from a meeting summary.
                </Text>
              )}
              {!isOwnerOrManager && (
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                  Your manager will assign goals to you here.
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
