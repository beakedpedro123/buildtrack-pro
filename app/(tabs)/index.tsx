import { ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useAppAuth } from "@/lib/auth-context";
import { useClockState } from "@/lib/clock-state-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { formatTime12, formatTimeForEdit, parse12HrTime } from "@/lib/utils";
import { router } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useOfflineQueue } from "@/lib/offline-queue";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";
import { VoiceGoalCreator } from "@/components/voice-goal-creator";
import { JobPicker } from "@/components/ui/job-picker";
import { ConstructionCalculator } from "@/components/construction-calculator";

const companyLogo = require("@/assets/images/company-logo.png");
import { BG_HOME as bgHome } from "@/constants/bg-urls";

const ROLE_COLORS: Record<string, string> = {
  owner: "#C8A951",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#D4A843",
  laborer: "#22C55E",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

type LaborPeriod = "week" | "month" | "30days";

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(ms: number) {
  if (ms <= 0) return "0h 0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatHours(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function getDateRange(period: LaborPeriod): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (period === "week") {
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Week" };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: end.toISOString(), label: "This Month" };
  }
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString(), label: "Last 30 Days" };
}

// Daily motivational messages by role
const OWNER_QUOTES = [
  "Building greatness, one project at a time.",
  "Your vision drives the whole team forward.",
  "Leaders don't create followers — they create more leaders.",
  "Every empire was built one decision at a time.",
  "The foundation you're laying today will stand for generations.",
  "Your team looks up to you — keep leading by example.",
  "Success isn't built overnight, but it is built daily.",
  "The best investment is in the people who build with you.",
  "Stay hungry, stay humble, keep building.",
  "Great businesses are built by great teams — yours is one of them.",
  "Your hustle today writes tomorrow's legacy.",
  "Keep pushing — the view from the top is worth it.",
  "You didn't come this far to only come this far.",
  "The grind never lies. Keep going, boss.",
];
const OFFICE_MANAGER_QUOTES = [
  "Organization is the backbone of every great project.",
  "Your attention to detail keeps everything running smooth.",
  "Behind every great crew is someone keeping it all together.",
  "Precision today prevents problems tomorrow.",
  "You're the glue that holds this operation together.",
  "Every number you track builds a stronger business.",
  "Your work behind the scenes makes the field work possible.",
  "Stay sharp — the team depends on your accuracy.",
  "Great operations run on great organization.",
  "Keep the machine running — you're doing amazing.",
  "Details matter. And you nail every one of them.",
  "The office is the engine room — keep it humming.",
  "Payroll, hours, reports — you handle it all with grace.",
  "The crew doesn't see everything you do, but the business wouldn't run without you.",
];
const LOGISTICS_QUOTES = [
  "Coordination is your superpower — keep it flowing.",
  "Every delivery, every schedule, every move — you make it happen.",
  "The crew builds it, but you make sure they have what they need.",
  "Logistics wins jobs. Keep those wheels turning.",
  "On time, on budget, on point — that's your standard.",
  "Materials don't move themselves. You're the engine.",
  "Great logistics means zero excuses on the job site.",
  "You keep the supply chain tight and the crew happy.",
  "Planning today saves headaches tomorrow. Keep planning.",
  "When the job runs smooth, that's your fingerprint on it.",
  "Every truck, every load, every schedule — you own it.",
  "The field depends on your timing. Don't let up.",
];
const FOREMAN_QUOTES = [
  "Your crew counts on you — lead with confidence.",
  "A great foreman builds both structures and people.",
  "Set the pace, set the standard, set the example.",
  "Your leadership on site makes all the difference.",
  "Safety first, quality always — you set the tone.",
  "The crew follows your energy. Bring it today.",
  "Good foremen build buildings. Great foremen build teams.",
  "Keep your crew tight and your standards high.",
  "Every job site you run is a reflection of your leadership.",
  "Lead from the front — they're watching and learning.",
  "Your experience is your superpower. Use it.",
  "Another day to show your crew what excellence looks like.",
];
const LABORER_QUOTES = [
  "Let's build something great today!",
  "Hard work pays off — keep it up!",
  "Safety first, quality always.",
  "Another day to make progress!",
  "Your work matters. Stay focused!",
  "Great things are built one day at a time.",
  "Stay safe, stay sharp.",
  "Let's get it done right!",
  "Consistency builds excellence.",
  "Every brick counts. Keep going!",
  "Show up, work hard, be proud of what you build.",
  "The best workers don't cut corners — they set standards.",
  "Your hands are building someone's dream. That matters.",
  "Skill + effort = unstoppable. Keep at it.",
];

function getDailyQuote(role?: string): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  if (role === "owner") return OWNER_QUOTES[dayOfYear % OWNER_QUOTES.length];
  if (role === "office_manager") return OFFICE_MANAGER_QUOTES[dayOfYear % OFFICE_MANAGER_QUOTES.length];
  if (role === "logistics") return LOGISTICS_QUOTES[dayOfYear % LOGISTICS_QUOTES.length];
  if (role === "foreman") return FOREMAN_QUOTES[dayOfYear % FOREMAN_QUOTES.length];
  return LABORER_QUOTES[dayOfYear % LABORER_QUOTES.length];
}

