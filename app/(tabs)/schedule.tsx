import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ImageBackground,
} from "react-native";
import { BG_MORE as bg_more } from "@/constants/bg-urls";
import { IconSymbol } from "@/components/ui/icon-symbol";

// ─── Helpers ─────────────────────────────────────────────────────────────
function getMTNDate(d?: Date) {
  const now = d || new Date();
  const str = now.toLocaleDateString("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
  const [mo, dy, yr] = str.split("/");
  return new Date(`${yr}-${mo}-${dy}T12:00:00`);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function getWeekDates(baseDate: Date) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(dd);
  }
  return dates;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "#F59E0B22", text: "#F59E0B", label: "Pending" },
  in_progress: { bg: "#3B82F622", text: "#3B82F6", label: "In Progress" },
  completed: { bg: "#22C55E22", text: "#22C55E", label: "Completed" },
  skipped: { bg: "#EF444422", text: "#EF4444", label: "Skipped" },
};

export default function ScheduleScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState(getMTNDate());
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);

  const empId = (employee as any)?.id ?? 0;
  const isManagement = ["owner", "office_manager", "logistics"].includes(employee?.role || "");

  // Queries
  const { data: allSchedule, isLoading, refetch } = trpc.schedule.getAll.useQuery();
  const { data: allJobs } = trpc.jobs.list.useQuery();
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const createMutation = trpc.schedule.create.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const updateMutation = trpc.schedule.update.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const deleteMutation = trpc.schedule.delete.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } catch {}
    setRefreshing(false);
  }, [refetch]);

  // Week navigation
  const baseDate = useMemo(() => {
    const d = getMTNDate();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const today = getMTNDate();

  // Active jobs only
  const activeJobs = useMemo(() => (allJobs || []).filter((j: any) => j.status === "active"), [allJobs]);
  const activeEmployees = useMemo(() => (allEmployees || []).filter((e: any) => e.isActive), [allEmployees]);

  // Filter schedule for selected date
  const dayTasks = useMemo(() => {
    if (!allSchedule) return [];
    return (allSchedule as any[]).filter((item: any) => {
      const itemDate = new Date(item.scheduledDate);
      return isSameDay(itemDate, selectedDate);
    }).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [allSchedule, selectedDate]);

  // Count tasks per day for the week dots
  const weekTaskCounts = useMemo(() => {
    if (!allSchedule) return {};
    const counts: Record<string, number> = {};
    for (const item of allSchedule as any[]) {
      const d = new Date(item.scheduledDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [allSchedule]);

  const getJobName = (jobId: number) => {
    const job = (allJobs || []).find((j: any) => j.id === jobId);
    return job ? (job as any).name : "Unknown Job";
  };

  const getAssignedNames = (assignedStr: string | null) => {
    if (!assignedStr) return [];
    try {
      const ids = JSON.parse(assignedStr) as number[];
      return ids.map((id) => {
        const emp = (allEmployees || []).find((e: any) => e.id === id);
        return emp ? (emp as any).name : `#${id}`;
      });
    } catch { return []; }
  };

  const handleAddTask = useCallback(async () => {
    if (!taskTitle.trim()) {
      Alert.alert("Missing Info", "Please enter a task title.");
      return;
    }
    if (!selectedJobId) {
      Alert.alert("Missing Job", "Please select a job for this task.");
      return;
    }
    try {
      if (editingTask) {
        await updateMutation.mutateAsync({
          id: editingTask.id,
          title: taskTitle.trim(),
          description: taskDesc.trim() || undefined,
          scheduledDate: selectedDate.toISOString(),
          assignedEmployees: selectedEmployees.length > 0 ? JSON.stringify(selectedEmployees) : undefined,
        });
      } else {
        await createMutation.mutateAsync({
          jobId: selectedJobId,
          title: taskTitle.trim(),
          description: taskDesc.trim() || undefined,
          scheduledDate: selectedDate.toISOString(),
          assignedEmployees: selectedEmployees.length > 0 ? JSON.stringify(selectedEmployees) : undefined,
          createdBy: empId,
        });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save task");
    }
  }, [taskTitle, taskDesc, selectedJobId, selectedEmployees, selectedDate, editingTask, empId]);

  const handleStatusChange = useCallback(async (task: any, newStatus: string) => {
    try {
      await updateMutation.mutateAsync({ id: task.id, status: newStatus as any });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert("Error", "Failed to update status");
    }
  }, []);

  const handleDeleteTask = useCallback((task: any) => {
    Alert.alert("Delete Task", `Remove "${task.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteMutation.mutateAsync({ id: task.id });
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }, []);

  const handleEditTask = useCallback((task: any) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDesc(task.description || "");
    setSelectedJobId(task.jobId);
    try {
      setSelectedEmployees(task.assignedEmployees ? JSON.parse(task.assignedEmployees) : []);
    } catch { setSelectedEmployees([]); }
    setShowAddModal(true);
  }, []);

  const resetForm = () => {
    setShowAddModal(false);
    setEditingTask(null);
    setTaskTitle("");
    setTaskDesc("");
    setSelectedJobId(null);
    setSelectedEmployees([]);
  };

  const toggleEmployee = (id: number) => {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  return (
    <ScreenContainer>
      <ImageBackground source={bg_more} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.1 }}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Schedule</Text>
          {isManagement && (
            <TouchableOpacity
              onPress={() => { resetForm(); setShowAddModal(true); }}
              style={[s.addBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={s.addBtnText}>+ Task</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Week Navigation */}
        <View style={[s.weekNav, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setWeekOffset((w) => w - 1)} style={s.weekArrow}>
            <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>{"\u2039"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekOffset(0)}>
            <Text style={[s.weekLabel, { color: colors.foreground }]}>
              {formatDate(weekDates[0])} \u2013 {formatDate(weekDates[6])}
            </Text>
            {weekOffset === 0 && (
              <Text style={[s.currentWeekBadge, { color: colors.primary }]}>This Week</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekOffset((w) => w + 1)} style={s.weekArrow}>
            <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>{"\u203a"}</Text>
          </TouchableOpacity>
        </View>

        {/* Day Selector */}
        <View style={s.dayRow}>
          {weekDates.map((d, i) => {
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const taskCount = weekTaskCounts[key] || 0;
            const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedDate(d)}
                style={[
                  s.dayCell,
                  {
                    backgroundColor: isSelected ? colors.primary : "transparent",
                    borderColor: isToday && !isSelected ? colors.primary : "transparent",
                    borderWidth: isToday && !isSelected ? 2 : 0,
                  },
                ]}
              >
                <Text style={[s.dayName, { color: isSelected ? "#fff" : colors.muted }]}>
                  {dayNames[d.getDay()]}
                </Text>
                <Text style={[s.dayNum, { color: isSelected ? "#fff" : colors.foreground }]}>
                  {d.getDate()}
                </Text>
                {taskCount > 0 && (
                  <View style={[s.dotIndicator, { backgroundColor: isSelected ? "#fff" : colors.primary }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Date Label */}
        <View style={s.dateLabelRow}>
          <Text style={[s.dateLabel, { color: colors.foreground }]}>{formatDateFull(selectedDate)}</Text>
          <Text style={[s.taskCount, { color: colors.muted }]}>
            {dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Task List */}
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : dayTasks.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={[s.emptyTitle, { color: colors.muted }]}>No tasks scheduled</Text>
            <Text style={[s.emptySubtitle, { color: colors.muted }]}>
              {isManagement ? "Tap \"+ Task\" to add a task for this day." : "No tasks assigned for this day."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={dayTasks}
            keyExtractor={(item: any) => item.id.toString()}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            renderItem={({ item: task }) => {
              const statusInfo = STATUS_COLORS[task.status] || STATUS_COLORS.pending;
              const assignedNames = getAssignedNames(task.assignedEmployees);
              return (
                <View style={[s.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={s.taskHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.taskJob, { color: colors.primary }]}>{getJobName(task.jobId)}</Text>
                      <Text style={[s.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}
                      onPress={() => {
                        const statuses = ["pending", "in_progress", "completed", "skipped"];
                        const currentIdx = statuses.indexOf(task.status);
                        const nextStatus = statuses[(currentIdx + 1) % statuses.length];
                        handleStatusChange(task, nextStatus);
                      }}
                    >
                      <Text style={[s.statusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                    </TouchableOpacity>
                  </View>

                  {task.description ? (
                    <Text style={[s.taskDesc, { color: colors.muted }]} numberOfLines={2}>{task.description}</Text>
                  ) : null}

                  {assignedNames.length > 0 && (
                    <View style={s.crewRow}>
                      <Text style={[s.crewLabel, { color: colors.muted }]}>Crew:</Text>
                      <Text style={[s.crewNames, { color: colors.foreground }]} numberOfLines={1}>
                        {assignedNames.join(", ")}
                      </Text>
                    </View>
                  )}

                  {isManagement && (
                    <View style={s.taskActions}>
                      <TouchableOpacity onPress={() => handleEditTask(task)} style={s.taskActionBtn}>
                        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteTask(task)} style={s.taskActionBtn}>
                        <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Add/Edit Task Modal */}
        <Modal visible={showAddModal} animationType="slide" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.modalOverlay}>
            <View style={[s.modalContent, { backgroundColor: colors.background }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[s.modalTitle, { color: colors.foreground }]}>
                    {editingTask ? "Edit Task" : "Add Task"}
                  </Text>
                  <TouchableOpacity onPress={resetForm}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>

                {/* Date display */}
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Date</Text>
                <View style={[s.dateDisplay, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.foreground, fontSize: 15 }}>{formatDateFull(selectedDate)}</Text>
                </View>

                {/* Job Selector */}
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Job *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                    {activeJobs.map((job: any) => (
                      <TouchableOpacity
                        key={job.id}
                        onPress={() => setSelectedJobId(job.id)}
                        style={[
                          s.jobChip,
                          {
                            backgroundColor: selectedJobId === job.id ? colors.primary : colors.surface,
                            borderColor: selectedJobId === job.id ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{ color: selectedJobId === job.id ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}
                          numberOfLines={1}
                        >
                          {job.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Task Title */}
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Task Title *</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="e.g. Frame 2nd floor walls"
                  placeholderTextColor={colors.muted}
                  returnKeyType="next"
                />

                {/* Description */}
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Description (optional)</Text>
                <TextInput
                  style={[s.input, s.descInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={taskDesc}
                  onChangeText={setTaskDesc}
                  placeholder="Details about the task..."
                  placeholderTextColor={colors.muted}
                  multiline
                />

                {/* Crew Assignment */}
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Assign Crew</Text>
                <View style={s.crewGrid}>
                  {activeEmployees.map((emp: any) => {
                    const isSelected = selectedEmployees.includes(emp.id);
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        onPress={() => toggleEmployee(emp.id)}
                        style={[
                          s.crewChip,
                          {
                            backgroundColor: isSelected ? colors.primary + "22" : colors.surface,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <View style={[s.crewCheck, { borderColor: isSelected ? colors.primary : colors.muted, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                          {isSelected && <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{"\u2713"}</Text>}
                        </View>
                        <Text style={{ color: isSelected ? colors.primary : colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
                          {emp.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  onPress={handleAddTask}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  style={[s.saveBtn, { backgroundColor: colors.primary, opacity: (createMutation.isPending || updateMutation.isPending) ? 0.6 : 1 }]}
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.saveBtnText}>{editingTask ? "Update Task" : "Add Task"}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ImageBackground>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 24, fontWeight: "800" },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  weekArrow: { padding: 8 },
  weekLabel: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  currentWeekBadge: { fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 2 },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  dayCell: {
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 58,
    borderRadius: 14,
  },
  dayName: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  dayNum: { fontSize: 16, fontWeight: "700" },
  dotIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 3,
  },
  dateLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  dateLabel: { fontSize: 16, fontWeight: "700" },
  taskCount: { fontSize: 13 },
  emptyState: { alignItems: "center", paddingTop: 50 },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  emptySubtitle: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  taskCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  taskJob: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  taskTitle: { fontSize: 15, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },
  taskDesc: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  crewRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 },
  crewLabel: { fontSize: 12, fontWeight: "600" },
  crewNames: { fontSize: 12, flex: 1 },
  taskActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#33333322",
  },
  taskActionBtn: { padding: 4 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  dateDisplay: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  jobChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  descInput: { minHeight: 60, textAlignVertical: "top" },
  crewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  crewChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  crewCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
