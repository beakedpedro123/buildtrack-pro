import { ScreenContainer } from "@/components/screen-container";
import { JobCard } from "@/components/ui/job-card";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const DEFAULT_BUDGET_CATEGORIES = [
  "Labor",
  "Materials",
  "Equipment",
  "Subcontractors",
  "Permits & Fees",
  "Miscellaneous",
];

export default function JobsScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "budget" | "reports" | "photos">("overview");
  const [showNewJob, setShowNewJob] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);

  // New job form
  const [jobName, setJobName] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobClient, setJobClient] = useState("");
  const [jobBudget, setJobBudget] = useState("");
  const [jobNotes, setJobNotes] = useState("");

  // Expense form
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCategoryId, setExpCategoryId] = useState<number | null>(null);

  // Budget category form
  const [budgetName, setBudgetName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  // RBAC role helpers
  const role = employee?.role ?? "laborer";
  const canManage = role === "owner" || role === "secretary" || role === "logistics";
  const canSeeBudget = canManage; // laborer & foreman cannot see dollar amounts
  // Foreman can update job status but not create/delete jobs
  const canUpdateStatus = canManage || role === "foreman";

  const { data: allJobs, isLoading } = trpc.jobs.list.useQuery();
  const { data: jobReports } = trpc.reports.forJob.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob }
  );
  const { data: jobPhotos } = trpc.reports.getPhotosForJob.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob }
  );
  const { data: budgetCategories } = trpc.budget.getCategories.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob && canSeeBudget }
  );
  const { data: expenses } = trpc.budget.getExpenses.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob && canSeeBudget }
  );
  const { data: syncLogs } = trpc.budget.getSyncLogs.useQuery(
    { limit: 5 },
    { enabled: canSeeBudget }
  );

  const createJob = trpc.jobs.create.useMutation({ onSuccess: () => { utils.jobs.list.invalidate(); setShowNewJob(false); resetJobForm(); } });
  const updateJob = trpc.jobs.update.useMutation({ onSuccess: () => { utils.jobs.list.invalidate(); } });
  const addExpense = trpc.budget.addExpense.useMutation({ onSuccess: () => { utils.budget.getExpenses.invalidate(); utils.budget.getCategories.invalidate(); setShowAddExpense(false); resetExpForm(); } });
  const addBudgetCat = trpc.budget.createCategory.useMutation({ onSuccess: () => { utils.budget.getCategories.invalidate(); setShowAddBudget(false); setBudgetName(""); setBudgetAmount(""); } });
  const syncToQB = trpc.budget.syncToQB.useMutation();

  const resetJobForm = () => { setJobName(""); setJobAddress(""); setJobClient(""); setJobBudget(""); setJobNotes(""); };
  const resetExpForm = () => { setExpDesc(""); setExpAmount(""); setExpCategoryId(null); };

  const filteredJobs = (allJobs || []).filter((j) => {
    if (filter === "active") return j.status === "active";
    if (filter === "completed") return j.status === "completed" || j.status === "cancelled";
    return true;
  });

  // Budget figures — only computed for roles that can see them
  const totalBudget = canSeeBudget ? parseFloat(selectedJob?.totalBudget || "0") : 0;
  const totalSpent = canSeeBudget ? (expenses || []).reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0) : 0;
  const budgetPct = totalBudget > 0 ? Math.min(totalSpent / totalBudget, 1) : 0;
  const budgetBarColor = budgetPct < 0.6 ? colors.success : budgetPct < 0.85 ? colors.warning : colors.error;

  // Progress-only percentage for laborer/foreman (based on reports count as a proxy)
  const reportCount = (jobReports || []).length;
  const photoCount = (jobPhotos || []).length;

  const handleCreateJob = async () => {
    if (!jobName.trim() || !employee) return;
    await createJob.mutateAsync({
      name: jobName.trim(),
      address: jobAddress || undefined,
      clientName: jobClient || undefined,
      totalBudget: jobBudget || undefined,
      notes: jobNotes || undefined,
      createdBy: employee.id,
    });
  };

  const handleSyncQB = async () => {
    if (!employee) return;
    Alert.alert("Sync to QuickBooks", "This will mark all unsynced expenses as synced. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sync Now",
        onPress: async () => {
          try {
            const result = await syncToQB.mutateAsync({ triggeredBy: employee.id, syncType: "full" });
            utils.budget.getSyncLogs.invalidate();
            Alert.alert("Sync Complete", `${result.itemsSynced} items synced to QuickBooks.`);
          } catch {
            Alert.alert("Sync Failed", "Could not sync to QuickBooks. Please try again.");
          }
        },
      },
    ]);
  };

  // Tabs available depend on role — laborer/foreman never see the Budget tab
  const availableTabs = canSeeBudget
    ? (["overview", "budget", "reports", "photos"] as const)
    : (["overview", "reports", "photos"] as const);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    filterRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
    filterText: { fontSize: 13, fontWeight: "600" },
    addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
    tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
    tabText: { fontSize: 13, fontWeight: "600" },
    section: { padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.background, marginBottom: 10 },
    kpiCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    kpiValue: { fontSize: 22, fontWeight: "800", color: colors.foreground },
    kpiLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
    expenseRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    syncCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, margin: 20, borderWidth: 1, borderColor: colors.border },
    syncBtn: { backgroundColor: "#2CA01C", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 12 },
    catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  });

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        {/* Only management can create jobs */}
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewJob(true)}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ New Job</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(["active", "all", "completed"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, { borderColor: filter === f ? colors.primary : colors.border, backgroundColor: filter === f ? colors.primary + "15" : colors.surface }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, { color: filter === f ? colors.primary : colors.muted }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <JobCard job={item} onPress={() => { setSelectedJob(item); setActiveTab("overview"); }} hideBudget={!canSeeBudget} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🏗️</Text>
              <Text style={{ color: colors.muted, fontSize: 16 }}>No {filter} jobs</Text>
              {canManage && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>Tap "+ New Job" to create one</Text>}
            </View>
          }
        />
      )}

      {/* Job Detail Modal */}
      <Modal visible={!!selectedJob} animationType="slide" presentationStyle="pageSheet">
        {selectedJob && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedJob.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{selectedJob.clientName || selectedJob.address || "No client"}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedJob(null)}>
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs — Budget tab hidden for laborer/foreman */}
            <View style={styles.tabRow}>
              {availableTabs.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, { borderBottomWidth: activeTab === tab ? 2 : 0, borderBottomColor: colors.primary }]}
                  onPress={() => setActiveTab(tab as any)}
                >
                  <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <View style={styles.section}>
                  {/* KPI Cards — laborer/foreman see reports & photos count only, no dollar amounts */}
                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiValue}>{reportCount}</Text>
                      <Text style={styles.kpiLabel}>Reports</Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiValue}>{photoCount}</Text>
                      <Text style={styles.kpiLabel}>Photos</Text>
                    </View>
                    {canSeeBudget ? (
                      <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { fontSize: 16 }]}>${totalSpent.toLocaleString()}</Text>
                        <Text style={styles.kpiLabel}>Spent</Text>
                      </View>
                    ) : (
                      <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { fontSize: 16, color: colors.primary }]}>
                          {selectedJob.status === "active" ? "🟢" : selectedJob.status === "paused" ? "🟡" : "⚫"}
                        </Text>
                        <Text style={styles.kpiLabel}>{STATUS_LABELS[selectedJob.status]}</Text>
                      </View>
                    )}
                  </View>

                  {/* Progress bar for laborer/foreman — shows job status visually without dollars */}
                  {!canSeeBudget && (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Job Progress</Text>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: colors.muted }}>Status</Text>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: selectedJob.status === "active" ? colors.success : selectedJob.status === "paused" ? colors.warning : colors.muted }}>
                          {STATUS_LABELS[selectedJob.status]}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: colors.muted }}>Field Reports</Text>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{reportCount} submitted</Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 13, color: colors.muted }}>Site Photos</Text>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{photoCount} uploaded</Text>
                      </View>
                    </View>
                  )}

                  <Text style={styles.sectionTitle}>Job Details</Text>
                  {[
                    { label: "Status", value: STATUS_LABELS[selectedJob.status] },
                    { label: "Address", value: selectedJob.address },
                    // Client name visible to foreman/laborer so they know the site
                    { label: "Client", value: selectedJob.clientName },
                    // Budget only visible to management
                    ...(canSeeBudget ? [
                      { label: "Client Phone", value: selectedJob.clientPhone },
                      { label: "Total Budget", value: selectedJob.totalBudget ? `$${parseFloat(selectedJob.totalBudget).toLocaleString()}` : null },
                    ] : []),
                    { label: "Notes", value: selectedJob.notes },
                  ].filter((r) => r.value).map((row) => (
                    <View key={row.label} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>{row.label}</Text>
                      <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{row.value}</Text>
                    </View>
                  ))}

                  {/* Status update — management + foreman can update status */}
                  {canUpdateStatus && (
                    <View style={{ marginTop: 20, gap: 10 }}>
                      <Text style={styles.sectionTitle}>Update Status</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {(["active", "paused", "completed", "cancelled"] as const).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: selectedJob.status === s ? colors.primary : colors.border, backgroundColor: selectedJob.status === s ? colors.primary + "15" : colors.surface }}
                            onPress={() => {
                              updateJob.mutate({ id: selectedJob.id, status: s });
                              setSelectedJob({ ...selectedJob, status: s });
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "600", color: selectedJob.status === s ? colors.primary : colors.muted }}>{STATUS_LABELS[s]}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Budget Tab — only rendered for management roles */}
              {activeTab === "budget" && canSeeBudget && (
                <View style={styles.section}>
                  {/* Budget Overview */}
                  <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }}>Total Budget</Text>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>
                      ${totalBudget.toLocaleString()}
                    </Text>
                    <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                      <View style={{ height: "100%", width: `${budgetPct * 100}%`, backgroundColor: budgetBarColor, borderRadius: 4 }} />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Spent: ${totalSpent.toLocaleString()}</Text>
                      <Text style={{ fontSize: 13, color: colors.muted }}>Remaining: ${Math.max(0, totalBudget - totalSpent).toLocaleString()}</Text>
                    </View>
                  </View>

                  {/* Budget Categories */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <Text style={styles.sectionTitle}>Categories</Text>
                    {canManage && (
                      <TouchableOpacity onPress={() => setShowAddBudget(true)} style={{ backgroundColor: colors.primary + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>+ Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {(budgetCategories || []).map((cat) => {
                    const catSpent = parseFloat(cat.spentAmount || "0");
                    const catBudget = parseFloat(cat.budgetedAmount || "0");
                    const pct = catBudget > 0 ? Math.min(catSpent / catBudget, 1) : 0;
                    return (
                      <View key={cat.id} style={styles.catRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{cat.name}</Text>
                          <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                            <View style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: pct < 0.8 ? colors.success : colors.error, borderRadius: 2 }} />
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>${catSpent.toLocaleString()}</Text>
                          <Text style={{ fontSize: 11, color: colors.muted }}>/ ${catBudget.toLocaleString()}</Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* Expenses */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 12 }}>
                    <Text style={styles.sectionTitle}>Expenses</Text>
                    {canManage && (
                      <TouchableOpacity onPress={() => setShowAddExpense(true)} style={{ backgroundColor: colors.primary + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>+ Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {(expenses || []).map((exp) => (
                    <View key={exp.id} style={styles.expenseRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, color: colors.foreground }}>{exp.description}</Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>{new Date(exp.expenseDate).toLocaleDateString()}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>${parseFloat(exp.amount).toLocaleString()}</Text>
                        {exp.qbSynced && <Text style={{ fontSize: 10, color: colors.success }}>QB Synced</Text>}
                      </View>
                    </View>
                  ))}

                  {/* QuickBooks Sync — owner only */}
                  <View style={styles.syncCard}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>QuickBooks Sync</Text>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
                      {(expenses || []).filter((e) => !e.qbSynced).length} unsynced expense{(expenses || []).filter((e) => !e.qbSynced).length !== 1 ? "s" : ""}
                    </Text>
                    {(syncLogs || []).slice(0, 2).map((log) => (
                      <View key={log.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: log.status === "success" ? colors.success : log.status === "failed" ? colors.error : colors.warning, marginRight: 8 }} />
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {log.status} · {log.itemsSynced} items · {new Date(log.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    ))}
                    {employee?.role === "owner" && (
                      <TouchableOpacity style={styles.syncBtn} onPress={handleSyncQB} disabled={syncToQB.isPending}>
                        {syncToQB.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Sync to QuickBooks</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Reports Tab */}
              {activeTab === "reports" && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{(jobReports || []).length} Field Reports</Text>
                  {(jobReports || []).map((report) => {
                    const workItems = (() => { try { return JSON.parse(report.workCompleted || "[]"); } catch { return []; } })();
                    return (
                      <View key={report.id} style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{new Date(report.reportDate).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</Text>
                          <Text style={{ fontSize: 13, color: colors.muted }}>{report.crewCount} crew · {report.weatherCondition}</Text>
                        </View>
                        {workItems.slice(0, 3).map((w: string, i: number) => (
                          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success, marginRight: 8 }} />
                            <Text style={{ fontSize: 13, color: colors.foreground }}>{w}</Text>
                          </View>
                        ))}
                        {workItems.length > 3 && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>+{workItems.length - 3} more items</Text>}
                        {report.notes ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, fontStyle: "italic" }}>{report.notes}</Text> : null}
                      </View>
                    );
                  })}
                  {(!jobReports || jobReports.length === 0) && (
                    <Text style={{ color: colors.muted, fontSize: 14 }}>No reports for this job yet.</Text>
                  )}
                </View>
              )}

              {/* Photos Tab */}
              {activeTab === "photos" && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{(jobPhotos || []).length} Site Photos</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {(jobPhotos || []).map((photo) => (
                      <View key={photo.id} style={{ width: "31%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", backgroundColor: colors.border }}>
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 24 }}>📷</Text>
                          <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center", paddingHorizontal: 4 }} numberOfLines={2}>{photo.caption || new Date(photo.createdAt).toLocaleDateString()}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  {(!jobPhotos || jobPhotos.length === 0) && (
                    <Text style={{ color: colors.muted, fontSize: 14 }}>No photos uploaded yet.</Text>
                  )}
                </View>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>

            {/* Add Expense Modal — management only */}
            {canManage && (
              <Modal visible={showAddExpense} animationType="slide" presentationStyle="formSheet">
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Add Expense</Text>
                    <TouchableOpacity onPress={() => { setShowAddExpense(false); resetExpForm(); }}>
                      <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ padding: 20 }}>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Description *</Text>
                    <TextInput style={styles.input} placeholder="e.g. Lumber delivery" placeholderTextColor={colors.muted} value={expDesc} onChangeText={setExpDesc} />
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Amount ($) *</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.muted} value={expAmount} onChangeText={setExpAmount} keyboardType="decimal-pad" />
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>Category</Text>
                    {(budgetCategories || []).map((cat) => (
                      <TouchableOpacity key={cat.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => setExpCategoryId(cat.id)}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: expCategoryId === cat.id ? colors.primary : colors.border, backgroundColor: expCategoryId === cat.id ? colors.primary : "transparent", marginRight: 12 }} />
                        <Text style={{ fontSize: 14, color: colors.foreground }}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.syncBtn, { marginTop: 20, backgroundColor: colors.primary }]}
                      onPress={async () => {
                        if (!expDesc.trim() || !expAmount || !employee) return;
                        await addExpense.mutateAsync({
                          jobId: selectedJob.id,
                          categoryId: expCategoryId || undefined,
                          description: expDesc.trim(),
                          amount: expAmount,
                          expenseDate: new Date().toISOString(),
                          submittedBy: employee.id,
                        });
                      }}
                      disabled={addExpense.isPending}
                    >
                      {addExpense.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Add Expense</Text>}
                    </TouchableOpacity>
                  </ScrollView>
                </KeyboardAvoidingView>
              </Modal>
            )}

            {/* Add Budget Category Modal — management only */}
            {canManage && (
              <Modal visible={showAddBudget} animationType="slide" presentationStyle="formSheet">
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Add Budget Category</Text>
                    <TouchableOpacity onPress={() => { setShowAddBudget(false); setBudgetName(""); setBudgetAmount(""); }}>
                      <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ padding: 20 }}>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Category Name *</Text>
                    <TextInput style={styles.input} placeholder="e.g. Labor" placeholderTextColor={colors.muted} value={budgetName} onChangeText={setBudgetName} />
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Budgeted Amount ($) *</Text>
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.muted} value={budgetAmount} onChangeText={setBudgetAmount} keyboardType="decimal-pad" />
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>Quick select:</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                      {DEFAULT_BUDGET_CATEGORIES.map((c) => (
                        <TouchableOpacity key={c} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: budgetName === c ? colors.primary + "20" : colors.surface, borderWidth: 1, borderColor: budgetName === c ? colors.primary : colors.border }} onPress={() => setBudgetName(c)}>
                          <Text style={{ fontSize: 13, color: budgetName === c ? colors.primary : colors.foreground }}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.syncBtn, { backgroundColor: colors.primary }]}
                      onPress={async () => {
                        if (!budgetName.trim() || !budgetAmount) return;
                        await addBudgetCat.mutateAsync({ jobId: selectedJob.id, name: budgetName.trim(), budgetedAmount: budgetAmount });
                      }}
                      disabled={addBudgetCat.isPending}
                    >
                      {addBudgetCat.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Add Category</Text>}
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              </Modal>
            )}
          </View>
        )}
      </Modal>

      {/* New Job Modal — management only */}
      {canManage && (
        <Modal visible={showNewJob} animationType="slide" presentationStyle="formSheet">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Job</Text>
              <TouchableOpacity onPress={() => { setShowNewJob(false); resetJobForm(); }}>
                <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Job Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Smith Residence Remodel" placeholderTextColor={colors.muted} value={jobName} onChangeText={setJobName} />
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Address</Text>
              <TextInput style={styles.input} placeholder="123 Main St, City, State" placeholderTextColor={colors.muted} value={jobAddress} onChangeText={setJobAddress} />
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Client Name</Text>
              <TextInput style={styles.input} placeholder="Client name" placeholderTextColor={colors.muted} value={jobClient} onChangeText={setJobClient} />
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Total Budget ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.muted} value={jobBudget} onChangeText={setJobBudget} keyboardType="decimal-pad" />
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Notes</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} placeholder="Any notes about this job..." placeholderTextColor={colors.muted} value={jobNotes} onChangeText={setJobNotes} multiline />
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 }}
                onPress={handleCreateJob}
                disabled={createJob.isPending || !jobName.trim()}
              >
                {createJob.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Create Job</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </ScreenContainer>
  );
}