// ═══════════════════════════════════════════════════════════
// Collapsible Section Header Component
// ═══════════════════════════════════════════════════════════
function CollapsibleHeader({
  title,
  expanded,
  onToggle,
  badge,
  rightAction,
  colors,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  rightAction?: { label: string; onPress: () => void };
  colors: any;
}) {
  return (
    <TouchableOpacity
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 }}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>{title}</Text>
        {badge !== undefined && badge > 0 && (
          <View style={{ backgroundColor: colors.error + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress}>
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
        <Text style={{ fontSize: 12, color: colors.muted }}>{expanded ? "▲" : "▼"}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await utils.invalidate(); } catch {}
    setRefreshing(false);
  }, [utils]);
  const colors = useColors();
  const { employee, logout } = useAppAuth();
  const [now, setNow] = useState(new Date());
  const [laborPeriod, setLaborPeriod] = useState<LaborPeriod>("week");
  const [showActiveJobs, setShowActiveJobs] = useState(false);
  const [showByEmployee, setShowByEmployee] = useState(true);
  const [showBudgetAlerts, setShowBudgetAlerts] = useState(true);
  const [showWeeklyTrend, setShowWeeklyTrend] = useState(false);
  const [showCostByJob, setShowCostByJob] = useState(false);
  const [showHourlyProfit, setShowHourlyProfit] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const role = employee?.role || "laborer";
  const isManagement = role === "owner" || role === "office_manager" || role === "logistics";
  const isOwner = role === "owner";
  const isForeman = role === "foreman";
  const isLaborer = role === "laborer";
  const isFieldRole = role === "foreman" || role === "laborer";
  const isSecretary = role === "office_manager";

  const { startDate, endDate, label: periodLabel } = useMemo(() => getDateRange(laborPeriod), [laborPeriod]);

  const [cachedMyJobs, setCachedMyJobs] = useState<any[] | null>(null);
  const [cachedActiveJobs, setCachedActiveJobs] = useState<any[] | null>(null);
  const [cachedEmployees, setCachedEmployees] = useState<any[] | null>(null);

  useEffect(() => {
    getCached<any[]>(CACHE_KEYS.MY_JOBS).then((d) => { if (d) setCachedMyJobs(d); });
    getCached<any[]>(CACHE_KEYS.ACTIVE_JOBS).then((d) => { if (d) setCachedActiveJobs(d); });
    getCached<any[]>(CACHE_KEYS.ALL_EMPLOYEES).then((d) => { if (d) setCachedEmployees(d); });
  }, []);

  const { data: activeJobs } = trpc.jobs.listActive.useQuery(undefined, { staleTime: 30000 });
  useEffect(() => {
    if (activeJobs && activeJobs.length > 0) {
      setCache(CACHE_KEYS.ACTIVE_JOBS, activeJobs);
      setCachedActiveJobs(activeJobs);
    }
  }, [activeJobs]);

  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManagement, staleTime: 30000 });
  useEffect(() => {
    if (allEmployees && allEmployees.length > 0) {
      setCache(CACHE_KEYS.ALL_EMPLOYEES, allEmployees);
      setCachedEmployees(allEmployees);
    }
  }, [allEmployees]);

  const { data: clockedIn, refetch: refetchClockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { enabled: isManagement, staleTime: 0, refetchInterval: 15000, refetchOnMount: "always", refetchOnWindowFocus: "always" });

  const [showVoiceGoals, setShowVoiceGoals] = useState(false);
  const { addClockEntry } = useOfflineQueue();

  // Clock-out from dashboard
  const { forceRefresh: clockForceRefresh } = useClockState();
  const clockOutMutation = trpc.clock.out.useMutation();
  const [clockingOutId, setClockingOutId] = useState<number | null>(null);
  const handleDashboardClockOut = useCallback(async (entryId: number) => {
    if (clockingOutId) return;
    setClockingOutId(entryId);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const clockOutTime = new Date().toISOString();
    const entryData = (clockedIn || []).find((e: any) => e.id === entryId);
    try {
      await clockOutMutation.mutateAsync({ entryId, clockOut: clockOutTime });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await clockForceRefresh();
      refetchClockedIn();
    } catch {
      if (entryData) {
        await addClockEntry({
          employeeId: entryData.employeeId,
          jobId: entryData.jobId,
          clockIn: typeof entryData.clockIn === 'string' ? entryData.clockIn : new Date(entryData.clockIn).toISOString(),
          clockOut: clockOutTime,
          existingEntryId: entryId > 0 ? entryId : undefined,
        });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally { setClockingOutId(null); }
  }, [clockingOutId, clockOutMutation, clockForceRefresh, refetchClockedIn, clockedIn, addClockEntry]);

  // Edit time state
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editTimeStr, setEditTimeStr] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const updateEntryMutation = trpc.clock.updateEntry.useMutation();

  const startEditTime = (entryId: number, currentClockIn: string) => {
    const edit = formatTimeForEdit(currentClockIn);
    setEditTimeStr(edit.time);
    setEditingEntryId(entryId);
  };

  const saveEditTime = useCallback(async () => {
    if (!editingEntryId || !editTimeStr) return;
    const parts = editTimeStr.split(":");
    if (parts.length !== 2) { Alert.alert("Invalid Time", "Use HH:MM format"); return; }
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
      Alert.alert("Invalid Time", "Enter a valid time (00:00 - 23:59)"); return;
    }
    const entry = (clockedIn || []).find((e: any) => e.id === editingEntryId);
    const originalDate = entry ? new Date(entry.clockIn) : new Date();
    const newDate = new Date(originalDate);
    newDate.setHours(hours, mins, 0, 0);
    setEditSaving(true);
    try {
      await updateEntryMutation.mutateAsync({ entryId: editingEntryId, clockIn: newDate.toISOString() });
      setEditingEntryId(null);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Error", "Failed to update time."); }
    finally { setEditSaving(false); }
  }, [editingEntryId, editTimeStr, clockedIn, updateEntryMutation]);

  // Self clock state
  const { activeEntry, optimisticClockIn, optimisticClockOut } = useClockState();
  const clockInMutation = trpc.clock.in.useMutation();
  const clockOutMutationSelf = trpc.clock.out.useMutation();
  const [selfClockJobId, setSelfClockJobId] = useState<number | null>(null);
  const [selfClockLoading, setSelfClockLoading] = useState(false);
  const [selfClockSuccess, setSelfClockSuccess] = useState<string | null>(null);

  const handleSelfClockIn = useCallback(async () => {
    if (!employee?.id || !selfClockJobId) {
      Alert.alert("Select a Job", "Please select a jobsite before clocking in.");
      return;
    }
    if (selfClockLoading) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelfClockLoading(true);
    try {
      const clockInTime = new Date().toISOString();
      optimisticClockIn({ id: -1, employeeId: employee.id, jobId: selfClockJobId, clockIn: clockInTime, clockOut: null });
      setSelfClockSuccess("Clocked in!");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSelfClockSuccess(null), 4000);
      try {
        await clockInMutation.mutateAsync({ employeeId: employee.id, jobId: selfClockJobId, clockIn: clockInTime, isOfflineEntry: false });
      } catch {
        await addClockEntry({ employeeId: employee.id, jobId: selfClockJobId, clockIn: clockInTime });
        setSelfClockSuccess("Clocked in (saved for sync)!");
        setTimeout(() => setSelfClockSuccess(null), 4000);
      }
    } finally { setSelfClockLoading(false); }
  }, [employee?.id, selfClockJobId, selfClockLoading, clockInMutation, addClockEntry, optimisticClockIn]);

  const handleSelfClockOut = useCallback(async () => {
    if (!activeEntry) return;
    if (selfClockLoading) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelfClockLoading(true);
    try {
      const clockOutTime = new Date().toISOString();
      optimisticClockOut();
      setSelfClockSuccess("Clocked out!");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSelfClockSuccess(null), 4000);
      if (activeEntry.id < 0) {
        await addClockEntry({ employeeId: activeEntry.employeeId, jobId: activeEntry.jobId, clockIn: activeEntry.clockIn, clockOut: clockOutTime });
      } else {
        try {
          await clockOutMutationSelf.mutateAsync({ entryId: activeEntry.id, clockOut: clockOutTime });
        } catch {
          await addClockEntry({ employeeId: activeEntry.employeeId, jobId: activeEntry.jobId, clockIn: activeEntry.clockIn, clockOut: clockOutTime, existingEntryId: activeEntry.id });
          setSelfClockSuccess("Clocked out (saved for sync)!");
          setTimeout(() => setSelfClockSuccess(null), 4000);
        }
      }
    } catch {} finally { setSelfClockLoading(false); }
  }, [activeEntry, selfClockLoading, clockOutMutationSelf, optimisticClockOut, addClockEntry]);

  const { data: myJobs } = trpc.jobs.forEmployee.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee && !isManagement }
  );
  useEffect(() => {
    if (myJobs && myJobs.length > 0) {
      setCache(CACHE_KEYS.MY_JOBS, myJobs);
      setCachedMyJobs(myJobs);
    }
  }, [myJobs]);

  const rawMyJobs = (myJobs && myJobs.length > 0) ? myJobs : (cachedMyJobs && cachedMyJobs.length > 0) ? cachedMyJobs : (activeJobs || cachedActiveJobs || []);
  const effectiveMyJobs = (rawMyJobs as any[]).filter((j: any) => j && j.id).map((j: any) => ({ ...j, name: String(j.name || j.jobName || `Job #${j.id}`) })).filter((j: any) => j.name.length >= 2);
  const effectiveActiveJobs = ((activeJobs || cachedActiveJobs || []) as any[]).filter((j: any) => j && j.id).map((j: any) => ({ ...j, name: String(j.name || j.jobName || `Job #${j.id}`) })).filter((j: any) => j.name.length >= 2);

  useEffect(() => {
    if (effectiveMyJobs.length === 1 && !selfClockJobId) {
      setSelfClockJobId(effectiveMyJobs[0].id);
    }
  }, [effectiveMyJobs]);

  // Budget alerts — owner AND office_manager (secretary) should see them
  const { data: budgetAlerts } = trpc.budgetAlerts.getAlerts.useQuery(undefined, { enabled: isOwner || isSecretary, staleTime: 60000 });
  const activeAlerts = useMemo(() => (budgetAlerts || []).filter(a => a.alertLevel !== "ok"), [budgetAlerts]);

  // Labor cost data
  const { data: byJob } = trpc.laborDashboard.byJob.useQuery({ startDate, endDate }, { enabled: isManagement, staleTime: 30000 });
  const { data: weeklyTrend } = trpc.laborDashboard.weeklyTrend.useQuery({ weeks: 8 }, { enabled: isManagement, staleTime: 60000 });
  const { data: byEmployee } = trpc.laborDashboard.byEmployee.useQuery({ startDate, endDate }, { enabled: isManagement, staleTime: 30000 });

  const totalCost = useMemo(() => (byJob || []).reduce((sum, j) => sum + j.totalCost, 0), [byJob]);
  const totalMinutes = useMemo(() => (byJob || []).reduce((sum, j) => sum + j.totalMinutes, 0), [byJob]);
  const canSeeDollars = isOwner || role === "office_manager";

  const maxJobCost = useMemo(() => {
    if (!byJob || byJob.length === 0) return 1;
    return Math.max(...byJob.map(j => canSeeDollars ? j.totalCost : j.totalMinutes)) || 1;
  }, [byJob, canSeeDollars]);

  const maxWeeklyCost = useMemo(() => {
    if (!weeklyTrend || weeklyTrend.length === 0) return 1;
    return Math.max(...weeklyTrend.map(w => canSeeDollars ? w.totalCost : w.totalMinutes)) || 1;
  }, [weeklyTrend, canSeeDollars]);

  const elapsed = activeEntry ? now.getTime() - new Date(activeEntry.clockIn).getTime() : 0;
  const activeJobForEntry = [...effectiveActiveJobs, ...effectiveMyJobs].find((j) => j.id === activeEntry?.jobId);

  // Profit calculation for hourly jobs
  const hourlyJobProfits = useMemo(() => {
    if (!byJob || !activeJobs) return [];
    return (activeJobs as any[])
      .filter((j: any) => j.billingType === "hourly" && j.hourlyRate)
      .map((job: any) => {
        const laborData = byJob.find((b) => b.jobId === job.id);
        if (!laborData || laborData.totalMinutes === 0) return null;
        const hours = laborData.totalMinutes / 60;
        const revenue = hours * parseFloat(job.hourlyRate || "0");
        const cost = laborData.totalCost;
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { jobName: job.name, revenue, cost, profit, margin, hours };
      })
      .filter(Boolean) as { jobName: string; revenue: number; cost: number; profit: number; margin: number; hours: number }[];
  }, [byJob, activeJobs]);

  const getRoleColor = (r: string) => {
    switch (r) {
      case "owner": return "#C8A951";
      case "office_manager": return "#8B5CF6";
      case "logistics": return "#0EA5E9";
      case "foreman": return "#D4A843";
      case "laborer": return "#22C55E";
      default: return colors.muted;
    }
  };

  if (!employee) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </ScreenContainer>
    );
  }

  const roleColor = ROLE_COLORS[role] || colors.primary;

  // ═══════════════════════════════════════════════════════════
  // LABORER HOME — Clean, simple, personal
  // ═══════════════════════════════════════════════════════════
  if (isLaborer) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <ImageBackground source={bgHome} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.3 }}>
        <OfflineBanner />
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
          {/* Company Logo */}
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <Image source={companyLogo} style={{ width: 80, height: 80, resizeMode: "contain" }} />
          </View>

          {/* Personal Hero */}
          <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 2 }}>{employee.name}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: roleColor }}>{ROLE_LABELS[role]}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", fontStyle: "italic", marginTop: 4, paddingHorizontal: 20 }}>{getDailyQuote(role)}</Text>
          </View>

          {/* Clock Status Card */}
          <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: activeEntry ? colors.success : colors.muted }} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: activeEntry ? colors.success : colors.muted }}>
                {activeEntry ? "Clocked In" : "Not Clocked In"}
              </Text>
            </View>
            {selfClockSuccess && (
              <View style={{ backgroundColor: colors.success + "15", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: colors.success, fontSize: 14, fontWeight: "700", textAlign: "center" }}>✓ {selfClockSuccess}</Text>
              </View>
            )}
            {activeEntry ? (
              <>
                <Text style={{ fontSize: 48, fontWeight: "800", color: colors.foreground, letterSpacing: -1 }}>{formatDuration(elapsed)}</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 }}>
                  {activeJobForEntry?.name || "Unknown Job"} · Since {formatTime12(activeEntry.clockIn)}
                </Text>
                <TouchableOpacity
                  style={{ borderRadius: 14, padding: 16, alignItems: "center", width: "100%", backgroundColor: colors.error, opacity: selfClockLoading ? 0.7 : 1 }}
                  onPress={handleSelfClockOut}
                  disabled={selfClockLoading}
                >
                  {selfClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock Out</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 48, fontWeight: "800", color: colors.muted + "60", letterSpacing: -1 }}>0h 0m</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 12 }}>Select a jobsite and clock in</Text>
                {employee?.id ? (
                  <JobPicker employeeId={employee.id} selectedJobId={selfClockJobId} onSelectJob={setSelfClockJobId} />
                ) : null}
                <TouchableOpacity
                  style={{ borderRadius: 14, padding: 16, alignItems: "center", width: "100%", backgroundColor: colors.success, opacity: (!selfClockJobId || selfClockLoading) ? 0.5 : 1 }}
                  onPress={handleSelfClockIn}
                  disabled={!selfClockJobId || selfClockLoading}
                >
                  {selfClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => setShowVoiceGoals(true)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>🎯</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>My Goals</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/reports" as any)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>📋</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Daily Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/hours" as any)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>⏰</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>My Hours</Text>
            </TouchableOpacity>
          </View>

          {/* Tools: Calculator + Compass */}
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>Tools</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
                onPress={() => setShowCalculator(true)}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>🧮</Text>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Calculator</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Construction & Payroll</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Linking.openURL("compass://").catch(() => {
                      Linking.openURL("https://www.google.com/maps").catch(() => {});
                    });
                  }
                }}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>🧭</Text>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Compass</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Direction & Navigation</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Logout */}
          <TouchableOpacity style={{ marginHorizontal: 20, marginTop: 8, marginBottom: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={logout}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
      <VoiceGoalCreator visible={showVoiceGoals} onClose={() => setShowVoiceGoals(false)} />
      <ConstructionCalculator visible={showCalculator} onClose={() => setShowCalculator(false)} />
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // FOREMAN HOME — Personal + crew overview
  // ═══════════════════════════════════════════════════════════
  if (isForeman) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <ImageBackground source={bgHome} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.3 }}>
        <OfflineBanner />
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
          {/* Company Logo */}
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <Image source={companyLogo} style={{ width: 80, height: 80, resizeMode: "contain" }} />
          </View>

          {/* Personal Hero */}
          <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 2 }}>{employee.name}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: roleColor }}>{ROLE_LABELS[role]}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", fontStyle: "italic", marginTop: 4, paddingHorizontal: 20 }}>{getDailyQuote(role)}</Text>
          </View>

          {/* Clock Status Card */}
          <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: activeEntry ? colors.success : colors.muted }} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: activeEntry ? colors.success : colors.muted }}>
                {activeEntry ? "Clocked In" : "Not Clocked In"}
              </Text>
            </View>
            {selfClockSuccess && (
              <View style={{ backgroundColor: colors.success + "15", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: colors.success, fontSize: 14, fontWeight: "700", textAlign: "center" }}>✓ {selfClockSuccess}</Text>
              </View>
            )}
            {activeEntry ? (
              <>
                <Text style={{ fontSize: 48, fontWeight: "800", color: colors.foreground, letterSpacing: -1 }}>{formatDuration(elapsed)}</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 }}>
                  {activeJobForEntry?.name || "Unknown Job"} · Since {formatTime12(activeEntry.clockIn)}
                </Text>
                <TouchableOpacity
                  style={{ borderRadius: 14, padding: 16, alignItems: "center", width: "100%", backgroundColor: colors.error, opacity: selfClockLoading ? 0.7 : 1 }}
                  onPress={handleSelfClockOut}
                  disabled={selfClockLoading}
                >
                  {selfClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock Out</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 48, fontWeight: "800", color: colors.muted + "60", letterSpacing: -1 }}>0h 0m</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 12 }}>Select a jobsite and clock in</Text>
                {employee?.id ? (
                  <JobPicker employeeId={employee.id} selectedJobId={selfClockJobId} onSelectJob={setSelfClockJobId} />
                ) : null}
                <TouchableOpacity
                  style={{ borderRadius: 14, padding: 16, alignItems: "center", width: "100%", backgroundColor: colors.success, opacity: (!selfClockJobId || selfClockLoading) ? 0.5 : 1 }}
                  onPress={handleSelfClockIn}
                  disabled={!selfClockJobId || selfClockLoading}
                >
                  {selfClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.success + "15", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.success + "40", alignItems: "center" }} onPress={() => router.push("/manage" as any)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>⏱️</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success, textAlign: "center" }}>Crew Clock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/reports" as any)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>📋</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Field Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/safety" as any)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>🛡️</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Safety</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => setShowVoiceGoals(true)}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>🎯</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Goals</Text>
            </TouchableOpacity>
          </View>

          {/* Tools: Calculator + Compass */}
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>Tools</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
                onPress={() => setShowCalculator(true)}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>🧮</Text>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Calculator</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Construction & Payroll</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Linking.openURL("compass://").catch(() => {
                      Linking.openURL("https://www.google.com/maps").catch(() => {});
                    });
                  }
                }}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>🧭</Text>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Compass</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Direction & Navigation</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Logout */}
          <TouchableOpacity style={{ marginHorizontal: 20, marginTop: 8, marginBottom: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={logout}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
      <VoiceGoalCreator visible={showVoiceGoals} onClose={() => setShowVoiceGoals(false)} />
      <ConstructionCalculator visible={showCalculator} onClose={() => setShowCalculator(false)} />
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MANAGEMENT HOME — Full dashboard (Owner, Office Manager, Logistics)
  // ═══════════════════════════════════════════════════════════
  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ImageBackground source={bgHome} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.3 }}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* Company Logo */}
        <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 2 }}>
          <Image source={companyLogo} style={{ width: 100, height: 100, resizeMode: "contain" }} />
        </View>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>
                {now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening"}, {employee.name.split(" ")[0]}
              </Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start", marginTop: 4, backgroundColor: roleColor }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{ROLE_LABELS[role]}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontStyle: "italic", color: colors.muted, marginTop: 6 }}>
            {getDailyQuote(role)}
          </Text>
        </View>

        {/* Management KPIs — TAPPABLE */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 16 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}
            onPress={() => router.push("/jobs" as any)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground }}>{(activeJobs || cachedActiveJobs || []).length}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Active Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}
            onPress={() => router.push("/team" as any)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.success }}>{(clockedIn || []).length}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>On Site Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}
            onPress={() => router.push("/manage" as any)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground }}>{(allEmployees || cachedEmployees || []).filter((e: any) => e.isActive).length}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Employees</Text>
          </TouchableOpacity>
        </View>

        {/* Who's On Site */}
        {(clockedIn || []).length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>On Site Now ({(clockedIn || []).length})</Text>
              <TouchableOpacity onPress={() => router.push("/team" as any)}>
                <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>See All</Text>
              </TouchableOpacity>
            </View>
            {(clockedIn || []).slice(0, 5).map((entry: any) => {
              const empName = entry.employeeName || (allEmployees || []).find((e: any) => e.id === entry.employeeId)?.name || "Unknown";
              const empRole = entry.employeeRole || (allEmployees || []).find((e: any) => e.id === entry.employeeId)?.role || "laborer";
              const jobName = entry.jobName || (activeJobs || []).find((j: any) => j.id === entry.jobId)?.name || "Unknown Job";
              const dur = now.getTime() - new Date(entry.clockIn).getTime();
              const durDisplay = dur > 0 ? formatDuration(dur) : "0h 0m";
              const isEditing = editingEntryId === entry.id;
              const timeStr = formatTime12(entry.clockIn);
              const isClockingOut = clockingOutId === entry.id;
              return (
                <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 12, backgroundColor: ROLE_COLORS[empRole] || colors.primary }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{getInitials(empName)}</Text>
                  </View>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/timecard/${entry.employeeId}` as any)} activeOpacity={0.6}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{empName}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{jobName} • In: {timeStr}</Text>
                  </TouchableOpacity>
                  {isEditing ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <TextInput
                        value={editTimeStr}
                        onChangeText={setEditTimeStr}
                        style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: colors.foreground, width: 60, textAlign: "center", backgroundColor: colors.surface }}
                        placeholder="HH:MM"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                      <TouchableOpacity onPress={saveEditTime} style={{ backgroundColor: colors.success, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                        {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingEntryId(null)} style={{ paddingHorizontal: 4 }}>
                        <Text style={{ color: colors.muted, fontSize: 14 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>{durDisplay}</Text>
                      {isManagement && (
                        <>
                          <TouchableOpacity onPress={() => startEditTime(entry.id, entry.clockIn)} style={{ padding: 4 }}>
                            <Text style={{ fontSize: 14 }}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDashboardClockOut(entry.id)}
                            style={{ backgroundColor: colors.error, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44, alignItems: "center" }}
                            disabled={isClockingOut}
                          >
                            {isClockingOut ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>OUT</Text>}
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 12 }} />
          </>
        )}

        {/* ═══ BUDGET ALERTS (owner + office_manager) — COLLAPSIBLE ═══ */}
        {(isOwner || isSecretary) && activeAlerts.length > 0 && (
          <>
            <CollapsibleHeader
              title="Budget Alerts"
              expanded={showBudgetAlerts}
              onToggle={() => setShowBudgetAlerts(!showBudgetAlerts)}
              badge={activeAlerts.length}
              colors={colors}
            />
            {showBudgetAlerts && activeAlerts.map((alert) => {
              const alertColors = {
                warning: { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E", dot: "#F59E0B" },
                danger: { bg: "#FFF1F0", border: "#F97316", text: "#9A3412", dot: "#F97316" },
                critical: { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B", dot: "#EF4444" },
                ok: { bg: colors.surface, border: colors.border, text: colors.foreground, dot: colors.success },
              };
              const ac = alertColors[alert.alertLevel];
              return (
                <View key={alert.jobId} style={{ marginHorizontal: 20, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: 1.5, backgroundColor: ac.bg, borderColor: ac.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: 8, backgroundColor: ac.dot }} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: ac.text }} numberOfLines={1}>{alert.jobName}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: ac.dot }}>{alert.percentUsed}%</Text>
                  </View>
                  <Text style={{ fontSize: 11, marginTop: 2, marginLeft: 16, color: ac.text }}>
                    {formatCurrency(alert.totalSpend)} of {formatCurrency(alert.totalBudget)} budget used
                  </Text>
                  <View style={{ flexDirection: "row", marginLeft: 16, marginTop: 4, gap: 12 }}>
                    <Text style={{ fontSize: 10, color: ac.text }}>Labor: {formatCurrency(alert.laborCost)}</Text>
                    <Text style={{ fontSize: 10, color: ac.text }}>Overhead: {formatCurrency(alert.overheadCost)}</Text>
                    <Text style={{ fontSize: 10, color: ac.text }}>Expenses: {formatCurrency(alert.expensesCost)}</Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: ac.border + "33", borderRadius: 2, marginTop: 8, marginHorizontal: 16 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: ac.dot, width: `${Math.min(alert.percentUsed, 100)}%` }} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ═══ HOURLY JOB PROFIT (owner only) — COLLAPSIBLE ═══ */}
        {isOwner && hourlyJobProfits.length > 0 && (
          <>
            <CollapsibleHeader
              title={`Hourly Job Profit (${hourlyJobProfits.length})`}
              expanded={showHourlyProfit}
              onToggle={() => setShowHourlyProfit(!showHourlyProfit)}
              colors={colors}
            />
            {showHourlyProfit && (
              <View style={{ marginBottom: 8 }}>
                {hourlyJobProfits.map((jp, i) => (
                  <View key={i} style={{ marginHorizontal: 20, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>{jp.jobName}</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Revenue</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.success }}>{formatCurrency(jp.revenue)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Labor Cost</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>{formatCurrency(jp.cost)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Profit</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: jp.profit >= 0 ? colors.success : colors.error }}>{formatCurrency(jp.profit)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Margin</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: jp.margin >= 0 ? colors.success : colors.error }}>{jp.margin.toFixed(1)}%</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ═══ LABOR COST DASHBOARD ═══ */}
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>{canSeeDollars ? "Labor Costs" : "Labor Overview"}</Text>
          </View>

          {/* Period Selector */}
          <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 }}>
            {(["week", "month", "30days"] as LaborPeriod[]).map((p) => {
              const labels: Record<LaborPeriod, string> = { week: "This Week", month: "This Month", "30days": "Last 30 Days" };
              const active = laborPeriod === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "15" : colors.surface }}
                  onPress={() => {
                    setLaborPeriod(p);
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? colors.primary : colors.muted }}>{labels[p]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Summary Cards */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 16, gap: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
              onPress={() => router.push("/jobs" as any)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 2, color: colors.primary }}>
                {canSeeDollars ? formatCurrency(totalCost) : formatHours(totalMinutes)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "500" }}>
                {canSeeDollars ? `Total Spend (${periodLabel})` : `Total Hours (${periodLabel})`}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 2, color: colors.foreground }}>
                {(byJob || []).filter(j => j.totalMinutes > 0).length}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "500" }}>Jobs w/ Labor</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 2, color: colors.foreground }}>
                {(byEmployee || []).length}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "500" }}>Workers</Text>
            </View>
          </View>

          {/* Weekly Trend — COLLAPSIBLE */}
          {weeklyTrend && weeklyTrend.length > 0 && (
            <>
              <CollapsibleHeader
                title="Weekly Trend"
                expanded={showWeeklyTrend}
                onToggle={() => setShowWeeklyTrend(!showWeeklyTrend)}
                colors={colors}
              />
              {showWeeklyTrend && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", height: 100, paddingHorizontal: 20, marginBottom: 6, gap: 3 }}>
                    {weeklyTrend.map((w, i) => {
                      const value = canSeeDollars ? w.totalCost : w.totalMinutes;
                      const height = maxWeeklyCost > 0 ? Math.max((value / maxWeeklyCost) * 80, 2) : 2;
                      const isCurrentWeek = i === weeklyTrend.length - 1;
                      return (
                        <View key={i} style={{ flex: 1, alignItems: "center" }}>
                          <Text style={{ fontSize: 8, fontWeight: "600", color: colors.muted, marginBottom: 3 }}>
                            {canSeeDollars ? formatCurrency(value) : formatHours(value)}
                          </Text>
                          <View style={{ flex: 1, borderRadius: 3, minWidth: 16, height, backgroundColor: isCurrentWeek ? colors.primary : colors.primary + "60" }} />
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 16, gap: 3 }}>
                    {weeklyTrend.map((w, i) => (
                      <View key={i} style={{ flex: 1 }}>
                        <Text style={{ fontSize: 8, color: colors.muted, textAlign: "center" }}>{w.weekLabel}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* Per-Job Breakdown — COLLAPSIBLE */}
          {byJob && byJob.length > 0 && (
            <>
              <CollapsibleHeader
                title={`${canSeeDollars ? "Cost" : "Hours"} by Job (${periodLabel})`}
                expanded={showCostByJob}
                onToggle={() => setShowCostByJob(!showCostByJob)}
                colors={colors}
              />
              {showCostByJob && (
              <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                {byJob.slice(0, 8).map((job) => {
                  const value = canSeeDollars ? job.totalCost : job.totalMinutes;
                  const pct = maxJobCost > 0 ? (value / maxJobCost) * 100 : 0;
                  const hasOverhead = canSeeDollars && (job.taxRate > 0 || job.workersCompRate > 0 || job.liabilityInsRate > 0);
                  return (
                    <View key={job.jobId} style={{ marginBottom: hasOverhead ? 12 : 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                        <Text style={{ width: 90, fontSize: 11, color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>{job.jobName}</Text>
                        <View style={{ flex: 1, height: 20, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden", marginHorizontal: 6 }}>
                          <View style={{ height: "100%", borderRadius: 5, width: `${Math.max(pct, 2)}%`, backgroundColor: colors.primary }} />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "700", minWidth: 55, textAlign: "right", color: colors.foreground }}>
                          {canSeeDollars ? formatCurrency(job.totalCost) : formatHours(job.totalMinutes)}
                        </Text>
                      </View>
                      {hasOverhead && (
                        <View style={{ marginLeft: 96, paddingRight: 4 }}>
                          {job.taxRate > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={{ fontSize: 9, color: colors.muted }}>Tax ({job.taxRate}%)</Text>
                              <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{formatCurrency(job.taxCost)}</Text>
                            </View>
                          )}
                          {job.workersCompRate > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={{ fontSize: 9, color: colors.muted }}>WC ({job.workersCompRate}%)</Text>
                              <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{formatCurrency(job.workersCompCost)}</Text>
                            </View>
                          )}
                          {job.liabilityInsRate > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={{ fontSize: 9, color: colors.muted }}>Ins ({job.liabilityInsRate}%)</Text>
                              <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{formatCurrency(job.liabilityInsCost)}</Text>
                            </View>
                          )}
                          <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 2, paddingTop: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: colors.foreground }}>Total w/ Overhead</Text>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: colors.primary }}>{formatCurrency(job.totalWithOverhead)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            </>
          )}

          {/* Per-Employee Breakdown (collapsible) */}
          {byEmployee && byEmployee.length > 0 && (
            <>
              <CollapsibleHeader
                title={`By Employee (${periodLabel})`}
                expanded={showByEmployee}
                onToggle={() => setShowByEmployee(!showByEmployee)}
                colors={colors}
              />
              {showByEmployee && (
                <View style={{ marginBottom: 16 }}>
                  {byEmployee.slice(0, 8).map((emp) => (
                    <TouchableOpacity key={emp.employeeId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => router.push(`/timecard/${emp.employeeId}` as any)} activeOpacity={0.6}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10, backgroundColor: getRoleColor(emp.role) }}>
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{getInitials(emp.employeeName)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{emp.employeeName}</Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>{emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: "right" }}>{formatHours(emp.totalMinutes)}</Text>
                          {canSeeDollars && (
                            <Text style={{ fontSize: 10, color: colors.muted, textAlign: "right" }}>{formatCurrency(emp.totalCost)}</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 14, color: colors.primary }}>›</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </>

        {/* ═══ ACTIVE JOBS (collapsible) ═══ */}
        <CollapsibleHeader
          title={`Active Jobs (${(activeJobs || cachedActiveJobs || []).length})`}
          expanded={showActiveJobs}
          onToggle={() => setShowActiveJobs(!showActiveJobs)}
          rightAction={{ label: "See All", onPress: () => router.push("/jobs" as any) }}
          colors={colors}
        />
        {showActiveJobs && (
          <View style={{ paddingHorizontal: 20 }}>
            {(activeJobs || cachedActiveJobs || []).slice(0, 5).map((job: any) => {
              const budget = parseFloat(job.totalBudget || "0");
              const spent = (job as any).spentAmount || 0;
              const pct = budget > 0 ? Math.min(spent / budget, 1) : 0;
              const barColor = pct < 0.6 ? colors.success : pct < 0.85 ? colors.warning : colors.error;
              return (
                <TouchableOpacity
                  key={job.id}
                  style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                  onPress={() => router.push("/jobs" as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, flex: 1 }} numberOfLines={1}>{job.name}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: (job.status === "active" ? colors.success : colors.warning) + "20" }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: job.status === "active" ? colors.success : colors.warning }}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  {job.clientName && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{job.clientName}</Text>}
                  {budget > 0 && canSeeDollars && (
                    <View style={{ marginTop: 6 }}>
                      <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: barColor, width: `${pct * 100}%` }} />
                      </View>
                      <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>${spent.toLocaleString()} / ${budget.toLocaleString()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ═══ TOOLS: Calculator ═══ */}
        <View style={{ paddingHorizontal: 20, marginTop: 16, marginBottom: 8 }}>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
            onPress={() => setShowCalculator(true)}
          >
            <Text style={{ fontSize: 24, marginRight: 12 }}>🧮</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Construction Calculator</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Area, Concrete, Framing, Payroll, Stairs</Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.primary }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={{ marginHorizontal: 20, marginTop: 8, marginBottom: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={logout}>
          <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
    <ConstructionCalculator visible={showCalculator} onClose={() => setShowCalculator(false)} />
    </ScreenContainer>
  );
}
