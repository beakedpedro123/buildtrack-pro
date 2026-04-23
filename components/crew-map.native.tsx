/**
 * CrewMap — Native (iOS/Android) implementation using react-native-maps
 * Shows clocked-in employees with GPS data on a real map.
 */
import React, { useMemo, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import MapView, { Marker, Callout } from "react-native-maps";

const ROLE_COLORS: Record<string, string> = {
  owner: "#E8500A",
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

export function CrewMap({ clockedIn, colors }: CrewMapProps) {
  const mapRef = useRef<any>(null);

  const membersWithGps = useMemo(() => {
    return (clockedIn || []).filter(
      (m) => m.clockInLatitude != null && m.clockInLongitude != null &&
        Number(m.clockInLatitude) !== 0 && Number(m.clockInLongitude) !== 0
    );
  }, [clockedIn]);

  const region = useMemo(() => {
    if (membersWithGps.length === 0) {
      return { latitude: 33.4484, longitude: -112.074, latitudeDelta: 0.5, longitudeDelta: 0.5 };
    }
    const lats = membersWithGps.map((m) => Number(m.clockInLatitude));
    const lngs = membersWithGps.map((m) => Number(m.clockInLongitude));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const deltaLat = Math.max((maxLat - minLat) * 1.5, 0.02);
    const deltaLng = Math.max((maxLng - minLng) * 1.5, 0.02);
    return { latitude: centerLat, longitude: centerLng, latitudeDelta: deltaLat, longitudeDelta: deltaLng };
  }, [membersWithGps]);

  if (membersWithGps.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ fontSize: 28, marginBottom: 8 }}>📍</Text>
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>
          No GPS data available yet.{"\n"}Locations appear when crew clocks in with GPS enabled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mapWrapper}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
        showsCompass={true}
        showsScale={true}
      >
        {membersWithGps.map((member) => {
          const roleColor = ROLE_COLORS[member.employeeRole] || colors.primary;
          return (
            <Marker
              key={member.employeeId}
              coordinate={{
                latitude: Number(member.clockInLatitude),
                longitude: Number(member.clockInLongitude),
              }}
              pinColor={roleColor}
              title={member.employeeName}
              description={`${member.jobName}`}
            />
          );
        })}
      </MapView>
      <View style={[styles.legend, { backgroundColor: colors.surface + "E6", borderColor: colors.border }]}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
          {membersWithGps.length} crew on map
        </Text>
        {membersWithGps.slice(0, 4).map((m) => (
          <View key={m.employeeId} style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ROLE_COLORS[m.employeeRole] || colors.primary, marginRight: 6 }} />
            <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>{m.employeeName}</Text>
          </View>
        ))}
        {membersWithGps.length > 4 && (
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>+{membersWithGps.length - 4} more</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    height: 220,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  legend: {
    position: "absolute",
    bottom: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
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
