/**
 * CrewMap — Web fallback implementation
 * Shows clocked-in employees with GPS data as location cards with "Open in Maps" links.
 * react-native-maps doesn't work on web, so we use a card-based layout.
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const ROLE_COLORS: Record<string, string> = {
  owner: "#1E3A5F",
  office_manager: "#8B5CF6",
  logistics: "#0EA5E9",
  foreman: "#F59E0B",
  laborer: "#22C55E",
};

interface CrewMember {
  employeeId: number;
  employeeName: string;
  employeeRole: string;
  jobName: string;
  clockInLatitude: string | number | null;
  clockInLongitude: string | number | null;
  clockIn: string;
}

interface CrewMapProps {
  clockedIn: CrewMember[];
  colors: any;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function CrewMap({ clockedIn, colors }: CrewMapProps) {
  const membersWithGps = useMemo(() => {
    return (clockedIn || []).filter(
      (m) => m.clockInLatitude != null && m.clockInLongitude != null &&
        Number(m.clockInLatitude) !== 0 && Number(m.clockInLongitude) !== 0
    );
  }, [clockedIn]);

  if (membersWithGps.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="location-on" size={28} color={colors.muted} style={{ marginBottom: 8 }} />
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>
          No GPS data available yet.{"\n"}Locations appear when crew clocks in with GPS enabled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
        {membersWithGps.map((member) => {
          const roleColor = ROLE_COLORS[member.employeeRole] || colors.primary;
          const lat = Number(member.clockInLatitude);
          const lng = Number(member.clockInLongitude);
          const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

          return (
            <TouchableOpacity
              key={member.employeeId}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => Linking.openURL(mapsUrl)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <View style={[styles.avatar, { backgroundColor: roleColor }]}>
                  <Text style={styles.avatarText}>{getInitials(member.employeeName)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                    {member.employeeName}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>
                    {member.jobName}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 10, color: colors.muted }}>
                   {lat.toFixed(4)}, {lng.toFixed(4)}
                </Text>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "600" }}>Open Map →</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    paddingLeft: 20,
  },
  card: {
    width: 200,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
