import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
 * Standalone job picker component.
 * Fetches jobs directly from the server, caches them in AsyncStorage,
 * and renders a simple list of tappable buttons.
 * 
 * This component is intentionally simple and self-contained to avoid
 * any data corruption from shared state or complex caching layers.
 */
export function JobPicker({ employeeId, selectedJobId, onSelectJob }: JobPickerProps) {
  const colors = useColors();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);

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
        // Cache the cleaned data
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

  if (loading && queryLoading && jobs.length === 0) {
    return (
      <View style={{ paddingVertical: 20, alignItems: "center" }}>
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

  return (
    <View style={{ marginBottom: 14, gap: 6 }}>
      {jobs.map((job) => {
        const isSelected = selectedJobId === job.id;
        return (
          <TouchableOpacity
            key={job.id}
            onPress={() => onSelectJob(job.id)}
            activeOpacity={0.7}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: isSelected ? colors.primary + "18" : colors.surface,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: isSelected ? "700" : "500",
                color: isSelected ? colors.primary : colors.foreground,
                lineHeight: 20,
              }}
              numberOfLines={2}
            >
              {isSelected ? "✓  " : ""}
              {job.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
