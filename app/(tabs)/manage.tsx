import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useState, useCallback } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

// Import the actual screen components
import TeamScreen from "./team";
import MeetingsScreen from "./meetings";
import PayrollScreen from "./payroll";
import HoursScreen from "./hours";

type ManageTab = "team" | "meetings" | "payroll" | "hours";

export default function ManageScreen() {
  const colors = useColors();
  const { employee } = useAppAuth();
  const role = employee?.role || "laborer";
  const isOwner = role === "owner";
  const isOfficeMgr = role === "office_manager";
  const canViewPayroll = isOwner || isOfficeMgr;

  const [activeTab, setActiveTab] = useState<ManageTab>("team");

  const tabs: { key: ManageTab; label: string; icon: string }[] = [
    { key: "team", label: "Team", icon: "👥" },
    { key: "meetings", label: "Meetings", icon: "🎙️" },
    ...(canViewPayroll ? [{ key: "payroll" as ManageTab, label: "Payroll", icon: "💰" }] : []),
    { key: "hours", label: "My Hours", icon: "⏱️" },
  ];

  const handleTabPress = useCallback((tab: ManageTab) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
        {/* Sub-tab bar */}
        <View style={[styles.subTabBar, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabScroll}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleTabPress(tab.key)}
                  style={[
                    styles.subTab,
                    isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                    !isActive && { backgroundColor: "transparent", borderColor: colors.border },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 14 }}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.subTabText,
                      { color: isActive ? "#000" : colors.muted },
                      isActive && { fontWeight: "700" },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Content — each sub-screen handles its own ScreenContainer/SafeArea */}
      <View style={{ flex: 1 }}>
        {activeTab === "team" && <TeamScreen embedded />}
        {activeTab === "meetings" && <MeetingsScreen embedded />}
        {activeTab === "payroll" && <PayrollScreen embedded />}
        {activeTab === "hours" && <HoursScreen embedded />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  subTabBar: {
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
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
