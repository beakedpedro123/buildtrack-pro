import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useState, useCallback, useMemo, useEffect } from "react";
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
  View, ImageBackground, Modal, Linking } from "react-native";

import { BG_MORE as bg_more } from "@/constants/bg-urls";
import { useLanguage, type AppLanguage } from "@/lib/language-context";
// Messages feature removed
import { OverheadSettings } from "@/components/overhead-settings";
import { useGpsTracking } from "@/hooks/use-gps-tracking";
import { useLunchSettings } from "@/hooks/use-lunch-settings";
import { useCompanyTrade, TRADE_OPTIONS } from "@/hooks/use-company-trade";
import { Switch, Image as RNImage } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { getApiBaseUrl } from "@/constants/oauth";
import { useBranding } from "@/lib/branding-context";
// Crew clock-in uses trpc queries directly, no extra cache imports needed

// Trade icon mapping (MaterialIcons names)
const TRADE_ICON_MAP: Record<string, string> = {
  general_contractor: "construction", framing: "carpenter", steel_erection: "precision-manufacturing",
  concrete: "foundation", electrical: "electrical-services", plumbing: "plumbing",
  hvac: "hvac", roofing: "roofing", painting: "format-paint",
  construction_cleaning: "cleaning-services", drywall: "view-quilt", masonry: "layers",
  landscaping: "yard", demolition: "foundation", insulation: "thermostat",
  flooring: "grid-on", welding: "hardware", excavation: "terrain",
  windows_doors: "door-front", other: "build",
};
// Quick lookup map for trade data by slug
const AVAILABLE_TRADES_MAP: Record<string, { name: string; icon: string; description: string }> = Object.fromEntries(
  Object.entries(TRADE_ICON_MAP).map(([slug, icon]) => [slug, { name: slug.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), icon, description: "" }])
);

