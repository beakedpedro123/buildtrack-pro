import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useCallback } from "react";
import { ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground, Modal } from "react-native";

import { BG_MORE as bg_more } from "@/constants/bg-urls";
import { useLanguage, type AppLanguage } from "@/lib/language-context";
// Messages feature removed
import { OverheadSettings } from "@/components/overhead-settings";
import { useGpsTracking } from "@/hooks/use-gps-tracking";
import { useLunchSettings } from "@/hooks/use-lunch-settings";
import { useCompanyTrade, TRADE_OPTIONS } from "@/hooks/use-company-trade";
import { Switch } from "react-native";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer" };

const ROLE_COLORS: Record<string, string> = {
  owner: "#1E3A5F",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
  laborer: "#22C55E" };

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type ProfileTab = "profile" | "overhead";

export default function ProfileScreen() {
  const colors = useColors();
  const { employee, logout } = useAppAuth();
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await utils.invalidate(); } catch {}
    setRefreshing(false);
  }, [utils]);

  const [editingName, setEditingName] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [newName, setNewName] = useState(employee?.name || "");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const { language, setLanguage } = useLanguage();
  const { gpsEnabled, toggleGps } = useGpsTracking();
  const { lunchSettings, updateSettings: updateLunchSettings } = useLunchSettings();
  const { trade: companyTrade, updateTrade } = useCompanyTrade();
  const [showTradePicker, setShowTradePicker] = useState(false);

  const empId = (employee as any)?.id ?? 0;

  const updateEmployee = trpc.employees.update.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
    } });

  const styles = StyleSheet.create({
    section: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginHorizontal: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border },
    rowLast: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.foreground,
      backgroundColor: colors.background,
      marginBottom: 12 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 10 },
    outlineBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border } });

  if (!employee) return null;

  const roleColor = ROLE_COLORS[employee.role] || colors.primary;

  const handleSaveName = async () => {
    if (!newName.trim()) {
      Alert.alert("Name Required", "Please enter your name.");
      return;
    }
    setSaving(true);
    try {
      await updateEmployee.mutateAsync({
        id: employee.id,
        name: newName.trim(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Name Updated", `Your name has been changed to "${newName.trim()}".`);
      setEditingName(false);
    } catch {
      Alert.alert("Error", "Could not update name. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePin = async () => {
    if (currentPin !== employee.pin) {
      Alert.alert("Incorrect PIN", "Your current PIN is incorrect.");
      return;
    }
    if (newPin.length < 4) {
      Alert.alert("PIN Too Short", "Your new PIN must be at least 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("PIN Mismatch", "New PIN and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      await updateEmployee.mutateAsync({ id: employee.id, pin: newPin });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("PIN Updated", "Your PIN has been changed successfully.");
      setEditingPin(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      Alert.alert("Error", "Could not update PIN. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleTabPress = (tab: ProfileTab) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };


  if (activeTab === "overhead") {
    return (
      <ScreenContainer>
        <OverheadSettings employeeId={empId} onClose={() => setActiveTab("profile")} />
      </ScreenContainer>
    );
  }

  // Messages feature removed

  return (
    <ScreenContainer>
        <ImageBackground source={bg_more} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.08 }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>

          {/* Sub-tab bar */}
          <View style={tabStyles.subTabBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabStyles.subTabScroll}>
              <TouchableOpacity
                onPress={() => handleTabPress("profile")}
                style={[tabStyles.subTab, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                activeOpacity={0.7}
              >
                <MaterialIcons name="person" size={14} color={colors.muted} />
                <Text style={[tabStyles.subTabText, { color: "#000", fontWeight: "700" }]}>My Profile</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>

          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}>
            <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>My Profile</Text>
          </View>

          {/* Avatar + Role Badge */}
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: roleColor + "22", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: roleColor, marginBottom: 12 }}>
              <Text style={{ fontSize: 30, fontWeight: "800", color: roleColor }}>{getInitials(employee.name)}</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{employee.name}</Text>
            <View style={{ backgroundColor: roleColor + "22", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, marginTop: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: roleColor }}>{ROLE_LABELS[employee.role]}</Text>
            </View>
          </View>

          {/* Edit Name */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>DISPLAY NAME</Text>
              <TouchableOpacity onPress={() => { setEditingName(!editingName); setNewName(employee.name); }}>
                <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>{editingName ? "Cancel" : "Edit"}</Text>
              </TouchableOpacity>
            </View>
            {editingName ? (
              <View style={{ padding: 16 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor={colors.muted}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={handleSaveName} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save Name</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rowLast}>
                <Text style={{ fontSize: 16, color: colors.foreground, fontWeight: "600" }}>{employee.name}</Text>
              </View>
            )}
          </View>

          {/* Change PIN */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>LOGIN PIN</Text>
              <TouchableOpacity onPress={() => { setEditingPin(!editingPin); setCurrentPin(""); setNewPin(""); setConfirmPin(""); }}>
                <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>{editingPin ? "Cancel" : "Change PIN"}</Text>
              </TouchableOpacity>
            </View>
            {editingPin ? (
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Current PIN</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter current PIN"
                  placeholderTextColor={colors.muted}
                  value={currentPin}
                  onChangeText={setCurrentPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                  returnKeyType="next"
                />
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>New PIN (4–6 digits)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter new PIN"
                  placeholderTextColor={colors.muted}
                  value={newPin}
                  onChangeText={setNewPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                  returnKeyType="next"
                />
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Confirm New PIN</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter new PIN"
                  placeholderTextColor={colors.muted}
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleSavePin}
                />
                <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={handleSavePin} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save New PIN</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rowLast}>
                <Text style={{ fontSize: 15, color: colors.muted }}>••••</Text>
              </View>
            )}
          </View>

          {/* Language Toggle */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>APP LANGUAGE / IDIOMA</Text>
            </View>
            <View style={{ flexDirection: "row", padding: 16, gap: 10 }}>
              {(["en", "es"] as AppLanguage[]).map((lang) => {
                const isActive = language === lang;
                const label = lang === "en" ? "English" : "Español";
                const flag = lang === "en" ? "\ud83c\uddfa\ud83c\uddf8" : "\ud83c\uddf2\ud83c\uddfd";
                return (
                  <TouchableOpacity
                    key={lang}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: isActive ? colors.primary + "18" : colors.background,
                      borderWidth: 2,
                      borderColor: isActive ? colors.primary : colors.border,
                    }}
                    onPress={() => {
                      setLanguage(lang);
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{flag}</Text>
                    <Text style={{ fontSize: 15, fontWeight: isActive ? "800" : "600", color: isActive ? colors.primary : colors.foreground }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Account Info */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={{ fontSize: 14, color: colors.muted }}>Role</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: roleColor }}>{ROLE_LABELS[employee.role]}</Text>
            </View>
            {employee.phone ? (
              <View style={styles.row}>
                <Text style={{ fontSize: 14, color: colors.muted }}>Phone</Text>
                <Text style={{ fontSize: 14, color: colors.foreground }}>{employee.phone}</Text>
              </View>
            ) : null}
            {employee.email ? (
              <View style={styles.row}>
                <Text style={{ fontSize: 14, color: colors.muted }}>Email</Text>
                <Text style={{ fontSize: 14, color: colors.foreground }}>{employee.email}</Text>
              </View>
            ) : null}
            <View style={styles.rowLast}>
              <Text style={{ fontSize: 14, color: colors.muted }}>Employee ID</Text>
              <Text style={{ fontSize: 14, color: colors.foreground }}>#{employee.id}</Text>
            </View>
          </View>

          {/* Company Trade & Settings — Owner Only */}
          {employee.role === "owner" && (
            <View style={styles.section}>
              <View style={styles.row}>
                <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>COMPANY SETTINGS</Text>
              </View>
              {/* Company Trade Selector */}
              <TouchableOpacity
                style={[styles.row, { justifyContent: "space-between" }]}
                onPress={() => setShowTradePicker(true)}
                activeOpacity={0.6}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <MaterialIcons name="construction" size={18} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Company Trade</Text>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                      {TRADE_OPTIONS.find((t) => t.key === companyTrade)?.label || "Framing"}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </TouchableOpacity>
              <View style={styles.rowLast}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <MaterialIcons name="settings" size={18} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>GPS Tracking</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Capture location on clock-in/out</Text>
                  </View>
                </View>
                <Switch
                  value={gpsEnabled}
                  onValueChange={(val) => {
                    toggleGps(val);
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary + "80" }}
                  thumbColor={gpsEnabled ? colors.primary : colors.muted}
                />
              </View>
            </View>
          )}

          {/* Lunch/Break Deduction — Owner Only */}
          {employee.role === "owner" && (
            <View style={styles.section}>
              <View style={styles.row}>
                <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>LUNCH / BREAK DEDUCTION</Text>
              </View>
              {/* Enable toggle */}
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <MaterialIcons name="restaurant" size={18} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Auto-Deduct Lunch</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Deduct break time from payroll reports</Text>
                  </View>
                </View>
                <Switch
                  value={lunchSettings.enabled}
                  onValueChange={(val) => {
                    updateLunchSettings({ enabled: val });
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary + "80" }}
                  thumbColor={lunchSettings.enabled ? colors.primary : colors.muted}
                />
              </View>
              {lunchSettings.enabled && (
                <>
                  {/* Deduction amount */}
                  <View style={styles.row}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <MaterialIcons name="schedule" size={18} color={colors.muted} />
                      <Text style={{ fontSize: 14, color: colors.foreground }}>Deduct per day</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {[15, 30, 45, 60].map((mins) => (
                        <TouchableOpacity
                          key={mins}
                          onPress={() => {
                            updateLunchSettings({ deductMinutes: mins });
                            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                            backgroundColor: lunchSettings.deductMinutes === mins ? colors.primary : colors.surface,
                            borderWidth: 1, borderColor: lunchSettings.deductMinutes === mins ? colors.primary : colors.border,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: lunchSettings.deductMinutes === mins ? "#fff" : colors.foreground }}>{mins}m</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {/* Min shift length */}
                  <View style={styles.row}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <MaterialIcons name="timer" size={18} color={colors.muted} />
                      <Text style={{ fontSize: 14, color: colors.foreground }}>Min shift to qualify</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {[{ label: "4h", val: 240 }, { label: "5h", val: 300 }, { label: "6h", val: 360 }, { label: "7h", val: 420 }].map((opt) => (
                        <TouchableOpacity
                          key={opt.val}
                          onPress={() => {
                            updateLunchSettings({ minShiftMinutes: opt.val });
                            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                            backgroundColor: lunchSettings.minShiftMinutes === opt.val ? colors.primary : colors.surface,
                            borderWidth: 1, borderColor: lunchSettings.minShiftMinutes === opt.val ? colors.primary : colors.border,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: lunchSettings.minShiftMinutes === opt.val ? "#fff" : colors.foreground }}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {/* Skip days */}
                  <View style={styles.rowLast}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <MaterialIcons name="event-busy" size={18} color={colors.muted} />
                        <Text style={{ fontSize: 14, color: colors.foreground }}>Skip deduction on</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => {
                          const isSkipped = lunchSettings.skipDays.includes(idx);
                          return (
                            <TouchableOpacity
                              key={day}
                              onPress={() => {
                                const newSkip = isSkipped
                                  ? lunchSettings.skipDays.filter((d) => d !== idx)
                                  : [...lunchSettings.skipDays, idx];
                                updateLunchSettings({ skipDays: newSkip });
                                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                backgroundColor: isSkipped ? colors.warning + "20" : colors.surface,
                                borderWidth: 1, borderColor: isSkipped ? colors.warning : colors.border,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "600", color: isSkipped ? colors.warning : colors.muted }}>{day}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Fridays skipped by default (short day, no lunch)</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Overhead Settings - Owner Only */}
          {(employee.role === "owner" || employee.role === "office_manager") && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.rowLast}
                onPress={() => {
                  setActiveTab("overhead");
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <MaterialIcons name="settings" size={18} color={colors.foreground} />
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Overhead & Expenses</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Set monthly business costs for accurate job costing</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sign Out */}
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: colors.error }]}
              onPress={() => {
                Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: logout },
                ]);
              }}
            >
              <Text style={{ color: colors.error, fontWeight: "700", fontSize: 15 }}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>

    {/* Trade Picker Modal */}
    <Modal visible={showTradePicker} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Select Your Trade</Text>
            <TouchableOpacity onPress={() => setShowTradePicker(false)}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 16 }}>
            {TRADE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => {
                  updateTrade(opt.key);
                  setShowTradePicker(false);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16,
                  borderRadius: 12, marginBottom: 8,
                  backgroundColor: companyTrade === opt.key ? colors.primary + "15" : "transparent",
                  borderWidth: companyTrade === opt.key ? 1.5 : 1,
                  borderColor: companyTrade === opt.key ? colors.primary : colors.border,
                }}
                activeOpacity={0.6}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: companyTrade === opt.key ? colors.primary : colors.foreground }}>{opt.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{opt.description}</Text>
                </View>
                {companyTrade === opt.key && <MaterialIcons name="check-circle" size={22} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
    </ScreenContainer>
  );
}

const tabStyles = StyleSheet.create({
  subTabBar: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  subTabScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  subTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
