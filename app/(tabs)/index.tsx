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
  Modal,
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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";
import { VoiceGoalCreator } from "@/components/voice-goal-creator";
import { JobPicker } from "@/components/ui/job-picker";
import { ConstructionCalculator } from "@/components/construction-calculator";
import { CompassModal } from "@/components/compass-modal";
import { useBranding } from "@/lib/branding-context";

const defaultCompanyLogo = require("@/assets/images/company-logo.png");
import { BG_HOME as bgHome } from "@/constants/bg-urls";

const ROLE_COLORS: Record<string, string> = {
  owner: "#1E3A5F",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
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

  // Company branding from centralized BrandingContext (staleTime: 5s, refetchInterval: 30s)
  const { branding } = useBranding();
  const companyLogoSource = branding?.logoUrl
    ? { uri: branding.logoUrl }
    : defaultCompanyLogo;
  const [now, setNow] = useState(new Date());
  const [laborPeriod, setLaborPeriod] = useState<LaborPeriod>("week");
  const [showActiveJobs, setShowActiveJobs] = useState(false);
  const [showByEmployee, setShowByEmployee] = useState(true);
  const [showTodaySchedule, setShowTodaySchedule] = useState(false);
  const [showBudgetAlerts, setShowBudgetAlerts] = useState(true);
  const [showHourlyProfit, setShowHourlyProfit] = useState(false);
  const [showLaborCosts, setShowLaborCosts] = useState(false);
  const [showWeeklyTrend, setShowWeeklyTrend] = useState(false);
  const [showCostByJob, setShowCostByJob] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCompass, setShowCompass] = useState(false);

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

  const { data: activeJobs } = trpc.jobs.listActive.useQuery(undefined, { staleTime: 15000, refetchOnMount: "always" });
  useEffect(() => {
    if (activeJobs && activeJobs.length > 0) {
      setCache(CACHE_KEYS.ACTIVE_JOBS, activeJobs);
      setCachedActiveJobs(activeJobs);
    }
  }, [activeJobs]);

  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManagement, staleTime: 15000, refetchOnMount: "always" });
  useEffect(() => {
    if (allEmployees && allEmployees.length > 0) {
      setCache(CACHE_KEYS.ALL_EMPLOYEES, allEmployees);
      setCachedEmployees(allEmployees);
    }
  }, [allEmployees]);

  // Clocked-in with cache fallback
  const clockedInQ = trpc.clock.allClockedIn.useQuery(undefined, { enabled: isManagement, staleTime: 0, refetchInterval: 15000, refetchOnMount: "always", refetchOnWindowFocus: "always" });
  const { data: clockedIn } = useOfflineCache(CACHE_KEYS.CLOCKED_IN, clockedInQ.data, clockedInQ.isLoading);
  const refetchClockedIn = clockedInQ.refetch;

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

  // Jobsite correction state
  const [editingJobEntryId, setEditingJobEntryId] = useState<number | null>(null);
  const [editJobSaving, setEditJobSaving] = useState(false);

  const handleChangeJobsite = useCallback(async (entryId: number, newJobId: number) => {
    setEditJobSaving(true);
    try {
      await updateEntryMutation.mutateAsync({ entryId, jobId: newJobId });
      setEditingJobEntryId(null);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchClockedIn();
    } catch { Alert.alert("Error", "Failed to update jobsite."); }
    finally { setEditJobSaving(false); }
  }, [updateEntryMutation, refetchClockedIn]);

  // Lunch management state
  const [lunchEntryId, setLunchEntryId] = useState<number | null>(null);
  const [lunchMinutes, setLunchMinutes] = useState("30");
  const [lunchSaving, setLunchSaving] = useState(false);
  const adjustEntryMutation = trpc.clock.adjustEntry.useMutation();

  const handleAddLunch = useCallback(async (entryId: number, empName: string) => {
    const mins = parseInt(lunchMinutes, 10);
    if (isNaN(mins) || mins <= 0 || mins > 120) {
      Alert.alert("Invalid", "Enter lunch minutes between 1-120.");
      return;
    }
    if (!employee?.id) return;
    setLunchSaving(true);
    try {
      const entry = (clockedIn || []).find((e: any) => e.id === entryId);
      if (!entry) { Alert.alert("Error", "Entry not found."); return; }
      // Adjust clock-in forward by lunch minutes to deduct lunch
      const originalIn = new Date(entry.clockIn);
      const adjustedIn = new Date(originalIn.getTime() + mins * 60000);
      await adjustEntryMutation.mutateAsync({
        entryId,
        clockIn: adjustedIn.toISOString(),
        adjustedBy: employee.id,
        reason: `Lunch deduction: ${mins} min for ${empName}`,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLunchEntryId(null);
      refetchClockedIn();
      Alert.alert("Lunch Added", `${mins} min lunch deducted for ${empName}.`);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to add lunch.");
    } finally { setLunchSaving(false); }
  }, [lunchMinutes, employee?.id, clockedIn, adjustEntryMutation, refetchClockedIn]);

  // Crew clock-in modal state (for management/foreman home dashboard)
  const [showCrewClockIn, setShowCrewClockIn] = useState(false);
  const [crewClockEmpId, setCrewClockEmpId] = useState<number | null>(null);
  const [crewClockJobId, setCrewClockJobId] = useState<number | null>(null);
  const [crewClockLoading, setCrewClockLoading] = useState(false);
  const [useCustomCrewClockTime, setUseCustomCrewClockTime] = useState(false);
  const [customCrewClockTime, setCustomCrewClockTime] = useState("");
  const [customCrewClockAmpm, setCustomCrewClockAmpm] = useState("AM");
  const crewClockInMutation = trpc.clock.in.useMutation();

  const notClockedInEmployees = useMemo(() => {
    const clockedInIds = new Set((clockedIn || []).map((e: any) => e.employeeId));
    const allActive = (allEmployees || cachedEmployees || []).filter((e: any) => e.isActive && !clockedInIds.has(e.id));
    if (isForeman && employee) {
      return allActive.filter((e: any) => e.role === "laborer");
    }
    return allActive;
  }, [allEmployees, cachedEmployees, clockedIn, isForeman, employee]);

  const handleCrewClockIn = useCallback(async () => {
    if (!crewClockEmpId || !crewClockJobId) {
      Alert.alert("Select Both", "Please select an employee and a job.");
      return;
    }
    if (crewClockLoading) return;
    setCrewClockLoading(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      let clockInTime = new Date().toISOString();
      if (useCustomCrewClockTime && customCrewClockTime) {
        const parts = customCrewClockTime.split(":");
        if (parts.length === 2) {
          let hours = parseInt(parts[0], 10);
          const mins = parseInt(parts[1], 10);
          if (!isNaN(hours) && !isNaN(mins)) {
            if (customCrewClockAmpm === "PM" && hours < 12) hours += 12;
            if (customCrewClockAmpm === "AM" && hours === 12) hours = 0;
            const customDate = new Date();
            customDate.setHours(hours, mins, 0, 0);
            clockInTime = customDate.toISOString();
          }
        }
      }
      await crewClockInMutation.mutateAsync({
        employeeId: crewClockEmpId,
        jobId: crewClockJobId,
        clockIn: clockInTime,
        isOfflineEntry: false,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        utils.clock.allClockedIn.invalidate(),
        utils.clock.activeEntry.invalidate(),
        utils.clock.history.invalidate(),
      ]);
      refetchClockedIn();
      setShowCrewClockIn(false);
      setCrewClockEmpId(null);
      setCrewClockJobId(null);
      setUseCustomCrewClockTime(false);
      setCustomCrewClockTime("");
      Alert.alert("Clocked In", "Employee has been clocked in successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not clock in. Please try again.");
    } finally {
      setCrewClockLoading(false);
    }
  }, [crewClockEmpId, crewClockJobId, crewClockLoading, crewClockInMutation, utils, refetchClockedIn, useCustomCrewClockTime, customCrewClockTime, customCrewClockAmpm]);

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
  const budgetAlertsQ = trpc.budgetAlerts.getAlerts.useQuery(undefined, { enabled: isOwner || isSecretary, staleTime: 60000 });
  const { data: budgetAlerts } = useOfflineCache(CACHE_KEYS.BUDGET_ALERTS, budgetAlertsQ.data, budgetAlertsQ.isLoading);
  const activeAlerts = useMemo(() => (budgetAlerts || []).filter(a => a.alertLevel !== "ok"), [budgetAlerts]);

  // Labor cost data with cache fallback
  const byJobQ = trpc.laborDashboard.byJob.useQuery({ startDate, endDate }, { enabled: isManagement, staleTime: 15000, refetchOnMount: "always" });
  const weeklyTrendQ = trpc.laborDashboard.weeklyTrend.useQuery({ weeks: 8 }, { enabled: isManagement, staleTime: 60000 });
  const byEmployeeQ = trpc.laborDashboard.byEmployee.useQuery({ startDate, endDate }, { enabled: isManagement, staleTime: 15000, refetchOnMount: "always" });
  const { data: byJob } = useOfflineCache(`${CACHE_KEYS.LABOR_BY_JOB}_home_${startDate}`, byJobQ.data, byJobQ.isLoading);
  const { data: weeklyTrend } = useOfflineCache(CACHE_KEYS.CHART_LABOR_TRENDS, weeklyTrendQ.data, weeklyTrendQ.isLoading);
  const { data: byEmployee } = useOfflineCache(`${CACHE_KEYS.LABOR_BY_EMPLOYEE}_home_${startDate}`, byEmployeeQ.data, byEmployeeQ.isLoading);

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

  // Today's schedule tasks
  const { data: allSchedule } = trpc.schedule.getAll.useQuery(undefined, { enabled: isManagement, staleTime: 15000, refetchOnMount: "always" });
  const todayTasks = useMemo(() => {
    if (!allSchedule) return [];
    const today = new Date();
    return (allSchedule as any[]).filter((item: any) => {
      const d = new Date(item.scheduledDate);
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [allSchedule]);

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
      case "owner": return "#1E3A5F";
      case "office_manager": return "#8B5CF6";
      case "logistics": return "#0EA5E9";
      case "foreman": return "#F59E0B";
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
        <ImageBackground source={bgHome} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.12 }}>
        <OfflineBanner />
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
          {/* Company Logo */}
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <Image source={companyLogoSource} style={{ width: 80, height: 80, resizeMode: "contain" }} />
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
          <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
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
              <MaterialIcons name="flag" size={22} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>My Goals</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/reports" as any)}>
              <MaterialIcons name="description" size={22} color={colors.foreground} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Daily Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/hours" as any)}>
              <MaterialIcons name="schedule" size={22} color={colors.foreground} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>My Hours</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
            <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.success + "18", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.success + "40" }} onPress={() => setShowCrewClockIn(true)}>
              <MaterialIcons name="access-time" size={22} color={colors.success} style={{ marginRight: 12 }} />
              <View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Crew Clock-In</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>Manual clock in/out</Text>
              </View>
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
                <MaterialIcons name="calculate" size={22} color={colors.primary} style={{ marginRight: 12 }} />
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Calculator</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Construction & Payroll</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
                onPress={() => setShowCompass(true)}
              >
                <MaterialIcons name="explore" size={22} color={colors.primary} style={{ marginRight: 12 }} />
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
      <CompassModal visible={showCompass} onClose={() => setShowCompass(false)} />
      {/* Crew Clock-In Modal */}
      <Modal visible={showCrewClockIn} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "80%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Crew Clock-In</Text>
              <TouchableOpacity onPress={() => { setShowCrewClockIn(false); setCrewClockEmpId(null); setCrewClockJobId(null); setUseCustomCrewClockTime(false); }}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>SELECT EMPLOYEE</Text>
            <ScrollView style={{ maxHeight: 180, marginBottom: 16 }} nestedScrollEnabled>
              {notClockedInEmployees.map((emp: any) => (
                <TouchableOpacity key={emp.id} onPress={() => setCrewClockEmpId(emp.id)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 4, backgroundColor: crewClockEmpId === emp.id ? colors.success + "20" : colors.surface, borderWidth: crewClockEmpId === emp.id ? 1 : 0, borderColor: colors.success }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: crewClockEmpId === emp.id ? colors.success : colors.muted + "30", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Text style={{ color: crewClockEmpId === emp.id ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 14 }}>{(emp.name || "").substring(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{emp.role}</Text>
                  </View>
                  {crewClockEmpId === emp.id && <MaterialIcons name="check-circle" size={20} color={colors.success} />}
                </TouchableOpacity>
              ))}
              {notClockedInEmployees.length === 0 && <Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>All employees are clocked in</Text>}
            </ScrollView>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>SELECT JOBSITE</Text>
            <ScrollView style={{ maxHeight: 140, marginBottom: 16 }} nestedScrollEnabled>
              {effectiveActiveJobs.map((job: any) => (
                <TouchableOpacity key={job.id} onPress={() => setCrewClockJobId(job.id)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 4, backgroundColor: crewClockJobId === job.id ? colors.primary + "20" : colors.surface, borderWidth: crewClockJobId === job.id ? 1 : 0, borderColor: colors.primary }}>
                  <MaterialIcons name="location-on" size={18} color={crewClockJobId === job.id ? colors.primary : colors.muted} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, flex: 1 }}>{job.name}</Text>
                  {crewClockJobId === job.id && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setUseCustomCrewClockTime(!useCustomCrewClockTime)} style={{ flexDirection: "row", alignItems: "center", marginBottom: useCustomCrewClockTime ? 8 : 16 }}>
              <MaterialIcons name={useCustomCrewClockTime ? "check-box" : "check-box-outline-blank"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 14, color: colors.foreground }}>Custom clock-in time</Text>
            </TouchableOpacity>
            {useCustomCrewClockTime && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <TextInput value={customCrewClockTime} onChangeText={setCustomCrewClockTime} placeholder="7:00" placeholderTextColor={colors.muted} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, color: colors.foreground, fontSize: 16, borderWidth: 1, borderColor: colors.border }} keyboardType="numbers-and-punctuation" />
                <TouchableOpacity onPress={() => setCustomCrewClockAmpm(customCrewClockAmpm === "AM" ? "PM" : "AM")} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{customCrewClockAmpm}</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={handleCrewClockIn} disabled={!crewClockEmpId || !crewClockJobId || crewClockLoading} style={{ backgroundColor: colors.success, borderRadius: 14, padding: 16, alignItems: "center", opacity: (!crewClockEmpId || !crewClockJobId || crewClockLoading) ? 0.5 : 1 }}>
              {crewClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In Employee</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // FOREMAN HOME — Personal + crew overview
  // ═══════════════════════════════════════════════════════════
  if (isForeman) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <ImageBackground source={bgHome} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.12 }}>
        <OfflineBanner />
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
          {/* Company Logo */}
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <Image source={companyLogoSource} style={{ width: 80, height: 80, resizeMode: "contain" }} />
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
          <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: 14, padding: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
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
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.success + "15", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.success + "40", alignItems: "center" }} onPress={() => setShowCrewClockIn(true)}>
              <MaterialIcons name="access-time" size={24} color={colors.success} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success, textAlign: "center" }}>Crew Clock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/reports" as any)}>
              <MaterialIcons name="description" size={22} color={colors.foreground} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Field Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => router.push("/safety" as any)}>
              <MaterialIcons name="verified-user" size={22} color={colors.foreground} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" }}>Safety</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" }} onPress={() => setShowVoiceGoals(true)}>
              <MaterialIcons name="flag" size={22} color={colors.foreground} style={{ marginBottom: 6 }} />
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
                <MaterialIcons name="calculate" size={22} color={colors.primary} style={{ marginRight: 12 }} />
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Calculator</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Construction & Payroll</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
                onPress={() => setShowCompass(true)}
              >
                <MaterialIcons name="explore" size={22} color={colors.primary} style={{ marginRight: 12 }} />
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
      <CompassModal visible={showCompass} onClose={() => setShowCompass(false)} />
      {/* Crew Clock-In Modal */}
      <Modal visible={showCrewClockIn} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "80%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Crew Clock-In</Text>
              <TouchableOpacity onPress={() => { setShowCrewClockIn(false); setCrewClockEmpId(null); setCrewClockJobId(null); setUseCustomCrewClockTime(false); }}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>SELECT EMPLOYEE</Text>
            <ScrollView style={{ maxHeight: 180, marginBottom: 16 }} nestedScrollEnabled>
              {notClockedInEmployees.map((emp: any) => (
                <TouchableOpacity key={emp.id} onPress={() => setCrewClockEmpId(emp.id)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 4, backgroundColor: crewClockEmpId === emp.id ? colors.success + "20" : colors.surface, borderWidth: crewClockEmpId === emp.id ? 1 : 0, borderColor: colors.success }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: crewClockEmpId === emp.id ? colors.success : colors.muted + "30", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Text style={{ color: crewClockEmpId === emp.id ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 14 }}>{(emp.name || "").substring(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{emp.role}</Text>
                  </View>
                  {crewClockEmpId === emp.id && <MaterialIcons name="check-circle" size={20} color={colors.success} />}
                </TouchableOpacity>
              ))}
              {notClockedInEmployees.length === 0 && <Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>All employees are clocked in</Text>}
            </ScrollView>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>SELECT JOBSITE</Text>
            <ScrollView style={{ maxHeight: 140, marginBottom: 16 }} nestedScrollEnabled>
              {effectiveActiveJobs.map((job: any) => (
                <TouchableOpacity key={job.id} onPress={() => setCrewClockJobId(job.id)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 4, backgroundColor: crewClockJobId === job.id ? colors.primary + "20" : colors.surface, borderWidth: crewClockJobId === job.id ? 1 : 0, borderColor: colors.primary }}>
                  <MaterialIcons name="location-on" size={18} color={crewClockJobId === job.id ? colors.primary : colors.muted} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, flex: 1 }}>{job.name}</Text>
                  {crewClockJobId === job.id && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setUseCustomCrewClockTime(!useCustomCrewClockTime)} style={{ flexDirection: "row", alignItems: "center", marginBottom: useCustomCrewClockTime ? 8 : 16 }}>
              <MaterialIcons name={useCustomCrewClockTime ? "check-box" : "check-box-outline-blank"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 14, color: colors.foreground }}>Custom clock-in time</Text>
            </TouchableOpacity>
            {useCustomCrewClockTime && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <TextInput value={customCrewClockTime} onChangeText={setCustomCrewClockTime} placeholder="7:00" placeholderTextColor={colors.muted} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, color: colors.foreground, fontSize: 16, borderWidth: 1, borderColor: colors.border }} keyboardType="numbers-and-punctuation" />
                <TouchableOpacity onPress={() => setCustomCrewClockAmpm(customCrewClockAmpm === "AM" ? "PM" : "AM")} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{customCrewClockAmpm}</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={handleCrewClockIn} disabled={!crewClockEmpId || !crewClockJobId || crewClockLoading} style={{ backgroundColor: colors.success, borderRadius: 14, padding: 16, alignItems: "center", opacity: (!crewClockEmpId || !crewClockJobId || crewClockLoading) ? 0.5 : 1 }}>
              {crewClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In Employee</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MANAGEMENT HOME — Full dashboard (Owner, Office Manager, Logistics)
  // ═══════════════════════════════════════════════════════════
  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ImageBackground source={bgHome} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.12 }}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* Company Logo */}
        <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 2 }}>
          <Image source={companyLogoSource} style={{ width: 100, height: 100, resizeMode: "contain" }} />
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
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{(activeJobs || cachedActiveJobs || []).length}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Active Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}
            onPress={() => router.push("/team" as any)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.success }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{(clockedIn || []).length}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>On Site Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}
            onPress={() => router.push("/manage" as any)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{(allEmployees || cachedEmployees || []).filter((e: any) => e.isActive).length}</Text>
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
              const isEditingJob = editingJobEntryId === entry.id;
              const isEditingLunch = lunchEntryId === entry.id;
              const timeStr = formatTime12(entry.clockIn);
              const isClockingOut = clockingOutId === entry.id;
              return (
                <View key={entry.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20 }}>
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
                          <Text style={{ color: colors.muted, fontSize: 14 }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>{durDisplay}</Text>
                        {isManagement && (
                          <>
                            <TouchableOpacity onPress={() => startEditTime(entry.id, entry.clockIn)} style={{ padding: 4 }}>
                              <MaterialIcons name="edit" size={16} color={colors.primary} />
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
                  {/* Inline action row: Jobsite + Lunch */}
                  {isManagement && !isEditing && (
                    <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingBottom: 8, gap: 8, marginLeft: 50 }}>
                      <TouchableOpacity
                        onPress={() => setEditingJobEntryId(isEditingJob ? null : entry.id)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isEditingJob ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: isEditingJob ? colors.primary : colors.border }}
                      >
                        <MaterialIcons name="location-on" size={12} color={isEditingJob ? colors.primary : colors.muted} />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: isEditingJob ? colors.primary : colors.muted }}>Job</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setLunchEntryId(isEditingLunch ? null : entry.id); setLunchMinutes("30"); }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isEditingLunch ? colors.warning + "15" : colors.surface, borderWidth: 1, borderColor: isEditingLunch ? colors.warning : colors.border }}
                      >
                        <MaterialIcons name="restaurant" size={12} color={isEditingLunch ? colors.warning : colors.muted} />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: isEditingLunch ? colors.warning : colors.muted }}>Lunch</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {/* Jobsite picker dropdown */}
                  {isEditingJob && isManagement && (
                    <View style={{ paddingHorizontal: 20, paddingBottom: 10, marginLeft: 50 }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>Change Jobsite:</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {(effectiveActiveJobs || []).map((job: any) => {
                          const isCurrent = job.id === entry.jobId;
                          return (
                            <TouchableOpacity
                              key={job.id}
                              onPress={() => !isCurrent && handleChangeJobsite(entry.id, job.id)}
                              disabled={isCurrent || editJobSaving}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: isCurrent ? colors.success + "20" : colors.surface, borderWidth: 1, borderColor: isCurrent ? colors.success : colors.border, opacity: editJobSaving ? 0.5 : 1 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: "600", color: isCurrent ? colors.success : colors.foreground }}>{isCurrent ? "✓ " : ""}{job.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {/* Lunch management inline */}
                  {isEditingLunch && isManagement && (
                    <View style={{ paddingHorizontal: 20, paddingBottom: 10, marginLeft: 50 }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>Add Lunch Deduction:</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {[15, 30, 45, 60].map((mins) => (
                          <TouchableOpacity
                            key={mins}
                            onPress={() => setLunchMinutes(String(mins))}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: lunchMinutes === String(mins) ? colors.warning + "20" : colors.surface, borderWidth: 1, borderColor: lunchMinutes === String(mins) ? colors.warning : colors.border }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: lunchMinutes === String(mins) ? colors.warning : colors.foreground }}>{mins}m</Text>
                          </TouchableOpacity>
                        ))}
                        <TextInput
                          value={lunchMinutes}
                          onChangeText={setLunchMinutes}
                          style={{ width: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, color: colors.foreground, textAlign: "center", backgroundColor: colors.surface }}
                          keyboardType="numeric"
                          maxLength={3}
                          placeholder="min"
                          placeholderTextColor={colors.muted}
                        />
                        <TouchableOpacity
                          onPress={() => handleAddLunch(entry.id, empName)}
                          disabled={lunchSaving}
                          style={{ backgroundColor: colors.warning, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, opacity: lunchSaving ? 0.5 : 1 }}
                        >
                          {lunchSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Apply</Text>}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (!employee?.id) return;
                          Alert.alert("Delete Lunch", `Remove lunch deduction for ${empName}? This will restore the original clock-in time.`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => {
                              // To delete lunch, we'd need to restore original time. For now show info.
                              Alert.alert("Tip", "To remove a lunch deduction, use the Edit button to adjust the clock-in time back to the original.");
                            }},
                          ]);
                        }}
                        style={{ marginTop: 6 }}
                      >
                        <Text style={{ fontSize: 11, color: colors.error, fontWeight: "600" }}>Delete Existing Lunch</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 12 }} />
          </>
        )}

        {/* ═══ TODAY'S SCHEDULE — COLLAPSIBLE ═══ */}
        {isManagement && todayTasks.length > 0 && (
          <>
            <CollapsibleHeader
              title={`Today's Schedule (${todayTasks.length})`}
              expanded={showTodaySchedule}
              onToggle={() => setShowTodaySchedule(!showTodaySchedule)}
              rightAction={{ label: "View All", onPress: () => router.push("/manage" as any) }}
              colors={colors}
            />
            {showTodaySchedule && todayTasks.slice(0, 5).map((task: any) => {
              const jobName = (activeJobs || []).find((j: any) => j.id === task.jobId)?.name || "Unknown Job";
              const statusColors: Record<string, { bg: string; text: string; label: string }> = {
                pending: { bg: "#F59E0B22", text: "#F59E0B", label: "Pending" },
                in_progress: { bg: "#3B82F622", text: "#3B82F6", label: "In Progress" },
                completed: { bg: "#22C55E22", text: "#22C55E", label: "Done" },
                skipped: { bg: "#EF444422", text: "#EF4444", label: "Skipped" },
              };
              const sc = statusColors[task.status] || statusColors.pending;
              return (
                <View key={task.id} style={{ marginHorizontal: 20, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{jobName}</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{task.title}</Text>
                  </View>
                  <View style={{ backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: sc.text }}>{sc.label}</Text>
                  </View>
                </View>
              );
            })}
            {showTodaySchedule && todayTasks.length > 5 && (
              <TouchableOpacity onPress={() => router.push("/manage" as any)} style={{ alignItems: "center", paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>+{todayTasks.length - 5} more tasks</Text>
              </TouchableOpacity>
            )}
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
                  <View style={{ height: 4, backgroundColor: ac.border + "33", borderRadius: 2, marginTop: 8, marginLeft: 16, marginRight: 4 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: ac.dot, width: `${Math.min(alert.percentUsed, 100)}%` }} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ═══ HOURLY JOB PROFIT (owner + office_manager) — COLLAPSIBLE ═══ */}
        {(isOwner || isSecretary) && hourlyJobProfits.length > 0 && (
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

        {/* ═══ LABOR COST DASHBOARD — COLLAPSIBLE ═══ */}
        <>
          <CollapsibleHeader
            title={canSeeDollars ? "Labor Costs" : "Labor Overview"}
            expanded={showLaborCosts}
            onToggle={() => setShowLaborCosts(!showLaborCosts)}
            colors={colors}
          />

          {showLaborCosts && <>
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
          <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 16, gap: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
              onPress={() => router.push("/jobs" as any)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 2, color: colors.primary }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {canSeeDollars ? formatCurrency(totalCost) : formatHours(totalMinutes)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "500" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {canSeeDollars ? `Total Spend (${periodLabel})` : `Total Hours (${periodLabel})`}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 2, color: colors.foreground }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {(byJob || []).filter(j => j.totalMinutes > 0).length}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "500" }}>Jobs w/ Labor</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 2, color: colors.foreground }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
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
        </>}
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

        {/* ═══ CREW CLOCK-IN QUICK ACTION ═══ */}
        <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginTop: 16, marginBottom: 12 }}>
          <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.success + "18", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.success + "40" }} onPress={() => setShowCrewClockIn(true)}>
            <MaterialIcons name="access-time" size={22} color={colors.success} style={{ marginRight: 12 }} />
            <View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Crew Clock-In</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Manual clock in/out</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ═══ TOOLS: Calculator ═══ */}
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}
            onPress={() => setShowCalculator(true)}
          >
            <MaterialIcons name="calculate" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Construction Calculator</Text>
              <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Area, Concrete, Framing, Payroll, Stairs</Text>
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
    <CompassModal visible={showCompass} onClose={() => setShowCompass(false)} />
    {/* Crew Clock-In Modal */}
    <Modal visible={showCrewClockIn} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "80%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Crew Clock-In</Text>
            <TouchableOpacity onPress={() => { setShowCrewClockIn(false); setCrewClockEmpId(null); setCrewClockJobId(null); setUseCustomCrewClockTime(false); }}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>SELECT EMPLOYEE</Text>
          <ScrollView style={{ maxHeight: 180, marginBottom: 16 }} nestedScrollEnabled>
            {notClockedInEmployees.map((emp: any) => (
              <TouchableOpacity key={emp.id} onPress={() => setCrewClockEmpId(emp.id)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 4, backgroundColor: crewClockEmpId === emp.id ? colors.success + "20" : colors.surface, borderWidth: crewClockEmpId === emp.id ? 1 : 0, borderColor: colors.success }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: crewClockEmpId === emp.id ? colors.success : colors.muted + "30", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Text style={{ color: crewClockEmpId === emp.id ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 14 }}>{(emp.name || "").substring(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{emp.role}</Text>
                </View>
                {crewClockEmpId === emp.id && <MaterialIcons name="check-circle" size={20} color={colors.success} />}
              </TouchableOpacity>
            ))}
            {notClockedInEmployees.length === 0 && <Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>All employees are clocked in</Text>}
          </ScrollView>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>SELECT JOBSITE</Text>
          <ScrollView style={{ maxHeight: 140, marginBottom: 16 }} nestedScrollEnabled>
            {effectiveActiveJobs.map((job: any) => (
              <TouchableOpacity key={job.id} onPress={() => setCrewClockJobId(job.id)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 4, backgroundColor: crewClockJobId === job.id ? colors.primary + "20" : colors.surface, borderWidth: crewClockJobId === job.id ? 1 : 0, borderColor: colors.primary }}>
                <MaterialIcons name="location-on" size={18} color={crewClockJobId === job.id ? colors.primary : colors.muted} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, flex: 1 }}>{job.name}</Text>
                {crewClockJobId === job.id && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => setUseCustomCrewClockTime(!useCustomCrewClockTime)} style={{ flexDirection: "row", alignItems: "center", marginBottom: useCustomCrewClockTime ? 8 : 16 }}>
            <MaterialIcons name={useCustomCrewClockTime ? "check-box" : "check-box-outline-blank"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 14, color: colors.foreground }}>Custom clock-in time</Text>
          </TouchableOpacity>
          {useCustomCrewClockTime && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <TextInput value={customCrewClockTime} onChangeText={setCustomCrewClockTime} placeholder="7:00" placeholderTextColor={colors.muted} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, color: colors.foreground, fontSize: 16, borderWidth: 1, borderColor: colors.border }} keyboardType="numbers-and-punctuation" />
              <TouchableOpacity onPress={() => setCustomCrewClockAmpm(customCrewClockAmpm === "AM" ? "PM" : "AM")} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{customCrewClockAmpm}</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={handleCrewClockIn} disabled={!crewClockEmpId || !crewClockJobId || crewClockLoading} style={{ backgroundColor: colors.success, borderRadius: 14, padding: 16, alignItems: "center", opacity: (!crewClockEmpId || !crewClockJobId || crewClockLoading) ? 0.5 : 1 }}>
            {crewClockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In Employee</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </ScreenContainer>
  );
}
