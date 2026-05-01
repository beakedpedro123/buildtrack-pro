import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import * as Auth from "@/lib/_core/auth";
import { useColors } from "@/hooks/use-colors";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { useOfflineMutation } from "@/hooks/use-offline-mutation";
import { useCompanyTrade, getTradeSchedulePhases, getTradePromptContext, TRADE_OPTIONS } from "@/hooks/use-company-trade";
import { CACHE_KEYS } from "@/lib/data-cache";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import Svg, { Rect, Text as SvgText, G, Line } from "react-native-svg";

const { width: SCREEN_W } = Dimensions.get("window");

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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "#F59E0B22", text: "#F59E0B", label: "Pending" },
  in_progress: { bg: "#3B82F622", text: "#3B82F6", label: "In Progress" },
  completed: { bg: "#22C55E22", text: "#22C55E", label: "Completed" },
  skipped: { bg: "#EF444422", text: "#EF4444", label: "Skipped" },
};

const PHASE_COLORS = [
  "#8B5CF6", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B",
];

const CONSTRUCTION_PHASES = [
  "Site Prep", "Foundation", "Framing", "Roofing", "Plumbing Rough-In",
  "Electrical Rough-In", "HVAC", "Insulation", "Drywall", "Interior Trim",
  "Painting", "Flooring", "Cabinets & Counters", "Final Mechanical",
  "Exterior Finish", "Landscaping", "Punch List", "Final Inspection",
];

type ViewMode = "overview" | "calendar" | "tasks" | "planner";

