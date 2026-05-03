import {
   ScreenContainer } from "@/components/screen-container";
import { JobCard } from "@/components/ui/job-card";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Linking from "expo-linking";
import { getApiBaseUrl } from "@/constants/oauth";
import { useState, useCallback, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
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
  View, ImageBackground } from "react-native";

import { BG_JOBS as bg_jobs } from "@/constants/bg-urls";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { useOfflineMutation } from "@/hooks/use-offline-mutation";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled" };

const DEFAULT_BUDGET_CATEGORIES = [
  "Labor",
  "Materials",
  "Equipment",
  "Subcontractors",
  "Permits & Fees",
  "Miscellaneous",
];

export default function JobsScreen({ embedded }: { embedded?: boolean } = {}) {
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

  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "budget" | "reports" | "photos">("overview");
  const [showNewJob, setShowNewJob] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingCompletionPdf, setGeneratingCompletionPdf] = useState(false);

  // Budget report config
  const [showBudgetReportConfig, setShowBudgetReportConfig] = useState(false);
  const [budgetDateRange, setBudgetDateRange] = useState<"all" | "1pay" | "2pay" | "month" | "custom">("all");
  const [budgetCustomStart, setBudgetCustomStart] = useState("");
  const [budgetCustomEnd, setBudgetCustomEnd] = useState("");
  const [budgetBillingRate, setBudgetBillingRate] = useState<number | null>(null);
  const [budgetCustomRate, setBudgetCustomRate] = useState("");

  // New job form
  const [jobName, setJobName] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobClient, setJobClient] = useState("");
  const [jobBudget, setJobBudget] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [jobTaxRate, setJobTaxRate] = useState("");
  const [jobWorkersComp, setJobWorkersComp] = useState("");
  const [jobLiabilityIns, setJobLiabilityIns] = useState("");
  const [jobBillingType, setJobBillingType] = useState<"fixed" | "hourly">("fixed");
  const [jobHourlyRate, setJobHourlyRate] = useState("55");
  const [jobCrewIds, setJobCrewIds] = useState<number[]>([]);

  // Expense form
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCategoryId, setExpCategoryId] = useState<number | null>(null);

  // Budget category form
  const [budgetName, setBudgetName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  // Inline budget editing
  const [editingBudget, setEditingBudget] = useState(false);
  const [editBudgetValue, setEditBudgetValue] = useState("");

  // Change orders
  const [showAddCO, setShowAddCO] = useState(false);
  const [coDesc, setCoDesc] = useState("");
  const [coAmount, setCoAmount] = useState("");
  const [coType, setCoType] = useState<"add" | "deduct">("add");
  const [coNotes, setCoNotes] = useState("");

  // Budget audit log
  const [showAuditLog, setShowAuditLog] = useState(false);

  // RBAC role helpers
  const role = employee?.role ?? "laborer";
  const canManage = role === "owner" || role === "office_manager" || role === "logistics";
  const canSeeBudget = role === "owner" || role === "office_manager";
  const canUpdateStatus = canManage || role === "foreman";

  const { data: allJobs, isLoading, isError: jobsError } = trpc.jobs.list.useQuery(undefined, { staleTime: 15000, refetchOnMount: "always" });

  // Offline caching for jobs
  const [cachedJobs, setCachedJobs] = useState<any[] | null>(null);
  useEffect(() => {
    getCached<any[]>(CACHE_KEYS.ALL_JOBS).then((d) => { if (d) setCachedJobs(d); });
  }, []);
  useEffect(() => {
    if (allJobs && allJobs.length > 0) {
      setCache(CACHE_KEYS.ALL_JOBS, allJobs).catch(() => {});
      setCachedJobs(allJobs);
    }
  }, [allJobs]);
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
  const { data: laborCost } = trpc.clock.laborCostForJob.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob && canSeeBudget }
  );
  const { data: changeOrdersList } = trpc.changeOrders.list.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob && canSeeBudget }
  );
  const { data: coTotalAmt } = trpc.changeOrders.total.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob && canSeeBudget }
  );
  const { data: jobScheduleItems } = trpc.schedule.getByJob.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob, staleTime: 15000, refetchOnMount: "always" }
  );
  const { data: auditLogEntries } = trpc.financialCharts.auditLog.useQuery(
    { jobId: selectedJob?.id || 0 },
    { enabled: !!selectedJob && canSeeBudget && showAuditLog }
  );

  const { data: allEmployeesForCrew } = trpc.employees.list.useQuery(undefined, { staleTime: 30_000 });
  const activeEmployeesForCrew = (allEmployeesForCrew || []).filter((e: any) => e.isActive);
  const createJob = trpc.jobs.create.useMutation({ onSuccess: () => { utils.jobs.list.invalidate(); utils.jobs.listActive.invalidate(); setShowNewJob(false); resetJobForm(); } });
  const updateJob = trpc.jobs.update.useMutation({ onSuccess: () => { utils.jobs.list.invalidate(); utils.jobs.listActive.invalidate(); } });
  const addExpense = trpc.budget.addExpense.useMutation({ onSuccess: () => { utils.budget.getExpenses.invalidate(); utils.budget.getCategories.invalidate(); setShowAddExpense(false); resetExpForm(); } });
  const addBudgetCat = trpc.budget.createCategory.useMutation({ onSuccess: () => { utils.budget.getCategories.invalidate(); setShowAddBudget(false); setBudgetName(""); setBudgetAmount(""); } });
  const createAuditEntry = trpc.financialCharts.createAuditEntry.useMutation({ onSuccess: () => { utils.financialCharts.auditLog.invalidate(); } });
  const createCO = trpc.changeOrders.create.useMutation({ onSuccess: () => {
    utils.changeOrders.list.invalidate(); utils.changeOrders.total.invalidate(); setShowAddCO(false); setCoDesc(""); setCoAmount(""); setCoType("add"); setCoNotes("");
  } });
  const deleteCO = trpc.changeOrders.delete.useMutation({ onSuccess: () => { utils.changeOrders.list.invalidate(); utils.changeOrders.total.invalidate(); } });
  // ─── Offline-aware mutation wrappers ───
  const offlineUpdateJob = useOfflineMutation("jobs.update", updateJob, { silent: true });
  const offlineAddExpense = useOfflineMutation("budget.addExpense", addExpense, { offlineMessage: "Expense will be added when back online." });
  const offlineCreateAuditEntry = useOfflineMutation("budgetAuditLog.create", createAuditEntry, { silent: true });
  const offlineCreateCO = useOfflineMutation("changeOrders.create", createCO, { offlineMessage: "Change order will be created when back online." });
  const offlineDeleteCO = useOfflineMutation("changeOrders.delete", deleteCO, { silent: true });

  const resetJobForm = () => { setJobName(""); setJobAddress(""); setJobClient(""); setJobBudget(""); setJobNotes(""); setJobTaxRate(""); setJobWorkersComp(""); setJobLiabilityIns(""); setJobBillingType("fixed"); setJobHourlyRate("55"); setJobCrewIds([]); };
  const resetExpForm = () => { setExpDesc(""); setExpAmount(""); setExpCategoryId(null); };

  const effectiveJobs = allJobs || cachedJobs || [];
  const filteredJobs = effectiveJobs.filter((j: any) => {
    if (filter === "active") return j.status === "active";
    if (filter === "completed") return j.status === "completed" || j.status === "cancelled";
    return true;
  });

  // Budget figures (includes approved change orders)
  const baseBudget = canSeeBudget ? parseFloat(selectedJob?.totalBudget || "0") : 0;
  const changeOrderAdj = canSeeBudget ? (typeof coTotalAmt === "number" ? coTotalAmt : 0) : 0;
  const totalBudget = baseBudget + changeOrderAdj;
  const expenseSpent = canSeeBudget ? (expenses || []).reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0) : 0;
  const laborSpent = canSeeBudget ? (laborCost?.totalCost || 0) : 0;
  const laborMinutes = laborCost?.totalMinutes || 0;
  const laborHours = laborCost ? (laborCost.totalMinutes / 60) : 0;
  const laborHoursDecimal = laborHours.toFixed(2);
  const laborH = Math.floor(laborMinutes / 60);
  const laborM = Math.round(laborMinutes % 60);
  const laborHoursDetailed = `${laborH}h ${laborM}m`;
  const totalSpent = expenseSpent + laborSpent;
  const budgetPct = totalBudget > 0 ? Math.min(totalSpent / totalBudget, 1) : 0;
  const budgetPctRaw = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const budgetBarColor = budgetPct < 0.6 ? colors.success : budgetPct < 0.85 ? colors.warning : colors.error;
  const budgetAlertLevel = budgetPctRaw >= 100 ? "critical" : budgetPctRaw >= 90 ? "danger" : budgetPctRaw >= 80 ? "warning" : "ok";
  const budgetAlertMessages: Record<string, string> = {
    warning: "This job has used 80%+ of its budget. Review spending.",
    danger: "This job has used 90%+ of its budget. Immediate attention needed.",
    critical: "This job has exceeded its budget!",
    ok: "" };
  const budgetAlertColors: Record<string, { bg: string; border: string; text: string }> = {
    warning: { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" },
    danger: { bg: "#FFF1F0", border: "#F97316", text: "#9A3412" },
    critical: { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B" },
    ok: { bg: colors.surface, border: colors.border, text: colors.foreground } };

  const reportCount = (jobReports || []).length;
  const photoCount = (jobPhotos || []).length;

  const handleCreateJob = async () => {
    if (!jobName.trim() || !employee) return;
    try {
      await createJob.mutateAsync({
        name: jobName.trim(),
        address: jobAddress || undefined,
        clientName: jobClient || undefined,
        billingType: jobBillingType,
        totalBudget: jobBillingType === "fixed" ? (jobBudget || undefined) : undefined,
        hourlyRate: jobBillingType === "hourly" ? jobHourlyRate : undefined,
        notes: jobNotes || undefined,
        taxRate: jobTaxRate || undefined,
        workersCompRate: jobWorkersComp || undefined,
        liabilityInsRate: jobLiabilityIns || undefined,
        assignedCrew: jobCrewIds.length > 0 ? JSON.stringify(jobCrewIds) : undefined,
        createdBy: employee.id });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not create job. Please try again.");
    }
  };

  // Generate Job Completion PDF (server-side, comprehensive)
  const handleGenerateCompletionPdf = async () => {
    if (!selectedJob) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGeneratingCompletionPdf(true);
    try {
      const apiBase = getApiBaseUrl();
      const url = `${apiBase}/api/job-completion-pdf?jobId=${selectedJob.id}&companyId=${(employee as any)?.companyId || ""}`;
      const { downloadAuthenticatedPDF } = await import("@/lib/download-pdf");
      await downloadAuthenticatedPDF(url, `job_completion_${selectedJob.id}.pdf`);
    } catch (err: any) {
      Alert.alert("Error", `Failed to download PDF: ${err?.message || "Unknown error"}`);
    } finally {
      setGeneratingCompletionPdf(false);
    }
  };

  // Compute date range for budget report
  const getBudgetDateParams = () => {
    const now = new Date();
    let startDate = "";
    let endDate = "";
    if (budgetDateRange === "all") {
      // All time — no date filter
      startDate = "";
      endDate = "";
    } else if (budgetDateRange === "1pay") {
      // Last 2 weeks
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 14);
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
    } else if (budgetDateRange === "2pay") {
      // Last 4 weeks
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 28);
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
    } else if (budgetDateRange === "month") {
      // Current month
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      endDate = now.toISOString().slice(0, 10);
    } else if (budgetDateRange === "custom") {
      startDate = budgetCustomStart;
      endDate = budgetCustomEnd;
    }
    return { startDate, endDate };
  };

  // Generate PDF Budget Report — uses server-side PDFKit for detailed report with logo
  const handleGenerateBudgetPdf = async () => {
    if (!selectedJob) return;
    const { startDate, endDate } = getBudgetDateParams();
    if (budgetDateRange === "custom" && (!startDate || !endDate)) {
      Alert.alert("Date Required", "Please enter both start and end dates for custom range.");
      return;
    }
    const effectiveRate = budgetBillingRate === -1 ? (parseInt(budgetCustomRate) || 0) : budgetBillingRate;
    setGeneratingPdf(true);
    try {
      const apiBase = getApiBaseUrl();
      let pdfUrl = `${apiBase}/api/budget-report-pdf?jobId=${selectedJob.id}&companyId=${(employee as any)?.companyId || ""}`;
      if (startDate) pdfUrl += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) pdfUrl += `&endDate=${encodeURIComponent(endDate)}`;
      if (effectiveRate && effectiveRate > 0) pdfUrl += `&billingRate=${effectiveRate}`;
      const { downloadAuthenticatedPDF } = await import("@/lib/download-pdf");
      await downloadAuthenticatedPDF(pdfUrl, `budget_report_job${selectedJob.id}.pdf`);
    } catch (err: any) {
      Alert.alert("Error", `Could not generate PDF report: ${err?.message || "Please try again."}`);
    } finally {
      setGeneratingPdf(false);
      setShowBudgetReportConfig(false);
    }
  };

  // Generate PDF Field Reports Summary
  const handleGenerateReportsPdf = async () => {
    if (!selectedJob) return;
    setGeneratingPdf(true);
    try {
      const apiBase = getApiBaseUrl();
      const pdfUrl = `${apiBase}/api/field-reports-pdf?jobId=${selectedJob.id}&companyId=${(employee as any)?.companyId || ""}`;
      const { downloadAuthenticatedPDF } = await import("@/lib/download-pdf");
      await downloadAuthenticatedPDF(pdfUrl, `field_reports_job${selectedJob.id}.pdf`);
    } catch (err: any) {
      Alert.alert("Error", `Could not generate PDF report: ${err?.message || "Please try again."}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Tabs available depend on role
  const availableTabs = canSeeBudget
    ? (["overview", "budget", "reports", "photos"] as const)
    : (["overview", "reports", "photos"] as const);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    filterRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
    filterText: { fontSize: 13, fontWeight: "600" },
    addBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
    tabText: { fontSize: 13, fontWeight: "600" },
    section: { padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.background, marginBottom: 10 },
    kpiCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    kpiValue: { fontSize: 22, fontWeight: "800", color: colors.foreground },
    kpiLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
    expenseRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    pdfCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, margin: 20, borderWidth: 1, borderColor: colors.border },
    pdfBtn: { backgroundColor: "#D4A843", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 12 },
    catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border } });

    const JWrapper = embedded ? View : ScreenContainer;
    return (
    <JWrapper style={embedded ? { flex: 1 } : undefined} edges={embedded ? undefined : ["top", "left", "right"]}>
        <ImageBackground source={bg_jobs} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.08 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
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

      {isLoading && !cachedJobs ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          renderItem={({ item }) => (
            <JobCard job={item} spentAmount={item.spentAmount || 0} laborHours={item.laborHours || 0} onPress={() => { setSelectedJob(item); setActiveTab("overview"); }} hideBudget={!canSeeBudget} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <MaterialIcons name="business" size={40} color={colors.muted} style={{ marginBottom: 12 }} />
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

            {/* Tabs */}
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
                          {selectedJob.status === "active" ? "●" : selectedJob.status === "paused" ? "●" : "●"}
                        </Text>
                        <Text style={styles.kpiLabel}>{STATUS_LABELS[selectedJob.status]}</Text>
                      </View>
                    )}
                  </View>

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
                    { label: "Client", value: selectedJob.clientName },
                    ...(canSeeBudget ? [
                      { label: "Client Phone", value: selectedJob.clientPhone },
                      { label: "Billing", value: selectedJob.billingType === "hourly" ? `Hourly @ $${selectedJob.hourlyRate || "55"}/hr` : "Fixed Budget" },
                      ...(selectedJob.billingType !== "hourly" ? [{ label: "Total Budget", value: totalBudget > 0 ? `$${totalBudget.toLocaleString()}${changeOrderAdj !== 0 ? " (incl. COs)" : ""}` : (selectedJob.totalBudget ? `$${parseFloat(selectedJob.totalBudget).toLocaleString()}` : null) }] : []),
                    ] : []),
                    { label: "Notes", value: selectedJob.notes },
                  ].filter((r) => r.value).map((row) => (
                    <View key={row.label} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 14, color: colors.muted, width: 110 }}>{row.label}</Text>
                      <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{row.value}</Text>
                    </View>
                  ))}

                  {/* Hourly Revenue Card — for hourly jobs only */}
                  {selectedJob.billingType === "hourly" && canSeeBudget && (
                    <View style={{ marginTop: 16, backgroundColor: "#D4A843" + "15", borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: "#D4A843" + "40" }}>
                      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Hourly Revenue</Text>
                      <Text style={{ fontSize: 28, fontWeight: "800", color: "#D4A843" }}>
                        ${(laborHours * parseFloat(selectedJob.hourlyRate || "55")).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                       {laborHoursDetailed} ({laborHoursDecimal} hrs) × ${selectedJob.hourlyRate || "55"}/hr per person
                     </Text>
                    </View>
                  )}

                  {/* Editable Billing Type & Rate — management only, for existing jobs */}
                  {canManage && (
                    <View style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>Billing Settings</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        {(["fixed", "hourly"] as const).map((bt) => (
                          <TouchableOpacity
                            key={bt}
                            style={{
                              flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 2,
                              borderColor: selectedJob.billingType === bt ? colors.primary : colors.border,
                              backgroundColor: selectedJob.billingType === bt ? colors.primary + "15" : "transparent",
                              alignItems: "center",
                            }}
                            onPress={() => {
                              offlineUpdateJob.mutate({ id: selectedJob.id, billingType: bt });
                              setSelectedJob({ ...selectedJob, billingType: bt });
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "700", color: selectedJob.billingType === bt ? colors.primary : colors.muted }}>
                              {bt === "fixed" ? "Fixed" : "Hourly"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {selectedJob.billingType === "hourly" && (
                        <View>
                          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Rate per person/hour</Text>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {["45", "50", "55", "60"].map((rate) => (
                              <TouchableOpacity
                                key={rate}
                                style={{
                                  flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 2,
                                  borderColor: (selectedJob.hourlyRate || "55") === rate ? colors.primary : colors.border,
                                  backgroundColor: (selectedJob.hourlyRate || "55") === rate ? colors.primary + "15" : "transparent",
                                  alignItems: "center",
                                }}
                                onPress={() => {
                                  offlineUpdateJob.mutate({ id: selectedJob.id, hourlyRate: rate });
                                  setSelectedJob({ ...selectedJob, hourlyRate: rate });
                                }}
                              >
                                <Text style={{ fontSize: 14, fontWeight: "800", color: (selectedJob.hourlyRate || "55") === rate ? colors.primary : colors.foreground }}>${rate}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Editable Overhead Rates — management only */}
                  {canManage && (
                    <View style={{ marginTop: 20, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>Overhead Rates (%)</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>These rates are applied to labor costs for this job.</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Tax</Text>
                          <TextInput
                            style={[styles.input, { marginBottom: 0 }]}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            defaultValue={selectedJob.taxRate || "0"}
                            onEndEditing={(e) => {
                              const val = e.nativeEvent.text;
                              offlineUpdateJob.mutate({ id: selectedJob.id, taxRate: val });
                              setSelectedJob({ ...selectedJob, taxRate: val });
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Workers Comp</Text>
                          <TextInput
                            style={[styles.input, { marginBottom: 0 }]}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            defaultValue={selectedJob.workersCompRate || "0"}
                            onEndEditing={(e) => {
                              const val = e.nativeEvent.text;
                              offlineUpdateJob.mutate({ id: selectedJob.id, workersCompRate: val });
                              setSelectedJob({ ...selectedJob, workersCompRate: val });
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Liability Ins</Text>
                          <TextInput
                            style={[styles.input, { marginBottom: 0 }]}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            defaultValue={selectedJob.liabilityInsRate || "0"}
                            onEndEditing={(e) => {
                              const val = e.nativeEvent.text;
                              offlineUpdateJob.mutate({ id: selectedJob.id, liabilityInsRate: val });
                              setSelectedJob({ ...selectedJob, liabilityInsRate: val });
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  )}

                  {canUpdateStatus && (
                    <View style={{ marginTop: 20, gap: 10 }}>
                      <Text style={styles.sectionTitle}>Update Status</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {(["active", "paused", "completed", "cancelled"] as const).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: selectedJob.status === s ? colors.primary : colors.border, backgroundColor: selectedJob.status === s ? colors.primary + "15" : colors.surface }}
                            onPress={() => {
                              offlineUpdateJob.mutate({ id: selectedJob.id, status: s });
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

              {/* Budget Tab — management only */}
              {activeTab === "budget" && canSeeBudget && (
                <View style={styles.section}>
                  {/* For hourly jobs: show revenue overview instead of budget progress */}
                  {selectedJob.billingType === "hourly" ? (
                    <View style={{ backgroundColor: "#D4A843" + "10", borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: "#D4A843" + "30", marginBottom: 20 }}>
                      <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }}>Hourly Revenue</Text>
                      <Text style={{ fontSize: 32, fontWeight: "800", color: "#D4A843", marginBottom: 6 }}>
                        ${(laborHours * parseFloat(selectedJob.hourlyRate || "55")).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </Text>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                         <Text style={{ fontSize: 13, color: colors.muted }}>{laborHoursDetailed} ({laborHoursDecimal} hrs)</Text>
                        <Text style={{ fontSize: 13, color: colors.muted }}>@ ${selectedJob.hourlyRate || "55"}/hr per person</Text>
                      </View>
                      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "#D4A843" + "30", paddingTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                        <View>
                          <Text style={{ fontSize: 12, color: colors.muted }}>Labor Cost</Text>
                          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>${laborSpent.toLocaleString()}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 12, color: colors.muted }}>Gross Margin</Text>
                          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.success }}>
                            ${Math.max(0, (laborHours * parseFloat(selectedJob.hourlyRate || "55")) - laborSpent).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* Budget Alert Banner */}
                      {budgetAlertLevel !== "ok" && totalBudget > 0 && (
                        <View style={{ backgroundColor: budgetAlertColors[budgetAlertLevel].bg, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: budgetAlertColors[budgetAlertLevel].border, marginBottom: 14 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                            <Text style={{ fontSize: 16, marginRight: 8 }}>{budgetAlertLevel === "critical" ? "\u26A0\uFE0F" : budgetAlertLevel === "danger" ? "\u26A0\uFE0F" : "\u26A0\uFE0F"}</Text>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: budgetAlertColors[budgetAlertLevel].text }}>
                              {budgetAlertLevel === "critical" ? "OVER BUDGET" : budgetAlertLevel === "danger" ? "BUDGET DANGER" : "BUDGET WARNING"}
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: budgetAlertColors[budgetAlertLevel].border, marginLeft: "auto" }}>
                              {Math.round(budgetPctRaw)}%
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: budgetAlertColors[budgetAlertLevel].text, marginLeft: 24 }}>
                            {budgetAlertMessages[budgetAlertLevel]}
                          </Text>
                        </View>
                      )}

                      {/* Budget Overview — Tap to Edit */}
                      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <Text style={{ fontSize: 14, color: colors.muted }}>Effective Budget</Text>
                          {canSeeBudget && (
                            <TouchableOpacity
                              onPress={() => { setEditingBudget(true); setEditBudgetValue(String(baseBudget)); }}
                              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + "15" }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Edit Base</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground, marginBottom: 2 }}>
                          ${totalBudget.toLocaleString()}
                        </Text>
                        {changeOrderAdj !== 0 && (
                          <Text style={{ fontSize: 12, color: changeOrderAdj > 0 ? colors.success : colors.error, marginBottom: 6 }}>
                            Base ${baseBudget.toLocaleString()} {changeOrderAdj > 0 ? "+" : ""}{changeOrderAdj.toLocaleString()} in change orders
                          </Text>
                        )}
                        {editingBudget && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 }}>
                            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>$</Text>
                            <TextInput
                              style={{ flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18, fontWeight: "700", color: colors.foreground }}
                              value={editBudgetValue}
                              onChangeText={setEditBudgetValue}
                              keyboardType="decimal-pad"
                              autoFocus
                              returnKeyType="done"
                              placeholder="Enter new budget"
                              placeholderTextColor={colors.muted}
                            />
                            <TouchableOpacity
                              onPress={() => {
                                const val = editBudgetValue.replace(/[^0-9.]/g, "");
                                if (val && parseFloat(val) > 0) {
                                  const oldBudget = parseFloat(selectedJob.totalBudget || "0");
                                  offlineUpdateJob.mutate({ id: selectedJob.id, totalBudget: val });
                                  offlineCreateAuditEntry.mutate({
                                    jobId: selectedJob.id,
                                    employeeId: employee?.id || 0,
                                    action: "budget_edit",
                                    previousValue: String(oldBudget),
                                    newValue: val,
                                    description: `Base budget changed from $${oldBudget.toLocaleString()} to $${parseFloat(val).toLocaleString()}`,
                                  });
                                  setSelectedJob({ ...selectedJob, totalBudget: val });
                                  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                }
                                setEditingBudget(false);
                              }}
                              style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
                            >
                              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Save</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditingBudget(false)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                              <Text style={{ fontSize: 14, color: colors.muted }}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                          <View style={{ height: "100%", width: `${budgetPct * 100}%`, backgroundColor: budgetBarColor, borderRadius: 4 }} />
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 13, color: colors.muted }}>Spent: ${totalSpent.toLocaleString()}</Text>
                          <Text style={{ fontSize: 13, color: colors.muted }}>Remaining: ${Math.max(0, totalBudget - totalSpent).toLocaleString()}</Text>
                        </View>
                      </View>

                      {/* Change Orders Section */}
                      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Change Orders</Text>
                          <TouchableOpacity
                            onPress={() => setShowAddCO(true)}
                            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#D4A843" + "20" }}
                          >
                            <Text style={{ fontSize: 18, color: "#D4A843", marginRight: 4 }}>+</Text>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: "#D4A843" }}>Add CO</Text>
                          </TouchableOpacity>
                        </View>

                        {showAddCO && (
                          <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#D4A843" + "40", marginBottom: 12 }}>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>New Change Order</Text>
                            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                              {(["add", "deduct"] as const).map((t) => (
                                <TouchableOpacity
                                  key={t}
                                  onPress={() => setCoType(t)}
                                  style={{
                                    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 2, alignItems: "center",
                                    borderColor: coType === t ? (t === "add" ? colors.success : colors.error) : colors.border,
                                    backgroundColor: coType === t ? (t === "add" ? colors.success + "15" : colors.error + "15") : "transparent",
                                  }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: "700", color: coType === t ? (t === "add" ? colors.success : colors.error) : colors.muted }}>
                                    {t === "add" ? "+ Addition" : "- Deduction"}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <TextInput
                              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, marginBottom: 8 }}
                              placeholder="Description (e.g. Added 2nd floor framing)"
                              placeholderTextColor={colors.muted}
                              value={coDesc}
                              onChangeText={setCoDesc}
                            />
                            <TextInput
                              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, marginBottom: 8 }}
                              placeholder="Amount ($)"
                              placeholderTextColor={colors.muted}
                              keyboardType="decimal-pad"
                              value={coAmount}
                              onChangeText={setCoAmount}
                            />
                            <TextInput
                              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, marginBottom: 12 }}
                              placeholder="Notes (optional)"
                              placeholderTextColor={colors.muted}
                              value={coNotes}
                              onChangeText={setCoNotes}
                            />
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              <TouchableOpacity
                                onPress={() => {
                                  if (!coDesc.trim() || !coAmount.trim()) { Alert.alert("Required", "Description and amount are required."); return; }
                                  const coAmtClean = coAmount.replace(/[^0-9.]/g, "");
                                  offlineCreateCO.mutate({
                                    jobId: selectedJob.id,
                                    description: coDesc.trim(),
                                    amount: coAmtClean,
                                    orderType: coType,
                                    createdBy: employee?.id || 0,
                                    notes: coNotes.trim() || undefined,
                                  });
                                  offlineCreateAuditEntry.mutate({
                                    jobId: selectedJob.id,
                                    employeeId: employee?.id || 0,
                                    action: coType === "add" ? "change_order_add" : "change_order_deduct",
                                    newValue: coAmtClean,
                                    description: `Change order ${coType === "add" ? "addition" : "deduction"}: ${coDesc.trim()} — $${parseFloat(coAmtClean).toLocaleString()}`,
                                  });
                                  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                }}
                                style={{ flex: 1, backgroundColor: "#D4A843", paddingVertical: 12, borderRadius: 8, alignItems: "center" }}
                              >
                                <Text style={{ fontSize: 14, fontWeight: "700", color: "#000" }}>{createCO.isPending ? "Saving..." : "Save Change Order"}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => { setShowAddCO(false); setCoDesc(""); setCoAmount(""); setCoType("add"); setCoNotes(""); }}
                                style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                              >
                                <Text style={{ fontSize: 14, color: colors.muted }}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {(!changeOrdersList || changeOrdersList.length === 0) && !showAddCO && (
                          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 }}>No change orders yet. Tap "+ Add CO" to create one.</Text>
                        )}

                        {(changeOrdersList || []).map((co: any) => (
                          <View key={co.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: co.orderType === "add" ? colors.success + "20" : colors.error + "20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                              <Text style={{ fontSize: 16, fontWeight: "800", color: co.orderType === "add" ? colors.success : colors.error }}>{co.orderType === "add" ? "+" : "-"}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{co.description}</Text>
                              <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(co.orderDate).toLocaleDateString()}{co.notes ? " — " + co.notes : ""}</Text>
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: co.orderType === "add" ? colors.success : colors.error, marginRight: 8 }}>
                              {co.orderType === "add" ? "+" : "-"}${parseFloat(co.amount || "0").toLocaleString()}
                            </Text>
                            {canSeeBudget && (
                              <TouchableOpacity
                                onPress={() => {
                                  Alert.alert("Delete Change Order", `Remove "${co.description}"?`, [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Delete", style: "destructive", onPress: () => {
                                      offlineDeleteCO.mutate({ id: co.id, requestingId: employee?.id || 0 });
                                      offlineCreateAuditEntry.mutate({
                                        jobId: selectedJob.id,
                                        employeeId: employee?.id || 0,
                                        action: "change_order_deleted",
                                        previousValue: co.amount,
                                        description: `Change order deleted: ${co.description} — $${parseFloat(co.amount).toLocaleString()}`,
                                      });
                                    } },
                                  ]);
                                }}
                                style={{ padding: 4 }}
                              >
                                <Text style={{ fontSize: 16, color: colors.error }}>X</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}

                        {(changeOrdersList && changeOrdersList.length > 0) && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Net Change Orders</Text>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: changeOrderAdj >= 0 ? colors.success : colors.error }}>
                              {changeOrderAdj >= 0 ? "+" : ""}${changeOrderAdj.toLocaleString()}
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                  {/* Labor Cost */}
                  <View style={{ backgroundColor: colors.primary + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.primary + "30", marginBottom: 20 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View>
                        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>Base Labor</Text>
                        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>${laborSpent.toLocaleString()}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>Hours Logged</Text>
                         <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>{laborHoursDetailed}</Text>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{laborHoursDecimal} decimal hrs</Text>
                      </View>
                    </View>
                    {/* Overhead breakdown */}
                    {(() => {
                      const taxR = parseFloat(selectedJob?.taxRate || "0");
                      const wcR = parseFloat(selectedJob?.workersCompRate || "0");
                      const liR = parseFloat(selectedJob?.liabilityInsRate || "0");
                      const taxAmt = Math.round(laborSpent * (taxR / 100) * 100) / 100;
                      const wcAmt = Math.round(laborSpent * (wcR / 100) * 100) / 100;
                      const liAmt = Math.round(laborSpent * (liR / 100) * 100) / 100;
                      const totalOverhead = taxAmt + wcAmt + liAmt;
                      const totalLabor = laborSpent + totalOverhead;
                      const hasRates = taxR > 0 || wcR > 0 || liR > 0;
                      if (!hasRates) return <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Set tax/workers comp/insurance rates in job settings to see full cost breakdown</Text>;
                      return (
                        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.primary + "30", paddingTop: 10 }}>
                          {taxR > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: colors.muted }}>Payroll Tax ({taxR}%)</Text>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>${taxAmt.toLocaleString()}</Text>
                            </View>
                          )}
                          {wcR > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: colors.muted }}>Workers Comp ({wcR}%)</Text>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>${wcAmt.toLocaleString()}</Text>
                            </View>
                          )}
                          {liR > 0 && (
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: colors.muted }}>Liability Ins ({liR}%)</Text>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>${liAmt.toLocaleString()}</Text>
                            </View>
                          )}
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, borderTopWidth: 1, borderTopColor: colors.primary + "30", paddingTop: 6 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Total Labor Cost</Text>
                            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>${totalLabor.toLocaleString()}</Text>
                          </View>
                        </View>
                      );
                    })()}
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
                      </View>
                    </View>
                  ))}

                  {/* Budget Audit Log */}
                  <View style={{ marginTop: 20, marginBottom: 20 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setShowAuditLog(!showAuditLog);
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <MaterialIcons name="description" size={18} color={colors.foreground} />
                        <View>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Budget History</Text>
                          <Text style={{ fontSize: 12, color: colors.muted }}>Full audit trail of all budget changes</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 18, color: colors.muted }}>{showAuditLog ? "▲" : "▼"}</Text>
                    </TouchableOpacity>

                    {showAuditLog && (
                      <View style={{ marginTop: 8 }}>
                        {!auditLogEntries || auditLogEntries.length === 0 ? (
                          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 20, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                            <Text style={{ fontSize: 13, color: colors.muted }}>No budget changes recorded yet</Text>
                          </View>
                        ) : (
                          auditLogEntries.map((entry: any, idx: number) => {
                            const actionColors: Record<string, string> = {
                              budget_edit: colors.primary,
                              change_order_add: colors.success,
                              change_order_deduct: colors.warning,
                              change_order_deleted: colors.error,
                            };
                            const actionIcons: Record<string, string> = {
                              budget_edit: "Edit",
                              change_order_add: "+",
                              change_order_deduct: "−",
                              change_order_deleted: "Del",
                            };
                            const accentColor = actionColors[entry.action] || colors.muted;
                            return (
                              <View
                                key={entry.id || idx}
                                style={{
                                  flexDirection: "row",
                                  backgroundColor: colors.surface,
                                  borderRadius: 10,
                                  padding: 12,
                                  marginBottom: 6,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderLeftWidth: 3,
                                  borderLeftColor: accentColor,
                                }}
                              >
                                <Text style={{ fontSize: 16, marginRight: 10, marginTop: 2 }}>{actionIcons[entry.action] || "→"}</Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{entry.description || entry.action}</Text>
                                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                                    {entry.previousValue && (
                                      <Text style={{ fontSize: 11, color: colors.muted }}>From: ${parseFloat(entry.previousValue).toLocaleString()}</Text>
                                    )}
                                    {entry.newValue && (
                                      <Text style={{ fontSize: 11, color: accentColor, fontWeight: "600" }}>To: ${parseFloat(entry.newValue).toLocaleString()}</Text>
                                    )}
                                  </View>
                                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                                    <Text style={{ fontSize: 11, color: colors.muted }}>{entry.employeeName || "System"}</Text>
                                    <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(entry.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>

                  {/* Generate PDF Report */}
                  <View style={styles.pdfCard}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Export Reports</Text>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
                      Generate professional PDF reports to share with clients, accountants, or your team.
                    </Text>
                    <TouchableOpacity style={styles.pdfBtn} onPress={() => setShowBudgetReportConfig(true)} disabled={generatingPdf}>
                      {generatingPdf ? <ActivityIndicator color="#fff" /> : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <MaterialIcons name="date-range" size={18} color="#fff" />
                          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Budget Report PDF</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pdfBtn, { backgroundColor: colors.primary, marginTop: 8 }]} onPress={handleGenerateReportsPdf} disabled={generatingPdf}>
                      {generatingPdf ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Generate Field Reports PDF</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pdfBtn, { backgroundColor: "#22C55E", marginTop: 8 }]} onPress={handleGenerateCompletionPdf} disabled={generatingCompletionPdf}>
                      {generatingCompletionPdf ? <ActivityIndicator color="#fff" /> : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <MaterialIcons name="description" size={18} color="#fff" />
                          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Job Completion Report PDF</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6, textAlign: "center" }}>
                      Includes all reports, budgets, expenses, materials, safety meetings & change orders
                    </Text>
                  </View>
                </View>
              )}

              {/* Reports Tab */}
              {activeTab === "reports" && (
                <View style={styles.section}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <Text style={styles.sectionTitle}>{reportCount} Field Reports</Text>
                    <TouchableOpacity onPress={handleGenerateReportsPdf} disabled={generatingPdf} style={{ backgroundColor: "#D4A84320", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ color: "#D4A843", fontWeight: "700", fontSize: 13 }}>{generatingPdf ? "Generating…" : "Export PDF"}</Text>
                    </TouchableOpacity>
                  </View>
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
                  <Text style={styles.sectionTitle}>{photoCount} Site Photos</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {(jobPhotos || []).map((photo) => (
                      <View key={photo.id} style={{ width: "31%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", backgroundColor: colors.border }}>
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                          <MaterialIcons name="photo-camera" size={22} color={colors.foreground} />
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

            {/* Add Expense Modal */}
            {canManage && (
              <Modal visible={showAddExpense} animationType="slide" presentationStyle="formSheet">
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
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
                      style={[styles.pdfBtn, { marginTop: 20, backgroundColor: colors.primary }]}
                      onPress={async () => {
                        if (!expDesc.trim() || !expAmount || !employee) return;
                        await addExpense.mutateAsync({
                          jobId: selectedJob.id,
                          categoryId: expCategoryId || undefined,
                          description: expDesc.trim(),
                          amount: expAmount,
                          expenseDate: new Date().toISOString(),
                          submittedBy: employee.id });
                      }}
                      disabled={addExpense.isPending}
                    >
                      {addExpense.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Add Expense</Text>}
                    </TouchableOpacity>
                  </ScrollView>
                </KeyboardAvoidingView>
              </Modal>
            )}

            {/* Add Budget Category Modal */}
            {canManage && (
              <Modal visible={showAddBudget} animationType="slide" presentationStyle="formSheet">
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
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
                      style={[styles.pdfBtn, { backgroundColor: colors.primary }]}
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

      {/* New Job Modal */}
      {canManage && (
        <Modal visible={showNewJob} animationType="slide" presentationStyle="formSheet">
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === "android" ? 24 : 0} style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Job</Text>
              <TouchableOpacity onPress={() => { setShowNewJob(false); resetJobForm(); }}>
                <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Job Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Smith Residence Remodel" placeholderTextColor={colors.muted} value={jobName} onChangeText={setJobName} />
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Address</Text>
              <TextInput style={styles.input} placeholder="123 Main St, City, State" placeholderTextColor={colors.muted} value={jobAddress} onChangeText={setJobAddress} />
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Client Name</Text>
              <TextInput style={styles.input} placeholder="Client name" placeholderTextColor={colors.muted} value={jobClient} onChangeText={setJobClient} />

              {/* Billing Type Toggle */}
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Billing Type</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {(["fixed", "hourly"] as const).map((bt) => (
                  <TouchableOpacity
                    key={bt}
                    style={{
                      flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2,
                      borderColor: jobBillingType === bt ? colors.primary : colors.border,
                      backgroundColor: jobBillingType === bt ? colors.primary + "15" : colors.surface,
                      alignItems: "center",
                    }}
                    onPress={() => setJobBillingType(bt)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: jobBillingType === bt ? colors.primary : colors.muted }}>
                      {bt === "fixed" ? "Fixed Budget" : "Hourly"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {bt === "fixed" ? "Set total budget" : "Per-person per-hour"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Fixed Budget field — only shown for fixed billing */}
              {jobBillingType === "fixed" && (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Total Budget ($)</Text>
                  <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.muted} value={jobBudget} onChangeText={setJobBudget} keyboardType="decimal-pad" />
                </>
              )}

              {/* Hourly Rate selector — only shown for hourly billing */}
              {jobBillingType === "hourly" && (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Billing Rate (per person/hour)</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                    {["45", "50", "55", "60"].map((rate) => (
                      <TouchableOpacity
                        key={rate}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2,
                          borderColor: jobHourlyRate === rate ? colors.primary : colors.border,
                          backgroundColor: jobHourlyRate === rate ? colors.primary + "15" : colors.surface,
                          alignItems: "center",
                        }}
                        onPress={() => setJobHourlyRate(rate)}
                      >
                        <Text style={{ fontSize: 16, fontWeight: "800", color: jobHourlyRate === rate ? colors.primary : colors.foreground }}>${rate}</Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>/hr</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Notes</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} placeholder="Any notes about this job..." placeholderTextColor={colors.muted} value={jobNotes} onChangeText={setJobNotes} multiline />

              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>Overhead Rates (%)</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Applied to labor costs for this job. Leave blank or 0 if not applicable.</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Payroll Tax Rate (%)</Text>
                <TextInput style={styles.input} placeholder="e.g. 7.65" placeholderTextColor={colors.muted} value={jobTaxRate} onChangeText={setJobTaxRate} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Workers Comp Rate (%)</Text>
                <TextInput style={styles.input} placeholder="e.g. 12.5" placeholderTextColor={colors.muted} value={jobWorkersComp} onChangeText={setJobWorkersComp} keyboardType="decimal-pad" />
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Liability Insurance Rate (%)</Text>
                <TextInput style={styles.input} placeholder="e.g. 3.0" placeholderTextColor={colors.muted} value={jobLiabilityIns} onChangeText={setJobLiabilityIns} keyboardType="decimal-pad" />
              </View>

              {/* ─── Crew Selection ─── */}
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>Assign Crew</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Select employees for this job. Their hourly rates will be used to calculate daily labor cost and profit timeline.</Text>
                {activeEmployeesForCrew.length === 0 ? (
                  <Text style={{ fontSize: 13, color: colors.muted, fontStyle: "italic" }}>No active employees found.</Text>
                ) : (
                  activeEmployeesForCrew.map((emp: any) => {
                    const selected = jobCrewIds.includes(emp.id);
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: selected ? colors.primary + "18" : "transparent", marginBottom: 4 }}
                        onPress={() => {
                          if (selected) setJobCrewIds(prev => prev.filter(id => id !== emp.id));
                          else setJobCrewIds(prev => [...prev, emp.id]);
                        }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                          {selected && <MaterialIcons name="check" size={14} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                          <Text style={{ fontSize: 11, color: colors.muted }}>{emp.role} {emp.hourlyRate ? `• $${emp.hourlyRate}/hr` : ""}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
                {jobCrewIds.length > 0 && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
                      {jobCrewIds.length} selected • Daily labor: ${activeEmployeesForCrew.filter((e: any) => jobCrewIds.includes(e.id)).reduce((sum: number, e: any) => sum + (parseFloat(e.hourlyRate || "0") * 8), 0).toFixed(2)}/day (8hr)
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8, opacity: (!jobName.trim() || createJob.isPending) ? 0.5 : 1 }}
                onPress={handleCreateJob}
                disabled={createJob.isPending || !jobName.trim()}
              >
                {createJob.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Create Job</Text>}
              </TouchableOpacity>
              <View style={{ height: Platform.OS === "android" ? 80 : 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Budget Report Config Modal */}
      <Modal visible={showBudgetReportConfig} animationType="slide" presentationStyle="formSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setShowBudgetReportConfig(false)}>
              <Text style={{ fontSize: 16, color: colors.primary, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>Budget Report</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 20 }}>
            {/* Date Range */}
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Date Range</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {[
                { key: "all" as const, label: "All Time" },
                { key: "1pay" as const, label: "1 Payroll (2 Weeks)" },
                { key: "2pay" as const, label: "2 Payrolls (4 Weeks)" },
                { key: "month" as const, label: "Full Month" },
                { key: "custom" as const, label: "Custom Range" },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setBudgetDateRange(opt.key)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: budgetDateRange === opt.key ? colors.primary : colors.surface,
                    borderWidth: 1, borderColor: budgetDateRange === opt.key ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: budgetDateRange === opt.key ? "#fff" : colors.foreground }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom date inputs */}
            {budgetDateRange === "custom" && (
              <View style={{ marginBottom: 16, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, width: 50 }}>From:</Text>
                  <TextInput
                    value={budgetCustomStart}
                    onChangeText={setBudgetCustomStart}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface }}
                  />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, width: 50 }}>To:</Text>
                  <TextInput
                    value={budgetCustomEnd}
                    onChangeText={setBudgetCustomEnd}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface }}
                  />
                </View>
              </View>
            )}

            {/* Billing Rate */}
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 8, marginTop: 8 }}>Billing Rate (per hour)</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>Select a rate to override the default job billing rate, or leave blank to use the job's configured rate.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {[null, 45, 50, 55, 60, -1].map((rate) => {
                const isSelected = budgetBillingRate === rate;
                const label = rate === null ? "Job Default" : rate === -1 ? "Custom" : `$${rate}/hr`;
                return (
                  <TouchableOpacity
                    key={String(rate)}
                    onPress={() => setBudgetBillingRate(rate)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                      backgroundColor: isSelected ? "#F59E0B" : colors.surface,
                      borderWidth: 1, borderColor: isSelected ? "#F59E0B" : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? "#fff" : colors.foreground }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom rate input */}
            {budgetBillingRate === -1 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>$</Text>
                <TextInput
                  value={budgetCustomRate}
                  onChangeText={setBudgetCustomRate}
                  placeholder="Enter rate"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface }}
                />
                <Text style={{ fontSize: 13, color: colors.muted }}>/hr</Text>
              </View>
            )}

            {/* Generate button */}
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 16, opacity: generatingPdf ? 0.7 : 1 }}
              onPress={handleGenerateBudgetPdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Generate Budget Report</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </ScrollView>
        </View>
      </Modal>
    </ImageBackground>
    </JWrapper>
  );
}
