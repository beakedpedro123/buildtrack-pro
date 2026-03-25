import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = "select" | "pin";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  secretary: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "#E8500A",
  secretary: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
  laborer: "#22C55E",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function LoginScreen() {
  const colors = useColors();
  const { login } = useAppAuth();
  const [step, setStep] = useState<Step>("select");
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const { data: employees, isLoading } = trpc.employees.list.useQuery();
  const verifyPin = trpc.employees.verifyPin.useMutation();

  const handleSelectEmployee = (emp: any) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedEmployee(emp);
    setPin("");
    setError("");
    setStep("pin");
  };

  const handlePinPress = (digit: string) => {
    if (pin.length >= 6) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p + digit);
    setError("");
  };

  const handleDelete = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p.slice(0, -1));
  };

  useEffect(() => {
    if (pin.length === 4 || pin.length === 6) {
      handleVerify();
    }
  }, [pin]);

  const handleVerify = async () => {
    if (!selectedEmployee) return;
    try {
      const result = await verifyPin.mutateAsync({ pin });
      if (result && result.id === selectedEmployee.id) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await login(result as any);
        router.replace("/(tabs)");
      } else {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError("Incorrect PIN. Try again.");
        setPin("");
      }
    } catch {
      setError("Incorrect PIN. Try again.");
      setPin("");
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 },
    logo: { fontSize: 28, fontWeight: "800", color: colors.primary, letterSpacing: -0.5, textShadowColor: colors.primary + '33', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    subtitle: { fontSize: 14, color: colors.muted, marginTop: 4 },
    logoAccent: { color: colors.foreground },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 },
    empCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    empName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      marginTop: 3,
      alignSelf: "flex-start",
    },
    roleBadgeText: { fontSize: 11, fontWeight: "600", color: "#fff" },
    pinContainer: { flex: 1, alignItems: "center", paddingTop: 24 },
    pinDots: { flexDirection: "row", gap: 14, marginBottom: 32 },
    pinDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    pinDotFilled: { backgroundColor: colors.primary },
    keypad: { width: "100%", maxWidth: 280 },
    keyRow: { flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 16 },
    keyBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    keyText: { fontSize: 24, fontWeight: "600", color: colors.foreground },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    backText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
    errorText: { color: colors.error, fontSize: 14, marginBottom: 12, textAlign: "center" },
    selectedName: { fontSize: 22, fontWeight: "700", color: colors.foreground, marginBottom: 4 },
    selectedRole: { fontSize: 14, color: colors.muted, marginBottom: 24 },
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (step === "pin" && selectedEmployee) {
    const roleColor = ROLE_COLORS[selectedEmployee.role] || colors.primary;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>BuildTrack Pro</Text>
        </View>
        <View style={{ paddingHorizontal: 24 }}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { setStep("select"); setPin(""); setError(""); }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pinContainer}>
          <View style={[styles.avatar, { backgroundColor: roleColor, width: 64, height: 64, borderRadius: 32, marginBottom: 12 }]}>
            <Text style={[styles.avatarText, { fontSize: 22 }]}>{getInitials(selectedEmployee.name)}</Text>
          </View>
          <Text style={styles.selectedName}>{selectedEmployee.name}</Text>
          <Text style={styles.selectedRole}>{ROLE_LABELS[selectedEmployee.role]}</Text>
          <Text style={{ fontSize: 15, color: colors.muted, marginBottom: 20 }}>Enter your PIN</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.pinDots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
            ))}
          </View>
          <View style={styles.keypad}>
            {[["1","2","3"],["4","5","6"],["7","8","9"],["","0","⌫"]].map((row, ri) => (
              <View key={ri} style={styles.keyRow}>
                {row.map((key, ki) => (
                  <TouchableOpacity
                    key={ki}
                    style={[styles.keyBtn, key === "" && { opacity: 0 }]}
                    onPress={() => key === "⌫" ? handleDelete() : key !== "" ? handlePinPress(key) : null}
                    disabled={key === ""}
                  >
                    <Text style={[styles.keyText, key === "⌫" && { color: colors.error }]}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          {verifyPin.isPending && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>BuildTrack Pro</Text>
        <Text style={styles.subtitle}>Select your name to clock in</Text>
      </View>
      <View style={{ paddingHorizontal: 24, flex: 1 }}>
        <Text style={styles.sectionTitle}>Who are you?</Text>
        <FlatList
          data={employees || []}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const roleColor = ROLE_COLORS[item.role] || colors.primary;
            return (
              <TouchableOpacity style={styles.empCard} onPress={() => handleSelectEmployee(item)}>
                <View style={[styles.avatar, { backgroundColor: roleColor }]}>
                  <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.empName}>{item.name}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                    <Text style={styles.roleBadgeText}>{ROLE_LABELS[item.role]}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 48 }}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>No employees found.</Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>Ask your owner to add employees first.</Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
