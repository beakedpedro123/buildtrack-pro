import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as Haptics from "expo-haptics";

const FILING_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
] as const;

interface EmployeeTaxInfoProps {
  visible: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
}

export function EmployeeTaxInfoModal({ visible, onClose, employeeId, employeeName }: EmployeeTaxInfoProps) {
  const colors = useColors();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();

  const [ssn, setSsn] = useState("");
  const [filingStatus, setFilingStatus] = useState<string>("single");
  const [federalAllowances, setFederalAllowances] = useState("0");
  const [stateAllowances, setStateAllowances] = useState("0");
  const [additionalWithholding, setAdditionalWithholding] = useState("0");
  const [w4Year, setW4Year] = useState(new Date().getFullYear().toString());
  const [i9Verified, setI9Verified] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: taxInfo, isLoading } = trpc.taxInfo.get.useQuery(
    { employeeId },
    { enabled: visible && !!employeeId }
  );

  const upsertMutation = trpc.taxInfo.upsert.useMutation({
    onSuccess: () => {
      utils.taxInfo.get.invalidate({ employeeId });
      utils.taxInfo.getAll.invalidate();
    },
  });

  useEffect(() => {
    if (taxInfo) {
      setSsn(taxInfo.ssn || "");
      setFilingStatus(taxInfo.filingStatus || "single");
      setFederalAllowances(String(taxInfo.federalAllowances || 0));
      setStateAllowances(String(taxInfo.stateAllowances || 0));
      setAdditionalWithholding(String(taxInfo.additionalWithholding || "0"));
      setW4Year(String(taxInfo.w4Year || new Date().getFullYear()));
      setI9Verified(!!taxInfo.i9Verified);
      setNotes(taxInfo.notes || "");
    } else if (!isLoading) {
      // Reset for new entry
      setSsn("");
      setFilingStatus("single");
      setFederalAllowances("0");
      setStateAllowances("0");
      setAdditionalWithholding("0");
      setW4Year(new Date().getFullYear().toString());
      setI9Verified(false);
      setNotes("");
    }
  }, [taxInfo, isLoading]);

  const formatSSN = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const handleSave = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      await upsertMutation.mutateAsync({
        employeeId,
        ssn: ssn || undefined,
        filingStatus: filingStatus as any,
        federalAllowances: parseInt(federalAllowances) || 0,
        stateAllowances: parseInt(stateAllowances) || 0,
        additionalWithholding: additionalWithholding || "0",
        w4Year: parseInt(w4Year) || new Date().getFullYear(),
        i9Verified,
        notes: notes || undefined,
        updatedBy: employee.id,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", `Tax info for ${employeeName} has been updated.`);
      onClose();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to save tax info");
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: Platform.OS === "ios" ? 60 : 20,
      paddingBottom: 16,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.foreground,
    },
    subtitle: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
    },
    section: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: 12,
    },
    label: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 6,
      fontWeight: "600",
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      fontSize: 15,
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
    },
    row: {
      flexDirection: "row",
      gap: 12,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 8,
      marginRight: 8,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 40,
    },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Tax Information</Text>
            <Text style={styles.subtitle}>{employeeName}</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Close</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* SSN */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Social Security</Text>
                <Text style={styles.label}>SSN (last 4 recommended for security)</Text>
                <TextInput
                  style={styles.input}
                  value={ssn}
                  onChangeText={(t) => setSsn(formatSSN(t))}
                  placeholder="XXX-XX-XXXX or last 4"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  maxLength={11}
                  secureTextEntry
                />
              </View>

              {/* Filing Status */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>W-4 Information</Text>
                <Text style={styles.label}>Filing Status</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {FILING_STATUSES.map((fs) => (
                    <TouchableOpacity
                      key={fs.value}
                      style={[
                        styles.chip,
                        {
                          borderColor: filingStatus === fs.value ? colors.primary : colors.border,
                          backgroundColor: filingStatus === fs.value ? colors.primary + "15" : colors.surface,
                        },
                      ]}
                      onPress={() => {
                        setFilingStatus(fs.value);
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: filingStatus === fs.value ? colors.primary : colors.foreground }}>
                        {fs.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Federal Allowances</Text>
                    <TextInput
                      style={styles.input}
                      value={federalAllowances}
                      onChangeText={setFederalAllowances}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>State Allowances</Text>
                    <TextInput
                      style={styles.input}
                      value={stateAllowances}
                      onChangeText={setStateAllowances}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Additional Withholding ($)</Text>
                    <TextInput
                      style={styles.input}
                      value={additionalWithholding}
                      onChangeText={setAdditionalWithholding}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>W-4 Year</Text>
                    <TextInput
                      style={styles.input}
                      value={w4Year}
                      onChangeText={setW4Year}
                      keyboardType="number-pad"
                      placeholder="2026"
                      placeholderTextColor={colors.muted}
                      maxLength={4}
                    />
                  </View>
                </View>
              </View>

              {/* I-9 Verification */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Employment Verification</Text>
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: i9Verified ? colors.success + "15" : colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: i9Verified ? colors.success : colors.border,
                  }}
                  onPress={() => {
                    setI9Verified(!i9Verified);
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: i9Verified ? colors.success : colors.border, backgroundColor: i9Verified ? colors.success : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    {i9Verified && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>}
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: i9Verified ? colors.success : colors.foreground }}>
                      I-9 Verified
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      Employment eligibility verification complete
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes for Accountant</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Any notes for your accountant (e.g., exempt status, special withholding)..."
                  placeholderTextColor={colors.muted}
                  multiline
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Save Tax Info</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}