const ROLE_LABEL_KEYS: Record<string, string> = {
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
  const { language, setLanguage, t } = useLanguage();
  const ROLE_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(ROLE_LABEL_KEYS).map(([k, v]) => [k, t(v)])
  );
  const { gpsEnabled, toggleGps } = useGpsTracking();
  const { lunchSettings, updateSettings: updateLunchSettings } = useLunchSettings();
  const { trade: companyTrade, updateTrade } = useCompanyTrade();
  const [showTradePicker, setShowTradePicker] = useState(false);

  const empId = (employee as any)?.id ?? 0;
  const companyId = (employee as any)?.companyId ?? 1;

  // ═══ Server-Backed Trade Management ═══
  const { data: tradeData, refetch: refetchTrades } = trpc.tradeKnowledge.getCompanyTrades.useQuery(
    { companyId },
    { enabled: employee?.role === "owner", staleTime: 30000 }
  );
  const updateTradesMutation = trpc.tradeKnowledge.updateCompanyTrades.useMutation();
  const [serverTrades, setServerTrades] = useState<string[]>([]);
  const [serverPrimaryTrade, setServerPrimaryTrade] = useState<string>("general_contractor");
  const [savingTrades, setSavingTrades] = useState(false);

  // Sync server trade data to local state when it loads
  React.useEffect(() => {
    if (tradeData?.trades) {
      setServerTrades(tradeData.trades);
      setServerPrimaryTrade(tradeData.primaryTrade || tradeData.trades[0] || "general_contractor");
    }
  }, [tradeData]);

  const handleSaveTrades = useCallback(async () => {
    if (serverTrades.length === 0) return;
    setSavingTrades(true);
    try {
      await updateTradesMutation.mutateAsync({
        companyId,
        trades: serverTrades,
        primaryTrade: serverPrimaryTrade,
        requestingEmployeeId: empId,
      });
      // Also sync to local AsyncStorage for offline use
      updateTrade(serverPrimaryTrade as any);
      await refetchTrades();
      setShowTradePicker(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Trades Updated", `${serverTrades.length} trade${serverTrades.length > 1 ? "s" : ""} saved successfully.`);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to update trades");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingTrades(false);
    }
  }, [serverTrades, serverPrimaryTrade, companyId, empId]);

  // ═══ Company Branding State (from centralized BrandingContext) ═══
  const { branding: brandingData, invalidateBranding } = useBranding();
  const updateLogoMutation = trpc.branding.updateLogo.useMutation();
  const updateBrandColorMutation = trpc.branding.updateBrandColor.useMutation();
  const removeLogoMutation = trpc.branding.removeLogo.useMutation();
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [brandColorInput, setBrandColorInput] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Preset brand colors
  const PRESET_COLORS = [
    "#C9A84C", "#1E3A5F", "#2D5016", "#8B1A1A", "#4A2C6E",
    "#D4620B", "#0A7EA4", "#333333", "#B8860B", "#1B4332",
    "#7C3AED", "#DC2626", "#0369A1", "#854D0E", "#166534",
  ];

  React.useEffect(() => {
    if (brandingData?.brandColor) setBrandColorInput(brandingData.brandColor);
  }, [brandingData]);

  const handlePickLogo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission Needed", "Please allow photo access to upload your logo."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploadingLogo(true);
      const uri = result.assets[0].uri;
      const apiBase = getApiBaseUrl();
      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append("file", blob, `logo_${companyId}_${Date.now()}.jpg`);
      } else {
        formData.append("file", { uri, type: "image/jpeg", name: `logo_${companyId}_${Date.now()}.jpg` } as any);
      }
      const uploadRes = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();
      await updateLogoMutation.mutateAsync({ companyId, logoUrl: url, requestingEmployeeId: empId });
      // Invalidate branding globally — all screens (home, profile, etc.) update instantly
      invalidateBranding();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Logo Updated", "Your company logo has been updated successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }, [companyId, empId]);

  const handleRemoveLogo = useCallback(async () => {
    Alert.alert("Remove Logo", "Are you sure you want to remove your company logo?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          await removeLogoMutation.mutateAsync({ companyId, requestingEmployeeId: empId });
          invalidateBranding();
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: any) { Alert.alert("Error", err?.message || "Failed to remove logo"); }
      }},
    ]);
  }, [companyId, empId]);

  const handleSaveBrandColor = useCallback(async (color: string) => {
    try {
      await updateBrandColorMutation.mutateAsync({ companyId, brandColor: color, requestingEmployeeId: empId });
      setBrandColorInput(color);
      invalidateBranding();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to update brand color");
    }
  }, [companyId, empId]);

  // ═══ Crew Clock-In State ═══
  const canManageCrew = employee?.role === "owner" || employee?.role === "office_manager" || employee?.role === "logistics" || employee?.role === "foreman";
  const isForeman = employee?.role === "foreman";
  const [showCrewClockIn, setShowCrewClockIn] = useState(false);
  const [clockEmpId, setClockEmpId] = useState<number | null>(null);
  const [clockJobId, setClockJobId] = useState<number | null>(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [useCustomClockTime, setUseCustomClockTime] = useState(false);
  const [customClockTime, setCustomClockTime] = useState("");
  const [customClockAmpm, setCustomClockAmpm] = useState("AM");

  const { data: allEmployees } = trpc.employees.list.useQuery(undefined, { enabled: canManageCrew, staleTime: 15000 });
  const { data: clockedIn, refetch: refetchClockedIn } = trpc.clock.allClockedIn.useQuery(undefined, { enabled: canManageCrew, staleTime: 0, refetchInterval: 15000 });
  const { data: activeJobs } = trpc.jobs.listActive.useQuery(undefined, { enabled: canManageCrew, staleTime: 15000 });
  const clockInMutation = trpc.clock.in.useMutation();

  const notClockedInEmployees = useMemo(() => {
    const clockedInIds = new Set((clockedIn || []).map((e: any) => e.employeeId));
    const allActive = (allEmployees || []).filter((e: any) => e.isActive && !clockedInIds.has(e.id));
    if (isForeman && employee) {
      return allActive.filter((e: any) => e.role === "laborer");
    }
    return allActive;
  }, [allEmployees, clockedIn, isForeman, employee]);

  const handleCrewClockIn = useCallback(async () => {
    if (!clockEmpId || !clockJobId) {
      Alert.alert("Select Both", "Please select an employee and a job.");
      return;
    }
    if (clockLoading) return;
    setClockLoading(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      await clockInMutation.mutateAsync({ employeeId: clockEmpId, jobId: clockJobId, clockIn: clockInTime, isOfflineEntry: false });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        utils.clock.allClockedIn.invalidate(),
        utils.clock.activeEntry.invalidate(),
        utils.clock.history.invalidate(),
      ]);
      await refetchClockedIn();
      setShowCrewClockIn(false);
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
                      {tradeData?.trades?.length ? `${tradeData.trades.length} trade${tradeData.trades.length > 1 ? "s" : ""} • ${(tradeData.availableTrades?.find((t: any) => t.slug === tradeData.primaryTrade)?.name || TRADE_OPTIONS.find((t) => t.key === companyTrade)?.label || "Framing")}` : (TRADE_OPTIONS.find((t) => t.key === companyTrade)?.label || "Framing")}
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

          {/* Company Branding — Owner/Office Manager */}
          {(employee.role === "owner" || employee.role === "office_manager") && (
            <View style={styles.section}>
              <View style={styles.row}>
                <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>COMPANY BRANDING</Text>
              </View>
              {/* Logo Upload */}
              <TouchableOpacity
                style={[styles.row, { justifyContent: "space-between" }]}
                onPress={handlePickLogo}
                activeOpacity={0.6}
                disabled={uploadingLogo}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  {brandingData?.logoUrl ? (
                    <RNImage source={{ uri: brandingData.logoUrl }} style={{ width: 36, height: 36, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }}>
                      <MaterialIcons name="add-a-photo" size={18} color={colors.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                      {brandingData?.logoUrl ? "Company Logo" : "Upload Logo"}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {brandingData?.logoUrl ? "Tap to change • Appears on reports & dashboard" : "JPG, PNG, PDF • Appears on all reports"}
                    </Text>
                  </View>
                </View>
                {uploadingLogo ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : brandingData?.logoUrl ? (
                  <TouchableOpacity onPress={handleRemoveLogo} style={{ padding: 4 }}>
                    <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                ) : (
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                )}
              </TouchableOpacity>
              {/* Brand Color */}
              <TouchableOpacity
                style={[styles.rowLast, { justifyContent: "space-between" }]}
                onPress={() => setShowColorPicker(!showColorPicker)}
                activeOpacity={0.6}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: brandingData?.brandColor || colors.primary, borderWidth: 1, borderColor: colors.border }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Brand Color</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {brandingData?.brandColor || "Default"} • Used on reports & app accent
                    </Text>
                  </View>
                </View>
                <MaterialIcons name={showColorPicker ? "expand-less" : "expand-more"} size={20} color={colors.muted} />
              </TouchableOpacity>
              {/* Color Picker Dropdown */}
              {showColorPicker && (
                <View style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginTop: -1 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                    {PRESET_COLORS.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => handleSaveBrandColor(c)}
                        style={{
                          width: 36, height: 36, borderRadius: 8, backgroundColor: c,
                          borderWidth: brandingData?.brandColor === c ? 3 : 1,
                          borderColor: brandingData?.brandColor === c ? colors.foreground : colors.border,
                        }}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={brandColorInput}
                      onChangeText={setBrandColorInput}
                      placeholder="#C9A84C"
                      placeholderTextColor={colors.muted}
                      maxLength={7}
                      style={{
                        flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.background,
                        borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12,
                        fontSize: 14, color: colors.foreground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        if (/^#[0-9A-Fa-f]{6}$/.test(brandColorInput)) handleSaveBrandColor(brandColorInput);
                        else Alert.alert("Invalid Color", "Please enter a valid hex color like #C9A84C");
                      }}
                      style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(brandColorInput) ? brandColorInput : colors.primary, paddingHorizontal: 16, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Lunch/Break Deduction — Owner/Office Manager */}
          {(employee.role === "owner" || employee.role === "office_manager") && (
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

          {/* ═══ Crew Clock-In Section ═══ */}
          {canManageCrew && (
            <View style={styles.section}>
              <View style={styles.row}>
                <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "600" }}>CREW CLOCK-IN</Text>
              </View>
              <TouchableOpacity
                style={[styles.rowLast, { justifyContent: "flex-start", gap: 12 }]}
                onPress={() => setShowCrewClockIn(true)}
                activeOpacity={0.6}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success + "20", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="access-time" size={20} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Manual Clock-In</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Clock in crew members who missed their punch</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Contact Support — Owner Only */}
          {employee?.role === "owner" && (
            <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}
                onPress={() => Linking.openURL("https://buildtrack-dnjxcthz.manus.space/api/web/support")}
              >
                <MaterialIcons name="support-agent" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>Contact Support</Text>
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

    {/* Crew Clock-In Modal */}
    {canManageCrew && (
      <Modal visible={showCrewClockIn} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Clock In Employee</Text>
            <TouchableOpacity onPress={() => { setShowCrewClockIn(false); setClockEmpId(null); setClockJobId(null); setUseCustomClockTime(false); setCustomClockTime(""); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Select Employee</Text>
            {notClockedInEmployees.map((emp: any) => {
              const isSelected = clockEmpId === emp.id;
              const empRoleColor = ROLE_COLORS[emp.role] || colors.primary;
              return (
                <TouchableOpacity
                  key={emp.id}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1.5, borderColor: isSelected ? colors.success : colors.border, backgroundColor: isSelected ? colors.success + "15" : colors.surface }}
                  onPress={() => setClockEmpId(emp.id)}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: empRoleColor, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{getInitials(emp.name)}</Text>
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
            {(activeJobs || []).filter((j: any) => j.status === "active").map((job: any) => {
              const isSelected = clockJobId === job.id;
              return (
                <TouchableOpacity
                  key={job.id}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1.5, borderColor: isSelected ? colors.success : colors.border, backgroundColor: isSelected ? colors.success + "15" : colors.surface }}
                  onPress={() => setClockJobId(job.id)}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: isSelected ? colors.success : colors.foreground }}>{job.name}</Text>
                  {isSelected && <Text style={{ color: colors.success, fontWeight: "700", fontSize: 18, marginLeft: 8 }}>✓</Text>}
                </TouchableOpacity>
              );
            })}

            {/* Custom Clock-In Time */}
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
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: useCustomClockTime ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: useCustomClockTime ? colors.primary : colors.border }}
                >
                  <MaterialIcons name="schedule" size={16} color={useCustomClockTime ? colors.primary : colors.muted} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: useCustomClockTime ? colors.primary : colors.muted }}>{useCustomClockTime ? "Custom" : "Now"}</Text>
                </TouchableOpacity>
              </View>
              {useCustomClockTime && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={customClockTime}
                    onChangeText={setCustomClockTime}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: "700", color: colors.foreground, backgroundColor: colors.surface, textAlign: "center" }}
                    placeholder="H:MM"
                    placeholderTextColor={colors.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  {["AM", "PM"].map((ap) => (
                    <TouchableOpacity
                      key={ap}
                      onPress={() => setCustomClockAmpm(ap)}
                      style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: customClockAmpm === ap ? colors.primary : colors.surface, borderWidth: 1, borderColor: customClockAmpm === ap ? colors.primary : colors.border }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "700", color: customClockAmpm === ap ? "#fff" : colors.foreground }}>{ap}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={{ backgroundColor: colors.success, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 16, opacity: (!clockEmpId || !clockJobId || clockLoading) ? 0.5 : 1 }}
              onPress={handleCrewClockIn}
              disabled={!clockEmpId || !clockJobId || clockLoading}
            >
              {clockLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Clock In</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    )}

    {/* Trade Management Modal — Server-Backed Multi-Trade Picker */}
    <Modal visible={showTradePicker} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Manage Trades</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {serverTrades.length > 0 ? `${serverTrades.length} trade${serverTrades.length > 1 ? "s" : ""} selected` : "Select your trades"}
                {!tradeData?.allTradesUnlocked && serverTrades.length >= 3 ? " • Upgrade for more" : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowTradePicker(false)}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {/* Primary Trade Selector */}
          {serverTrades.length > 1 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 8 }}>PRIMARY TRADE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {serverTrades.map((slug: string) => {
                  const serverTrade = tradeData?.availableTrades?.find((t: any) => t.slug === slug);
                  const iconName = TRADE_ICON_MAP[slug] || "build";
                  const tradeName = serverTrade?.name || slug.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                  const isPrimary = serverPrimaryTrade === slug;
                  return (
                    <TouchableOpacity
                      key={slug}
                      onPress={() => {
                        setServerPrimaryTrade(slug);
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 6,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: isPrimary ? colors.primary : "transparent",
                        borderWidth: 1, borderColor: isPrimary ? colors.primary : colors.border,
                      }}
                    >
                      <MaterialIcons name={iconName as any} size={16} color={isPrimary ? "#fff" : colors.foreground} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: isPrimary ? "#fff" : colors.foreground }}>{tradeName}</Text>
                      {isPrimary && <MaterialIcons name="star" size={14} color="#FFD700" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <ScrollView style={{ padding: 16 }}>
            {tradeData?.availableTrades?.map((opt: any) => {
              const isSelected = serverTrades.includes(opt.slug);
              const isPrimary = serverPrimaryTrade === opt.slug;
              const iconName = TRADE_ICON_MAP[opt.slug] || "build";
              return (
                <TouchableOpacity
                  key={opt.slug}
                  onPress={() => {
                    if (isSelected) {
                      // Remove trade
                      const newTrades = serverTrades.filter((s: string) => s !== opt.slug);
                      if (newTrades.length === 0) return; // Must have at least 1
                      setServerTrades(newTrades);
                      if (serverPrimaryTrade === opt.slug) setServerPrimaryTrade(newTrades[0]);
                    } else {
                      // Add trade — GC counts as 1 trade, only allTradesUnlocked bypasses the 3-trade cap
                      const isUnlocked = tradeData?.allTradesUnlocked || false;
                      if (!isUnlocked && serverTrades.length >= 3) {
                        Alert.alert("Trade Limit", "Free plan allows up to 3 trades. Upgrade to All Trades ($4.99/mo) to unlock all trades.");
                        return;
                      }
                      setServerTrades([...serverTrades, opt.slug]);
                      if (serverTrades.length === 0) setServerPrimaryTrade(opt.slug);
                    }
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16,
                    borderRadius: 12, marginBottom: 8,
                    backgroundColor: isSelected ? colors.primary + "12" : "transparent",
                    borderWidth: isSelected ? 1.5 : 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                  activeOpacity={0.6}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isSelected ? colors.primary + "20" : colors.background, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <MaterialIcons name={iconName as any} size={20} color={isSelected ? colors.primary : colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: isSelected ? colors.primary : colors.foreground }}>{opt.name}</Text>
                      {isPrimary && <View style={{ backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>PRIMARY</Text></View>}
                    </View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{opt.description}</Text>
                  </View>
                  <MaterialIcons name={isSelected ? "check-circle" : "radio-button-unchecked"} size={22} color={isSelected ? colors.primary : colors.border} />
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 20 }} />
            {/* Save Button */}
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center",
                opacity: savingTrades ? 0.6 : 1,
              }}
              onPress={handleSaveTrades}
              disabled={savingTrades}
            >
              {savingTrades ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Save Trades ({serverTrades.length})</Text>
              )}
            </TouchableOpacity>
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
