import {
   ScreenContainer } from "@/components/screen-container";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_MORE as bg_more } from "@/constants/bg-urls";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  secretary: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer" };

const ROLE_COLORS: Record<string, string> = {
  owner: "#E8500A",
  secretary: "#8B5CF6",
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

export default function ProfileScreen() {
  const colors = useColors();
  const { employee, logout } = useAppAuth();
  const utils = trpc.useUtils();

  const [editingName, setEditingName] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [newName, setNewName] = useState(employee?.name || "");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  const updateEmployee = trpc.employees.update.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
    } });

  const styles = StyleSheet.create({
    section: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginHorizontal: 16,
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
        // No requestingEmployeeId needed — employees can update their own name
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

  return (
    <ScreenContainer>
        <ImageBackground source={bg_more} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}>
            <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground }}>My Profile</Text>
          </View>

          {/* Avatar + Role Badge */}
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: roleColor + "22", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: roleColor, marginBottom: 12 }}>
              <Text style={{ fontSize: 30, fontWeight: "800", color: roleColor }}>{getInitials(employee.name)}</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{employee.name}</Text>
            <View style={{ backgroundColor: roleColor + "22", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginTop: 6 }}>
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
    </ScreenContainer>
  );
}
