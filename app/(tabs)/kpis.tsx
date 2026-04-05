import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
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
  View, ImageBackground } from "react-native";

import { BG_JOBS as bg_jobs } from "@/constants/bg-urls";

const CATEGORIES = [
  { key: "revenue", label: "Revenue", icon: "💰" },
  { key: "labor", label: "Labor", icon: "👷" },
  { key: "jobs", label: "Jobs", icon: "🏗️" },
  { key: "safety", label: "Safety", icon: "🛡️" },
  { key: "schedule", label: "Schedule", icon: "📅" },
  { key: "custom", label: "Custom", icon: "📊" },
] as const;

const PERIODS = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
] as const;

export default function KPIsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();

  const role = employee?.role ?? "laborer";
  const canEdit = role === "owner" || role === "office_manager";

  const [showCreate, setShowCreate] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<any>(null);
  const [filterCat, setFilterCat] = useState<string>("all");

  // Create form
  const [kpiName, setKpiName] = useState("");
  const [kpiCategory, setKpiCategory] = useState<string>("custom");
  const [kpiUnit, setKpiUnit] = useState("");
  const [kpiTarget, setKpiTarget] = useState("");
  const [kpiDescription, setKpiDescription] = useState("");
  const [kpiPeriod, setKpiPeriod] = useState<string>("monthly");

  // Update value form
  const [updateValue, setUpdateValue] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");

  const { data: kpis, isLoading } = trpc.kpi.list.useQuery(undefined, { staleTime: 30000 });
  const { data: history } = trpc.kpi.getHistory.useQuery(
    { kpiId: selectedKpi?.id || 0, limit: 10 },
    { enabled: !!selectedKpi }
  );

  const createKpi = trpc.kpi.create.useMutation({
    onSuccess: () => {
      utils.kpi.list.invalidate();
      setShowCreate(false);
      resetCreateForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } });
  const updateKpiMut = trpc.kpi.update.useMutation({
    onSuccess: () => { utils.kpi.list.invalidate(); } });
  const deleteKpi = trpc.kpi.delete.useMutation({
    onSuccess: () => {
      utils.kpi.list.invalidate();
      setSelectedKpi(null);
    } });
  const addHistory = trpc.kpi.addHistoryEntry.useMutation({
    onSuccess: () => {
      utils.kpi.list.invalidate();
      utils.kpi.getHistory.invalidate();
      setShowUpdate(false);
      setUpdateValue("");
      setUpdateNotes("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } });

  const resetCreateForm = () => {
    setKpiName("");
    setKpiCategory("custom");
    setKpiUnit("");
    setKpiTarget("");
    setKpiDescription("");
    setKpiPeriod("monthly");
  };

  const filteredKpis = (kpis || []).filter((k) => {
    if (filterCat === "all") return true;
    return k.category === filterCat;
  });

  // Group KPIs by category
  const grouped = filteredKpis.reduce((acc, kpi) => {
    const cat = kpi.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kpi);
    return acc;
  }, {} as Record<string, typeof filteredKpis>);

  const getCategoryInfo = (cat: string) => CATEGORIES.find((c) => c.key === cat) || { key: cat, label: cat, icon: "📊" };

  const getProgressPct = (kpi: any) => {
    const current = parseFloat(kpi.currentValue || "0");
    const target = parseFloat(kpi.targetValue || "0");
    if (target <= 0) return 0;
    return Math.min(current / target, 1);
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 0.9) return colors.success;
    if (pct >= 0.5) return colors.warning;
    return colors.primary;
  };

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    filterRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 6 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
    filterText: { fontSize: 12, fontWeight: "600" },
    addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    kpiCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.background, marginBottom: 10 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 12 } });

  // Access guard — only owner, office_manager, logistics, foreman
  if (role === "laborer") {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>KPIs</Text>
          <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8 }}>
            KPI tracking is available to management roles only.
          </Text>
        </View>
    </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
        <ImageBackground source={bg_jobs} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      <View style={styles.header}>
        <Text style={styles.title}>KPIs</Text>
        {canEdit && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ New KPI</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, { borderColor: filterCat === "all" ? colors.primary : colors.border, backgroundColor: filterCat === "all" ? colors.primary + "15" : colors.surface }]}
          onPress={() => setFilterCat("all")}
        >
          <Text style={[styles.filterText, { color: filterCat === "all" ? colors.primary : colors.muted }]}>All</Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.filterChip, { borderColor: filterCat === cat.key ? colors.primary : colors.border, backgroundColor: filterCat === cat.key ? colors.primary + "15" : colors.surface }]}
            onPress={() => setFilterCat(cat.key)}
          >
            <Text style={[styles.filterText, { color: filterCat === cat.key ? colors.primary : colors.muted }]}>{cat.icon} {cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={Object.entries(grouped)}
          keyExtractor={([cat]) => cat}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: [cat, items] }) => {
            const catInfo = getCategoryInfo(cat);
            return (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.muted, marginBottom: 8 }}>
                  {catInfo.icon} {catInfo.label.toUpperCase()}
                </Text>
                {items.map((kpi) => {
                  const pct = getProgressPct(kpi);
                  const current = parseFloat(kpi.currentValue || "0");
                  const target = parseFloat(kpi.targetValue || "0");
                  return (
                    <TouchableOpacity
                      key={kpi.id}
                      style={styles.kpiCard}
                      onPress={() => setSelectedKpi(kpi)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{kpi.name}</Text>
                          {kpi.description ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{kpi.description}</Text> : null}
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 20, fontWeight: "800", color: getProgressColor(pct) }}>
                            {current.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ""}
                          </Text>
                          {target > 0 && (
                            <Text style={{ fontSize: 11, color: colors.muted }}>
                              / {target.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ""}
                            </Text>
                          )}
                        </View>
                      </View>
                      {target > 0 && (
                        <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                          <View style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: getProgressColor(pct), borderRadius: 3 }} />
                        </View>
                      )}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{kpi.period}</Text>
                        {target > 0 && <Text style={{ fontSize: 11, color: colors.muted }}>{Math.round(pct * 100)}% of target</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
              <Text style={{ color: colors.muted, fontSize: 16 }}>No KPIs yet</Text>
              {canEdit && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>Tap "+ New KPI" to create one</Text>}
            </View>
          }
        />
      )}

      {/* KPI Detail Modal */}
      <Modal visible={!!selectedKpi} animationType="slide" presentationStyle="pageSheet">
        {selectedKpi && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedKpi.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{getCategoryInfo(selectedKpi.category).icon} {getCategoryInfo(selectedKpi.category).label} · {selectedKpi.period}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedKpi(null)}>
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              {/* Current Value Card */}
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 20, alignItems: "center" }}>
                <Text style={{ fontSize: 36, fontWeight: "800", color: colors.primary }}>
                  {parseFloat(selectedKpi.currentValue || "0").toLocaleString()}{selectedKpi.unit ? ` ${selectedKpi.unit}` : ""}
                </Text>
                {parseFloat(selectedKpi.targetValue || "0") > 0 && (
                  <>
                    <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
                      Target: {parseFloat(selectedKpi.targetValue || "0").toLocaleString()}{selectedKpi.unit ? ` ${selectedKpi.unit}` : ""}
                    </Text>
                    <View style={{ width: "100%", height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
                      <View style={{ height: "100%", width: `${getProgressPct(selectedKpi) * 100}%`, backgroundColor: getProgressColor(getProgressPct(selectedKpi)), borderRadius: 4 }} />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{Math.round(getProgressPct(selectedKpi) * 100)}% achieved</Text>
                  </>
                )}
              </View>

              {selectedKpi.description ? (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Description</Text>
                  <Text style={{ fontSize: 14, color: colors.muted }}>{selectedKpi.description}</Text>
                </View>
              ) : null}

              {/* Update Value Button */}
              {canEdit && (
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 20 }}
                  onPress={() => { setUpdateValue(""); setUpdateNotes(""); setShowUpdate(true); }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Update Value</Text>
                </TouchableOpacity>
              )}

              {/* History */}
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>History</Text>
              {(history || []).length === 0 && (
                <Text style={{ color: colors.muted, fontSize: 14 }}>No history entries yet.</Text>
              )}
              {(history || []).map((h, i) => (
                <View key={h.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === 0 ? colors.primary : colors.muted, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                      {parseFloat(h.value).toLocaleString()}{selectedKpi.unit ? ` ${selectedKpi.unit}` : ""}
                    </Text>
                    {h.notes ? <Text style={{ fontSize: 12, color: colors.muted }}>{h.notes}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{new Date(h.recordedAt).toLocaleDateString()}</Text>
                </View>
              ))}

              {/* Delete KPI */}
              {canEdit && (
                <TouchableOpacity
                  style={{ marginTop: 24, alignItems: "center", paddingVertical: 12 }}
                  onPress={() => {
                    Alert.alert("Delete KPI", `Remove "${selectedKpi.name}"?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteKpi.mutate({ id: selectedKpi.id, requestingEmployeeId: employee!.id }) },
                    ]);
                  }}
                >
                  <Text style={{ color: colors.error, fontWeight: "600", fontSize: 14 }}>Delete KPI</Text>
                </TouchableOpacity>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>

            {/* Update Value Modal */}
            <Modal visible={showUpdate} animationType="slide" presentationStyle="formSheet">
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Update Value</Text>
                  <TouchableOpacity onPress={() => setShowUpdate(false)}>
                    <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 20 }}>
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>New Value{selectedKpi.unit ? ` (${selectedKpi.unit})` : ""} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new value"
                    placeholderTextColor={colors.muted}
                    value={updateValue}
                    onChangeText={setUpdateValue}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.input, { height: 60, textAlignVertical: "top" }]}
                    placeholder="e.g. End of week update"
                    placeholderTextColor={colors.muted}
                    value={updateNotes}
                    onChangeText={setUpdateNotes}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={async () => {
                      if (!updateValue || !employee) return;
                      await addHistory.mutateAsync({
                        kpiId: selectedKpi.id,
                        value: updateValue,
                        notes: updateNotes || undefined,
                        recordedBy: employee.id });
                      // Update the selected KPI's current value locally
                      setSelectedKpi({ ...selectedKpi, currentValue: updateValue });
                    }}
                    disabled={addHistory.isPending || !updateValue}
                  >
                    {addHistory.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          </View>
        )}
      </Modal>

      {/* Create KPI Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New KPI</Text>
            <TouchableOpacity onPress={() => { setShowCreate(false); resetCreateForm(); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20 }}>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>KPI Name *</Text>
            <TextInput style={styles.input} placeholder="e.g. Monthly Revenue" placeholderTextColor={colors.muted} value={kpiName} onChangeText={setKpiName} />

            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Category</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: kpiCategory === cat.key ? colors.primary : colors.border, backgroundColor: kpiCategory === cat.key ? colors.primary + "15" : colors.surface }}
                  onPress={() => setKpiCategory(cat.key)}
                >
                  <Text style={{ fontSize: 13, color: kpiCategory === cat.key ? colors.primary : colors.foreground }}>{cat.icon} {cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Unit (e.g. $, %, hrs, jobs)</Text>
            <TextInput style={styles.input} placeholder="$" placeholderTextColor={colors.muted} value={kpiUnit} onChangeText={setKpiUnit} />

            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Target Value</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.muted} value={kpiTarget} onChangeText={setKpiTarget} keyboardType="decimal-pad" />

            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Period</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {PERIODS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: kpiPeriod === p.key ? colors.primary : colors.border, backgroundColor: kpiPeriod === p.key ? colors.primary + "15" : colors.surface }}
                  onPress={() => setKpiPeriod(p.key)}
                >
                  <Text style={{ fontSize: 13, color: kpiPeriod === p.key ? colors.primary : colors.foreground }}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput style={[styles.input, { height: 60, textAlignVertical: "top" }]} placeholder="What does this KPI track?" placeholderTextColor={colors.muted} value={kpiDescription} onChangeText={setKpiDescription} multiline />

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={async () => {
                if (!kpiName.trim() || !employee) return;
                await createKpi.mutateAsync({
                  name: kpiName.trim(),
                  category: kpiCategory as any,
                  unit: kpiUnit || undefined,
                  targetValue: kpiTarget || undefined,
                  description: kpiDescription || undefined,
                  period: kpiPeriod as any,
                  createdBy: employee.id });
              }}
              disabled={createKpi.isPending || !kpiName.trim()}
            >
              {createKpi.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Create KPI</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ImageBackground>
    </ScreenContainer>
  );
}
