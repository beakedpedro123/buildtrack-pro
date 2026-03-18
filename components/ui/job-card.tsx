import { useColors } from "@/hooks/use-colors";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const STATUS_COLORS: Record<string, string> = {
  active: "#22C55E",
  paused: "#F59E0B",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

interface JobCardProps {
  job: {
    id: number;
    name: string;
    address?: string | null;
    clientName?: string | null;
    status: string;
    totalBudget?: string | null;
  };
  crewCount?: number;
  spentAmount?: number;
  onPress?: () => void;
}

export function JobCard({ job, crewCount, spentAmount, onPress }: JobCardProps) {
  const colors = useColors();
  const budget = parseFloat(job.totalBudget || "0");
  const spent = spentAmount || 0;
  const pct = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const barColor = pct < 0.6 ? colors.success : pct < 0.85 ? colors.warning : colors.error;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.leftBorder, { backgroundColor: STATUS_COLORS[job.status] || colors.primary }]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{job.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[job.status] + "20" }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[job.status] }]}>
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </Text>
          </View>
        </View>
        {job.clientName ? (
          <Text style={[styles.client, { color: colors.muted }]} numberOfLines={1}>
            {job.clientName}
          </Text>
        ) : null}
        {job.address ? (
          <Text style={[styles.address, { color: colors.muted }]} numberOfLines={1}>
            {job.address}
          </Text>
        ) : null}
        {budget > 0 && (
          <View style={styles.budgetRow}>
            <View style={[styles.budgetBar, { backgroundColor: colors.border }]}>
              <View style={[styles.budgetFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={[styles.budgetText, { color: colors.muted }]}>
              ${spent.toLocaleString()} / ${budget.toLocaleString()}
            </Text>
          </View>
        )}
        {crewCount !== undefined && (
          <Text style={[styles.crew, { color: colors.muted }]}>
            {crewCount} crew member{crewCount !== 1 ? "s" : ""} clocked in
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  leftBorder: { width: 4 },
  content: { flex: 1, padding: 14 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  name: { fontSize: 16, fontWeight: "700", flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },
  client: { fontSize: 13, marginBottom: 2 },
  address: { fontSize: 12, marginBottom: 6 },
  budgetRow: { marginTop: 8 },
  budgetBar: { height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 4 },
  budgetFill: { height: "100%", borderRadius: 3 },
  budgetText: { fontSize: 11 },
  crew: { fontSize: 12, marginTop: 6 },
});
