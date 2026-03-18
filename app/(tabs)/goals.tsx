import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState } from "react";
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

  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(weekDate);

  const utils = trpc.useUtils();
  const { data: goals, isLoading, refetch } = trpc.goals.list.useQuery({
    weekOf: weekStart.toISOString(),
  });

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => {
      utils.goals.list.invalidate();
      setShowAddGoal(false);
      setNewGoalTitle("");
      setNewGoalDescription("");
      setNewGoalPriority("medium");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });
  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });
  const deleteGoal = trpc.goals.delete.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });

  // Goals visible to all except laborer
  const canView = ["owner", "secretary", "logistics", "foreman"].includes(employee?.role || "");
  const canManage = canView; // same roles can create/edit goals

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

  const completedCount = (goals || []).filter((g) => g.status === "completed").length;
  const totalCount = (goals || []).filter((g) => g.status !== "cancelled").length;

  const handleStatusCycle = (goal: any) => {
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
    });
  };

  const PRIORITIES: Priority[] = ["low", "medium", "high"];

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
            <TouchableOpacity onPress={() => { setShowAddGoal(false); setNewGoalTitle(""); setNewGoalDescription(""); }}>
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
          data={goals || []}
          keyExtractor={(item) => item.id.toString()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const status = item.status as GoalStatus;
            const priority = item.priority as Priority;
            return (
              <TouchableOpacity style={styles.card} onPress={() => canManage && handleStatusCycle(item)} activeOpacity={canManage ? 0.75 : 1}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <Text style={{ fontSize: 22, color: STATUS_COLORS[status], marginTop: 1 }}>{STATUS_ICONS[status]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: status === "completed" ? colors.muted : colors.foreground, textDecorationLine: status === "completed" ? "line-through" : "none" }}>
                      {item.title}
                    </Text>
                    {item.description ? (
                      <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 }}>{item.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                      <View style={{ backgroundColor: PRIORITY_COLORS[priority] + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: PRIORITY_COLORS[priority], textTransform: "capitalize" }}>{priority}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: STATUS_COLORS[status], fontWeight: "600", textTransform: "capitalize" }}>
                        {status.replace("_", " ")}
                      </Text>
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
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>No goals this week</Text>
              {canManage && (
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                  Tap "+ Goal" to add a weekly goal, or generate goals from a meeting summary.
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
