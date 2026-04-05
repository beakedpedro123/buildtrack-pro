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
  const isForeman = role === "foreman";
  const isLaborer = role === "laborer";

  // ─── Role Access Matrix ───────────────────────────────────────────────
  // Owner/Office Manager: Dashboard, Jobs, Goals, Reports, Manage (Team+Meetings+Payroll+Hours), Profile
  // Logistics: Dashboard, Jobs, Goals, Reports, Manage (Team+Meetings+Hours), Profile
  // Foreman: Dashboard, Jobs, Goals, Reports, My Hours, Profile (no consolidation needed — already clean)
  // Laborer: Dashboard, Jobs, Goals, Reports, My Hours, Profile

  const isManagement = isOwner || isOfficeMgr || isLogistics;
  const canManageTeam = isOwner || isOfficeMgr || isLogistics;
  const canViewPayroll = isOwner || isOfficeMgr;
  const canMeetings = isOwner || isOfficeMgr || isLogistics;
  const canViewGoals = true;
  const canViewHours = true;
  const canViewReports = true;

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
      <Tabs.Screen
        name="jobs"
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
          href: canViewGoals ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="doc.text.fill" color={color} />,
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

      {/* ─── Individual tabs hidden for management, shown for field roles ─── */}
      <Tabs.Screen
        name="clock"
        options={{
          title: "Clock",
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="clock.fill" color={color} />,
          href: undefined,
        }}
      />
      <Tabs.Screen
        name="hours"
        options={{
          title: "My Hours",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="timer" color={color} />,
          href: (!isManagement && canViewHours) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: "Meetings",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="mic.fill" color={color} />,
          href: null, // Always hidden from tab bar — accessed via Manage tab for management
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: "Safety",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="shield.fill" color={color} />,
          href: null,
        }}
      />
      <Tabs.Screen
        name="labor-costs"
        options={{
          title: "Labor $",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="chart.line.uptrend.xyaxis" color={color} />,
          href: null,
        }}
      />
      <Tabs.Screen
        name="kpis"
        options={{
          title: "KPIs",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="chart.bar.fill" color={color} />,
          href: null,
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          title: "Payroll",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="dollarsign.circle.fill" color={color} />,
          href: null, // Always hidden — accessed via Manage tab
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "Team",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.3.fill" color={color} />,
          href: null, // Always hidden — accessed via Manage tab
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
