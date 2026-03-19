import { ScreenContainer } from "@/components/screen-container";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { JobCard } from "@/components/ui/job-card";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const companyLogo = require("@/assets/images/company-logo.png");

const ROLE_COLORS: Record<string, string> = {
  owner: "#C8A951",
  secretary: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#D4A843",
  laborer: "#22C55E",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  secretary: "Secretary",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function DashboardScreen() {
  const colors = useColors();
  const { employee, logout } = useAppAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const role = employee?.role || "laborer";
  const isManagement = role === "owner" || role === "secretary" || role === "logistics";
  const isForeman = role === "foreman";
  const isFieldRole = role === "foreman" || role === "laborer";

  const { data: activeJobs } = trpc.jobs.listActive.useQuery();
  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: isManagement });
  const { data: clockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { enabled: isManagement });
  const { data: recentReports } = trpc.reports.recent.useQuery({ limit: 5 }, { enabled: isManagement || isForeman });
  const { data: activeEntry } = trpc.clock.activeEntry.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee }
  );
  const { data: myJobs } = trpc.jobs.forEmployee.useQuery(
    { employeeId: employee?.id || 0 },
    { enabled: !!employee && !isManagement }
  );

  const elapsed = activeEntry ? now.getTime() - new Date(activeEntry.clockIn).getTime() : 0;
  const activeJobForEntry = activeJobs?.find((j) => j.id === activeEntry?.jobId);

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
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
    reportRow: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
    logoutBtn: { marginHorizontal: 20, marginTop: 8, marginBottom: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  });

  if (!employee) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </ScreenContainer>
    );
  }

  const roleColor = ROLE_COLORS[role] || colors.primary;

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Company Logo */}
        <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
          <Image source={companyLogo} style={{ width: 120, height: 120, resizeMode: "contain" }} />
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
        </View>

        {/* Management KPIs */}
        {isManagement && (
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
        )}

        {/* My Clock Status (field roles only) */}
        {isFieldRole && <View style={styles.clockCard}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <View style={[styles.clockStatusDot, { backgroundColor: activeEntry ? colors.success : colors.muted }]} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: activeEntry ? colors.success : colors.muted }}>
              {activeEntry ? "Currently Clocked In" : "Not Clocked In"}
            </Text>
          </View>
          {activeEntry ? (
            <>
              <Text style={{ fontSize: 32, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>{formatDuration(elapsed)}</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 12 }}>
                {activeJobForEntry?.name || "Unknown Job"} · Since {new Date(activeEntry.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: colors.error, borderRadius: 10, padding: 12, alignItems: "center" }}
                onPress={() => router.push("/clock" as any)}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Clock Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: colors.success, borderRadius: 10, padding: 12, alignItems: "center" }}
              onPress={() => router.push("/clock" as any)}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Clock In</Text>
            </TouchableOpacity>
          )}
        </View>}

        {/* Who's On Site (management) */}
        {isManagement && (clockedIn || []).length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>On Site Now ({(clockedIn || []).length})</Text>
              <TouchableOpacity onPress={() => router.push("/team" as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {(clockedIn || []).slice(0, 5).map((entry: any) => {
              const emp = (allEmployees || []).find((e) => e.id === entry.employeeId);
              const job = (activeJobs || []).find((j) => j.id === entry.jobId);
              const dur = now.getTime() - new Date(entry.clockIn).getTime();
              if (!emp) return null;
              return (
                <View key={entry.id} style={styles.empRow}>
                  <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[emp.role] || colors.primary }]}>
                    <Text style={styles.avatarText}>{getInitials(emp.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{emp.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{job?.name || "Unknown Job"}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>{formatDuration(dur)}</Text>
                </View>
              );
            })}
            <View style={{ height: 16 }} />
          </>
        )}

        {/* Active Jobs */}
        {isManagement && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Jobs</Text>
              <TouchableOpacity onPress={() => router.push("/jobs" as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              {(activeJobs || []).slice(0, 3).map((job) => (
                <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} />
              ))}
            </View>
          </>
        )}

        {/* My Jobs (laborer/foreman) */}
        {!isManagement && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Jobsites</Text>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              {(myJobs || []).map((job) => (
                <JobCard key={job.id} job={job} onPress={() => router.push("/jobs" as any)} />
              ))}
              {(!myJobs || myJobs.length === 0) && (
                <Text style={{ color: colors.muted, fontSize: 14, paddingBottom: 16 }}>No jobs assigned. Contact your manager.</Text>
              )}
            </View>
          </>
        )}

        {/* Recent Reports (management + foreman) */}
        {(isManagement || isForeman) && (recentReports || []).length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <Text style={styles.sectionTitle}>Recent Reports</Text>
              <TouchableOpacity onPress={() => router.push("/reports" as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {(recentReports || []).slice(0, 3).map((report: any) => {
              const job = (activeJobs || []).find((j) => j.id === report.jobId);
              const workItems = (() => { try { return JSON.parse(report.workCompleted || "[]"); } catch { return []; } })();
              return (
                <View key={report.id} style={styles.reportRow}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                      {job?.name || `Job #${report.jobId}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {new Date(report.reportDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {workItems.length} task{workItems.length !== 1 ? "s" : ""} · {report.crewCount} crew · {report.weatherCondition}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
