import { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const JOB_PICKER_CACHE_KEY = "@job_picker_cache_v1";

interface JobItem {
  id: number;
  name: string;
}

interface JobPickerProps {
  employeeId: number;
  selectedJobId: number | null;
  onSelectJob: (jobId: number) => void;
}

/**
 * Job picker — ClockShark/Jibble style.
 * Tapping the selector opens a full-screen modal with a scrollable list
 * and search bar. Fully scrollable, no cut-off jobs.
 */
export function JobPicker({ employeeId, selectedJobId, onSelectJob }: JobPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch from server
  const { data: serverJobs, isLoading: queryLoading } = trpc.jobs.forEmployee.useQuery(
    { employeeId },
    { enabled: employeeId > 0, staleTime: 0, refetchOnMount: "always" }
  );

  // Also fetch all active jobs as fallback
  const { data: allActiveJobs } = trpc.jobs.listActive.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Load cached jobs on mount (for instant display)
  useEffect(() => {
    AsyncStorage.getItem(JOB_PICKER_CACHE_KEY + "_" + employeeId)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.id && parsed[0]?.name) {
              setJobs(parsed);
            }
          } catch {}
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [employeeId]);

  // When server data arrives, extract just id + name and update
  useEffect(() => {
    const source = serverJobs && serverJobs.length > 0 ? serverJobs : allActiveJobs;
    if (source && Array.isArray(source) && source.length > 0) {
      const cleaned: JobItem[] = [];
      for (const item of source) {
        if (item && typeof item === "object" && item.id && item.name) {
          cleaned.push({ id: Number(item.id), name: String(item.name) });
        }
      }
      if (cleaned.length > 0) {
        setJobs(cleaned);
        setLoading(false);
        AsyncStorage.setItem(
          JOB_PICKER_CACHE_KEY + "_" + employeeId,
          JSON.stringify(cleaned)
        ).catch(() => {});
      }
    }
  }, [serverJobs, allActiveJobs, employeeId]);

  // Auto-select if only one job
  useEffect(() => {
    if (jobs.length === 1 && !selectedJobId) {
      onSelectJob(jobs[0].id);
    }
  }, [jobs, selectedJobId, onSelectJob]);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  const openModal = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearch("");
    setModalVisible(true);
  };

  const handleSelect = (jobId: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectJob(jobId);
    setModalVisible(false);
  };

  const filteredJobs = search.trim()
    ? jobs.filter((j) => j.name.toLowerCase().includes(search.toLowerCase().trim()))
    : jobs;

  if (loading && queryLoading && jobs.length === 0) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>Loading jobsites...</Text>
      </View>
    );
  }

  if (jobs.length === 0) {
    return (
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 14, textAlign: "center" }}>
        No assigned jobsites
      </Text>
    );
  }

  // If only 1 job, just show it as a static row (no picker needed)
  if (jobs.length === 1) {
    return (
      <View style={{ marginBottom: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: colors.primary + "18",
            borderWidth: 1.5,
            borderColor: colors.primary,
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.primary }}>
            {jobs[0].name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700" }}>✓</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 14 }}>
      {/* Selector Button — tapping opens the full-screen modal */}
      <TouchableOpacity
        onPress={openModal}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: selectedJob ? colors.primary + "12" : colors.surface,
          borderWidth: 1.5,
          borderColor: selectedJob ? colors.primary : colors.border,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: selectedJob ? "700" : "500",
            color: selectedJob ? colors.primary : colors.muted,
          }}
          numberOfLines={1}
        >
          {selectedJob ? selectedJob.name : "Select a jobsite"}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.muted,
            marginLeft: 8,
            fontWeight: "600",
          }}
        >
          {jobs.length} sites
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginLeft: 8 }}>▼</Text>
      </TouchableOpacity>

      {/* Full-Screen Modal Picker */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "ios" ? insets.top : 16,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 20,
                fontWeight: "800",
                color: colors.foreground,
              }}
            >
              Select Jobsite
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar (show if 5+ jobs) */}
          {jobs.length >= 5 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search jobsites..."
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                autoCorrect={false}
                style={{
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
          )}

          {/* Job List — fully scrollable FlatList */}
          <FlatList
            data={filteredJobs}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: insets.bottom + 20,
            }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Text style={{ color: colors.muted, fontSize: 15 }}>
                  {search ? "No matching jobsites" : "No jobsites available"}
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isSelected = selectedJobId === item.id;
              return (
                <TouchableOpacity
                  onPress={() => handleSelect(item.id)}
                  activeOpacity={0.6}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                    marginTop: index === 0 ? 4 : 0,
                    marginBottom: 6,
                    borderRadius: 12,
                    backgroundColor: isSelected ? colors.primary + "18" : colors.surface,
                    borderWidth: isSelected ? 1.5 : 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  {/* Job number badge */}
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isSelected ? colors.primary : colors.border + "60",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: isSelected ? "#fff" : colors.muted,
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  {/* Job name — full text, no truncation */}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontWeight: isSelected ? "700" : "500",
                      color: isSelected ? colors.primary : colors.foreground,
                      lineHeight: 22,
                    }}
                  >
                    {item.name}
                  </Text>

                  {/* Checkmark for selected */}
                  {isSelected && (
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: colors.primary,
                        alignItems: "center",
                        justifyContent: "center",
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
