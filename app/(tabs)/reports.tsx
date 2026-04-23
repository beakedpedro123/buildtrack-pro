import {
   ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View, ImageBackground } from "react-native";

import { BG_REPORTS as bg_reports } from "@/constants/bg-urls";
import { getCached, setCache, CACHE_KEYS } from "@/lib/data-cache";
import { useMemo } from "react";

const WORK_CHECKLIST = [
  "Wall Framing",
  "Floor Framing",
  "Floor Sheathing",
  "Stair Framing",
  "Roof Framing",
  "Roof Sheathing",
  "Deck Framing",
  "Wall Sheathing",
  "T&G Siding",
  "Interior Finish Work",
  "Finished Facia",
  "Exterior Soffit",
  "Interior Soffit",
  "Demo",
  "Shim and Shave",
  "Demolition",
  "Cleaning",
  "Inspection Checklist",
  "Timber Work",
  "Steel Install",
  "Decking Install",
];

const WEATHER_OPTIONS = ["Clear", "Partly Cloudy", "Overcast", "Rain", "Wind", "Snow", "Extreme Heat"];

interface MaterialRow {
  materialName: string;
  quantity: string;
  unit: string;
  unitCost: string;
  supplier: string;
}

export default function ReportsScreen({ embedded }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await utils.invalidate(); } catch {}
    setRefreshing(false);
  }, [utils]);

  const [showNewReport, setShowNewReport] = useState(false);
  const [showWorkChecklist, setShowWorkChecklist] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [workItems, setWorkItems] = useState<string[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("Clear");
  const [crewCount, setCrewCount] = useState("1");
  // Store only URIs — no base64 needed
  const [photos, setPhotos] = useState<{ uri: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [expandedReport, setExpandedReport] = useState<number | null>(null);

  // Ref to track photos state in AppState listener
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const { data: jobs } = trpc.jobs.listActive.useQuery();
  const reportsQuery = trpc.reports.recent.useQuery({ limit: 20 }, { staleTime: 30000 });
  const recentReports = reportsQuery.data;
  const { data: allJobs } = trpc.jobs.list.useQuery();

  // Offline cache: write on success, read on error
  useEffect(() => {
    if (recentReports && recentReports.length > 0) {
      setCache(CACHE_KEYS.RECENT_REPORTS, recentReports).catch(() => {});
    }
  }, [recentReports]);

  const [cachedReports, setCachedReports] = useState<any[] | null>(null);
  useEffect(() => {
    getCached<any[]>(CACHE_KEYS.RECENT_REPORTS).then((cached) => {
      if (cached) setCachedReports(cached);
    });
  }, []);

  const displayReports = recentReports || cachedReports;

  // Today's scheduled tasks for the selected job
  const { data: allSchedule } = trpc.schedule.getAll.useQuery(undefined, { staleTime: 30000 });
  const todayScheduledTasks = useMemo(() => {
    if (!allSchedule || !selectedJobId) return [];
    const today = new Date();
    return (allSchedule as any[]).filter((item: any) => {
      const d = new Date(item.scheduledDate);
      return item.jobId === selectedJobId && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    });
  }, [allSchedule, selectedJobId]);

  const createReport = trpc.reports.create.useMutation();
  const markSeenMutation = trpc.reports.markSeen.useMutation({
    onSuccess: () => {
      utils.reports.recent.invalidate();
    },
  });
  const getPhotosQuery = trpc.reports.getPhotos.useQuery(
    { reportId: expandedReport || 0 },
    { enabled: !!expandedReport }
  );
  const addMaterial = trpc.reports.addMaterial.useMutation();
  // Keep the tRPC mutation for saving photo metadata to DB after upload
  const savePhotoRecord = trpc.reports.uploadPhoto.useMutation();

  const canSubmitReport = employee?.role === "foreman" || employee?.role === "laborer" || employee?.role === "logistics" || employee?.role === "owner" || employee?.role === "office_manager";

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      if (Platform.OS !== "web") {
        const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (libStatus !== "granted" || camStatus !== "granted") {
          // permissions debug removed
        }
      }
    })();
  }, []);

  // Handle Android MainActivity destruction — recover pending image picker result
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active") {
        try {
          const result = await ImagePicker.getPendingResultAsync();
          if (result && Array.isArray(result) && result.length > 0) {
            const pickerResult = result[0] as ImagePicker.ImagePickerResult;
            if (!pickerResult.canceled && pickerResult.assets?.length > 0) {
              const newPhotos = pickerResult.assets.map((asset) => ({ uri: asset.uri }));
              setPhotos((prev) => [...prev, ...newPhotos].slice(0, 10));
            }
          }
        } catch (e) {
          // No pending result — that's fine
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const toggleWorkItem = (item: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const addMaterialRow = () => {
    setMaterials((prev) => [...prev, { materialName: "", quantity: "", unit: "units", unitCost: "", supplier: "" }]);
  };

  const updateMaterial = (index: number, field: keyof MaterialRow, value: string) => {
    setMaterials((prev) => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const removeMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Please go to Settings and allow BuildTrack Pro to access your photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newPhotos = result.assets.map((asset) => ({ uri: asset.uri }));
        setPhotos((prev) => {
          const updated = [...prev, ...newPhotos].slice(0, 10);
          return updated;
        });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err: any) {
      console.error("pickPhoto error:", err);
      Alert.alert("Error", `Failed to pick photo: ${err?.message || "Unknown error"}`);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Please go to Settings and allow BuildTrack Pro to use the camera.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotos((prev) => {
          const updated = [...prev, { uri: result.assets[0].uri }].slice(0, 10);
          return updated;
        });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err: any) {
      console.error("takePhoto error:", err);
      Alert.alert("Error", `Failed to take photo: ${err?.message || "Unknown error"}`);
    }
  };

  // Upload a single photo file to /api/upload using FormData
  const uploadPhotoFile = async (uri: string): Promise<string | null> => {
    try {
      const apiBase = getApiBaseUrl();
      const uploadUrl = `${apiBase}/api/upload`;

      const formData = new FormData();

      if (Platform.OS === "web") {
        // Web: fetch the blob from the object URL, then append
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append("file", blob, `photo_${Date.now()}.jpg`);
      } else {
        // Native (iOS/Android): Pass the URI directly as a file object
        // React Native's FormData implementation handles reading the file from the URI
        const fileObj = {
          uri: uri,
          type: "image/jpeg",
          name: `photo_${Date.now()}.jpg` } as any;
        formData.append("file", fileObj);
      }

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type header — fetch sets it automatically with the correct boundary
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Photo upload failed:", response.status, errText);
        return null;
      }

      const data = await response.json();
      // upload debug removed
      return data.url || null;
    } catch (err: any) {
      console.error("Photo upload error:", err?.message || err);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!selectedJobId || !employee) {
      Alert.alert("Missing Info", "Please select a job.");
      return;
    }
    if (workItems.length === 0 && materials.length === 0 && !notes) {
      Alert.alert("Empty Report", "Please add at least one work item, material, or note.");
      return;
    }
    setSubmitting(true);
    setUploadProgress("Creating report...");
    try {
      // Step 1: Create the report
      const reportId = await createReport.mutateAsync({
        jobId: selectedJobId,
        submittedBy: employee.id,
        reportDate: new Date().toISOString(),
        workCompleted: JSON.stringify(workItems),
        notes,
        weatherCondition: weather,
        crewCount: parseInt(crewCount) || 1 });

      // Step 2: Add materials
      for (const mat of materials) {
        if (!mat.materialName) continue;
        setUploadProgress("Saving materials...");
        await addMaterial.mutateAsync({
          reportId,
          jobId: selectedJobId,
          materialName: mat.materialName,
          quantity: mat.quantity || "1",
          unit: mat.unit,
          unitCost: mat.unitCost || undefined,
          totalCost: mat.unitCost && mat.quantity
            ? String(parseFloat(mat.unitCost) * parseFloat(mat.quantity))
            : undefined,
          supplier: mat.supplier || undefined });
      }

      // Step 3: Upload photos via /api/upload, then save record via tRPC
      let uploadedCount = 0;
      for (let i = 0; i < photos.length; i++) {
        setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}...`);
        try {
          const photoUrl = await uploadPhotoFile(photos[i].uri);
          if (photoUrl) {
            // Save the photo record to the database
            await savePhotoRecord.mutateAsync({
              reportId,
              jobId: selectedJobId,
              uploadedBy: employee.id,
              base64: "", // Not used — we already uploaded via /api/upload
              url: photoUrl, // Pass the S3 URL directly
            });
            uploadedCount++;
          } else {
            console.warn(`Photo ${i + 1} upload returned null URL`);
          }
        } catch (photoErr: any) {
          console.error(`Photo ${i + 1} failed:`, photoErr?.message || photoErr);
        }
      }

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      utils.reports.recent.invalidate();
      setShowNewReport(false);
      resetForm();

      const photoMsg = photos.length > 0
        ? ` with ${uploadedCount}/${photos.length} photos`
        : "";
      Alert.alert("Report Submitted", `Your daily report has been saved successfully${photoMsg}.`);
    } catch (e: any) {
      console.error("Report submit error:", e);
      Alert.alert("Error", `Failed to submit report: ${e?.message || "Please try again."}`);
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  };

  const resetForm = () => {
    setSelectedJobId(null);
    setWorkItems([]);
    setMaterials([]);
    setNotes("");
    setWeather("Clear");
    setCrewCount("1");
    setPhotos([]);
  };

  const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4 },
    addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    reportCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    reportHeader: { padding: 14, flexDirection: "row", alignItems: "center" },
    reportDate: { fontSize: 13, fontWeight: "700", color: colors.primary, marginRight: 10, minWidth: 50 },
    reportJob: { fontSize: 15, fontWeight: "600", color: colors.foreground },
    reportBy: { fontSize: 12, color: colors.muted },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Math.max(insets.top + 12, 28), paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    section: { paddingHorizontal: 20, paddingTop: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 },
    jobOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginBottom: 8, flexDirection: "row", alignItems: "center" },
    checkItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, marginRight: 12, alignItems: "center", justifyContent: "center" },
    checkLabel: { fontSize: 14, flex: 1 },
    materialRow: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.foreground, backgroundColor: colors.background, marginBottom: 8 },
    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: "hidden" },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", margin: 20 },
    submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    weatherChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, marginRight: 8 } });

  const getJobName = (jobId: number) => allJobs?.find((j) => j.id === jobId)?.name || `Job #${jobId}`;

    const RWrapper = embedded ? View : ScreenContainer;
    return (
    <RWrapper style={embedded ? { flex: 1 } : undefined} edges={embedded ? undefined : ["top", "left", "right"]}>
        <ImageBackground source={bg_reports} style={{ flex: 1 }} resizeMode="cover" imageStyle={{ opacity: 0.15 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Field Reports</Text>
        {canSubmitReport && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewReport(true)}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>+</Text>
            <Text style={styles.addBtnText}>New Report</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        data={displayReports || []}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const parsedWorkItems = (() => { try { return JSON.parse(item.workCompleted || "[]"); } catch { return []; } })();
          const isExpanded = expandedReport === item.id;
          return (
            <TouchableOpacity style={styles.reportCard} onPress={() => setExpandedReport(isExpanded ? null : item.id)}>
              <View style={styles.reportHeader}>
                <Text style={styles.reportDate}>
                  {new Date(item.reportDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportJob} numberOfLines={1}>{getJobName(item.jobId)}</Text>
                  <Text style={styles.reportBy}>{item.crewCount} crew · {item.weatherCondition}</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 18 }}>{isExpanded ? "▲" : "▼"}</Text>
              </View>
              {isExpanded && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                  {parsedWorkItems.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>Work Completed</Text>
                      {parsedWorkItems.map((w: string, i: number) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginRight: 8 }} />
                          <Text style={{ fontSize: 13, color: colors.foreground }}>{w}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {item.notes ? (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Notes</Text>
                      <Text style={{ fontSize: 13, color: colors.muted }}>{item.notes}</Text>
                    </View>
                  ) : null}

                  {/* Report Photos */}
                  {getPhotosQuery.data && getPhotosQuery.data.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Photos ({getPhotosQuery.data.length})</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {getPhotosQuery.data.map((photo: any) => (
                          <View key={photo.id} style={{ width: 100, height: 100, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                            <Image source={{ uri: photo.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {getPhotosQuery.isLoading && (
                    <View style={{ paddingVertical: 12, alignItems: "center" }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>Loading photos...</Text>
                    </View>
                  )}

                  {/* Seen by Owner Toggle */}
                  {employee?.role === "owner" && (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: item.seenByOwner ? colors.success + "15" : colors.surface,
                        borderRadius: 10,
                        padding: 12,
                        marginTop: 12,
                        borderWidth: 1,
                        borderColor: item.seenByOwner ? colors.success : colors.border,
                      }}
                      onPress={async () => {
                        try {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          await markSeenMutation.mutateAsync({
                            reportId: item.id,
                            seen: !item.seenByOwner,
                            requestingId: employee.id,
                          });
                        } catch (err: any) {
                          Alert.alert("Error", err?.message || "Failed to update");
                        }
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 20 }}>{item.seenByOwner ? "\u2705" : "\u2B1C"}</Text>
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: item.seenByOwner ? colors.success : colors.foreground }}>
                            {item.seenByOwner ? "Reviewed" : "Mark as Reviewed"}
                          </Text>
                          {item.seenAt && item.seenByOwner && (
                            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                              Seen {new Date(item.seenAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  {/* Seen indicator for non-owner employees */}
                  {employee?.role !== "owner" && item.seenByOwner && (
                    <View style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 12,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}>
                      <Text style={{ fontSize: 14 }}>\u2705</Text>
                      <Text style={{ fontSize: 12, color: colors.success, fontWeight: "600" }}>Reviewed by Owner</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
            <Text style={{ color: colors.muted, fontSize: 16 }}>No reports yet</Text>
            {canSubmitReport && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>Tap "New Report" to submit today's field report</Text>}
          </View>
        }
      />

      {/* New Report Modal */}
      <Modal visible={showNewReport} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Daily Field Report</Text>
            <TouchableOpacity onPress={() => { setShowNewReport(false); resetForm(); }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Job Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Job *</Text>
                {(jobs || []).map((job) => (
                  <TouchableOpacity
                    key={job.id}
                    style={[styles.jobOption, { borderColor: selectedJobId === job.id ? colors.primary : colors.border, backgroundColor: selectedJobId === job.id ? colors.primary + "15" : colors.surface }]}
                    onPress={() => setSelectedJobId(job.id)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", flex: 1, color: selectedJobId === job.id ? colors.primary : colors.foreground }}>{job.name}</Text>
                    {selectedJobId === job.id && <Text style={{ color: colors.primary }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Crew & Weather */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Crew & Conditions</Text>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Crew Count</Text>
                    <TextInput
                      style={styles.input}
                      value={crewCount}
                      onChangeText={setCrewCount}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>Weather</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", paddingBottom: 4 }}>
                    {WEATHER_OPTIONS.map((w) => (
                      <TouchableOpacity
                        key={w}
                        style={[styles.weatherChip, { borderColor: weather === w ? colors.primary : colors.border, backgroundColor: weather === w ? colors.primary + "15" : colors.surface }]}
                        onPress={() => setWeather(w)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: weather === w ? colors.primary : colors.foreground }}>{w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Today's Scheduled Tasks (if any for selected job) */}
              {selectedJobId && todayScheduledTasks.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Today's Scheduled Tasks</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>From the job schedule — reference for your report</Text>
                  {todayScheduledTasks.map((task: any) => {
                    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
                      pending: { bg: "#F59E0B22", text: "#F59E0B", label: "Pending" },
                      in_progress: { bg: "#3B82F622", text: "#3B82F6", label: "In Progress" },
                      completed: { bg: "#22C55E22", text: "#22C55E", label: "Done" },
                      skipped: { bg: "#EF444422", text: "#EF4444", label: "Skipped" },
                    };
                    const sc = statusColors[task.status] || statusColors.pending;
                    return (
                      <View key={task.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{task.title}</Text>
                          {task.description ? <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{task.description}</Text> : null}
                        </View>
                        <View style={{ backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: sc.text }}>{sc.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Work Completed — Collapsible */}
              <View style={styles.section}>
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  onPress={() => setShowWorkChecklist(!showWorkChecklist)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.sectionTitle}>Work Completed</Text>
                    {workItems.length > 0 && (
                      <View style={{ backgroundColor: colors.success + "20", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.success }}>{workItems.length}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{showWorkChecklist ? "▲" : "▼"}</Text>
                </TouchableOpacity>
                {showWorkChecklist && WORK_CHECKLIST.map((item) => (
                  <TouchableOpacity key={item} style={styles.checkItem} onPress={() => toggleWorkItem(item)}>
                    <View style={[styles.checkBox, { borderColor: workItems.includes(item) ? colors.success : colors.border, backgroundColor: workItems.includes(item) ? colors.success : "transparent" }]}>
                      {workItems.includes(item) && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>}
                    </View>
                    <Text style={[styles.checkLabel, { color: workItems.includes(item) ? colors.foreground : colors.muted }]}>{item}</Text>
                  </TouchableOpacity>
                ))}
                {!showWorkChecklist && workItems.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {workItems.map((w) => (
                      <View key={w} style={{ backgroundColor: colors.success + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>✓ {w}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Materials Used */}
              <View style={styles.section}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={styles.sectionTitle}>Materials Used</Text>
                  <TouchableOpacity onPress={addMaterialRow} style={{ backgroundColor: colors.primary + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>+ Add</Text>
                  </TouchableOpacity>
                </View>
                {materials.map((mat, i) => (
                  <View key={i} style={styles.materialRow}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Material {i + 1}</Text>
                      <TouchableOpacity onPress={() => removeMaterial(i)}>
                        <Text style={{ color: colors.error, fontSize: 13 }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput style={styles.input} placeholder="Material name (e.g. 2x4 lumber)" placeholderTextColor={colors.muted} value={mat.materialName} onChangeText={(v) => updateMaterial(i, "materialName", v)} />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Qty" placeholderTextColor={colors.muted} value={mat.quantity} onChangeText={(v) => updateMaterial(i, "quantity", v)} keyboardType="decimal-pad" />
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Unit (ea, lbs, ft)" placeholderTextColor={colors.muted} value={mat.unit} onChangeText={(v) => updateMaterial(i, "unit", v)} />
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Unit cost $" placeholderTextColor={colors.muted} value={mat.unitCost} onChangeText={(v) => updateMaterial(i, "unitCost", v)} keyboardType="decimal-pad" />
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Supplier" placeholderTextColor={colors.muted} value={mat.supplier} onChangeText={(v) => updateMaterial(i, "supplier", v)} />
                    </View>
                  </View>
                ))}
              </View>

              {/* Photos */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Site Photos ({photos.length}/10)</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.addBtn, { flex: 1, justifyContent: "center" }]}
                    onPress={takePhoto}
                  >
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>📷 Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addBtn, { flex: 1, justifyContent: "center", backgroundColor: "#1A2332" }]}
                    onPress={pickPhoto}
                  >
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>🖼 Gallery</Text>
                  </TouchableOpacity>
                </View>
                {photos.length > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.success, fontWeight: "600" }}>
                      {photos.length} photo{photos.length !== 1 ? "s" : ""} ready to upload
                    </Text>
                  </View>
                )}
                <View style={styles.photoGrid}>
                  {photos.map((p, i) => (
                    <TouchableOpacity key={`${i}-${p.uri.slice(-20)}`} style={styles.photoThumb} onPress={() => {
                      setPhotos((prev) => prev.filter((_, idx) => idx !== i));
                    }}>
                      <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} />
                      <View style={{ position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 12 }}>✕</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Notes */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <TextInput
                  style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                  placeholder="Any additional notes, issues, or observations..."
                  placeholderTextColor={colors.muted}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <View style={{ alignItems: "center" }}>
                    <ActivityIndicator color="#fff" />
                    {uploadProgress ? <Text style={{ color: "#fff", fontSize: 12, marginTop: 4 }}>{uploadProgress}</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.submitBtnText}>Submit Daily Report</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ImageBackground>
    </RWrapper>
  );
}
