import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee, isAuthenticated, loading } = useAppAuth();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const role = employee?.role || "laborer";
  const isOwner = role === "owner";
  const isOfficeMgr = role === "office_manager";
  const isLogistics = role === "logistics";

  // ─── Role Access Matrix ───────────────────────────────────────────────
  // Owner/Office Manager/Logistics: Home, Jobs & Reports, Goals, Manage (Team+Clock+Meetings+Payroll+Hours), Profile
  // Foreman: Home, Jobs & Reports, Goals, My Hours, Profile
  // Laborer: Home, Jobs & Reports, Goals, My Hours, Profile

  const isManagement = isOwner || isOfficeMgr || isLogistics;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />

      {/* ─── Merged Jobs + Reports tab ─── */}
      <Tabs.Screen
        name="jobsreports"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="briefcase.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="target" color={color} />,
        }}
      />

      {/* ─── Consolidated "Manage" tab for management roles ─── */}
      <Tabs.Screen
        name="manage"
        options={{
          title: "Manage",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="square.grid.2x2.fill" color={color} />,
          href: isManagement ? undefined : null,
        }}
      />

      {/* ─── My Hours tab for field roles (Foreman/Laborer) ─── */}
      <Tabs.Screen
        name="hours"
        options={{
          title: "My Hours",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="timer" color={color} />,
          href: !isManagement ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />

      {/* ─── Hidden tabs (accessed via Manage sub-tabs or embedded) ─── */}
      <Tabs.Screen
        name="jobs"
        options={{ href: null, title: "Jobs" }}
      />
      <Tabs.Screen
        name="reports"
        options={{ href: null, title: "Reports" }}
      />
      <Tabs.Screen
        name="clock"
        options={{ href: null, title: "Clock" }}
      />
      <Tabs.Screen
        name="meetings"
        options={{ href: null, title: "Meetings" }}
      />
      <Tabs.Screen
        name="safety"
        options={{ href: null, title: "Safety" }}
      />
      <Tabs.Screen
        name="labor-costs"
        options={{ href: null, title: "Labor $" }}
      />
      <Tabs.Screen
        name="kpis"
        options={{ href: null, title: "KPIs" }}
      />
      <Tabs.Screen
        name="payroll"
        options={{ href: null, title: "Payroll" }}
      />
      <Tabs.Screen
        name="team"
        options={{ href: null, title: "Team" }}
      />
    </Tabs>
  );
}
