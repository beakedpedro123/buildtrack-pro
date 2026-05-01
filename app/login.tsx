import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useLanguage } from "@/lib/language-context";
import { getCached, setCache, CACHE_KEYS, setCacheCompanyId } from "@/lib/data-cache";
import * as Auth from "@/lib/_core/auth";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = "company" | "select" | "pin";

const ROLE_KEYS: Record<string, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};
const ROLE_COLORS: Record<string, string> = {
  owner: "#1E3A5F",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
  laborer: "#22C55E",
};

const COMPANY_CODE_KEY = "btp_company_code";

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
  const { isOnline } = useOfflineQueue();
  const { t } = useLanguage();
  const getRoleLabel = (role: string) => t(ROLE_KEYS[role] || role);
  const [step, setStep] = useState<Step>("company");
  const [companyCode, setCompanyCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cachedEmployees, setCachedEmployees] = useState<any[] | null>(null);

  const { data: employees, isLoading } = trpc.employees.listForLogin.useQuery(
    { companyId: companyId || 0 },
    {
      retry: 1,
      staleTime: 30000,
      enabled: step !== "company" && !!companyId && companyId > 0,
    }
  );
  const verifyPin = trpc.employees.verifyPin.useMutation();
  const lookupCompany = trpc.company.lookupBySlug.useMutation();

  // Check for saved company code on mount
  useEffect(() => {
    AsyncStorage.getItem(COMPANY_CODE_KEY).then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCompanyCode(parsed.slug);
          setCompanyName(parsed.name);
          if (parsed.id) setCompanyId(parsed.id);
          setStep("select");
        } catch {
          // Invalid saved data, stay on company step
        }
      }
    });
  }, []);

  // Load cached employees when companyId is known (scoped by company)
  useEffect(() => {
    if (companyId) {
      setCacheCompanyId(companyId);
      getCached<any[]>(CACHE_KEYS.LOGIN_EMPLOYEES).then((d) => {
        if (d) setCachedEmployees(d);
      });
    } else {
      setCachedEmployees(null);
    }
  }, [companyId]);

  // Cache employees when fetched from server (scoped by company)
  useEffect(() => {
    if (employees && employees.length > 0 && companyId) {
      setCacheCompanyId(companyId);
      setCache(CACHE_KEYS.LOGIN_EMPLOYEES, employees);
      setCachedEmployees(employees);
    }
  }, [employees, companyId]);

  const effectiveEmployees = employees || cachedEmployees || [];

  const handleCompanyLookup = async () => {
    const code = companyCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!code || code.length < 2) {
      setCompanyError("Enter your company code (at least 2 characters)");
      return;
    }
    setLookingUp(true);
    setCompanyError("");
    try {
      const result = await lookupCompany.mutateAsync({ slug: code });
      if (result && result.name) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCompanyName(result.name);
        setCompanyCode(code);
        setCompanyId(result.id);
        await AsyncStorage.setItem(COMPANY_CODE_KEY, JSON.stringify({ slug: code, name: result.name, id: result.id }));
        setStep("select");
      } else {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCompanyError("Company not found. Check your code and try again.");
      }
    } catch {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCompanyError("Company not found. Check your code and try again.");
    }
    setLookingUp(false);
  };

  const handleChangeCompany = async () => {
    await AsyncStorage.removeItem(COMPANY_CODE_KEY);
    setCompanyCode("");
    setCompanyName("");
    setCompanyId(null);
    setCachedEmployees(null);
    setStep("company");
  };

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
    if (!selectedEmployee || verifying) return;
    setVerifying(true);

    if (isOnline) {
      try {
        const result = await verifyPin.mutateAsync({ pin, companyId: companyId || undefined });
        if (result && (result as any).id === selectedEmployee.id) {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Store the PIN session JWT so subsequent API calls are authenticated
          const pinToken = (result as any).pinSessionToken;
          if (pinToken) {
            await Auth.setSessionToken(pinToken);
          }
          await login(result as any);
          router.replace("/(tabs)");
          return;
        } else {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError("Incorrect PIN. Try again.");
          setPin("");
          setVerifying(false);
          return;
        }
      } catch {
        // Server failed — fall through to offline verification
      }
    }

    if (selectedEmployee.pin && selectedEmployee.pin === pin) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await login(selectedEmployee as any);
      router.replace("/(tabs)");
    } else {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Incorrect PIN. Try again.");
      setPin("");
    }
    setVerifying(false);
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
    offlineBanner: {
      backgroundColor: colors.warning,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    // Company code step styles
    companyContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 40, alignItems: "center" },
    companyTitle: { fontSize: 22, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: "center" },
    companySubtitle: { fontSize: 14, color: colors.muted, marginBottom: 32, textAlign: "center", lineHeight: 20 },
    companyInput: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 18,
      fontWeight: "600" as const,
      color: colors.foreground,
      textAlign: "center" as const,
      letterSpacing: 1,
    },
    companyHint: { fontSize: 12, color: colors.muted, marginTop: 8, textAlign: "center" },
    companyBtn: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center" as const,
      marginTop: 24,
    },
    companyBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    companyBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.primary + "40",
      marginBottom: 8,
    },
  });

  // ── STEP 1: Company Code ──────────────────────────────────────────────
  if (step === "company") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>BuildTrack <Text style={styles.logoAccent}>Pro</Text></Text>
        </View>
        <View style={styles.companyContainer}>
          <Text style={styles.companyTitle}>Enter Your Company Code</Text>
          <Text style={styles.companySubtitle}>
            Your company owner will give you this code.{"\n"}
            Ingresa el código de tu empresa.
          </Text>
          <TextInput
            style={styles.companyInput}
            value={companyCode}
            onChangeText={(t) => {
              setCompanyCode(t.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              setCompanyError("");
            }}
            placeholder="e.g. smith-construction"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleCompanyLookup}
          />
          <Text style={styles.companyHint}>
            This is the URL your owner chose during signup
          </Text>
          {companyError ? (
            <Text style={[styles.errorText, { marginTop: 12 }]}>{companyError}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.companyBtn, lookingUp && { opacity: 0.6 }]}
            onPress={handleCompanyLookup}
            disabled={lookingUp}
          >
            {lookingUp ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.companyBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 24, textAlign: "center" }}>
            Don't have a code? Ask your company owner{"\n"}or sign up at buildtrackpro.com
          </Text>
        </View>
      </SafeAreaView>
      </View>
    );
  }

  // ── STEP 3: PIN Entry ─────────────────────────────────────────────────
  if (step === "pin" && selectedEmployee) {
    const roleColor = ROLE_COLORS[selectedEmployee.role] || colors.primary;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>BuildTrack <Text style={styles.logoAccent}>Pro</Text></Text>
        </View>
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              Offline mode — using cached data
            </Text>
          </View>
        )}
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
          <Text style={styles.selectedRole}>{getRoleLabel(selectedEmployee.role)}</Text>
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
          {verifying && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
        </View>
      </SafeAreaView>
      </View>
    );
  }

  // ── STEP 2: Employee Selection ────────────────────────────────────────
  if (isLoading && !cachedEmployees) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>BuildTrack <Text style={styles.logoAccent}>Pro</Text></Text>
        <Text style={styles.subtitle}>Select your name to clock in</Text>
      </View>
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
            Offline mode — using cached data
          </Text>
        </View>
      )}
      {/* Company badge */}
      <View style={{ paddingHorizontal: 24, marginBottom: 12 }}>
        <View style={styles.companyBadge}>
          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700", flex: 1 }}>
            {companyName || "Your Company"}
          </Text>
          <TouchableOpacity onPress={handleChangeCompany}>
            <Text style={{ fontSize: 12, color: colors.muted, textDecorationLine: "underline" }}>Change</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, flex: 1 }}>
        <Text style={styles.sectionTitle}>Who are you?</Text>
        <FlatList
          data={effectiveEmployees}
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
                    <Text style={styles.roleBadgeText}>{getRoleLabel(item.role)}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 48 }}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>No employees found.</Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>
                {isOnline ? "Ask your owner to add employees first." : "Connect to the internet to load employee data."}
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
    </View>
  );
}
