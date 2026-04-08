import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useState, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { BG_JOBS as bg_jobs } from "@/constants/bg-urls";

const ROLE_COLORS: Record<string, string> = {
  owner: "#E8500A",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
  laborer: "#22C55E" };

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer" };

const ROLES = ["owner", "office_manager", "logistics", "foreman", "laborer"] as const;

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function TeamScreen({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await utils.invalidate(); } catch {}
    setRefreshing(false);
  }, [utils]);

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [filterRole, setFilterRole] = useState<string>("all");

  // Inline pay editing state
  const [editingPay, setEditingPay] = useState(false);
  const [editPayType, setEditPayType] = useState<"hourly" | "salary">("hourly");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editSalaryAmount, setEditSalaryAmount] = useState("");
  const [editSalaryProjects, setEditSalaryProjects] = useState<number[]>([]);
  const [savingPay, setSavingPay] = useState(false);

  // New employee form
  const [empName, setEmpName] = useState("");
  const [empRole, setEmpRole] = useState<typeof ROLES[number]>("laborer");
  const [empPin, setEmpPin] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empRate, setEmpRate] = useState("");
  const [useInviteLink, setUseInviteLink] = useState(true);
  const [inviteResult, setInviteResult] = useState<{ token: string; code: string } | null>(null);

  // Owner, office_manager, logistics can add/edit employees and manage team
  const canManageTeam = employee?.role === "owner" || employee?.role === "office_manager" || employee?.role === "logistics";
  // Foremen can also clock crew in/out (but can't add/edit employees or see pay)
  const canManage = canManageTeam || employee?.role === "foreman";
  // Foremen and above can view the team list
  const canViewTeam = canManageTeam || employee?.role === "foreman";
  // Only owner/office_manager can see hourly rates
  const canSeeRates = employee?.role === "owner" || employee?.role === "office_manager";
  // Owner, office_manager, logistics can alter time entries
  const canAlterTime = employee?.role === "owner" || employee?.role === "office_manager" || employee?.role === "logistics";
  // Foremen and above can view other employees' cards
  const canViewOthers = canViewTeam;

  const { data: employees, isLoading } = trpc.employees.list.useQuery(undefined, { staleTime: 30000 });
  const { data: clockedIn, refetch: refetchClockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { staleTime: 15000, refetchInterval: 30000 });
  const { data: activeJobs } = trpc.jobs.listActive.useQuery(undefined, { staleTime: 30000 });

  // Clock mutations for inline clock-in/out
  const clockInMutation = trpc.clock.in.useMutation();
  const clockOutMutation = trpc.clock.out.useMutation();

  // Clock-in modal state
  const [showClockIn, setShowClockIn] = useState(false);
  const [clockEmpId, setClockEmpId] = useState<number | null>(null);
  const [clockJobId, setClockJobId] = useState<number | null>(null);
  const [clockLoading, setClockLoading] = useState(false);
  // Custom clock-in time
  const [useCustomClockTime, setUseCustomClockTime] = useState(false);
  const [customClockTime, setCustomClockTime] = useState("");
  const [customClockAmpm, setCustomClockAmpm] = useState("AM");

  const handleQuickClockIn = useCallback(async () => {
    if (!clockEmpId || !clockJobId) {
      Alert.alert("Select Both", "Please select an employee and a job.");
      return;
    }
    if (clockLoading) return;
    setClockLoading(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Build clock-in time: use custom time if set, otherwise now
      let clockInTime = new Date().toISOString();
      if (useCustomClockTime && customClockTime) {
        const parts = customClockTime.split(":");
        if (parts.length === 2) {
          let hours = parseInt(parts[0], 10);
          const mins = parseInt(parts[1], 10);
          if (!isNaN(hours) && !isNaN(mins)) {
            if (customClockAmpm === "PM" && hours < 12) hours += 12;
            if (customClockAmpm === "AM" && hours === 12) hours = 0;
            const customDate = new Date();
            customDate.setHours(hours, mins, 0, 0);
            clockInTime = customDate.toISOString();
          }
        }
      }
      await clockInMutation.mutateAsync({
        employeeId: clockEmpId,
        jobId: clockJobId,
        clockIn: clockInTime,
        isOfflineEntry: false,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        utils.clock.allClockedIn.invalidate(),
        utils.clock.activeEntry.invalidate(),
        utils.clock.history.invalidate(),
      ]);
      await refetchClockedIn();
      setShowClockIn(false);
      setClockEmpId(null);
      setClockJobId(null);
      setUseCustomClockTime(false);
      setCustomClockTime("");
      Alert.alert("Clocked In", "Employee has been clocked in successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not clock in. Please try again.");
    } finally {
      setClockLoading(false);
    }
  }, [clockEmpId, clockJobId, clockLoading, clockInMutation, utils, refetchClockedIn, useCustomClockTime, customClockTime, customClockAmpm]);

  const handleQuickClockOut = useCallback(async (entryId: number, empName: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Clock Out",
      `Clock out ${empName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clock Out",
          style: "destructive",
          onPress: async () => {
            try {
              await clockOutMutation.mutateAsync({
                entryId,
                clockOut: new Date().toISOString(),
              });
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await Promise.all([
                utils.clock.allClockedIn.invalidate(),
                utils.clock.activeEntry.invalidate(),
                utils.clock.history.invalidate(),
              ]);
              await refetchClockedIn();
            } catch {
              Alert.alert("Error", "Could not clock out. Please try again.");
            }
          },
        },
      ]
    );
  }, [clockOutMutation, utils, refetchClockedIn]);

  const notClockedInEmployees = useMemo(() => {
    const clockedInIds = new Set((clockedIn || []).map((e: any) => e.employeeId));
    return (employees || []).filter((e) => e.isActive && !clockedInIds.has(e.id));
  }, [employees, clockedIn]);

  const createEmployee = trpc.employees.create.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      setShowAddEmployee(false);
      resetForm();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } });

  const createWithInvite = trpc.employees.createWithInvite.useMutation({
    onSuccess: (data) => {
      utils.employees.list.invalidate();
      // Generate a short 6-char invite code from the token (uppercase alphanumeric)
      const code = data.inviteToken.slice(0, 6).toUpperCase();
      setInviteResult({ token: data.inviteToken, code });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } });

  const updateEmployee = trpc.employees.update.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      setSelectedEmployee(null);
    } });

  const deactivateEmployee = trpc.employees.deactivate.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      setSelectedEmployee(null);
    } });

  const resetForm = () => {
    setEmpName("");
    setEmpRole("laborer");
    setEmpPin("");
    setEmpPhone("");
    setEmpEmail("");
    setEmpRate("");
    setInviteResult(null);
  };

  const handleCreateEmployee = async () => {
    if (useInviteLink) {
      if (!empName.trim()) {
        Alert.alert("Missing Info", "Name is required.");
        return;
      }
      await createWithInvite.mutateAsync({
        name: empName.trim(),
        role: empRole,
        email: empEmail || undefined,
        phone: empPhone || undefined,
        hourlyRate: empRate || undefined,
        requestingEmployeeId: employee!.id });
    } else {
      if (!empName.trim() || empPin.length < 4) {
        Alert.alert("Missing Info", "Name and a 4-6 digit PIN are required.");
        return;
      }
      await createEmployee.mutateAsync({
        name: empName.trim(),
        role: empRole,
        pin: empPin,
        phone: empPhone || undefined,
        email: empEmail || undefined,
        hourlyRate: empRate || undefined,
        requestingEmployeeId: employee!.id });
    }
  };

  const handleShareInvite = async () => {
    if (!inviteResult) return;
    try {
      await Share.share({
        message: `You've been invited to join Carranza Custom Construction on BuildTrack Pro!\n\nYour invite code: ${inviteResult.code}\n\nDownload the app and enter this code when you first open it to set up your account.`,
        title: "BuildTrack Pro Invite" });
    } catch (e) {
      // user cancelled
    }
  };

  const handleDeactivate = (emp: any) => {
    Alert.alert(
      "Deactivate Employee",
      `Are you sure you want to deactivate ${emp.name}? They will no longer be able to log in.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => deactivateEmployee.mutate({ id: emp.id, requestingEmployeeId: employee!.id }) },
      ]
    );
  };

  const filteredEmployees = (employees || []).filter((emp) => {
    if (filterRole !== "all" && emp.role !== filterRole) return false;
    return emp.isActive;
  });

  const clockedInIds = new Set((clockedIn || []).map((e: any) => e.employeeId));

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    filterScroll: { paddingHorizontal: 20, marginBottom: 12 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, marginRight: 8 },
    empCard: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: 14 },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    empName: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", marginTop: 2 },
    roleBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
    onSiteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginLeft: 8 },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    section: { padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.background, marginBottom: 10 },
    roleOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginBottom: 8, flexDirection: "row", alignItems: "center" },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8, marginBottom: 32 },
    detailRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border } });

  const Wrapper = embedded ? View : ScreenContainer;
  if (!canViewTeam && !employee) {
    return (
      <Wrapper style={embedded ? { flex: 1 } : undefined}>
        <ImageBackground source={bg_jobs} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>Access Restricted</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>Team management is only available to management roles. Use the My Hours tab to view your own shifts.</Text>
        </View>
          </ImageBackground>
    </Wrapper>
    );
  }

  return (
    <Wrapper style={embedded ? { flex: 1 } : undefined} edges={embedded ? undefined : ["top", "left", "right"]}>
        <ImageBackground source={bg_jobs} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Team</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {(employees || []).filter((e) => e.isActive).length} active · {clockedInIds.size} on site
          </Text>
        </View>
        {canManageTeam && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddEmployee(true)}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ Add Employee</Text>
          </TouchableOpacity>
        )}
        {!canManageTeam && canManage && (
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.success }]} onPress={() => setShowClockIn(true)}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>⏱ Clock In</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Role Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingRight: 20 }}>
        {["all", ...ROLES].map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterChip, { borderColor: filterRole === r ? colors.primary : colors.border, backgroundColor: filterRole === r ? colors.primary + "15" : colors.surface }]}
            onPress={() => setFilterRole(r)}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: filterRole === r ? colors.primary : colors.muted }}>
              {r === "all" ? "All" : ROLE_LABELS[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          data={filteredEmployees}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const isClockedIn = clockedInIds.has(item.id);
            const clockEntry = (clockedIn || []).find((e: any) => e.employeeId === item.id);
            // Use enriched jobName from server join, fallback to activeJobs lookup
            const jobName = clockEntry?.jobName || (clockEntry ? (activeJobs || []).find((j) => j.id === clockEntry.jobId)?.name : null);
            const dur = clockEntry ? Date.now() - new Date(clockEntry.clockIn).getTime() : 0;
            const durDisplay = dur > 0 ? formatDuration(dur) : "0h 0m";
            const roleColor = ROLE_COLORS[item.role] || colors.primary;

            // Foremen and above can tap any card; laborers can only tap their own
            const canTap = canViewOthers || item.id === employee?.id;
            return (
              <TouchableOpacity style={styles.empCard} onPress={() => canTap ? setSelectedEmployee(item) : null} activeOpacity={canTap ? 0.75 : 1}>
                <View style={[styles.avatar, { backgroundColor: roleColor }]}>
                  <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.empName}>{item.name}</Text>
                    {isClockedIn && <View style={styles.onSiteDot} />}
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                    <Text style={styles.roleBadgeText}>{ROLE_LABELS[item.role]}</Text>
                  </View>
                  {isClockedIn && jobName && (
                    <Text style={{ fontSize: 12, color: colors.success, marginTop: 3 }}>
                      {jobName} · {durDisplay}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {canSeeRates && item.hourlyRate && (
                    <Text style={{ fontSize: 13, color: colors.muted }}>${item.hourlyRate}/hr</Text>
                  )}
                  {isClockedIn && canManage && clockEntry && (
                    <TouchableOpacity
                      style={{ backgroundColor: colors.error + "20", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.error + "50" }}
                      onPress={(e) => { e.stopPropagation?.(); handleQuickClockOut(clockEntry.id, item.name); }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>Clock Out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>👷</Text>
              <Text style={{ color: colors.muted, fontSize: 16 }}>No employees found</Text>
              {canManage && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>Tap "+ Add Employee" to get started</Text>}
            </View>
          }
        />
      )}

      {/* Employee Detail Modal */}
      <Modal visible={!!selectedEmployee} animationType="slide" presentationStyle="pageSheet">
        {selectedEmployee && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedEmployee.name}</Text>
              <TouchableOpacity onPress={() => setSelectedEmployee(null)}>
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <View style={styles.section}>
                {/* Avatar + Role */}
                <View style={{ alignItems: "center", marginBottom: 24 }}>
                  <View style={[styles.avatar, { width: 72, height: 72, borderRadius: 36, backgroundColor: ROLE_COLORS[selectedEmployee.role] || colors.primary }]}>
                    <Text style={[styles.avatarText, { fontSize: 26 }]}>{getInitials(selectedEmployee.name)}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[selectedEmployee.role] || colors.primary, marginTop: 10 }]}>
                    <Text style={[styles.roleBadgeText, { fontSize: 13 }]}>{ROLE_LABELS[selectedEmployee.role]}</Text>
                  </View>
                </View>

                {/* Details */}
                {[
                  { label: "Phone", value: selectedEmployee.phone },
                  { label: "Email", value: selectedEmployee.email },
                  { label: "Status", value: selectedEmployee.isActive ? "Active" : "Inactive" },
                  { label: "Member Since", value: new Date(selectedEmployee.createdAt).toLocaleDateString() },
                ].filter((r) => r.value).map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>{row.label}</Text>
                    <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{row.value}</Text>
                  </View>
                ))}

                {/* Pay Section — Owner/Office Manager only */}
                {canSeeRates && (
                  <View style={{ marginTop: 20, backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Pay Information</Text>
                      {canManage && !editingPay && (
                        <TouchableOpacity onPress={() => {
                          setEditingPay(true);
                          setEditPayType(selectedEmployee.payType || "hourly");
                          setEditHourlyRate(selectedEmployee.hourlyRate || "");
                          setEditSalaryAmount(selectedEmployee.salaryAmount || "");
                          try { setEditSalaryProjects(selectedEmployee.salaryProjects ? JSON.parse(selectedEmployee.salaryProjects) : []); } catch { setEditSalaryProjects([]); }
                        }}>
                          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Edit</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {!editingPay ? (
                      <View>
                        <View style={styles.detailRow}>
                          <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>Pay Type</Text>
                          <Text style={{ fontSize: 14, color: colors.foreground, flex: 1, textTransform: "capitalize" }}>{selectedEmployee.payType || "Hourly"}</Text>
                        </View>
                        {(selectedEmployee.payType || "hourly") === "hourly" ? (
                          <View style={styles.detailRow}>
                            <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>Hourly Rate</Text>
                            <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{selectedEmployee.hourlyRate ? `$${selectedEmployee.hourlyRate}/hr` : "Not set"}</Text>
                          </View>
                        ) : (
                          <>
                            <View style={styles.detailRow}>
                              <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>Salary</Text>
                              <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{selectedEmployee.salaryAmount ? `$${Number(selectedEmployee.salaryAmount).toLocaleString()}` : "Not set"}</Text>
                            </View>
                            {(() => {
                              let projIds: number[] = [];
                              try { projIds = selectedEmployee.salaryProjects ? JSON.parse(selectedEmployee.salaryProjects) : []; } catch {}
                              if (projIds.length === 0) return null;
                              const projNames = projIds.map((pid: number) => (activeJobs || []).find((j) => j.id === pid)?.name || `Job #${pid}`).join(", ");
                              const perProject = selectedEmployee.salaryAmount ? `$${(Number(selectedEmployee.salaryAmount) / projIds.length).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0";
                              return (
                                <>
                                  <View style={styles.detailRow}>
                                    <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>Split Across</Text>
                                    <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{projIds.length} projects</Text>
                                  </View>
                                  <View style={styles.detailRow}>
                                    <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>Per Project</Text>
                                    <Text style={{ fontSize: 14, color: colors.primary, flex: 1, fontWeight: "600" }}>{perProject}</Text>
                                  </View>
                                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{projNames}</Text>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </View>
                    ) : (
                      <View>
                        {/* Pay Type Toggle */}
                        <View style={{ flexDirection: "row", backgroundColor: colors.background, borderRadius: 10, padding: 3, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
                          <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: editPayType === "hourly" ? colors.primary : "transparent" }}
                            onPress={() => setEditPayType("hourly")}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "700", color: editPayType === "hourly" ? "#fff" : colors.muted }}>Hourly</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: editPayType === "salary" ? colors.primary : "transparent" }}
                            onPress={() => setEditPayType("salary")}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "700", color: editPayType === "salary" ? "#fff" : colors.muted }}>Salary</Text>
                          </TouchableOpacity>
                        </View>

                        {editPayType === "hourly" ? (
                          <>
                            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Hourly Rate ($)</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. 25.00"
                              placeholderTextColor={colors.muted}
                              value={editHourlyRate}
                              onChangeText={setEditHourlyRate}
                              keyboardType="decimal-pad"
                            />
                          </>
                        ) : (
                          <>
                            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Salary Amount ($)</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. 52000"
                              placeholderTextColor={colors.muted}
                              value={editSalaryAmount}
                              onChangeText={setEditSalaryAmount}
                              keyboardType="decimal-pad"
                            />

                            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, marginTop: 8 }}>Distribute Cost Across Projects (up to 6)</Text>
                            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Salary will be split evenly across selected projects</Text>
                            {(activeJobs || []).filter((j) => j.status === "active").map((job) => {
                              const isSelected = editSalaryProjects.includes(job.id);
                              return (
                                <TouchableOpacity
                                  key={job.id}
                                  style={[styles.roleOption, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + "15" : colors.background }]}
                                  onPress={() => {
                                    if (isSelected) {
                                      setEditSalaryProjects(editSalaryProjects.filter((id) => id !== job.id));
                                    } else if (editSalaryProjects.length < 6) {
                                      setEditSalaryProjects([...editSalaryProjects, job.id]);
                                    } else {
                                      Alert.alert("Maximum 6 Projects", "You can distribute salary across up to 6 projects.");
                                    }
                                  }}
                                >
                                  <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: isSelected ? colors.primary : colors.foreground }}>{job.name}</Text>
                                  {isSelected && <Text style={{ color: colors.primary, fontWeight: "700" }}>✓</Text>}
                                </TouchableOpacity>
                              );
                            })}
                            {editSalaryProjects.length > 0 && editSalaryAmount && (
                              <View style={{ backgroundColor: colors.primary + "10", borderRadius: 8, padding: 10, marginTop: 8 }}>
                                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>
                                  ${(Number(editSalaryAmount) / editSalaryProjects.length).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per project ({editSalaryProjects.length} projects)
                                </Text>
                              </View>
                            )}
                          </>
                        )}

                        {/* Save / Cancel buttons */}
                        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                          <TouchableOpacity
                            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
                            onPress={() => setEditingPay(false)}
                          >
                            <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}
                            disabled={savingPay}
                            onPress={async () => {
                              setSavingPay(true);
                              try {
                                await updateEmployee.mutateAsync({
                                  id: selectedEmployee.id,
                                  hourlyRate: editPayType === "hourly" ? editHourlyRate : undefined,
                                  payType: editPayType,
                                  salaryAmount: editPayType === "salary" ? editSalaryAmount : undefined,
                                  salaryProjects: editPayType === "salary" ? JSON.stringify(editSalaryProjects) : undefined,
                                });
                                setSelectedEmployee({
                                  ...selectedEmployee,
                                  hourlyRate: editPayType === "hourly" ? editHourlyRate : selectedEmployee.hourlyRate,
                                  payType: editPayType,
                                  salaryAmount: editPayType === "salary" ? editSalaryAmount : selectedEmployee.salaryAmount,
                                  salaryProjects: editPayType === "salary" ? JSON.stringify(editSalaryProjects) : selectedEmployee.salaryProjects,
                                });
                                setEditingPay(false);
                                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                Alert.alert("Saved", "Pay information updated successfully.");
                              } catch (err) {
                                Alert.alert("Error", "Failed to update pay information.");
                              } finally {
                                setSavingPay(false);
                              }
                            }}
                          >
                            {savingPay ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Current Status */}
                {clockedInIds.has(selectedEmployee.id) && (() => {
                  const entry = (clockedIn || []).find((e: any) => e.employeeId === selectedEmployee.id);
                  const job = entry ? (activeJobs || []).find((j) => j.id === entry.jobId) : null;
                  const dur = entry ? Date.now() - new Date(entry.clockIn).getTime() : 0;
                  return (
                    <View style={{ backgroundColor: colors.success + "15", borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: colors.success + "40" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.success, marginBottom: 4 }}>Currently On Site</Text>
                      <Text style={{ fontSize: 13, color: colors.foreground }}>{job?.name || "Unknown Job"}</Text>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Clocked in {formatDuration(dur)} ago</Text>
                    </View>
                  );
                })()}

                {/* View Timecard Button */}
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary + "15", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16, borderWidth: 1, borderColor: colors.primary + "40" }}
                  onPress={() => { setSelectedEmployee(null); router.push(`/timecard/${selectedEmployee.id}` as any); }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>View Full Timecard</Text>
                </TouchableOpacity>

                {/* Management Actions - only full managers can change roles/deactivate */}
                {canManageTeam && selectedEmployee.id !== employee?.id && (
                  <View style={{ marginTop: 24, gap: 10 }}>
                    <Text style={styles.sectionTitle}>Change Role</Text>
                    {ROLES.map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.roleOption, { borderColor: selectedEmployee.role === r ? colors.primary : colors.border, backgroundColor: selectedEmployee.role === r ? colors.primary + "15" : colors.surface }]}
                        onPress={() => {
                          updateEmployee.mutate({ id: selectedEmployee.id, role: r });
                          setSelectedEmployee({ ...selectedEmployee, role: r });
                        }}
                      >
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ROLE_COLORS[r], marginRight: 10 }} />
                        <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: selectedEmployee.role === r ? colors.primary : colors.foreground }}>{ROLE_LABELS[r]}</Text>
                        {selectedEmployee.role === r && <Text style={{ color: colors.primary }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={{ backgroundColor: colors.error + "15", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: colors.error + "40" }}
                      onPress={() => handleDeactivate(selectedEmployee)}
                    >
                      <Text style={{ color: colors.error, fontWeight: "700", fontSize: 15 }}>Deactivate Employee</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* Add Employee Modal */}
      <Modal visible={showAddEmployee} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Employee</Text>
            <TouchableOpacity onPress={() => { setShowAddEmployee(false); resetForm(); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ScrollView style={styles.section} keyboardShouldPersistTaps="handled">
              {inviteResult ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>Invite Created!</Text>
                  <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 20 }}>Share this code with {empName} so they can set up their own PIN and log in.</Text>
                  <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, width: "100%", marginBottom: 8, alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>Invite Code</Text>
                    <Text style={{ fontSize: 32, fontWeight: "900", color: colors.primary, letterSpacing: 6 }} selectable>{inviteResult.code}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginBottom: 16 }}>The employee enters this code when they first open the app.</Text>
                  <TouchableOpacity style={[styles.submitBtn, { width: "100%" }]} onPress={handleShareInvite}>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Share via Text / Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ marginTop: 12, padding: 12 }} onPress={() => { setShowAddEmployee(false); resetForm(); }}>
                    <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
              <>
              {/* Toggle: Invite Link vs Manual PIN */}
              <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: 10, padding: 3, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: useInviteLink ? colors.primary : "transparent" }}
                  onPress={() => setUseInviteLink(true)}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: useInviteLink ? "#fff" : colors.muted }}>Send Invite Code</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: !useInviteLink ? colors.primary : "transparent" }}
                  onPress={() => setUseInviteLink(false)}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: !useInviteLink ? "#fff" : colors.muted }}>Set PIN Manually</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Full Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. John Smith" placeholderTextColor={colors.muted} value={empName} onChangeText={setEmpName} />

              {!useInviteLink && (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>PIN (4-6 digits) *</Text>
                  <TextInput style={styles.input} placeholder="e.g. 1234" placeholderTextColor={colors.muted} value={empPin} onChangeText={setEmpPin} keyboardType="numeric" maxLength={6} secureTextEntry />
                </>
              )}

              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>Role *</Text>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleOption, { borderColor: empRole === r ? colors.primary : colors.border, backgroundColor: empRole === r ? colors.primary + "15" : colors.surface }]}
                  onPress={() => setEmpRole(r)}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ROLE_COLORS[r], marginRight: 10 }} />
                  <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: empRole === r ? colors.primary : colors.foreground }}>{ROLE_LABELS[r]}</Text>
                  {empRole === r && <Text style={{ color: colors.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}

              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, marginTop: 12 }}>Phone</Text>
              <TextInput style={styles.input} placeholder="(555) 000-0000" placeholderTextColor={colors.muted} value={empPhone} onChangeText={setEmpPhone} keyboardType="phone-pad" />

              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Email</Text>
              <TextInput style={styles.input} placeholder="john@example.com" placeholderTextColor={colors.muted} value={empEmail} onChangeText={setEmpEmail} keyboardType="email-address" autoCapitalize="none" />

              {/* Hourly rate input — owner only */}
              {canSeeRates && (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Hourly Rate ($)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 25.00" placeholderTextColor={colors.muted} value={empRate} onChangeText={setEmpRate} keyboardType="decimal-pad" />
                </>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateEmployee} disabled={createEmployee.isPending || createWithInvite.isPending}>
                {(createEmployee.isPending || createWithInvite.isPending) ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{useInviteLink ? "Create & Get Invite Code" : "Add Employee"}</Text>}
              </TouchableOpacity>
              </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* Clock-In FAB */}
      {canManage && (
        <TouchableOpacity
          style={{
            position: "absolute",
            bottom: embedded ? 20 : Math.max(insets.bottom + 8, 20),
            left: 20,
            backgroundColor: colors.success,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 8,
          }}
          onPress={() => setShowClockIn(true)}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 24 }}>⏱</Text>
        </TouchableOpacity>
      )}

      {/* Quick Clock-In Modal */}
      <Modal visible={showClockIn} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Clock In Employee</Text>
            <TouchableOpacity onPress={() => { setShowClockIn(false); setClockEmpId(null); setClockJobId(null); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.section}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Select Employee</Text>
            {notClockedInEmployees.map((emp) => {
              const isSelected = clockEmpId === emp.id;
              const roleColor = ROLE_COLORS[emp.role] || colors.primary;
              return (
                <TouchableOpacity
                  key={emp.id}
                  style={[styles.roleOption, { borderColor: isSelected ? colors.success : colors.border, backgroundColor: isSelected ? colors.success + "15" : colors.surface }]}
                  onPress={() => setClockEmpId(emp.id)}
                >
                  <View style={[styles.avatar, { width: 32, height: 32, borderRadius: 16, backgroundColor: roleColor, marginRight: 10 }]}>
                    <Text style={[styles.avatarText, { fontSize: 12 }]}>{getInitials(emp.name)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: isSelected ? colors.success : colors.foreground }}>{emp.name}</Text>
                  {isSelected && <Text style={{ color: colors.success, fontWeight: "700", fontSize: 18 }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            {notClockedInEmployees.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>All employees are currently clocked in</Text>
              </View>
            )}

            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginTop: 24, marginBottom: 12 }}>Select Job Site</Text>
            {(activeJobs || []).filter((j) => j.status === "active").map((job) => {
              const isSelected = clockJobId === job.id;
              return (
                <TouchableOpacity
                  key={job.id}
                  style={[styles.roleOption, { borderColor: isSelected ? colors.success : colors.border, backgroundColor: isSelected ? colors.success + "15" : colors.surface }]}
                  onPress={() => setClockJobId(job.id)}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: isSelected ? colors.success : colors.foreground }}>{job.name}</Text>
                  {job.address && <Text style={{ fontSize: 12, color: colors.muted }}>{job.address}</Text>}
                  {isSelected && <Text style={{ color: colors.success, fontWeight: "700", fontSize: 18, marginLeft: 8 }}>✓</Text>}
                </TouchableOpacity>
              );
            })}

            {/* Custom Clock-In Time Picker */}
            <View style={{ marginTop: 24, marginBottom: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Clock-In Time</Text>
                <TouchableOpacity
                  onPress={() => {
                    const next = !useCustomClockTime;
                    setUseCustomClockTime(next);
                    if (next) {
                      const now2 = new Date();
                      let h = now2.getHours();
                      const m = now2.getMinutes();
                      const ampm = h >= 12 ? "PM" : "AM";
                      if (h > 12) h -= 12;
                      if (h === 0) h = 12;
                      setCustomClockTime(`${h}:${m.toString().padStart(2, "0")}`);
                      setCustomClockAmpm(ampm);
                    }
                  }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: useCustomClockTime ? colors.primary : colors.border, justifyContent: "center", paddingHorizontal: 2 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", alignSelf: useCustomClockTime ? "flex-end" : "flex-start" }} />
                  </View>
                  <Text style={{ fontSize: 13, color: useCustomClockTime ? colors.primary : colors.muted, fontWeight: "600" }}>
                    {useCustomClockTime ? "Custom" : "Now"}
                  </Text>
                </TouchableOpacity>
              </View>
              {useCustomClockTime && (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, fontSize: 18, fontWeight: "700", textAlign: "center" }]}
                    value={customClockTime}
                    onChangeText={setCustomClockTime}
                    placeholder="7:30"
                    placeholderTextColor={colors.muted}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="done"
                  />
                  <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                    {["AM", "PM"].map((ap) => (
                      <TouchableOpacity
                        key={ap}
                        onPress={() => setCustomClockAmpm(ap)}
                        style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: customClockAmpm === ap ? colors.primary : colors.surface }}
                      >
                        <Text style={{ fontWeight: "700", fontSize: 14, color: customClockAmpm === ap ? "#fff" : colors.muted }}>{ap}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.success, marginTop: 16, opacity: (!clockEmpId || !clockJobId || clockLoading) ? 0.5 : 1 }]}
              onPress={handleQuickClockIn}
              disabled={!clockEmpId || !clockJobId || clockLoading}
            >
              {clockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ImageBackground>
    </Wrapper>
  );
}
