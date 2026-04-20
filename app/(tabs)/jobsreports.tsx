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
import JobsScreen from "./jobs";
import ReportsScreen from "./reports";
import ChartsScreen from "./charts";

type SubTab = "jobs" | "reports" | "charts";

export default function JobsReportsScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<SubTab>("jobs");

  const tabs: { key: SubTab; label: string; icon: string }[] = [
    { key: "jobs", label: "Jobs", icon: "🏗️" },
    { key: "reports", label: "Reports", icon: "📋" },
    { key: "charts", label: "Charts", icon: "📊" },
  ];

  const handleTabPress = useCallback((tab: SubTab) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
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
      <View style={{ flex: 1 }}>
        {activeTab === "jobs" && <JobsScreen embedded />}
        {activeTab === "reports" && <ReportsScreen embedded />}
        {activeTab === "charts" && <ChartsScreen embedded />}
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
