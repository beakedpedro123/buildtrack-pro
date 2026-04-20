import { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
 * Collapsible job picker — full-width, clean list with readable names.
 * No radio circles/squares. Tapping a job highlights it and collapses.
 */
export function JobPicker({ employeeId, selectedJobId, onSelectJob }: JobPickerProps) {
  const colors = useColors();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

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

  const toggleExpanded = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    Animated.timing(rotateAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const handleSelect = (jobId: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectJob(jobId);
    // Collapse after selection
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(false);
    Animated.timing(rotateAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

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

  // If only 1 job, just show it as a static row (no dropdown needed)
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
      {/* Collapsed Header / Pill */}
      <TouchableOpacity
        onPress={toggleExpanded}
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
        <Animated.Text
          style={{
            fontSize: 14,
            color: colors.muted,
            marginLeft: 8,
            transform: [{ rotate: chevronRotation }],
          }}
        >
          ▲
        </Animated.Text>
      </TouchableOpacity>

      {/* Expanded Job List */}
      {expanded && (
        <View
          style={{
            marginTop: 6,
            borderRadius: 12,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {jobs.map((job, index) => {
            const isSelected = selectedJobId === job.id;
            const isLast = index === jobs.length - 1;
            return (
              <TouchableOpacity
                key={job.id}
                onPress={() => handleSelect(job.id)}
                activeOpacity={0.6}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  backgroundColor: isSelected ? colors.primary + "15" : "transparent",
                  borderBottomWidth: isLast ? 0 : 0.5,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: isSelected ? "700" : "500",
                    color: isSelected ? colors.primary : colors.foreground,
                    lineHeight: 22,
                  }}
                >
                  {job.name}
                </Text>
                {isSelected && (
                  <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700", marginLeft: 8 }}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
