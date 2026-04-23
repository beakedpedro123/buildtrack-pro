import { useState, useMemo } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  FlatList,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";

type Priority = "low" | "medium" | "high";
type GoalStatus = "pending" | "in_progress" | "completed" | "cancelled";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#EF4444",
};

const STATUS_COLORS: Record<GoalStatus, string> = {
  pending: "#9CA3AF",
  in_progress: "#0EA5E9",
  completed: "#22C55E",
  cancelled: "#9CA3AF",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface GoalsCalendarProps {
  goals: any[];
  colors: any;
  employeeMap: Record<number, string>;
  onGoalPress: (goal: any) => void;
  onStatusChange: (goalId: number, newStatus: GoalStatus) => void;
  canUpdateStatus: boolean;
  isOwnerOrManager: boolean;
  onDeleteGoal: (goalId: number) => void;
  canManage: boolean;
  employeeId: number;
}

export function GoalsCalendar({
  goals,
  colors,
  employeeMap,
  onGoalPress,
  onStatusChange,
  canUpdateStatus,
  isOwnerOrManager,
  onDeleteGoal,
  canManage,
  employeeId,
}: GoalsCalendarProps) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  );
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [weekOffset, setWeekOffset] = useState(0);

  // Build a map of date -> goals for the current month
  const goalsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const goal of goals) {
      // Use deadline date if available, otherwise use weekOf date
      let dateStr: string | null = null;
      if (goal.deadline) {
        const d = new Date(goal.deadline);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } else if (goal.weekOf) {
        // Spread across the week (Mon-Fri)
        const ws = new Date(goal.weekOf);
        for (let i = 0; i < 5; i++) {
          const wd = new Date(ws);
          wd.setDate(wd.getDate() + i);
          const key = `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, "0")}-${String(wd.getDate()).padStart(2, "0")}`;
          if (!map[key]) map[key] = [];
          map[key].push(goal);
        }
        continue;
      }
      if (dateStr) {
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(goal);
      }
    }
    return map;
  }, [goals]);

  // Get days in the current view month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  // Adjust so Monday = 0
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  // Week view dates
  const weekViewDates = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const ws = getWeekStart(base);
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [weekOffset]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Goals for selected date
  const selectedGoals = useMemo(() => {
    return goalsByDate[selectedDate] || [];
  }, [goalsByDate, selectedDate]);

  const navigateMonth = (dir: number) => {
    let newMonth = viewMonth + dir;
    let newYear = viewYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setViewMonth(newMonth);
    setViewYear(newYear);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDayPress = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const getGoalDotsForDate = (dateStr: string) => {
    const dayGoals = goalsByDate[dateStr] || [];
    if (dayGoals.length === 0) return null;
    // Show up to 3 dots
    const dots = dayGoals.slice(0, 3).map((g: any, i: number) => {
      const status = g.status as GoalStatus;
      const color = status === "completed" ? STATUS_COLORS.completed
        : status === "in_progress" ? STATUS_COLORS.in_progress
        : PRIORITY_COLORS[g.priority as Priority] || STATUS_COLORS.pending;
      return (
        <View
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: color,
            marginHorizontal: 1,
          }}
        />
      );
    });
    return (
      <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 2 }}>
        {dots}
        {dayGoals.length > 3 && (
          <Text style={{ fontSize: 7, color: colors.muted, marginLeft: 1 }}>+{dayGoals.length - 3}</Text>
        )}
      </View>
    );
  };

  const statusOptions: { key: GoalStatus; label: string }[] = [
    { key: "pending", label: "Not Started" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Complete" },
  ];

  const getAssigneeNames = (goal: any): string => {
    if (goal.assignedToList) {
      const ids = String(goal.assignedToList).split(",").map(Number);
      return ids.map((id: number) => employeeMap[id] || "Unknown").join(", ");
    }
    if (goal.assignedTo) return employeeMap[goal.assignedTo] || "Unknown";
    return "Everyone";
  };

  const renderGoalItem = ({ item }: { item: any }) => {
    const status = item.status as GoalStatus;
    const priority = item.priority as Priority;
    const isCompleted = status === "completed";
    const isCancelled = status === "cancelled";
    const assigneeName = getAssigneeNames(item);
    const dl = item.deadline ? new Date(item.deadline) : null;
    const isOverdue = dl && dl < today && !isCompleted && !isCancelled;

    return (
      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 10,
          borderRadius: 14,
          backgroundColor: colors.surface,
          overflow: "hidden",
          ...(Platform.OS === "ios"
            ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }
            : { elevation: 1 }),
        }}
      >
        <View style={{ flexDirection: "row" }}>
          {/* Priority strip */}
          <View
            style={{
              width: 4,
              backgroundColor: isCompleted ? colors.muted + "44" : PRIORITY_COLORS[priority] || "#9CA3AF",
              borderTopLeftRadius: 14,
              borderBottomLeftRadius: 14,
            }}
          />
          <View style={{ flex: 1, padding: 14 }}>
            {/* Title row */}
            <TouchableOpacity
              onPress={() => onGoalPress(item)}
              activeOpacity={0.7}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: STATUS_COLORS[status] + "18",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 10,
                }}
              >
                <Text style={{ fontSize: 12, color: STATUS_COLORS[status], fontWeight: "700" }}>
                  {status === "completed" ? "✓" : status === "in_progress" ? "◑" : "○"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: isCompleted ? colors.muted : colors.foreground,
                    textDecorationLine: isCompleted ? "line-through" : "none",
                    lineHeight: 19,
                  }}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
              </View>
              {canManage && (
                <TouchableOpacity
                  onPress={() => onDeleteGoal(item.id)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: colors.error + "0D",
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.muted }}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* Info row */}
            <View style={{ flexDirection: "row", gap: 5, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <View style={{ backgroundColor: PRIORITY_COLORS[priority] + "14", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: PRIORITY_COLORS[priority], textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {priority}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.primary + "14", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, maxWidth: "50%" }}>
                <Text style={{ fontSize: 9, fontWeight: "600", color: colors.primary }} numberOfLines={1}>
                  {assigneeName}
                </Text>
              </View>
              {isOverdue && (
                <View style={{ backgroundColor: colors.error + "14", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: colors.error }}>OVERDUE</Text>
                </View>
              )}
              {dl && !isOverdue && !isCompleted && (
                <View style={{ backgroundColor: colors.muted + "14", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>
                    {dl.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
            </View>

            {/* Status buttons */}
            {canUpdateStatus && !isCancelled && (
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border + "30" }}>
                {statusOptions.map((opt) => {
                  const isActive = status === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => !isActive && onStatusChange(item.id, opt.key)}
                      activeOpacity={isActive ? 1 : 0.7}
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: isActive ? STATUS_COLORS[opt.key] + "22" : colors.background,
                        borderWidth: isActive ? 1.5 : 1,
                        borderColor: isActive ? STATUS_COLORS[opt.key] : colors.border + "50",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: isActive ? "800" : "600",
                          color: isActive ? STATUS_COLORS[opt.key] : colors.muted,
                        }}
                      >
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

  return (
    <View style={{ flex: 1 }}>
      {/* View mode toggle */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 8, gap: 8 }}>
        <TouchableOpacity
          onPress={() => { setViewMode("month"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 10,
            alignItems: "center",
            backgroundColor: viewMode === "month" ? colors.primary + "22" : colors.surface,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: viewMode === "month" ? colors.primary : colors.muted }}>
            Month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setViewMode("week"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 10,
            alignItems: "center",
            backgroundColor: viewMode === "week" ? colors.primary + "22" : colors.surface,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: viewMode === "week" ? colors.primary : colors.muted }}>
            Week
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === "month" ? (
        <>
          {/* Month header with navigation */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => navigateMonth(-1)} style={{ padding: 8 }}>
              <Text style={{ fontSize: 20, color: colors.primary, fontWeight: "700" }}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setViewMonth(today.getMonth());
                setViewYear(today.getFullYear());
                setSelectedDate(todayStr);
              }}
              style={{ alignItems: "center" }}
            >
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              {viewMonth === today.getMonth() && viewYear === today.getFullYear() && (
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "600" }}>This Month</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigateMonth(1)} style={{ padding: 8 }}>
              <Text style={{ fontSize: 20, color: colors.primary, fontWeight: "700" }}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day names header */}
          <View style={{ flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 }}>
            {DAY_NAMES.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, marginBottom: 8 }}>
            {/* Empty cells for offset */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <View key={`empty-${i}`} style={{ width: "14.28%", height: 44 }} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const hasGoals = (goalsByDate[dateStr] || []).length > 0;

              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => handleDayPress(dateStr)}
                  style={{ width: "14.28%", height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? colors.primary : "transparent",
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected || isToday ? "700" : "400",
                        color: isSelected ? "#fff" : isToday ? colors.primary : colors.foreground,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                  {getGoalDotsForDate(dateStr)}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : (
        <>
          {/* Week view header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => { setWeekOffset(w => w - 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={{ padding: 8 }}>
              <Text style={{ fontSize: 20, color: colors.primary, fontWeight: "700" }}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setWeekOffset(0); setSelectedDate(todayStr); }}
              style={{ alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                {weekViewDates[0].toLocaleDateString([], { month: "short", day: "numeric" })} – {weekViewDates[6].toLocaleDateString([], { month: "short", day: "numeric" })}
              </Text>
              {weekOffset === 0 && (
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "600" }}>This Week</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setWeekOffset(w => w + 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={{ padding: 8 }}
            >
              <Text style={{ fontSize: 20, color: colors.primary, fontWeight: "700" }}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Week day row */}
          <View style={{ flexDirection: "row", paddingHorizontal: 12, marginBottom: 8 }}>
            {weekViewDates.map((d, i) => {
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const dayGoals = goalsByDate[dateStr] || [];

              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleDayPress(dateStr)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600", marginBottom: 4 }}>
                    {DAY_NAMES[i]}
                  </Text>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? colors.primary : "transparent",
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: isSelected || isToday ? "700" : "400",
                        color: isSelected ? "#fff" : isToday ? colors.primary : colors.foreground,
                      }}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                  {dayGoals.length > 0 && (
                    <View style={{ flexDirection: "row", marginTop: 3, gap: 2 }}>
                      {dayGoals.slice(0, 3).map((_: any, j: number) => (
                        <View
                          key={j}
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: colors.primary,
                          }}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Selected date label */}
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
          {(() => {
            const [y, m, d] = selectedDate.split("-").map(Number);
            const date = new Date(y, m - 1, d);
            return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
          })()}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          {selectedGoals.length} {selectedGoals.length === 1 ? "goal" : "goals"}
        </Text>
      </View>

      {/* Goals list for selected date */}
      <FlatList
        data={selectedGoals}
        keyExtractor={(item: any) => `${item.id}-${selectedDate}`}
        renderItem={renderGoalItem}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 30 }}>
            <Text style={{ fontSize: 32 }}>📅</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginTop: 8 }}>
              No goals for this day
            </Text>
            {canManage && (
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                Tap "+ Goal" to add one
              </Text>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}
