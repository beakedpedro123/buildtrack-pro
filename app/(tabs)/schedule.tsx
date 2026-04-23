import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
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
  "#6366F1", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B",
];

const CONSTRUCTION_PHASES = [
  "Site Prep", "Foundation", "Framing", "Roofing", "Plumbing Rough-In",
  "Electrical Rough-In", "HVAC", "Insulation", "Drywall", "Interior Trim",
  "Painting", "Flooring", "Cabinets & Counters", "Final Mechanical",
  "Exterior Finish", "Landscaping", "Punch List", "Final Inspection",
];

type ViewMode = "overview" | "calendar" | "tasks";

export default function ScheduleScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
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

  // Form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPhase, setTaskPhase] = useState("");
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
  const bulkCreateMutation = trpc.schedule.bulkCreate.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });
  const deleteByJobMutation = trpc.schedule.deleteByJob.useMutation({ onSuccess: () => { refetch(); utils.schedule.getAll.invalidate(); } });

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

  const dayTasks = useMemo(() => {
    return jobScheduleItems.filter((item: any) => {
      const d = new Date(item.scheduledDate);
      return isSameDay(d, selectedDate);
    });
  }, [jobScheduleItems, selectedDate]);

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
        await updateMutation.mutateAsync({
          id: editingTask.id,
          title: taskTitle.trim(),
          description: taskDesc.trim() || undefined,
          phase: taskPhase || undefined,
          scheduledDate: selectedDate.toISOString(),
          assignedEmployees: selectedEmployees.length > 0 ? JSON.stringify(selectedEmployees) : undefined,
        });
      } else {
        await createMutation.mutateAsync({
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
      await updateMutation.mutateAsync({ id: task.id, status: newStatus as any });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { Alert.alert("Error", "Failed to update status"); }
  }, []);

  const handleDeleteTask = useCallback((task: any) => {
    Alert.alert("Delete Task", `Remove "${task.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await deleteMutation.mutateAsync({ id: task.id });
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
      const jobType = "residential framing"; // Pedro's business
      const prompt = `Generate a detailed construction schedule for this job:
Job: ${job.name}
Address: ${job.address || "N/A"}
Budget: $${job.totalBudget || "0"}
Start Date: ${startDate.toISOString().split("T")[0]}
Type: ${jobType}

Create a realistic multi-month schedule with construction phases. For each task, provide:
- phase (e.g., "Site Prep", "Foundation", "Framing", "Roofing", etc.)
- title (specific task name)
- description (brief details)
- scheduledDate (ISO date string)
- durationDays (how many days this task takes)

Return ONLY a valid JSON array of objects with these fields. No markdown, no explanation. Example:
[{"phase":"Site Prep","title":"Clear lot","description":"Remove debris and grade","scheduledDate":"2026-05-01","durationDays":2}]

Generate 30-60 tasks spanning 3-6 months for a typical residential framing job. Include all major phases from site prep through final inspection.`;

      // Call Pivot via the server's LLM
      const response = await fetch("http://127.0.0.1:3000/api/pivot-generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  // Template schedule generator (fallback)
  function generateTemplateSchedule(startDate: Date): any[] {
    const tasks: any[] = [];
    const phases = [
      { name: "Site Prep", tasks: ["Clear & grade lot", "Set up temp utilities", "Survey & stake"], days: 5 },
      { name: "Foundation", tasks: ["Excavate footings", "Form & pour footings", "Foundation walls", "Waterproofing", "Backfill"], days: 14 },
      { name: "Framing", tasks: ["Sill plates & floor joists", "Subfloor sheathing", "Wall framing – 1st floor", "Wall framing – 2nd floor", "Roof trusses", "Roof sheathing", "Window & door openings"], days: 21 },
      { name: "Roofing", tasks: ["Underlayment & flashing", "Shingle installation", "Ridge vents & caps"], days: 7 },
      { name: "Plumbing Rough-In", tasks: ["Drain/waste/vent rough", "Water supply rough", "Gas line rough"], days: 7 },
      { name: "Electrical Rough-In", tasks: ["Panel installation", "Wire runs & boxes", "Low voltage rough"], days: 7 },
      { name: "HVAC", tasks: ["Ductwork installation", "Unit placement", "Vent terminations"], days: 5 },
      { name: "Insulation", tasks: ["Exterior wall insulation", "Attic insulation", "Vapor barrier"], days: 5 },
      { name: "Drywall", tasks: ["Hang drywall", "Tape & mud", "Sand & prime"], days: 10 },
      { name: "Interior Trim", tasks: ["Door casings & baseboards", "Crown molding", "Stair railings"], days: 7 },
      { name: "Painting", tasks: ["Interior primer", "Interior paint – 2 coats", "Touch-up & detail"], days: 7 },
      { name: "Flooring", tasks: ["Tile installation", "Hardwood installation", "Carpet installation"], days: 7 },
      { name: "Final Mechanical", tasks: ["Plumbing fixtures", "Electrical fixtures & devices", "HVAC commissioning"], days: 5 },
      { name: "Exterior Finish", tasks: ["Siding installation", "Exterior paint/stain", "Gutters & downspouts"], days: 10 },
      { name: "Punch List", tasks: ["Walk-through inspection", "Deficiency corrections", "Final clean"], days: 5 },
      { name: "Final Inspection", tasks: ["Building dept inspection", "Certificate of occupancy", "Client walk-through"], days: 3 },
    ];

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
                <Text style={s.addBtnText}>⚡ Generate</Text>
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

        {/* Job Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          <TouchableOpacity
            onPress={() => { setSelectedJobId(null); setViewMode("overview"); }}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
              backgroundColor: !selectedJobId ? colors.primary : colors.surface,
              borderWidth: 1, borderColor: !selectedJobId ? colors.primary : colors.border,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: !selectedJobId ? "#fff" : colors.foreground }}>All Jobs</Text>
          </TouchableOpacity>
          {activeJobs.map((job: any) => {
            const isActive = selectedJobId === job.id;
            return (
              <TouchableOpacity
                key={job.id}
                onPress={() => { setSelectedJobId(job.id); setViewMode("tasks"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: isActive ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? "#fff" : colors.foreground }} numberOfLines={1}>{job.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* View Mode Tabs (only when a job is selected) */}
        {selectedJobId && (
          <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 4, gap: 0 }}>
            {(["tasks", "calendar", "overview"] as ViewMode[]).map((mode) => {
              const isActive = viewMode === mode;
              const label = mode === "tasks" ? "Phases" : mode === "calendar" ? "Calendar" : "Progress";
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
                <Text style={{ fontSize: 32 }}>📅</Text>
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
            {/* Week Navigation */}
            <View style={[s.weekNav, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setWeekOffset((w) => w - 1)} style={s.weekArrow}>
                <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWeekOffset(0)}>
                <Text style={[s.weekLabel, { color: colors.foreground }]}>
                  {formatDate(calendarWeekDates[0])} – {formatDate(calendarWeekDates[6])}
                </Text>
                {weekOffset === 0 && <Text style={[s.currentWeekBadge, { color: colors.primary }]}>This Week</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWeekOffset((w) => w + 1)} style={s.weekArrow}>
                <Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>›</Text>
              </TouchableOpacity>
            </View>
            {/* Day Selector */}
            <View style={s.dayRow}>
              {calendarWeekDates.map((d, i) => {
                const isSelected = isSameDay(d, selectedDate);
                const isToday = isSameDay(d, today);
                const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                const taskCount = weekTaskCounts[key] || 0;
                const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setSelectedDate(d)}
                    style={[s.dayCell, {
                      backgroundColor: isSelected ? colors.primary : "transparent",
                      borderColor: isToday && !isSelected ? colors.primary : "transparent",
                      borderWidth: isToday && !isSelected ? 2 : 0,
                    }]}
                  >
                    <Text style={[s.dayName, { color: isSelected ? "#fff" : colors.muted }]}>{dayNames[d.getDay()]}</Text>
                    <Text style={[s.dayNum, { color: isSelected ? "#fff" : colors.foreground }]}>{d.getDate()}</Text>
                    {taskCount > 0 && <View style={[s.dotIndicator, { backgroundColor: isSelected ? "#fff" : colors.primary }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.dateLabelRow}>
              <Text style={[s.dateLabel, { color: colors.foreground }]}>{formatDateFull(selectedDate)}</Text>
              <Text style={[s.taskCount, { color: colors.muted }]}>{dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}</Text>
            </View>
            <FlatList
              data={dayTasks}
              keyExtractor={(item: any) => item.id.toString()}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
              renderItem={renderTaskCard}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={[s.emptyTitle, { color: colors.muted }]}>No tasks for this day</Text>
                </View>
              }
            />
          </>
        ) : (
          /* ═══ PHASES / TASKS VIEW ═══ */
          <FlatList
            data={Object.entries(phaseGroups)}
            keyExtractor={([phase]) => phase}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Text style={{ fontSize: 32 }}>📅</Text>
                <Text style={[s.emptyTitle, { color: colors.muted }]}>No schedule yet</Text>
                <Text style={[s.emptySubtitle, { color: colors.muted }]}>
                  {isManagement ? "Tap \"⚡ Generate\" to create a full schedule with Pivot AI." : "No tasks scheduled for this job."}
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
        )}

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
