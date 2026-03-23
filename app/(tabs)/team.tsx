import { ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Linking from "expo-linking";

const ROLE_COLORS: Record<string, string> = {
  owner: "#E8500A",
  secretary: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
  laborer: "#22C55E",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  secretary: "Secretary",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

const ROLES = ["owner", "secretary", "logistics", "foreman", "laborer"] as const;

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function TeamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [filterRole, setFilterRole] = useState<string>("all");

  // New employee form
  const [empName, setEmpName] = useState("");
  const [empRole, setEmpRole] = useState<typeof ROLES[number]>("laborer");
  const [empPin, setEmpPin] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empRate, setEmpRate] = useState("");
  const [useInviteLink, setUseInviteLink] = useState(true);
  const [inviteResult, setInviteResult] = useState<{ token: string; code: string } | null>(null);

  // Owner, secretary, logistics can add/edit employees
  const canManage = employee?.role === "owner" || employee?.role === "secretary" || employee?.role === "logistics";
  // Secretary and logistics can view the team list
  const canViewTeam = employee?.role === "owner" || employee?.role === "secretary" || employee?.role === "logistics";
  // Only owner can see hourly rates
  const canSeeRates = employee?.role === "owner";
  // Owner, secretary, logistics can alter time entries
  const canAlterTime = employee?.role === "owner" || employee?.role === "secretary" || employee?.role === "logistics";
  // Laborer/foreman can only tap their own card (to see their own info)
  const canViewOthers = canViewTeam;

  const { data: employees, isLoading } = trpc.employees.list.useQuery();
  const { data: clockedIn } = trpc.clock.allClockedIn.useQuery();
  const { data: activeJobs } = trpc.jobs.listActive.useQuery();

  const createEmployee = trpc.employees.create.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      setShowAddEmployee(false);
      resetForm();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createWithInvite = trpc.employees.createWithInvite.useMutation({
    onSuccess: (data) => {
      utils.employees.list.invalidate();
      // Generate a short 6-char invite code from the token (uppercase alphanumeric)
      const code = data.inviteToken.slice(0, 6).toUpperCase();
      setInviteResult({ token: data.inviteToken, code });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateEmployee = trpc.employees.update.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      setSelectedEmployee(null);
    },
  });

  const deactivateEmployee = trpc.employees.deactivate.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      setSelectedEmployee(null);
    },
  });

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
        requestingEmployeeId: employee!.id,
      });
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
        requestingEmployeeId: employee!.id,
      });
    }
  };

  const handleShareInvite = async () => {
    if (!inviteResult) return;
    try {
      await Share.share({
        message: `You've been invited to join Carranza Custom Construction on BuildTrack Pro!\n\nYour invite code: ${inviteResult.code}\n\nDownload the app and enter this code when you first open it to set up your account.`,
        title: "BuildTrack Pro Invite",
      });
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
          onPress: () => deactivateEmployee.mutate({ id: emp.id, requestingEmployeeId: employee!.id }),
        },
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
    detailRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  });

  if (!canViewTeam && !employee) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>Access Restricted</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>Team management is only available to management roles. Use the My Hours tab to view your own shifts.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Team</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {(employees || []).filter((e) => e.isActive).length} active · {clockedInIds.size} on site
          </Text>
        </View>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddEmployee(true)}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ Add Employee</Text>
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
          data={filteredEmployees}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const isClockedIn = clockedInIds.has(item.id);
            const clockEntry = (clockedIn || []).find((e: any) => e.employeeId === item.id);
            const job = clockEntry ? (activeJobs || []).find((j) => j.id === clockEntry.jobId) : null;
            const dur = clockEntry ? Date.now() - new Date(clockEntry.clockIn).getTime() : 0;
            const roleColor = ROLE_COLORS[item.role] || colors.primary;

            // Laborer/foreman can only tap their own card
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
                  {isClockedIn && job && (
                    <Text style={{ fontSize: 12, color: colors.success, marginTop: 3 }}>
                      {job.name} · {formatDuration(dur)}
                    </Text>
                  )}
                </View>
                {canSeeRates && item.hourlyRate && (
                  <Text style={{ fontSize: 13, color: colors.muted }}>${item.hourlyRate}/hr</Text>
                )}
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

                {/* Details — hourly rate only shown to owner */}
                {[
                  { label: "Phone", value: selectedEmployee.phone },
                  { label: "Email", value: selectedEmployee.email },
                  ...(canSeeRates ? [{ label: "Hourly Rate", value: selectedEmployee.hourlyRate ? `$${selectedEmployee.hourlyRate}/hr` : null }] : []),
                  { label: "Status", value: selectedEmployee.isActive ? "Active" : "Inactive" },
                  { label: "Member Since", value: new Date(selectedEmployee.createdAt).toLocaleDateString() },
                ].filter((r) => r.value).map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>{row.label}</Text>
                    <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{row.value}</Text>
                  </View>
                ))}

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

                {/* Management Actions */}
                {canManage && selectedEmployee.id !== employee?.id && (
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
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView style={styles.section}>
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
    </ScreenContainer>
  );
}