export default function ScheduleScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const { trade: companyTrade } = useCompanyTrade();
  const utils = trpc.useUtils();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedDate, setSelectedDate] = useState(getMTNDate());
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [calendarSpan, setCalendarSpan] = useState<1 | 2 | 4>(1); // 1 week, 2 weeks, or 4 weeks (month)

  // Form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPhase, setTaskPhase] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);

  const empId = (employee as any)?.id ?? 0;
  const isManagement = ["owner", "office_manager", "logistics"].includes(employee?.role || "");

  // Queries
  const allScheduleQ = trpc.schedule.getAll.useQuery(undefined, { staleTime: 15_000, refetchOnMount: "always" });
  const { data: allSchedule, isLoading } = useOfflineCache(CACHE_KEYS.SCHEDULE_ALL, allScheduleQ.data, allScheduleQ.isLoading);
  const refetch = allScheduleQ.refetch;
  const { data: allJobs } = trpc.jobs.list.useQuery(undefined, { staleTime: 15_000 });
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { staleTime: 15_000 });
  const createMutation = trpc.schedule.create.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const updateMutation = trpc.schedule.update.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const deleteMutation = trpc.schedule.delete.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const bulkCreateMutation = trpc.schedule.bulkCreate.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  // ─── Offline-aware mutation wrappers ───
  const offlineScheduleCreate = useOfflineMutation("schedule.create", createMutation, { offlineMessage: "Schedule task will be created when back online." });
  const offlineScheduleUpdate = useOfflineMutation("schedule.update", updateMutation, { silent: true });
  const offlineScheduleDelete = useOfflineMutation("schedule.delete", deleteMutation, { silent: true });
  const deleteByJobMutation = trpc.schedule.deleteByJob.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const syncGoalsMutation = trpc.goals.syncFromSchedule.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } catch {}
    setRefreshing(false);
  }, [refetch]);

  const activeJobs = useMemo(() => (allJobs || []).filter((j: any) => j.status === "active"), [allJobs]);
  const activeEmployees = useMemo(() => (allEmployees || []).filter((e: any) => e.isActive), [allEmployees]);
  const today = getMTNDate();

  // Schedule items for selected job
  const jobScheduleItems = useMemo(() => {
    if (!allSchedule || !selectedJobId) return [];
    return (allSchedule as any[])
      .filter((item: any) => item.jobId === selectedJobId)
      .sort((a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }, [allSchedule, selectedJobId]);

  // Phase-grouped items
  const phaseGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const item of jobScheduleItems) {
      const phase = item.phase || "Unassigned";
      if (!groups[phase]) groups[phase] = [];
      groups[phase].push(item);
    }
    return groups;
  }, [jobScheduleItems]);

  // Phase progress
  const phaseProgress = useMemo(() => {
    const progress: { phase: string; total: number; completed: number; pct: number; color: string }[] = [];
    const phases = Object.keys(phaseGroups);
    phases.forEach((phase, i) => {
      const items = phaseGroups[phase];
      const completed = items.filter((t: any) => t.status === "completed").length;
      progress.push({
        phase,
        total: items.length,
        completed,
        pct: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
        color: PHASE_COLORS[i % PHASE_COLORS.length],
      });
    });
    return progress;
  }, [phaseGroups]);

  // Overall job progress
  const overallProgress = useMemo(() => {
    if (jobScheduleItems.length === 0) return 0;
    const completed = jobScheduleItems.filter((t: any) => t.status === "completed").length;
    return Math.round((completed / jobScheduleItems.length) * 100);
  }, [jobScheduleItems]);

  // Per-job overview stats
  const jobStats = useMemo(() => {
    if (!allSchedule) return [];
    const stats: Record<number, { total: number; completed: number; phases: Set<string>; startDate: Date | null; endDate: Date | null }> = {};
    for (const item of allSchedule as any[]) {
      if (!stats[item.jobId]) stats[item.jobId] = { total: 0, completed: 0, phases: new Set(), startDate: null, endDate: null };
      const s = stats[item.jobId];
      s.total++;
      if (item.status === "completed") s.completed++;
      if (item.phase) s.phases.add(item.phase);
      const d = new Date(item.scheduledDate);
      if (!s.startDate || d < s.startDate) s.startDate = d;
      if (!s.endDate || d > s.endDate) s.endDate = d;
    }
    return activeJobs.map((job: any) => ({
      job,
      ...(stats[job.id] || { total: 0, completed: 0, phases: new Set(), startDate: null, endDate: null }),
    }));
  }, [allSchedule, activeJobs]);

  // Calendar view: tasks per day for selected job
  const calendarWeekDates = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + weekOffset * 7);
    return getWeekDates(d);
  }, [weekOffset, today]);

  // Multi-week dates for expanded calendar view
  const calendarAllWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let w = 0; w < calendarSpan; w++) {
      const d = new Date(today);
      d.setDate(d.getDate() + (weekOffset + w) * 7);
      weeks.push(getWeekDates(d));
    }
    return weeks;
  }, [weekOffset, today, calendarSpan]);

  const dayTasks = useMemo(() => {
    return jobScheduleItems.filter((item: any) => {
      const d = new Date(item.scheduledDate);
      return isSameDay(d, selectedDate);
    });
  }, [jobScheduleItems, selectedDate]);

  // All tasks for the visible span
  const spanTasks = useMemo(() => {
    if (calendarSpan === 1) return dayTasks;
    const allDates = calendarAllWeeks.flat();
    const start = allDates[0];
    const end = allDates[allDates.length - 1];
    return jobScheduleItems.filter((item: any) => {
      const d = new Date(item.scheduledDate);
      return d >= start && d <= end;
    });
  }, [calendarSpan, calendarAllWeeks, jobScheduleItems, dayTasks]);

  const weekTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of jobScheduleItems) {
      const d = new Date(item.scheduledDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [jobScheduleItems]);

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
    if (!taskTitle.trim()) { Alert.alert("Missing Info", "Please enter a task title."); return; }
    if (!selectedJobId) { Alert.alert("Missing Job", "Please select a job first."); return; }
    try {
      if (editingTask) {
        await offlineScheduleUpdate.mutateAsync({
          id: editingTask.id,
          title: taskTitle.trim(),
          description: taskDesc.trim() || undefined,
          phase: taskPhase || undefined,
          scheduledDate: selectedDate.toISOString(),
          assignedEmployees: selectedEmployees.length > 0 ? JSON.stringify(selectedEmployees) : undefined,
        });
      } else {
        await offlineScheduleCreate.mutateAsync({
          jobId: selectedJobId,
          title: taskTitle.trim(),
          description: taskDesc.trim() || undefined,
          phase: taskPhase || undefined,
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
  }, [taskTitle, taskDesc, taskPhase, selectedJobId, selectedEmployees, selectedDate, editingTask, empId]);

  const handleStatusChange = useCallback(async (task: any, newStatus: string) => {
    try {
      await offlineScheduleUpdate.mutateAsync({ id: task.id, status: newStatus as any });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { Alert.alert("Error", "Failed to update status"); }
  }, []);

  const handleDeleteTask = useCallback((task: any) => {
    Alert.alert("Delete Task", `Remove "${task.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await offlineScheduleDelete.mutateAsync({ id: task.id });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  }, []);

  const handleEditTask = useCallback((task: any) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDesc(task.description || "");
    setTaskPhase(task.phase || "");
    try { setSelectedEmployees(task.assignedEmployees ? JSON.parse(task.assignedEmployees) : []); } catch { setSelectedEmployees([]); }
    setShowAddModal(true);
  }, []);

  const resetForm = () => {
    setShowAddModal(false);
    setEditingTask(null);
    setTaskTitle("");
    setTaskDesc("");
    setTaskPhase("");
    setSelectedEmployees([]);
  };

  const toggleEmployee = (id: number) => {
    setSelectedEmployees((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  // Generate schedule with Pivot AI
  const handleGenerateSchedule = useCallback(async () => {
    if (!selectedJobId) return;
    const job = activeJobs.find((j: any) => j.id === selectedJobId);
    if (!job) return;

    const existingCount = jobScheduleItems.length;
    if (existingCount > 0) {
      Alert.alert(
        "Schedule Exists",
        `This job already has ${existingCount} scheduled tasks. Generate a new schedule? This will replace the existing one.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Replace", style: "destructive", onPress: () => doGenerate(job, true) },
          { text: "Add To Existing", onPress: () => doGenerate(job, false) },
        ]
      );
    } else {
      doGenerate(job, false);
    }
  }, [selectedJobId, activeJobs, jobScheduleItems]);

  const doGenerate = async (job: any, replaceExisting: boolean) => {
    setGenerating(true);
    setShowGenerateModal(true);
    try {
      if (replaceExisting) {
        await deleteByJobMutation.mutateAsync({ jobId: job.id });
      }

      // Build a prompt for Pivot to generate the schedule
      const startDate = job.startDate ? new Date(job.startDate) : new Date();
      const tradeContext = getTradePromptContext(companyTrade);
      const tradeLabel = TRADE_OPTIONS.find((t) => t.key === companyTrade)?.label || companyTrade;
      const prompt = `Generate a detailed construction schedule for this job:
Job: ${job.name}
Address: ${job.address || "N/A"}
Budget: $${job.totalBudget || "0"}
Start Date: ${startDate.toISOString().split("T")[0]}
Trade: ${tradeLabel}

${tradeContext}

Create a realistic multi-month schedule with construction phases. For each task, provide:
- phase (e.g., "Site Prep", "Layout", "Framing", etc.)
- title (specific task name)
- description (brief details)
- scheduledDate (ISO date string)
- durationDays (how many days this task takes)

Return ONLY a valid JSON array of objects with these fields. No markdown, no explanation. Example:
[{"phase":"Site Prep","title":"Clear lot","description":"Remove debris and grade","scheduledDate":"2026-05-01","durationDays":2}]

Generate 25-50 tasks spanning the appropriate duration for a typical ${tradeLabel.toLowerCase()} job. ONLY include phases relevant to ${tradeLabel.toLowerCase()} work.`;

      // Call Pivot via the server's LLM
      const schedToken = await Auth.getSessionToken();
      const schedHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (schedToken) schedHeaders["Authorization"] = `Bearer ${schedToken}`;
      const response = await fetch("http://127.0.0.1:3000/api/pivot-generate-schedule", {
        method: "POST",
        headers: schedHeaders,
        body: JSON.stringify({ prompt, jobId: job.id }),
      });

      let tasks: any[] = [];
      if (response.ok) {
        const data = await response.json();
        tasks = data.tasks || [];
      }

      if (tasks.length === 0) {
        // Fallback: generate a basic template schedule
        tasks = generateTemplateSchedule(startDate);
      }

      // Bulk create all tasks
      const items = tasks.map((t: any, i: number) => ({
        jobId: job.id,
        title: t.title,
        description: t.description || "",
        phase: t.phase || "General",
        scheduledDate: t.scheduledDate,
        createdBy: empId,
        sortOrder: i,
      }));

      await bulkCreateMutation.mutateAsync({ items });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Schedule Generated", `Created ${items.length} tasks across multiple phases.`);
    } catch (err) {
      console.error("Schedule generation error:", err);
      // Fallback to template
      try {
        const startDate = job.startDate ? new Date(job.startDate) : new Date();
        const tasks = generateTemplateSchedule(startDate);
        const items = tasks.map((t: any, i: number) => ({
          jobId: job.id,
          title: t.title,
          description: t.description || "",
          phase: t.phase || "General",
          scheduledDate: t.scheduledDate,
          createdBy: empId,
          sortOrder: i,
        }));
        await bulkCreateMutation.mutateAsync({ items });
        Alert.alert("Schedule Generated", `Created ${items.length} tasks from template.`);
      } catch (e2) {
        Alert.alert("Error", "Failed to generate schedule. Please try again.");
      }
    }
    setGenerating(false);
    setShowGenerateModal(false);
  };

  // Template schedule generator (fallback) — uses company trade
  function generateTemplateSchedule(startDate: Date): any[] {
    const tasks: any[] = [];
    const phases = getTradeSchedulePhases(companyTrade);

    let currentDate = new Date(startDate);
    for (const phase of phases) {
      const daysPerTask = Math.max(1, Math.floor(phase.days / phase.tasks.length));
      for (const taskName of phase.tasks) {
        // Skip weekends
        while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        tasks.push({
          phase: phase.name,
          title: taskName,
          description: "",
          scheduledDate: currentDate.toISOString().split("T")[0] + "T12:00:00.000Z",
          durationDays: daysPerTask,
        });
        currentDate.setDate(currentDate.getDate() + daysPerTask);
      }
    }
    return tasks;
  }

  // ─── RENDER ────────────────────────────────────────────────────────────

  const renderTaskCard = ({ item: task }: { item: any }) => {
    const statusInfo = STATUS_COLORS[task.status] || STATUS_COLORS.pending;
    const assignedNames = getAssignedNames(task.assignedEmployees);
    return (
      <View style={[s.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.taskHeader}>
          <View style={{ flex: 1 }}>
            {task.phase && (
              <Text style={{ fontSize: 10, fontWeight: "700", color: PHASE_COLORS[CONSTRUCTION_PHASES.indexOf(task.phase) % PHASE_COLORS.length] || colors.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                {task.phase}
              </Text>
            )}
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
        {task.description ? <Text style={[s.taskDesc, { color: colors.muted }]} numberOfLines={2}>{task.description}</Text> : null}
        {assignedNames.length > 0 && (
          <View style={s.crewRow}>
            <Text style={[s.crewLabel, { color: colors.muted }]}>Crew:</Text>
            <Text style={[s.crewNames, { color: colors.foreground }]} numberOfLines={1}>{assignedNames.join(", ")}</Text>
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
  };

  // ─── Progress Chart (SVG) ──────────────────────────────────────────────
  const ProgressChart = () => {
    if (phaseProgress.length === 0) return null;
    const chartW = SCREEN_W - 40;
    const barH = 22;
    const gap = 6;
    const labelW = 90;
    const chartH = phaseProgress.length * (barH + gap) + 20;
    const maxBarW = chartW - labelW - 60;

    return (
      <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>Phase Progress</Text>
        <Svg width={chartW} height={chartH}>
          {phaseProgress.map((p, i) => {
            const y = i * (barH + gap) + 4;
            const barWidth = Math.max(2, (p.pct / 100) * maxBarW);
            return (
              <G key={p.phase}>
                <SvgText x={0} y={y + barH / 2 + 4} fontSize={10} fill={colors.foreground} fontWeight="600">
                  {p.phase.length > 12 ? p.phase.slice(0, 12) + "…" : p.phase}
                </SvgText>
                {/* Background bar */}
                <Rect x={labelW} y={y} width={maxBarW} height={barH} rx={4} fill={colors.surface} />
                {/* Progress bar */}
                <Rect x={labelW} y={y} width={barWidth} height={barH} rx={4} fill={p.color} opacity={0.85} />
                {/* Percentage text */}
                <SvgText x={labelW + maxBarW + 6} y={y + barH / 2 + 4} fontSize={11} fill={colors.muted} fontWeight="700">
                  {p.pct}%
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <ImageBackground source={bg_more} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.08 }}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Schedule</Text>
          {isManagement && selectedJobId && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={handleGenerateSchedule}
                style={[s.addBtn, { backgroundColor: colors.success }]}
              >
                <Text style={s.addBtnText}> Generate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { resetForm(); setShowAddModal(true); }}
                style={[s.addBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={s.addBtnText}>+ Task</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Job Selector — only shown when a job is selected, to switch between jobs or go back */}
        {selectedJobId && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ minHeight: 52, marginTop: 4 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => { setSelectedJobId(null); setViewMode("overview"); }}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>← All Jobs</Text>
            </TouchableOpacity>
            {activeJobs.map((job: any) => {
              const isActive = selectedJobId === job.id;
              return (
                <TouchableOpacity
                  key={job.id}
                  onPress={() => { setSelectedJobId(job.id); setViewMode("tasks"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderWidth: 1, borderColor: isActive ? colors.primary : colors.border,
                    maxWidth: 160,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? "#fff" : colors.foreground, lineHeight: 18 }} numberOfLines={1}>{job.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* View Mode Tabs (only when a job is selected) */}
        {selectedJobId && (
          <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 4, gap: 0 }}>
            {(["tasks", "calendar", "planner", "overview"] as ViewMode[]).map((mode) => {
              const isActive = viewMode === mode;
              const label = mode === "tasks" ? "Phases" : mode === "calendar" ? "Calendar" : mode === "planner" ? "Planner" : "Progress";
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => { setViewMode(mode); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{
                    flex: 1, paddingVertical: 10, alignItems: "center",
                    borderBottomWidth: isActive ? 2.5 : 0,
                    borderBottomColor: colors.primary,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: isActive ? "700" : "500", color: isActive ? colors.primary : colors.muted }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : !selectedJobId ? (
          /* ═══ ALL JOBS OVERVIEW ═══ */
          <FlatList
            data={jobStats}
            keyExtractor={(item: any) => item.job.id.toString()}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <MaterialIcons name="event" size={32} color={colors.muted} />
                <Text style={[s.emptyTitle, { color: colors.muted }]}>No active jobs</Text>
                <Text style={[s.emptySubtitle, { color: colors.muted }]}>Create a job first, then generate a schedule.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
              const dateRange = item.startDate && item.endDate
                ? `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`
                : "No schedule";
              return (
                <TouchableOpacity
                  onPress={() => { setSelectedJobId(item.job.id); setViewMode("tasks"); }}
                  style={[s.jobOverviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>{item.job.name}</Text>
                    <Text style={{ fontSize: 22, fontWeight: "800", color: pct === 100 ? colors.success : colors.primary }}>{pct}%</Text>
                  </View>
                  {/* Progress bar */}
                  <View style={{ height: 6, backgroundColor: colors.border + "40", borderRadius: 3, marginBottom: 8 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: pct === 100 ? colors.success : colors.primary, width: `${Math.min(pct, 100)}%` }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{item.completed}/{item.total} tasks</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{dateRange}</Text>
                  </View>
                  {item.phases.size > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {Array.from(item.phases).slice(0, 4).map((phase: any, i: number) => (
                        <View key={phase} style={{ backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: PHASE_COLORS[i % PHASE_COLORS.length] }}>{phase}</Text>
                        </View>
                      ))}
                      {item.phases.size > 4 && (
                        <Text style={{ fontSize: 9, color: colors.muted, alignSelf: "center" }}>+{item.phases.size - 4}</Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        ) : viewMode === "overview" ? (
          /* ═══ JOB PROGRESS VIEW ═══ */
          <ScrollView
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          >
            {/* Overall progress */}
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Text style={{ fontSize: 48, fontWeight: "800", color: overallProgress === 100 ? colors.success : colors.primary }}>{overallProgress}%</Text>
              <Text style={{ fontSize: 14, color: colors.muted, fontWeight: "600" }}>Overall Completion</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                {jobScheduleItems.filter((t: any) => t.status === "completed").length} of {jobScheduleItems.length} tasks done
              </Text>
            </View>
            <ProgressChart />
            {/* Timeline summary */}
            {jobScheduleItems.length > 0 && (
              <View style={{ marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Timeline</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>START</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{formatDate(new Date(jobScheduleItems[0].scheduledDate))}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>END</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{formatDate(new Date(jobScheduleItems[jobScheduleItems.length - 1].scheduledDate))}</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        ) : viewMode === "calendar" ? (
          /* ═══ CALENDAR VIEW ═══ */
          <>
            {/* Span Toggle */}
            <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, gap: 6 }}>
              {([1, 2, 4] as const).map((span) => {
                const isActive = calendarSpan === span;
                const label = span === 1 ? "1 Week" : span === 2 ? "2 Weeks" : "Month";
                return (
                  <TouchableOpacity
                    key={span}
                    onPress={() => { setCalendarSpan(span); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: isActive ? colors.primary + "18" : colors.surface,
                      borderWidth: 1.5, borderColor: isActive ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: isActive ? colors.primary : colors.muted }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Week Navigation */}
            <View style={[s.weekNav, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setWeekOffset((w) => w - calendarSpan)} style={s.weekArrow}>
                <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWeekOffset(0)}>
                <Text style={[s.weekLabel, { color: colors.foreground }]}>
                  {formatDate(calendarAllWeeks[0][0])} – {formatDate(calendarAllWeeks[calendarAllWeeks.length - 1][6])}
                </Text>
                {weekOffset === 0 && <Text style={[s.currentWeekBadge, { color: colors.primary }]}>Current</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWeekOffset((w) => w + calendarSpan)} style={s.weekArrow}>
                <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>›</Text>
              </TouchableOpacity>
            </View>
            {/* Day Selectors — one row per week */}
            {calendarAllWeeks.map((weekDates, wi) => (
              <View key={wi}>
                {calendarSpan > 1 && (
                  <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted, paddingHorizontal: 20, paddingTop: 6 }}>
                    {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
                  </Text>
                )}
                <View style={s.dayRow}>
                  {weekDates.map((d, i) => {
                    const isSelected = isSameDay(d, selectedDate);
                    const isToday = isSameDay(d, today);
                    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                    const taskCount = weekTaskCounts[key] || 0;
                    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
                    return (
                      <TouchableOpacity
                        key={`${wi}-${i}`}
                        onPress={() => setSelectedDate(d)}
                        style={[s.dayCell, {
                          backgroundColor: isSelected ? colors.primary : "transparent",
                          borderColor: isToday && !isSelected ? colors.primary : "transparent",
                          borderWidth: isToday && !isSelected ? 2 : 0,
                          paddingVertical: calendarSpan > 1 ? 4 : 8,
                        }]}
                      >
                        <Text style={[s.dayName, { color: isSelected ? "#fff" : colors.muted, fontSize: calendarSpan > 1 ? 9 : 11 }]}>{dayNames[d.getDay()]}</Text>
                        <Text style={[s.dayNum, { color: isSelected ? "#fff" : colors.foreground, fontSize: calendarSpan > 1 ? 13 : 15 }]}>{d.getDate()}</Text>
                        {taskCount > 0 && <View style={[s.dotIndicator, { backgroundColor: isSelected ? "#fff" : colors.primary }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={s.dateLabelRow}>
              <Text style={[s.dateLabel, { color: colors.foreground }]}>{formatDateFull(selectedDate)}</Text>
              <Text style={[s.taskCount, { color: colors.muted }]}>
                {calendarSpan === 1 ? `${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""}` : `${spanTasks.length} task${spanTasks.length !== 1 ? "s" : ""} in view`}
              </Text>
            </View>
            <FlatList
              data={calendarSpan === 1 ? dayTasks : spanTasks}
              keyExtractor={(item: any) => item.id.toString()}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
              renderItem={renderTaskCard}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={[s.emptyTitle, { color: colors.muted }]}>{calendarSpan === 1 ? "No tasks for this day" : "No tasks in this period"}</Text>
                </View>
              }
            />
          </>
        ) : viewMode === "planner" ? (
          /* ═══ BUDGET PLANNER VIEW ═══ */
          <BudgetPlannerView
            job={activeJobs.find((j: any) => j.id === selectedJobId)}
            scheduleItems={jobScheduleItems}
            allEmployees={allEmployees || []}
            colors={colors}
            isManagement={isManagement}
            onPushGoals={(tasks: any[]) => {
              Alert.alert(
                "Push as Goals",
                `Push ${tasks.length} schedule tasks as daily goals for the foreman? This will create goals for each assigned employee based on the schedule.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Push Goals",
                    onPress: () => {
                      syncGoalsMutation.mutate(
                        { weekOf: new Date().toISOString(), createdBy: empId },
                        {
                          onSuccess: (data: any) => {
                            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert("Goals Pushed", data?.message || `Schedule tasks synced as daily goals.`);
                            utils.goals.list.invalidate();
                          },
                          onError: () => {
                            Alert.alert("Error", "Failed to push goals. Try again.");
                          },
                        }
                      );
                    },
                  },
                ]
              );
            }}
          />
        ) : viewMode === "tasks" ? (
          /* ═══ PHASES / TASKS VIEW ═══ */
          <FlatList
            data={Object.entries(phaseGroups)}
            keyExtractor={([phase]) => phase}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <MaterialIcons name="event" size={32} color={colors.muted} />
                <Text style={[s.emptyTitle, { color: colors.muted }]}>No schedule yet</Text>
                <Text style={[s.emptySubtitle, { color: colors.muted }]}>
                  {isManagement ? "Tap \" Generate\" to create a full schedule with Pivot AI." : "No tasks scheduled for this job."}
                </Text>
              </View>
            }
            renderItem={({ item: [phase, tasks] }) => {
              const completed = tasks.filter((t: any) => t.status === "completed").length;
              const pct = Math.round((completed / tasks.length) * 100);
              const phaseIdx = CONSTRUCTION_PHASES.indexOf(phase);
              const phaseColor = PHASE_COLORS[phaseIdx >= 0 ? phaseIdx % PHASE_COLORS.length : Math.abs(phase.charCodeAt(0)) % PHASE_COLORS.length];
              return (
                <View style={{ marginBottom: 16 }}>
                  {/* Phase header */}
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 8 }}>
                    <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: phaseColor, marginRight: 10 }} />
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }}>{phase}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: phaseColor }}>{pct}%</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>{completed}/{tasks.length}</Text>
                  </View>
                  {/* Phase progress bar */}
                  <View style={{ marginHorizontal: 20, height: 3, backgroundColor: colors.border + "40", borderRadius: 2, marginBottom: 8 }}>
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: phaseColor, width: `${Math.min(pct, 100)}%` }} />
                  </View>
                  {/* Tasks */}
                  {tasks.map((task: any) => (
                    <View key={task.id}>
                      {renderTaskCard({ item: task })}
                    </View>
                  ))}
                </View>
              );
            }}
          />
        ) : null}

        {/* Add/Edit Task Modal */}
        <Modal visible={showAddModal} animationType="slide" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.modalOverlay}>
            <View style={[s.modalContent, { backgroundColor: colors.background }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingTask ? "Edit Task" : "Add Task"}</Text>
                  <TouchableOpacity onPress={resetForm}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[s.fieldLabel, { color: colors.muted }]}>Date</Text>
                <View style={[s.dateDisplay, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.foreground, fontSize: 15 }}>{formatDateFull(selectedDate)}</Text>
                </View>

                {/* Phase Selector */}
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Phase</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                    {CONSTRUCTION_PHASES.map((phase, i) => (
                      <TouchableOpacity
                        key={phase}
                        onPress={() => setTaskPhase(taskPhase === phase ? "" : phase)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                          backgroundColor: taskPhase === phase ? PHASE_COLORS[i % PHASE_COLORS.length] + "22" : colors.surface,
                          borderColor: taskPhase === phase ? PHASE_COLORS[i % PHASE_COLORS.length] : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: taskPhase === phase ? PHASE_COLORS[i % PHASE_COLORS.length] : colors.foreground }}>{phase}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={[s.fieldLabel, { color: colors.muted }]}>Task Title *</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="e.g. Frame 2nd floor walls"
                  placeholderTextColor={colors.muted}
                  returnKeyType="next"
                />

                <Text style={[s.fieldLabel, { color: colors.muted }]}>Description (optional)</Text>
                <TextInput
                  style={[s.input, s.descInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={taskDesc}
                  onChangeText={setTaskDesc}
                  placeholder="Details about the task..."
                  placeholderTextColor={colors.muted}
                  multiline
                />

                <Text style={[s.fieldLabel, { color: colors.muted }]}>Assign Crew</Text>
                <View style={s.crewGrid}>
                  {activeEmployees.map((emp: any) => {
                    const isSelected = selectedEmployees.includes(emp.id);
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        onPress={() => toggleEmployee(emp.id)}
                        style={[s.crewChip, {
                          backgroundColor: isSelected ? colors.primary + "22" : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                        }]}
                      >
                        <View style={[s.crewCheck, { borderColor: isSelected ? colors.primary : colors.muted, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                          {isSelected && <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>✓</Text>}
                        </View>
                        <Text style={{ color: isSelected ? colors.primary : colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{emp.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

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

        {/* Generating Modal */}
        <Modal visible={showGenerateModal} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 14, padding: 30, alignItems: "center", width: 260 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 16 }}>Generating Schedule</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center" }}>Pivot is creating your multi-month construction schedule...</Text>
            </View>
          </View>
        </Modal>
      </ImageBackground>
    </ScreenContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGET PLANNER VIEW — Shows crew cost, overhead, profit timeline, manual task entry
// ═══════════════════════════════════════════════════════════════════════════════
function BudgetPlannerView({ job, scheduleItems, allEmployees, colors, isManagement, onPushGoals }: {
  job: any;
  scheduleItems: any[];
  allEmployees: any[];
  colors: any;
  isManagement: boolean;
  onPushGoals: (tasks: any[]) => void;
}) {
  if (!job) return (
    <View style={{ alignItems: "center", paddingTop: 60 }}>
      <Text style={{ fontSize: 16, color: colors.muted }}>Select a job to view the planner.</Text>
    </View>
  );

  // Parse assigned crew from job
  const crewIds: number[] = (() => {
    try { return job.assignedCrew ? JSON.parse(job.assignedCrew) : []; } catch { return []; }
  })();
  const crewMembers = allEmployees.filter((e: any) => crewIds.includes(e.id));
  const hasAssignedCrew = crewMembers.length > 0;

  // Calculate daily labor cost (8hr day)
  const HOURS_PER_DAY = 8;
  const dailyLaborCost = crewMembers.reduce((sum: number, e: any) => sum + (parseFloat(e.hourlyRate || "0") * HOURS_PER_DAY), 0);

  // Overhead rates from job
  const taxRate = parseFloat(job.taxRate || "0") / 100;
  const wcRate = parseFloat(job.workersCompRate || "0") / 100;
  const liabRate = parseFloat(job.liabilityInsRate || "0") / 100;
  const totalOverheadRate = taxRate + wcRate + liabRate;
  const dailyOverhead = dailyLaborCost * totalOverheadRate;
  const dailyTotalCost = dailyLaborCost + dailyOverhead;

  // Budget and profit timeline
  const totalBudget = parseFloat(job.totalBudget || "0");
  const profitDays = dailyTotalCost > 0 ? Math.floor(totalBudget / dailyTotalCost) : 0;
  const profitMarginDays = profitDays > 0 ? Math.max(0, profitDays - (scheduleItems?.length || 0)) : 0;

  // Scheduled tasks count
  const scheduledCount = scheduleItems?.length || 0;
  const completedCount = (scheduleItems || []).filter((t: any) => t.status === "completed").length;

  // Group tasks by date for the daily breakdown
  const tasksByDate: Record<string, any[]> = {};
  for (const item of (scheduleItems || [])) {
    const dateKey = new Date(item.scheduledDate).toISOString().split("T")[0];
    if (!tasksByDate[dateKey]) tasksByDate[dateKey] = [];
    tasksByDate[dateKey].push(item);
  }
  const sortedDates = Object.keys(tasksByDate).sort();

  // Budget burn calculation
  const daysWorked = sortedDates.length;
  const burnedBudget = daysWorked * dailyTotalCost;
  const remainingBudget = totalBudget - burnedBudget;
  const burnPct = totalBudget > 0 ? Math.min(100, Math.round((burnedBudget / totalBudget) * 100)) : 0;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      {/* ─── Crew & Cost Summary ─── */}
      <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>Crew & Daily Cost</Text>
        {!hasAssignedCrew ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <MaterialIcons name="group-add" size={28} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8, textAlign: "center" }}>No crew assigned yet. Edit this job to select crew members.</Text>
          </View>
        ) : (
          <>
            {crewMembers.map((emp: any) => (
              <View key={emp.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border + "40" }}>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{emp.role}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>${(parseFloat(emp.hourlyRate || "0") * HOURS_PER_DAY).toFixed(2)}/day</Text>
              </View>
            ))}
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>Daily Labor</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>${dailyLaborCost.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>Daily Overhead ({(totalOverheadRate * 100).toFixed(1)}%)</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.warning }}>${dailyOverhead.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Daily Total</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.error }}>${dailyTotalCost.toFixed(2)}</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* ─── Profit Timeline ─── */}
      {totalBudget > 0 && dailyTotalCost > 0 && (
        <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>Profit Timeline</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: colors.primary }}>{profitDays}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>Max Work Days</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: scheduledCount > profitDays ? colors.error : colors.success }}>{scheduledCount}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>Scheduled Days</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: profitMarginDays <= 2 ? colors.error : profitMarginDays <= 5 ? colors.warning : colors.success }}>{profitMarginDays}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>Buffer Days</Text>
            </View>
          </View>
          {/* Budget burn bar */}
          <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Budget: ${totalBudget.toLocaleString()}</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: burnPct >= 90 ? colors.error : burnPct >= 70 ? colors.warning : colors.success }}>{burnPct}% allocated</Text>
            </View>
            <View style={{ height: 8, backgroundColor: colors.border + "40", borderRadius: 4 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: burnPct >= 90 ? colors.error : burnPct >= 70 ? colors.warning : colors.primary, width: `${Math.min(burnPct, 100)}%` }} />
            </View>
          </View>
          {remainingBudget > 0 ? (
            <Text style={{ fontSize: 13, color: colors.success, fontWeight: "600" }}>Estimated profit: ${remainingBudget.toFixed(2)}</Text>
          ) : (
            <Text style={{ fontSize: 13, color: colors.error, fontWeight: "600" }}>Over budget by ${Math.abs(remainingBudget).toFixed(2)}</Text>
          )}
        </View>
      )}

      {/* ─── Daily Task Breakdown ─── */}
      <View style={{ marginHorizontal: 20, marginTop: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Daily Breakdown</Text>
          {isManagement && scheduledCount > 0 && (
            <TouchableOpacity
              onPress={() => onPushGoals(scheduleItems || [])}
              style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Push as Goals</Text>
            </TouchableOpacity>
          )}
        </View>
        {sortedDates.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 30, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <MaterialIcons name="calendar-today" size={28} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>No tasks scheduled yet. Add tasks from the Calendar or Phases tab.</Text>
          </View>
        ) : (
          sortedDates.map((dateKey, di) => {
            const tasks = tasksByDate[dateKey];
            const d = new Date(dateKey + "T12:00:00");
            const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            const allDone = tasks.every((t: any) => t.status === "completed");
            return (
              <View key={dateKey} style={{ marginBottom: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: allDone ? colors.success + "40" : colors.border, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: allDone ? colors.success + "10" : "transparent" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{dayLabel}</Text>
                    <View style={{ backgroundColor: colors.primary + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }}>{tasks.length} task{tasks.length !== 1 ? "s" : ""}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>Day {di + 1}</Text>
                </View>
                {tasks.map((task: any) => (
                  <View key={task.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border + "40" }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: task.status === "completed" ? colors.success : task.status === "in_progress" ? colors.warning : colors.muted, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{task.title}</Text>
                      {task.phase && <Text style={{ fontSize: 10, color: colors.muted }}>{task.phase}</Text>}
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: task.status === "completed" ? colors.success : colors.muted, textTransform: "uppercase" }}>
                      {task.status === "completed" ? "Done" : task.status === "in_progress" ? "Active" : "Pending"}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </View>

      {/* ─── Cost Summary Footer ─── */}
      {totalBudget > 0 && dailyTotalCost > 0 && sortedDates.length > 0 && (
        <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Cost Summary</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Total Budget</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>${totalBudget.toLocaleString()}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Estimated Labor ({sortedDates.length} days)</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>${(dailyLaborCost * sortedDates.length).toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>Estimated Overhead</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.warning }}>${(dailyOverhead * sortedDates.length).toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Estimated Profit</Text>
            <Text style={{ fontSize: 14, fontWeight: "800", color: remainingBudget >= 0 ? colors.success : colors.error }}>${remainingBudget.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 24, fontWeight: "800" },
  addBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  weekNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 0.5,
  },
  weekArrow: { padding: 8 },
  weekLabel: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  currentWeekBadge: { fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 2 },
  dayRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, paddingHorizontal: 10 },
  dayCell: { alignItems: "center", justifyContent: "center", width: 42, height: 58, borderRadius: 14 },
  dayName: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  dayNum: { fontSize: 16, fontWeight: "700" },
  dotIndicator: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
  dateLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  dateLabel: { fontSize: 16, fontWeight: "700" },
  taskCount: { fontSize: 13 },
  emptyState: { alignItems: "center", paddingTop: 50 },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4, marginTop: 8 },
  emptySubtitle: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  taskCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10, marginHorizontal: 20 },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  taskTitle: { fontSize: 15, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },
  taskDesc: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  crewRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 },
  crewLabel: { fontSize: 12, fontWeight: "600" },
  crewNames: { fontSize: 12, flex: 1 },
  taskActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: "#33333322" },
  taskActionBtn: { padding: 4 },
  jobOverviewCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottomWidth: 0.5, marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  dateDisplay: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  descInput: { minHeight: 60, textAlignVertical: "top" },
  crewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  crewChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, gap: 8 },
  crewCheck: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  saveBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginBottom: 20 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
