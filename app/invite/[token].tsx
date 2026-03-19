import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const companyLogo = require("@/assets/images/company-logo.png");

export default function InviteScreen() {
  const colors = useColors();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [accepted, setAccepted] = useState(false);

  const { data: invite, isLoading } = trpc.employees.getByInviteToken.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const acceptInvite = trpc.employees.acceptInvite.useMutation({
    onSuccess: () => {
      setAccepted(true);
    },
    onError: (err) => {
      Alert.alert("Error", err.message || "Failed to accept invite.");
    },
  });

  const handleAccept = () => {
    if (!name.trim()) {
      Alert.alert("Missing Info", "Please enter your name.");
      return;
    }
    if (pin.length < 4) {
      Alert.alert("Invalid PIN", "PIN must be at least 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert("PIN Mismatch", "PINs do not match. Please try again.");
      return;
    }
    acceptInvite.mutate({ token: token || "", name: name.trim(), pin });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 24 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.foreground,
      backgroundColor: colors.surface,
      marginBottom: 14,
    },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      marginTop: 8,
    },
    label: { fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  });

  if (isLoading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.muted, marginTop: 12 }}>Loading invite...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!invite) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔗</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
            Invalid or Expired Invite
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
            This invite link is no longer valid. Please ask your manager for a new one.
          </Text>
          <TouchableOpacity style={{ marginTop: 24 }} onPress={() => router.replace("/login")}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (accepted) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Image source={companyLogo} style={{ width: 100, height: 100, resizeMode: "contain", marginBottom: 20 }} />
          <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
            Welcome to the Team!
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 24 }}>
            Your account is set up. You can now log in with your PIN.
          </Text>
          <TouchableOpacity style={styles.submitBtn} onPress={() => router.replace("/login")}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <Image source={companyLogo} style={{ width: 100, height: 100, resizeMode: "contain", marginBottom: 12 }} />
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: "center" }}>
              Welcome to BuildTrack Pro
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 6 }}>
              Carranza Custom Construction
            </Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }}>You've been invited as:</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{invite.name}</Text>
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600", marginTop: 2 }}>
              {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
            </Text>
          </View>

          <Text style={styles.label}>Your Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder={invite.name}
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Create a PIN (4-6 digits)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter PIN"
            placeholderTextColor={colors.muted}
            value={pin}
            onChangeText={setPin}
            keyboardType="numeric"
            maxLength={6}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter PIN"
            placeholderTextColor={colors.muted}
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="numeric"
            maxLength={6}
            secureTextEntry
          />

          <TouchableOpacity style={styles.submitBtn} onPress={handleAccept} disabled={acceptInvite.isPending}>
            {acceptInvite.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Set Up My Account</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
