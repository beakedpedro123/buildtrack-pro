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
  Platform,
  StyleSheet,
  Text,
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
  const [newGoalPriority, setNewGoalPriority] = useState<Priority>("medium");

  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(weekDate);

  const utils = trpc.useUtils();
  const { data: goals, isLoading, refetch } = trpc.goals.list.useQuery({
    weekOf: weekStart.toISOString(),
  });

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => { utils.goals.list.invalidate(); setShowAddGoal(false); setNewGoalTitle(""); setNewGoalPriority("medium"); },
  });
  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });
  const deleteGoal = trpc.goals.delete.useMutation({
    onSuccess: () => utils.goals.list.invalidate(),
  });

  const canManage = ["owner", "secretary", "logistics", "foreman"].includes(employee?.role || "");

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
      paddingVertical: 12,
      alignItems: "center",
    },
    outlineBtn: {
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    priorityBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1.5,
      marginRight: 8,
    },
  });

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
      priority: newGoalPriority,
      weekOf: weekStart.toISOString(),
      createdBy: employee?.id || 0,
    });
  };

  const PRIORITIES: Priority[] = ["low", "medium", "high"];

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 4,
        }}
      >
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => setWeekOffset((w) => w - 1)}
        >
          <Text style={{ fontSize: 18, color: colors.primary }}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
            {formatWeekLabel(weekDate)}
          </Text>
          {weekOffset === 0 && (
            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>This Week</Text>
          )}
        </View>
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => setWeekOffset((w) => w + 1)}
          disabled={weekOffset >= 0}
        >
          <Text style={{ fontSize: 18, color: weekOffset >= 0 ? colors.border : colors.primary }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {completedCount}/{totalCount} completed
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.success }}>
              {Math.round((completedCount / totalCount) * 100)}%
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.success,
                width: `${(completedCount / totalCount) * 100}%`,
              }}
            />
          </View>
        </View>
      )}

      {/* Add Goal Form */}
      {showAddGoal && (
        <View style={[styles.card, { marginBottom: 12 }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
            Add New Goal
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: colors.background,
              marginBottom: 12,
            }}
          >
            <Text
              style={{ fontSize: 14, color: newGoalTitle ? colors.foreground : colors.muted }}
              onPress={() => {
                if (Alert.prompt) {
                  Alert.prompt("Goal Title", "e.g. Complete framing on Job #3", (text) => setNewGoalTitle(text), "plain-text", newGoalTitle);
                }
              }}
            >
              {newGoalTitle || "Tap to enter goal title…"}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>Priority</Text>
          <View style={{ flexDirection: "row", marginBottom: 14 }}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.priorityBtn,
                  {
                    borderColor: PRIORITY_COLORS[p],
                    backgroundColor: newGoalPriority === p ? PRIORITY_COLORS[p] + "22" : "transparent",
                  },
                ]}
                onPress={() => setNewGoalPriority(p)}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: PRIORITY_COLORS[p],
                    textTransform: "capitalize",
                  }}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }]}
              onPress={handleAddGoal}
              disabled={createGoal.isPending}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {createGoal.isPending ? "Saving…" : "Add Goal"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineBtn, { flex: 1 }]}
              onPress={() => { setShowAddGoal(false); setNewGoalTitle(""); }}
            >
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={goals || []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const status = item.status as GoalStatus;
            const priority = item.priority as Priority;
            const isCompleted = status === "completed";
            return (
              <View style={[styles.card, isCompleted && { opacity: 0.7 }]}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  {/* Status Toggle */}
                  <TouchableOpacity
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: STATUS_COLORS[status],
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isCompleted ? STATUS_COLORS[status] + "22" : "transparent",
                    }}
                    onPress={() => handleStatusCycle(item)}
                  >
                    <Text style={{ fontSize: 14, color: STATUS_COLORS[status], fontWeight: "700" }}>
                      {STATUS_ICONS[status]}
                    </Text>
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: isCompleted ? colors.muted : colors.foreground,
                        textDecorationLine: isCompleted ? "line-through" : "none",
                      }}
                    >
                      {item.title}
                    </Text>
                    {item.description && (
                      <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 }}>
                        {item.description}
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                      <View
                        style={{
                          backgroundColor: PRIORITY_COLORS[priority] + "22",
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: PRIORITY_COLORS[priority], textTransform: "capitalize" }}>
                          {priority}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor: STATUS_COLORS[status] + "22",
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: STATUS_COLORS[status], textTransform: "capitalize" }}>
                          {status.replace("_", " ")}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {canManage && (
                    <TouchableOpacity
                      style={{ padding: 4 }}
                      onPress={() => handleDelete(item.id)}
                    >
                      <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>🎯</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
                No goals this week
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                Add goals manually or generate them from a meeting recording.
              </Text>
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
