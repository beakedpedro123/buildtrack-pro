import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

const CATEGORIES = [
  { key: "insurance", label: "Insurance", icon: "shield" },
  { key: "vehicles", label: "Vehicles", icon: "directions-car" },
  { key: "yard", label: "Yard / Shop", icon: "warehouse" },
  { key: "tools", label: "Tools / Equipment", icon: "build" },
  { key: "office", label: "Office", icon: "business" },
  { key: "payroll_taxes", label: "Payroll Taxes", icon: "receipt" },
  { key: "workers_comp", label: "Workers Comp", icon: "health-and-safety" },
  { key: "liability", label: "Liability", icon: "gavel" },
  { key: "other", label: "Other", icon: "more-horiz" },
] as const;

type CategoryKey = typeof CATEGORIES[number]["key"];

interface OverheadSettingsProps {
  employeeId: number;
  onClose: () => void;
}

export function OverheadSettings({ employeeId, onClose }: OverheadSettingsProps) {
  const colors = useColors();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [newCategory, setNewCategory] = useState<CategoryKey>("insurance");
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const { data: overheadItems, isLoading, refetch } = trpc.overhead.list.useQuery();
  const { data: monthlyTotal } = trpc.overhead.getTotal.useQuery();
  const createMutation = trpc.overhead.create.useMutation({ onSuccess: () => refetch() });
  const updateMutation = trpc.overhead.update.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.overhead.delete.useMutation({ onSuccess: () => refetch() });

  const handleAdd = useCallback(async () => {
    if (!newLabel.trim() || !newAmount.trim()) {
      Alert.alert("Missing Info", "Please enter a label and amount.");
      return;
    }
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid dollar amount.");
      return;
    }
    try {
      if (editingItem) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          category: newCategory,
          label: newLabel.trim(),
          monthlyAmount: amount.toFixed(2),
          notes: newNotes.trim() || undefined,
        });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await createMutation.mutateAsync({
          category: newCategory,
          label: newLabel.trim(),
          monthlyAmount: amount.toFixed(2),
          notes: newNotes.trim() || undefined,
          createdBy: employeeId,
        });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      resetForm();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save");
    }
  }, [newLabel, newAmount, newCategory, newNotes, editingItem, employeeId]);

  const handleDelete = useCallback((item: any) => {
    Alert.alert("Delete Expense", `Remove "${item.label}" ($${parseFloat(item.monthlyAmount).toFixed(2)}/mo)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteMutation.mutateAsync({ id: item.id });
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }, []);

  const handleEdit = useCallback((item: any) => {
    setEditingItem(item);
    setNewCategory(item.category);
    setNewLabel(item.label);
    setNewAmount(parseFloat(item.monthlyAmount).toString());
    setNewNotes(item.notes || "");
    setShowAddModal(true);
  }, []);

  const resetForm = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setNewCategory("insurance");
    setNewLabel("");
    setNewAmount("");
    setNewNotes("");
  };

  // Group items by category
  const grouped = (overheadItems || []).reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryTotals = CATEGORIES.map((cat) => {
    const items = grouped[cat.key] || [];
    const total = items.reduce((sum: number, i: any) => sum + parseFloat(i.monthlyAmount || "0"), 0);
    return { ...cat, items, total };
  }).filter((c) => c.items.length > 0);

  const annualTotal = (monthlyTotal || 0) * 12;
  const dailyOverhead = (monthlyTotal || 0) / 22; // ~22 working days/month

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>  
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={22} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Overhead & Expenses</Text>
        <TouchableOpacity
          onPress={() => { setEditingItem(null); setShowAddModal(true); }}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>Monthly</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
            ${(monthlyTotal || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>Annual</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
            ${annualTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>Daily Rate</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
            ${dailyOverhead.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : categoryTotals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Expenses Set</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Add your real monthly business expenses so Pivot can calculate accurate job costs and overhead rates.
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.emptyBtnText}>Add First Expense</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={categoryTotals}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
          renderItem={({ item: cat }) => (
            <View style={[styles.categorySection, { borderColor: colors.border }]}>
              <View style={styles.categoryHeader}>
                <Text style={[styles.categoryTitle, { color: colors.foreground }]}>{cat.label}</Text>
                <Text style={[styles.categoryTotal, { color: colors.primary }]}>
                  ${cat.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}/mo
                </Text>
              </View>
              {cat.items.map((item: any) => (
                <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.border }]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemLabel, { color: colors.foreground }]}>{item.label}</Text>
                    {item.notes ? <Text style={[styles.itemNotes, { color: colors.muted }]} numberOfLines={1}>{item.notes}</Text> : null}
                  </View>
                  <Text style={[styles.itemAmount, { color: colors.foreground }]}>
                    ${parseFloat(item.monthlyAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </Text>
                  <View style={styles.itemActions}>
                    <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionBtn}>
                      <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                      <Text style={{ color: colors.error, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingItem ? "Edit Expense" : "Add Monthly Expense"}
              </Text>
              <TouchableOpacity onPress={resetForm}>
                <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Category Selector */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setNewCategory(cat.key)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: newCategory === cat.key ? colors.primary : colors.surface,
                      borderColor: newCategory === cat.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: newCategory === cat.key ? "#fff" : colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Description</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. General Liability Insurance"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Monthly Amount ($)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={newAmount}
              onChangeText={setNewAmount}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder="Any notes..."
              placeholderTextColor={colors.muted}
              multiline
            />

            <TouchableOpacity
              onPress={handleAdd}
              disabled={createMutation.isPending || updateMutation.isPending}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: (createMutation.isPending || updateMutation.isPending) ? 0.6 : 1 }]}
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{editingItem ? "Update Expense" : "Add Expense"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 16, fontWeight: "500" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  summaryLabel: { fontSize: 12, fontWeight: "500", marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: "700" },
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  categorySection: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryTitle: { fontSize: 16, fontWeight: "700" },
  categoryTotal: { fontSize: 14, fontWeight: "600" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  itemInfo: { flex: 1 },
  itemLabel: { fontSize: 14, fontWeight: "500" },
  itemNotes: { fontSize: 12, marginTop: 2 },
  itemAmount: { fontSize: 14, fontWeight: "600", marginRight: 8 },
  itemActions: { flexDirection: "row", gap: 8 },
  actionBtn: { padding: 4 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryChipText: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  saveBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
