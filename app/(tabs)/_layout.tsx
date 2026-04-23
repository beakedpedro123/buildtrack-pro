import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { trpc } from "@/lib/trpc";

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
  // Owner/Office Manager/Logistics: Home, Jobs, Goals, Manage, Profile (with Messages)
  // Foreman: Home, Jobs, Goals, Manage, Profile (with Messages)
  // Laborer: Home, Jobs, Goals, Manage, Profile (with Messages)
  // All roles now get Manage tab — laborers see My Hours there
  // Messages are embedded in Profile tab for all roles

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <OfflineBanner />
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
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="building.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="target" color={color} />,
        }}
      />

      {/* ─── Manage tab — all roles get this now ─── */}
      <Tabs.Screen
        name="manage"
        options={{
          title: "Manage",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="square.grid.2x2.fill" color={color} />,
        }}
      />

      {/* ─── Profile tab (now includes Messages) ─── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.crop.circle.fill" color={color} />,
        }}
      />

      {/* ─── Hidden tabs (accessed via sub-navigation or embedded) ─── */}
      <Tabs.Screen
        name="hours"
        options={{ href: null, title: "My Hours" }}
      />
      <Tabs.Screen
        name="messages"
        options={{ href: null, title: "Messages" }}
      />
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
      <Tabs.Screen
        name="charts"
        options={{ href: null, title: "Charts" }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ href: null, title: "Schedule" }}
      />
    </Tabs>
    </View>
  );
}
