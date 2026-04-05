import { ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { JobCard } from "@/components/ui/job-card";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { formatTime12, formatTimeForEdit, parse12HrTime } from "@/lib/utils";
import { router } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View } from "react-native";
import * as Haptics from "expo-haptics";
import { VoiceGoalCreator } from "@/components/voice-goal-creator";

const companyLogo = require("@/assets/images/company-logo.png");
import { BG_HOME as bgHome } from "@/constants/bg-urls";

const ROLE_COLORS: Record<string, string> = {
  owner: "#C8A951",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#D4A843",
  laborer: "#22C55E" };

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer" };

type LaborPeriod = "week" | "month" | "30days";

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(ms: number) {
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

// Daily motivational messages by role — rotate based on day of year
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

  const { startDate, endDate, label: periodLabel } = useMemo(() => getDateRange(laborPeriod), [laborPeriod]);

  const { data: activeJobs } = trpc.jobs.listActive.useQuery(undefined, { enabled: isManagement, staleTime: 30000 });
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManagement, staleTime: 30000 });
  const { data: clockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { enabled: isManagement, staleTime: 15000 });

  // Voice goal creator state
  const [showVoiceGoals, setShowVoiceGoals] = useState(false);

  // Edit time state for Onsite Now
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

  const { data: activeEntry } = trpc.clock.activeEntry.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee, staleTime: 10000 }
  );
  const { data: myJobs } = trpc.jobs.forEmployee.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee && !isManagement }
  );

  // Budget alerts (owner/management only)
  const { data: budgetAlerts } = trpc.budgetAlerts.getAlerts.useQuery(undefined, { enabled: isOwner, staleTime: 60000 });
  const activeAlerts = useMemo(() => (budgetAlerts || []).filter(a => a.alertLevel !== "ok"), [budgetAlerts]);

  // Labor cost data (management only on Home)
  const { data: byJob } = trpc.laborDashboard.byJob.useQuery(
    { startDate, endDate },
    { enabled: isManagement, staleTime: 30000 }
  );
  const { data: weeklyTrend } = trpc.laborDashboard.weeklyTrend.useQuery(
    { weeks: 8 },
    { enabled: isManagement, staleTime: 60000 }
  );
  const { data: byEmployee } = trpc.laborDashboard.byEmployee.useQuery(
    { startDate, endDate },
    { enabled: isManagement, staleTime: 30000 }
  );

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
  const activeJobForEntry = (activeJobs || myJobs || []).find((j) => j.id === activeEntry?.jobId);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    greeting: { fontSize: 22, fontWeight: "800", color: colors.foreground },
    roleTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start", marginTop: 4 },
    roleTagText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    kpiRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 16 },
    kpiCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    kpiValue: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    kpiLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10 },
    sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },
    seeAll: { fontSize: 14, color: colors.primary, fontWeight: "600" },
    clockCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border },
    clockStatusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    empRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 12 },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    logoutBtn: { marginHorizontal: 20, marginTop: 8, marginBottom: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    alertBanner: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1.5 },
    alertRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    alertDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    alertJobName: { flex: 1, fontSize: 13, fontWeight: "700" },
    alertPct: { fontSize: 13, fontWeight: "800" },
    alertDetail: { fontSize: 11, marginTop: 2, marginLeft: 16 },
    periodRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 },
    periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
    periodText: { fontSize: 12, fontWeight: "600" },
    summaryRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 16, gap: 8 },
    summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
    summaryValue: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
    summaryLabel: { fontSize: 10, color: colors.muted, fontWeight: "500" },
    barRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    barLabel: { width: 90, fontSize: 11, color: colors.foreground, fontWeight: "600" },
    barTrack: { flex: 1, height: 20, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden", marginHorizontal: 6 },
    barFill: { height: "100%", borderRadius: 5 },
    barValue: { fontSize: 11, fontWeight: "700", minWidth: 55, textAlign: "right" },
    weeklyChart: { flexDirection: "row", alignItems: "flex-end", height: 100, paddingHorizontal: 20, marginBottom: 6, gap: 3 },
    weekBar: { flex: 1, borderRadius: 3, minWidth: 16 },
    weekLabelsRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 16, gap: 3 },
    laborEmpRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    laborEmpAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
    // Laborer/Foreman styles
    fieldHero: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 20 },
    fieldAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    fieldAvatarText: { color: "#fff", fontWeight: "800", fontSize: 28 },
    fieldName: { fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 2 },
    fieldRole: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
    fieldQuote: { fontSize: 13, color: colors.muted, textAlign: "center", fontStyle: "italic", marginTop: 4, paddingHorizontal: 20 },
    fieldClockCard: { marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    fieldTimeText: { fontSize: 48, fontWeight: "800", color: colors.foreground, letterSpacing: -1 },
    fieldJobText: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 },
    fieldClockBtn: { borderRadius: 14, padding: 16, alignItems: "center", width: "100%" },
    quickAction: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    quickActionIcon: { fontSize: 24, marginBottom: 6 },
    quickActionLabel: { fontSize: 11, fontWeight: "600", color: colors.foreground, textAlign: "center" },
    weekHoursCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border } });

  if (!employee) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </ScreenContainer>
    );
  }

  const roleColor = ROLE_COLORS[role] || colors.primary;

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
          <View style={styles.fieldHero}>
            <View style={[styles.fieldAvatar, { backgroundColor: roleColor }]}>
              <Text style={styles.fieldAvatarText}>{getInitials(employee.name)}</Text>
            </View>
            <Text style={styles.fieldName}>{employee.name}</Text>
            <Text style={[styles.fieldRole, { color: roleColor }]}>{ROLE_LABELS[role]}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            <Text style={styles.fieldQuote}>{getDailyQuote(role)}</Text>
          </View>

          {/* Clock Status Card */}
          <View style={styles.fieldClockCard}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={[styles.clockStatusDot, { backgroundColor: activeEntry ? colors.success : colors.muted }]} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: activeEntry ? colors.success : colors.muted }}>
                {activeEntry ? "Clocked In" : "Not Clocked In"}
              </Text>
            </View>
            {activeEntry ? (
              <>
                <Text style={styles.fieldTimeText}>{formatDuration(elapsed)}</Text>
                <Text style={styles.fieldJobText}>
                  {activeJobForEntry?.name || "Unknown Job"} · Since {formatTime12(activeEntry.clockIn)}
                </Text>
                <TouchableOpacity
                  style={[styles.fieldClockBtn, { backgroundColor: colors.error }]}
                  onPress={() => router.push("/clock" as any)}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock Out</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.fieldTimeText, { color: colors.muted + "60" }]}>0h 0m</Text>
                <Text style={[styles.fieldJobText, { marginBottom: 16 }]}>Ready to start your day</Text>
                <TouchableOpacity
                  style={[styles.fieldClockBtn, { backgroundColor: colors.success }]}
                  onPress={() => router.push("/clock" as any)}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
            <TouchableOpacity style={styles.quickAction} onPress={() => setShowVoiceGoals(true)}>
              <Text style={styles.quickActionIcon}>🎯</Text>
              <Text style={styles.quickActionLabel}>My Goals</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push("/reports" as any)}>
              <Text style={styles.quickActionIcon}>📋</Text>
              <Text style={styles.quickActionLabel}>Daily Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push("/hours" as any)}>
              <Text style={styles.quickActionIcon}>⏰</Text>
              <Text style={styles.quickActionLabel}>My Hours</Text>
            </TouchableOpacity>
          </View>

          {/* My Jobsites */}
          {myJobs && myJobs.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>My Jobsites</Text>
              </View>
              <View style={{ paddingHorizontal: 20 }}>
                {myJobs.map((job) => (
                  <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} hideBudget />
                ))}
              </View>
            </>
          )}

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
      <VoiceGoalCreator visible={showVoiceGoals} onClose={() => setShowVoiceGoals(false)} />
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // FOREMAN HOME — Personal + crew overview, no dollar amounts
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
          <View style={styles.fieldHero}>
            <View style={[styles.fieldAvatar, { backgroundColor: roleColor }]}>
              <Text style={styles.fieldAvatarText}>{getInitials(employee.name)}</Text>
            </View>
            <Text style={styles.fieldName}>{employee.name}</Text>
            <Text style={[styles.fieldRole, { color: roleColor }]}>{ROLE_LABELS[role]}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </Text>
          </View>

          {/* Clock Status Card */}
          <View style={styles.fieldClockCard}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={[styles.clockStatusDot, { backgroundColor: activeEntry ? colors.success : colors.muted }]} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: activeEntry ? colors.success : colors.muted }}>
                {activeEntry ? "Clocked In" : "Not Clocked In"}
              </Text>
            </View>
            {activeEntry ? (
              <>
                <Text style={styles.fieldTimeText}>{formatDuration(elapsed)}</Text>
                <Text style={styles.fieldJobText}>
                  {activeJobForEntry?.name || "Unknown Job"} · Since {formatTime12(activeEntry.clockIn)}
                </Text>
                <TouchableOpacity
                  style={[styles.fieldClockBtn, { backgroundColor: colors.error }]}
                  onPress={() => router.push("/clock" as any)}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock Out</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.fieldTimeText, { color: colors.muted + "60" }]}>0h 0m</Text>
                <Text style={[styles.fieldJobText, { marginBottom: 16 }]}>Ready to start your day</Text>
                <TouchableOpacity
                  style={[styles.fieldClockBtn, { backgroundColor: colors.success }]}
                  onPress={() => router.push("/clock" as any)}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Quick Actions for Foreman */}
          <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push("/reports" as any)}>
              <Text style={styles.quickActionIcon}>📋</Text>
              <Text style={styles.quickActionLabel}>Field Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push("/safety" as any)}>
              <Text style={styles.quickActionIcon}>🛡️</Text>
              <Text style={styles.quickActionLabel}>Safety</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => setShowVoiceGoals(true)}>
              <Text style={styles.quickActionIcon}>🎯</Text>
              <Text style={styles.quickActionLabel}>Goals</Text>
            </TouchableOpacity>
          </View>

          {/* My Jobsites */}
          {myJobs && myJobs.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>My Jobsites</Text>
              </View>
              <View style={{ paddingHorizontal: 20 }}>
                {myJobs.map((job) => (
                  <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} hideBudget />
                ))}
              </View>
            </>
          )}

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
          </TouchableOpacity>
         </ScrollView>
      </ImageBackground>
      <VoiceGoalCreator visible={showVoiceGoals} onClose={() => setShowVoiceGoals(false)} />
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
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={styles.greeting}>
                {now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening"}, {employee.name.split(" ")[0]}
              </Text>
              <View style={[styles.roleTag, { backgroundColor: roleColor }]}>
                <Text style={styles.roleTagText}>{ROLE_LABELS[role]}</Text>
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

        {/* Management KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{(activeJobs || []).length}</Text>
            <Text style={styles.kpiLabel}>Active Jobs</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: colors.success }]}>{(clockedIn || []).length}</Text>
            <Text style={styles.kpiLabel}>On Site Now</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{(allEmployees || []).filter((e) => e.isActive).length}</Text>
            <Text style={styles.kpiLabel}>Employees</Text>
          </View>
        </View>

        {/* Who's On Site */}
        {(clockedIn || []).length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>On Site Now ({(clockedIn || []).length})</Text>
              <TouchableOpacity onPress={() => router.push("/team" as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {(clockedIn || []).slice(0, 5).map((entry: any) => {
              const emp = (allEmployees || []).find((e: any) => e.id === entry.employeeId);
              const job = (activeJobs || []).find((j: any) => j.id === entry.jobId);
              const dur = now.getTime() - new Date(entry.clockIn).getTime();
              if (!emp) return null;
              const isEditing = editingEntryId === entry.id;
              const clockInTime = new Date(entry.clockIn);
              const timeStr = formatTime12(entry.clockIn);
              return (
                <View key={entry.id} style={styles.empRow}>
                  <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[emp.role] || colors.primary }]}>
                    <Text style={styles.avatarText}>{getInitials(emp.name)}</Text>
                  </View>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/timecard/${emp.id}` as any)} activeOpacity={0.6}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{emp.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{job?.name || "Unknown Job"} • In: {timeStr}</Text>
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
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>{formatDuration(dur)}</Text>
                      {isManagement && (
                        <TouchableOpacity onPress={() => startEditTime(entry.id, entry.clockIn)} style={{ padding: 4 }}>
                          <Text style={{ fontSize: 14 }}>✏️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 12 }} />
          </>
        )}

        {/* ═══ BUDGET ALERTS (owner only) ═══ */}
        {isOwner && activeAlerts.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 4 }]}>
              <Text style={styles.sectionTitle}>Budget Alerts</Text>
              <View style={{ backgroundColor: colors.error + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>{activeAlerts.length}</Text>
              </View>
            </View>
            {activeAlerts.map((alert) => {
              const alertColors = {
                warning: { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E", dot: "#F59E0B" },
                danger: { bg: "#FFF1F0", border: "#F97316", text: "#9A3412", dot: "#F97316" },
                critical: { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B", dot: "#EF4444" },
                ok: { bg: colors.surface, border: colors.border, text: colors.foreground, dot: colors.success } };
              const ac = alertColors[alert.alertLevel];
              return (
                <View key={alert.jobId} style={[styles.alertBanner, { backgroundColor: ac.bg, borderColor: ac.border }]}>
                  <View style={styles.alertRow as any}>
                    <View style={[styles.alertDot, { backgroundColor: ac.dot }]} />
                    <Text style={[styles.alertJobName, { color: ac.text }]} numberOfLines={1}>{alert.jobName}</Text>
                    <Text style={[styles.alertPct, { color: ac.dot }]}>{alert.percentUsed}%</Text>
                  </View>
                  <Text style={[styles.alertDetail, { color: ac.text }]}>
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

        {/* ═══ LABOR COST DASHBOARD (management only) ═══ */}
        <>
          <View style={[styles.sectionHeader, { marginTop: 4 }]}>
            <Text style={styles.sectionTitle}>{canSeeDollars ? "Labor Costs" : "Labor Overview"}</Text>
          </View>

          {/* Period Selector */}
          <View style={styles.periodRow}>
            {(["week", "month", "30days"] as LaborPeriod[]).map((p) => {
              const labels: Record<LaborPeriod, string> = { week: "This Week", month: "This Month", "30days": "Last 30 Days" };
              const active = laborPeriod === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.periodBtn,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary + "15" : colors.surface },
                  ]}
                  onPress={() => {
                    setLaborPeriod(p);
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.periodText, { color: active ? colors.primary : colors.muted }]}>
                    {labels[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {canSeeDollars ? formatCurrency(totalCost) : formatHours(totalMinutes)}
              </Text>
              <Text style={styles.summaryLabel}>
                {canSeeDollars ? `Total Spend (${periodLabel})` : `Total Hours (${periodLabel})`}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                {(byJob || []).filter(j => j.totalMinutes > 0).length}
              </Text>
              <Text style={styles.summaryLabel}>Jobs w/ Labor</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                {(byEmployee || []).length}
              </Text>
              <Text style={styles.summaryLabel}>Workers</Text>
            </View>
          </View>

          {/* Weekly Trend Chart */}
          {weeklyTrend && weeklyTrend.length > 0 && (
            <>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 8 }}>
                Weekly Trend
              </Text>
              <View style={styles.weeklyChart}>
                {weeklyTrend.map((w, i) => {
                  const value = canSeeDollars ? w.totalCost : w.totalMinutes;
                  const height = maxWeeklyCost > 0 ? Math.max((value / maxWeeklyCost) * 80, 2) : 2;
                  const isCurrentWeek = i === weeklyTrend.length - 1;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 8, fontWeight: "600", color: colors.muted, marginBottom: 3 }}>
                        {canSeeDollars ? formatCurrency(value) : formatHours(value)}
                      </Text>
                      <View
                        style={[
                          styles.weekBar,
                          { height, backgroundColor: isCurrentWeek ? colors.primary : colors.primary + "60" },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <View style={styles.weekLabelsRow}>
                {weeklyTrend.map((w, i) => (
                  <View key={i} style={{ flex: 1 }}>
                    <Text style={{ fontSize: 8, color: colors.muted, textAlign: "center" }}>
                      {w.weekLabel}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Per-Job Breakdown */}
          {byJob && byJob.length > 0 && (
            <>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 8 }}>
                {canSeeDollars ? "Cost" : "Hours"} by Job ({periodLabel})
              </Text>
              <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                {byJob.slice(0, 8).map((job) => {
                  const value = canSeeDollars ? job.totalCost : job.totalMinutes;
                  const pct = maxJobCost > 0 ? (value / maxJobCost) * 100 : 0;
                  const hasOverhead = canSeeDollars && (job.taxRate > 0 || job.workersCompRate > 0 || job.liabilityInsRate > 0);
                  return (
                    <View key={job.jobId} style={{ marginBottom: hasOverhead ? 12 : 0 }}>
                      <View style={styles.barRow}>
                        <Text style={styles.barLabel} numberOfLines={1}>{job.jobName}</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: colors.primary }]} />
                        </View>
                        <Text style={[styles.barValue, { color: colors.foreground }]}>
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
            </>
          )}

          {/* Per-Employee Breakdown */}
          {byEmployee && byEmployee.length > 0 && (
            <>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, paddingHorizontal: 20, marginBottom: 8 }}>
                By Employee ({periodLabel})
              </Text>
              <View style={{ marginBottom: 16 }}>
                {byEmployee.slice(0, 8).map((emp) => (
                  <TouchableOpacity key={emp.employeeId} style={styles.laborEmpRow} onPress={() => router.push(`/timecard/${emp.employeeId}` as any)} activeOpacity={0.6}>
                    <View style={[styles.laborEmpAvatar, { backgroundColor: getRoleColor(emp.role) }]}>
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
            </>
          )}
        </>

        {/* ═══ ACTIVE JOBS (collapsible) ═══ */}
        <TouchableOpacity
          style={[styles.sectionHeader, { marginTop: 4 }]}
          onPress={() => {
            setShowActiveJobs(!showActiveJobs);
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionTitle}>Active Jobs ({(activeJobs || []).length})</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => router.push("/jobs" as any)}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, color: colors.muted }}>{showActiveJobs ? "▲" : "▼"}</Text>
          </View>
        </TouchableOpacity>
        {showActiveJobs && (
          <View style={{ paddingHorizontal: 20 }}>
            {(activeJobs || []).slice(0, 5).map((job) => (
              <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} />
            ))}
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
    </ScreenContainer>
  );
}
