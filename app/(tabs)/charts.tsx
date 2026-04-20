import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
import { useState, useCallback, useMemo, useRef } from "react";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { CACHE_KEYS } from "@/lib/data-cache";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { captureRef } from "react-native-view-shot";
import Svg, { Rect, Line, Text as SvgText, G, Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";

const { width: SCREEN_W } = Dimensions.get("window");
const CHART_W = SCREEN_W - 48;
const CHART_H = 220;
const CHART_PAD = { top: 20, right: 16, bottom: 40, left: 60 };

type ChartSection = "profitability" | "labor" | "taxes" | "burndown";

// ─── Helper: format currency ────────────────────────────────────────────
function fmt$(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ─── SVG Bar Chart ──────────────────────────────────────────────────────
function BarChart({
  data,
  colors: c,
  barColor,
  barColor2,
  showLegend,
  legendLabels,
}: {
  data: { label: string; value: number; value2?: number }[];
  colors: any;
  barColor: string;
  barColor2?: string;
  showLegend?: boolean;
  legendLabels?: [string, string];
}) {
  if (!data || data.length === 0) return <Text style={{ color: c.muted, textAlign: "center", padding: 20 }}>No data available</Text>;
  const maxVal = Math.max(...data.map((d) => Math.max(d.value, d.value2 ?? 0)), 1);
  const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const hasTwo = barColor2 && data.some((d) => d.value2 !== undefined);
  const barW = hasTwo ? plotW / data.length / 2.5 : plotW / data.length / 1.8;
  const gap = (plotW - barW * data.length * (hasTwo ? 2 : 1)) / (data.length + 1);

  // Y-axis ticks
  const ticks = 5;
  const tickStep = maxVal / ticks;

  return (
    <View>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Y-axis lines and labels */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const y = CHART_PAD.top + plotH - (i / ticks) * plotH;
          return (
            <G key={`y-${i}`}>
              <Line x1={CHART_PAD.left} y1={y} x2={CHART_W - CHART_PAD.right} y2={y} stroke={c.border} strokeWidth={0.5} strokeDasharray="4,4" />
              <SvgText x={CHART_PAD.left - 6} y={y + 4} fontSize={9} fill={c.muted} textAnchor="end">
                {fmt$(i * tickStep)}
              </SvgText>
            </G>
          );
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const x = CHART_PAD.left + gap + i * (plotW / data.length);
          const h1 = (d.value / maxVal) * plotH;
          const h2 = hasTwo ? ((d.value2 ?? 0) / maxVal) * plotH : 0;
          return (
            <G key={i}>
              <Rect
                x={x}
                y={CHART_PAD.top + plotH - h1}
                width={barW}
                height={Math.max(h1, 1)}
                rx={3}
                fill={barColor}
                opacity={0.9}
              />
              {hasTwo && (
                <Rect
                  x={x + barW + 2}
                  y={CHART_PAD.top + plotH - h2}
                  width={barW}
                  height={Math.max(h2, 1)}
                  rx={3}
                  fill={barColor2}
                  opacity={0.7}
                />
              )}
              <SvgText
                x={x + (hasTwo ? barW : barW / 2)}
                y={CHART_H - 8}
                fontSize={9}
                fill={c.muted}
                textAnchor="middle"
                rotation={data.length > 6 ? -30 : 0}
                originX={x + barW / 2}
                originY={CHART_H - 8}
              >
                {d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label}
              </SvgText>
            </G>
          );
        })}
        {/* Baseline */}
        <Line x1={CHART_PAD.left} y1={CHART_PAD.top + plotH} x2={CHART_W - CHART_PAD.right} y2={CHART_PAD.top + plotH} stroke={c.border} strokeWidth={1} />
      </Svg>
      {showLegend && legendLabels && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: barColor }} />
            <Text style={{ fontSize: 11, color: c.muted }}>{legendLabels[0]}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: barColor2 }} />
            <Text style={{ fontSize: 11, color: c.muted }}>{legendLabels[1]}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── SVG Line Chart ─────────────────────────────────────────────────────
function LineChart({
  data,
  colors: c,
  lineColor,
  fillColor,
}: {
  data: { label: string; value: number }[];
  colors: any;
  lineColor: string;
  fillColor?: string;
}) {
  if (!data || data.length === 0) return <Text style={{ color: c.muted, textAlign: "center", padding: 20 }}>No data available</Text>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const ticks = 5;
  const tickStep = maxVal / ticks;

  const points = data.map((d, i) => ({
    x: CHART_PAD.left + (i / Math.max(data.length - 1, 1)) * plotW,
    y: CHART_PAD.top + plotH - (d.value / maxVal) * plotH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${CHART_PAD.top + plotH} L${points[0].x},${CHART_PAD.top + plotH} Z`;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fillColor || lineColor} stopOpacity={0.3} />
          <Stop offset="1" stopColor={fillColor || lineColor} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      {/* Y-axis */}
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const y = CHART_PAD.top + plotH - (i / ticks) * plotH;
        return (
          <G key={`y-${i}`}>
            <Line x1={CHART_PAD.left} y1={y} x2={CHART_W - CHART_PAD.right} y2={y} stroke={c.border} strokeWidth={0.5} strokeDasharray="4,4" />
            <SvgText x={CHART_PAD.left - 6} y={y + 4} fontSize={9} fill={c.muted} textAnchor="end">
              {fmt$(i * tickStep)}
            </SvgText>
          </G>
        );
      })}
      {/* Area fill */}
      <Path d={areaPath} fill="url(#areaGrad)" />
      {/* Line */}
      <Path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={lineColor} stroke="#fff" strokeWidth={1.5} />
      ))}
      {/* X-axis labels */}
      {data.map((d, i) => (
        <SvgText
          key={i}
          x={points[i].x}
          y={CHART_H - 8}
          fontSize={9}
          fill={c.muted}
          textAnchor="middle"
        >
          {d.label}
        </SvgText>
      ))}
      {/* Baseline */}
      <Line x1={CHART_PAD.left} y1={CHART_PAD.top + plotH} x2={CHART_W - CHART_PAD.right} y2={CHART_PAD.top + plotH} stroke={c.border} strokeWidth={1} />
    </Svg>
  );
}

// ─── SVG Donut Chart ────────────────────────────────────────────────────
function DonutChart({
  data,
  colors: c,
  sliceColors,
}: {
  data: { label: string; value: number }[];
  colors: any;
  sliceColors: string[];
}) {
  if (!data || data.length === 0) return <Text style={{ color: c.muted, textAlign: "center", padding: 20 }}>No data available</Text>;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Text style={{ color: c.muted, textAlign: "center", padding: 20 }}>No data available</Text>;
  const cx = CHART_W / 2;
  const cy = 90;
  const r = 70;
  const innerR = 42;
  let startAngle = -Math.PI / 2;

  const arcs = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle);
    const iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle);
    const iy2 = cy + innerR * Math.sin(endAngle);
    const path = `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} L${ix2},${iy2} A${innerR},${innerR} 0 ${largeArc} 0 ${ix1},${iy1} Z`;
    startAngle = endAngle;
    return { path, color: sliceColors[i % sliceColors.length], label: d.label, value: d.value, pct: ((d.value / total) * 100).toFixed(1) };
  });

  return (
    <View>
      <Svg width={CHART_W} height={190}>
        {arcs.map((a, i) => (
          <Path key={i} d={a.path} fill={a.color} />
        ))}
        <SvgText x={cx} y={cy - 6} fontSize={14} fontWeight="bold" fill={c.foreground} textAnchor="middle">
          {fmt$(total)}
        </SvgText>
        <SvgText x={cx} y={cy + 12} fontSize={10} fill={c.muted} textAnchor="middle">
          Total
        </SvgText>
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 8 }}>
        {arcs.map((a, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 100 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: a.color }} />
            <Text style={{ fontSize: 10, color: c.muted }} numberOfLines={1}>
              {a.label} ({a.pct}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Stacked Bar for Budget Burn-down ───────────────────────────────────
function BurndownChart({
  data,
  colors: c,
}: {
  data: { jobName: string; budget: number; spent: number; remaining: number }[];
  colors: any;
}) {
  if (!data || data.length === 0) return <Text style={{ color: c.muted, textAlign: "center", padding: 20 }}>No data available</Text>;
  const maxVal = Math.max(...data.map((d) => d.budget), 1);
  const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const barW = Math.min(plotW / data.length / 1.5, 40);
  const gap = (plotW - barW * data.length) / (data.length + 1);

  return (
    <View>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Y-axis */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = CHART_PAD.top + plotH - ((i + 1) / 5) * plotH;
          return (
            <G key={`y-${i}`}>
              <Line x1={CHART_PAD.left} y1={y} x2={CHART_W - CHART_PAD.right} y2={y} stroke={c.border} strokeWidth={0.5} strokeDasharray="4,4" />
              <SvgText x={CHART_PAD.left - 6} y={y + 4} fontSize={9} fill={c.muted} textAnchor="end">
                {fmt$(((i + 1) / 5) * maxVal)}
              </SvgText>
            </G>
          );
        })}
        {data.map((d, i) => {
          const x = CHART_PAD.left + gap + i * (plotW / data.length);
          const totalH = (d.budget / maxVal) * plotH;
          const spentH = (d.spent / maxVal) * plotH;
          const pct = d.budget > 0 ? (d.spent / d.budget) * 100 : 0;
          const spentColor = pct > 90 ? c.error : pct > 70 ? c.warning : c.success;
          return (
            <G key={i}>
              {/* Budget bar (background) */}
              <Rect
                x={x}
                y={CHART_PAD.top + plotH - totalH}
                width={barW}
                height={Math.max(totalH, 1)}
                rx={3}
                fill={c.border}
                opacity={0.4}
              />
              {/* Spent bar (foreground) */}
              <Rect
                x={x}
                y={CHART_PAD.top + plotH - spentH}
                width={barW}
                height={Math.max(spentH, 1)}
                rx={3}
                fill={spentColor}
                opacity={0.85}
              />
              {/* % label */}
              <SvgText
                x={x + barW / 2}
                y={CHART_PAD.top + plotH - spentH - 4}
                fontSize={8}
                fill={spentColor}
                textAnchor="middle"
                fontWeight="bold"
              >
                {pct.toFixed(0)}%
              </SvgText>
              {/* Job name */}
              <SvgText
                x={x + barW / 2}
                y={CHART_H - 8}
                fontSize={9}
                fill={c.muted}
                textAnchor="middle"
              >
                {d.jobName.length > 8 ? d.jobName.slice(0, 7) + "…" : d.jobName}
              </SvgText>
            </G>
          );
        })}
        <Line x1={CHART_PAD.left} y1={CHART_PAD.top + plotH} x2={CHART_W - CHART_PAD.right} y2={CHART_PAD.top + plotH} stroke={c.border} strokeWidth={1} />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: c.border, opacity: 0.4 }} />
          <Text style={{ fontSize: 11, color: c.muted }}>Budget</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: c.success }} />
          <Text style={{ fontSize: 11, color: c.muted }}>Spent</Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Charts Screen
// ═══════════════════════════════════════════════════════════════════════════
export default function ChartsScreen({ embedded }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const { employee } = useAppAuth();
  const utils = trpc.useUtils();
  const [activeSection, setActiveSection] = useState<ChartSection>("profitability");
  const [refreshing, setRefreshing] = useState(false);
  const [sharingChart, setSharingChart] = useState(false);
  const [dateRange, setDateRange] = useState<"all" | "this_month" | "last_quarter" | "ytd" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const chartRef = useRef<View>(null);

  // ─── Date range calculation ─────────────────────────────────────────
  const dateParams = useMemo(() => {
    const now = new Date();
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (dateRange === "this_month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "last_quarter") {
      const qStart = new Date(now);
      qStart.setMonth(qStart.getMonth() - 3);
      startDate = qStart.toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "ytd") {
      startDate = new Date(now.getFullYear(), 0, 1).toISOString();
      endDate = now.toISOString();
    } else if (dateRange === "custom" && customStart && customEnd) {
      startDate = new Date(customStart).toISOString();
      endDate = new Date(customEnd).toISOString();
    }
    return { startDate, endDate };
  }, [dateRange, customStart, customEnd]);

  const hasDateFilter = dateRange !== "all";

  const role = employee?.role || "laborer";
  const isOwner = role === "owner";
  const isOfficeMgr = role === "office_manager";
  const canSeeDollars = isOwner || isOfficeMgr;

  // ─── Data Queries ───────────────────────────────────────────────────
  // Use date-filtered queries when a filter is active, otherwise use the original unfiltered ones
  const profitQueryUnfiltered = trpc.financialCharts.jobProfitability.useQuery(undefined, { staleTime: 60000, enabled: !hasDateFilter });
  const profitQueryFiltered = trpc.financialCharts.jobProfitabilityFiltered.useQuery(
    { startDate: dateParams.startDate, endDate: dateParams.endDate },
    { staleTime: 60000, enabled: hasDateFilter }
  );
  const profitQueryRaw = hasDateFilter ? profitQueryFiltered : profitQueryUnfiltered;

  const taxQueryRaw = trpc.financialCharts.taxBreakdown.useQuery(undefined, { staleTime: 60000 });

  const laborQueryUnfiltered = trpc.financialCharts.monthlyLaborTrend.useQuery({ months: 6 }, { staleTime: 60000, enabled: !hasDateFilter });
  const laborQueryFiltered = trpc.financialCharts.monthlyLaborTrendFiltered.useQuery(
    { startDate: dateParams.startDate, endDate: dateParams.endDate },
    { staleTime: 60000, enabled: hasDateFilter }
  );
  const laborQueryRaw = hasDateFilter ? laborQueryFiltered : laborQueryUnfiltered;

  // Offline caching wrappers
  const profitCacheKey = hasDateFilter ? `${CACHE_KEYS.CHART_PROFITABILITY}_${dateParams.startDate}` : CACHE_KEYS.CHART_PROFITABILITY;
  const { data: profitCached, isLoading: profitCachedLoading } = useOfflineCache(profitCacheKey, profitQueryRaw.data, profitQueryRaw.isLoading);
  const profitQuery = { ...profitQueryRaw, data: profitCached, isLoading: profitCachedLoading };

  const { data: taxCached, isLoading: taxCachedLoading } = useOfflineCache(CACHE_KEYS.CHART_TAX_BREAKDOWN, taxQueryRaw.data, taxQueryRaw.isLoading);
  const taxQuery = { ...taxQueryRaw, data: taxCached, isLoading: taxCachedLoading };

  const laborCacheKey = hasDateFilter ? `${CACHE_KEYS.CHART_LABOR_TRENDS}_${dateParams.startDate}` : CACHE_KEYS.CHART_LABOR_TRENDS;
  const { data: laborCached, isLoading: laborCachedLoading } = useOfflineCache(laborCacheKey, laborQueryRaw.data, laborQueryRaw.isLoading);
  const laborQuery = { ...laborQueryRaw, data: laborCached, isLoading: laborCachedLoading };

  // budgetBurnDown requires a jobId — we'll use profitability data for the all-jobs burndown view instead
  const burndownFromProfit = profitQuery.data;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        utils.financialCharts.jobProfitability.invalidate(),
        utils.financialCharts.jobProfitabilityFiltered.invalidate(),
        utils.financialCharts.taxBreakdown.invalidate(),
        utils.financialCharts.monthlyLaborTrend.invalidate(),
        utils.financialCharts.monthlyLaborTrendFiltered.invalidate(),
      ]);
    } catch {}
    setRefreshing(false);
  }, [utils]);

  // ─── Derived chart data ─────────────────────────────────────────────
  const profitData = useMemo(() => {
    if (!profitQuery.data) return [];
    return profitQuery.data.map((j: any) => ({
      label: j.jobName,
      value: j.effectiveBudget,
      value2: j.totalSpend,
    }));
  }, [profitQuery.data]);

  const profitMargins = useMemo(() => {
    if (!profitQuery.data) return [];
    return profitQuery.data.map((j: any) => ({
      label: j.jobName,
      value: j.marginPct,
    }));
  }, [profitQuery.data]);

  const laborTrendData = useMemo(() => {
    if (!laborQuery.data) return [];
    return laborQuery.data.map((m: any) => ({
      label: m.monthLabel,
      value: m.totalCost,
    }));
  }, [laborQuery.data]);

  const laborHoursTrend = useMemo(() => {
    if (!laborQuery.data) return [];
    return laborQuery.data.map((m: any) => ({
      label: m.monthLabel,
      value: Math.round(m.totalMinutes / 60 * 10) / 10,
    }));
  }, [laborQuery.data]);

  const taxData = useMemo(() => {
    if (!taxQuery.data) return [];
    const slices: { label: string; value: number }[] = [];
    for (const j of taxQuery.data) {
      if (j.taxCost > 0) slices.push({ label: `${j.jobName} Tax`, value: j.taxCost });
      if (j.workersCompCost > 0) slices.push({ label: `${j.jobName} WC`, value: j.workersCompCost });
      if (j.liabilityInsCost > 0) slices.push({ label: `${j.jobName} Ins`, value: j.liabilityInsCost });
    }
    return slices;
  }, [taxQuery.data]);

  const taxSummary = useMemo(() => {
    if (!taxQuery.data) return { totalTax: 0, totalWC: 0, totalLiability: 0, grandTotal: 0 };
    let totalTax = 0, totalWC = 0, totalLiability = 0;
    for (const j of taxQuery.data) {
      totalTax += j.taxCost;
      totalWC += j.workersCompCost;
      totalLiability += j.liabilityInsCost;
    }
    return { totalTax, totalWC, totalLiability, grandTotal: totalTax + totalWC + totalLiability };
  }, [taxQuery.data]);

  const burndownData = useMemo(() => {
    if (!profitQuery.data) return [];
    return profitQuery.data.map((j: any) => ({
      jobName: j.jobName,
      budget: j.effectiveBudget,
      spent: j.totalSpend,
      remaining: Math.max(0, j.effectiveBudget - j.totalSpend),
    }));
  }, [profitQuery.data]);

  // ─── Share chart as image ───────────────────────────────────────────
  const shareChart = useCallback(async () => {
    if (!chartRef.current) return;
    setSharingChart(true);
    try {
      if (Platform.OS !== "web") {
        const uri = await captureRef(chartRef, { format: "png", quality: 1 });
        await shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Chart" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Share", "Chart sharing is available on mobile devices.");
      }
    } catch (err) {
      Alert.alert("Error", "Could not share chart. Please try again.");
    } finally {
      setSharingChart(false);
    }
  }, [activeSection]);

  // ─── Share as PDF report ────────────────────────────────────────────
  const sharePdfReport = useCallback(async () => {
    setSharingChart(true);
    try {
      const today = new Date().toLocaleDateString();
      let tableRows = "";
      let title = "";

      if (activeSection === "profitability" && profitQuery.data) {
        title = "Job Profitability Report";
        tableRows = profitQuery.data.map((j: any) =>
          `<tr><td>${j.jobName}</td><td>${fmt$(j.effectiveBudget)}</td><td>${fmt$(j.totalSpend)}</td><td>${fmt$(j.profit)}</td><td>${j.marginPct.toFixed(1)}%</td></tr>`
        ).join("");
        tableRows = `<table><thead><tr><th>Job</th><th>Budget</th><th>Spend</th><th>Profit</th><th>Margin</th></tr></thead><tbody>${tableRows}</tbody></table>`;
      } else if (activeSection === "labor" && laborQuery.data) {
        title = "Labor Cost Trends Report";
        tableRows = laborQuery.data.map((m: any) =>
          `<tr><td>${m.monthLabel}</td><td>${fmt$(m.totalCost)}</td><td>${(m.totalMinutes / 60).toFixed(1)} hrs</td><td>${fmt$(m.laborOnly)}</td></tr>`
        ).join("");
        tableRows = `<table><thead><tr><th>Month</th><th>Total Cost</th><th>Total Hours</th><th>Labor Only</th></tr></thead><tbody>${tableRows}</tbody></table>`;
      } else if (activeSection === "taxes" && taxQuery.data) {
        title = "Tax & Insurance Breakdown Report";
        tableRows = taxQuery.data.map((j: any) =>
          `<tr><td>${j.jobName}</td><td>${fmt$(j.taxCost)}</td><td>${fmt$(j.workersCompCost)}</td><td>${fmt$(j.liabilityInsCost)}</td><td>${fmt$(j.taxCost + j.workersCompCost + j.liabilityInsCost)}</td></tr>`
        ).join("");
        tableRows = `<table><thead><tr><th>Job</th><th>Tax</th><th>Workers Comp</th><th>Liability Ins</th><th>Total</th></tr></thead><tbody>${tableRows}</tbody></table>`;
      } else if (activeSection === "burndown" && profitQuery.data) {
        title = "Budget Burn-Down Report";
        tableRows = profitQuery.data.map((j: any) =>
          `<tr><td>${j.jobName}</td><td>${fmt$(j.effectiveBudget)}</td><td>${fmt$(j.totalSpend)}</td><td>${fmt$(Math.max(0, j.effectiveBudget - j.totalSpend))}</td><td>${j.effectiveBudget > 0 ? ((j.totalSpend / j.effectiveBudget) * 100).toFixed(1) : 0}%</td></tr>`
        ).join("");
        tableRows = `<table><thead><tr><th>Job</th><th>Budget</th><th>Spent</th><th>Remaining</th><th>Used</th></tr></thead><tbody>${tableRows}</tbody></table>`;
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #111; }
        h1 { color: #C9A84C; font-size: 24px; border-bottom: 2px solid #C9A84C; padding-bottom: 8px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #1a1a1a; color: #D4AF37; padding: 10px 8px; text-align: left; font-size: 12px; }
        td { padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
        tr:nth-child(even) { background: #f9f9f9; }
        .footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 10px; }
      </style></head><body>
        <h1>${title}</h1>
        <div class="meta">Generated: ${today} · BuildTrack Pro</div>
        ${tableRows}
        <div class="footer">BuildTrack Pro · ${title} · ${today}</div>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      if (Platform.OS !== "web") {
        await shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      Alert.alert("Error", "Could not generate PDF report.");
    } finally {
      setSharingChart(false);
    }
  }, [activeSection, profitQuery.data, laborQuery.data, taxQuery.data]);

  // ─── Section tabs ───────────────────────────────────────────────────
  const sections: { key: ChartSection; label: string; icon: string }[] = [
    { key: "profitability", label: "Profitability", icon: "💰" },
    { key: "labor", label: "Labor Trends", icon: "👷" },
    { key: "taxes", label: "Taxes & Ins", icon: "🏛️" },
    { key: "burndown", label: "Burn-Down", icon: "📉" },
  ];

  const isLoading = profitQuery.isLoading || taxQuery.isLoading || laborQuery.isLoading;

  const CWrapper = embedded ? View : ScreenContainer;

  // ─── Chart colors ───────────────────────────────────────────────────
  const CHART_COLORS = ["#D4AF37", "#2D7A4F", "#C0392B", "#3498DB", "#8E44AD", "#E67E22", "#1ABC9C", "#E74C3C"];

  return (
    <CWrapper style={embedded ? { flex: 1 } : undefined} edges={embedded ? undefined : ["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Section Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
          {sections.map((s) => {
            const isActive = activeSection === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveSection(s.key);
                }}
                style={[
                  styles.sectionTab,
                  isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                  !isActive && { backgroundColor: "transparent", borderColor: colors.border },
                ]}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13 }}>{s.icon}</Text>
                <Text style={[styles.sectionTabText, { color: isActive ? "#000" : colors.muted }, isActive && { fontWeight: "700" }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Date Range Filter */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {([
              { key: "all", label: "All Time" },
              { key: "this_month", label: "This Month" },
              { key: "last_quarter", label: "Last 3 Months" },
              { key: "ytd", label: "YTD" },
              { key: "custom", label: "Custom" },
            ] as const).map((p) => {
              const isActive = dateRange === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDateRange(p.key);
                    if (p.key === "custom") setShowCustomPicker(true);
                    else setShowCustomPicker(false);
                  }}
                  style={[
                    styles.dateChip,
                    isActive && { backgroundColor: colors.primary + "30", borderColor: colors.primary },
                    !isActive && { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateChipText, { color: isActive ? colors.primary : colors.muted }, isActive && { fontWeight: "700" }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {showCustomPicker && dateRange === "custom" && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Start Date</Text>
                <TouchableOpacity
                  style={[styles.dateInput, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    const d = customStart || new Date().toISOString().slice(0, 10);
                    if (Platform.OS === "ios" && Alert.prompt) {
                      Alert.prompt("Start Date", "Enter date (YYYY-MM-DD)", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Set", onPress: (val?: string) => { if (val) setCustomStart(val); } },
                      ], "plain-text", d);
                    } else {
                      const val = prompt("Start Date (YYYY-MM-DD)", d);
                      if (val) setCustomStart(val);
                    }
                  }}
                >
                  <Text style={{ fontSize: 13, color: customStart ? colors.foreground : colors.muted }}>
                    {customStart || "YYYY-MM-DD"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>End Date</Text>
                <TouchableOpacity
                  style={[styles.dateInput, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    const d = customEnd || new Date().toISOString().slice(0, 10);
                    if (Platform.OS === "ios" && Alert.prompt) {
                      Alert.prompt("End Date", "Enter date (YYYY-MM-DD)", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Set", onPress: (val?: string) => { if (val) setCustomEnd(val); } },
                      ], "plain-text", d);
                    } else {
                      const val = prompt("End Date (YYYY-MM-DD)", d);
                      if (val) setCustomEnd(val);
                    }
                  }}
                >
                  <Text style={{ fontSize: 13, color: customEnd ? colors.foreground : colors.muted }}>
                    {customEnd || "YYYY-MM-DD"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {hasDateFilter && (
            <Text style={{ fontSize: 11, color: colors.primary, marginTop: 6, fontStyle: "italic" }}>
              {dateRange === "custom" && customStart && customEnd
                ? `Showing: ${customStart} to ${customEnd}`
                : dateRange === "this_month" ? "Showing: This Month"
                : dateRange === "last_quarter" ? "Showing: Last 3 Months"
                : dateRange === "ytd" ? "Showing: Year to Date"
                : ""}
            </Text>
          )}
        </View>

        {/* Share buttons */}
        {canSeeDollars && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
            <TouchableOpacity
              onPress={shareChart}
              disabled={sharingChart}
              style={[styles.shareBtn, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}
              activeOpacity={0.7}
            >
              {sharingChart ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>📸 Share Image</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={sharePdfReport}
              disabled={sharingChart}
              style={[styles.shareBtn, { backgroundColor: colors.success + "20", borderColor: colors.success }]}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.success }}>📄 Share PDF</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <View style={{ padding: 60, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 12 }}>Loading charts…</Text>
          </View>
        ) : (
          <View ref={chartRef} collapsable={false} style={{ backgroundColor: colors.background }}>
            {/* ─── Profitability ──────────────────────────────────── */}
            {activeSection === "profitability" && (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {canSeeDollars ? (
                  <>
                    {/* Revenue vs Cost */}
                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Revenue vs Cost by Job</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Compare effective budget against total spend for each job</Text>
                      <BarChart
                        data={profitData}
                        colors={colors}
                        barColor="#D4AF37"
                        barColor2="#C0392B"
                        showLegend
                        legendLabels={["Budget", "Spend"]}
                      />
                    </View>

                    {/* Profit Margin */}
                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Profit Margin by Job</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Profit margin percentage for each job</Text>
                      <BarChart data={profitMargins} colors={colors} barColor={colors.success} />
                    </View>

                    {/* Summary cards */}
                    {profitQuery.data && profitQuery.data.length > 0 && (
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                        <View style={[styles.summaryCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                          <Text style={{ fontSize: 10, color: colors.muted }}>Total Budget</Text>
                          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>
                            {fmt$(profitQuery.data.reduce((s: number, j: any) => s + j.effectiveBudget, 0))}
                          </Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
                          <Text style={{ fontSize: 10, color: colors.muted }}>Total Profit</Text>
                          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.success }}>
                            {fmt$(profitQuery.data.reduce((s: number, j: any) => s + j.profit, 0))}
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={{ padding: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 40 }}>🔒</Text>
                    <Text style={{ color: colors.muted, marginTop: 8, textAlign: "center" }}>Financial charts are only visible to owners and office managers.</Text>
                  </View>
                )}
              </View>
            )}

            {/* ─── Labor Trends ───────────────────────────────────── */}
            {activeSection === "labor" && (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {canSeeDollars ? (
                  <>
                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Monthly Labor Costs</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Total labor spend over the past 6 months (including overhead)</Text>
                      <LineChart data={laborTrendData} colors={colors} lineColor="#D4AF37" fillColor="#D4AF37" />
                    </View>

                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Monthly Labor Hours</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Total hours worked each month</Text>
                      <LineChart data={laborHoursTrend} colors={colors} lineColor={colors.success} fillColor={colors.success} />
                    </View>

                    {/* Labor summary */}
                    {laborQuery.data && laborQuery.data.length > 0 && (
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                        <View style={[styles.summaryCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                          <Text style={{ fontSize: 10, color: colors.muted }}>6-Mo Labor Cost</Text>
                          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>
                            {fmt$(laborQuery.data.reduce((s: number, m: any) => s + m.totalCost, 0))}
                          </Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
                          <Text style={{ fontSize: 10, color: colors.muted }}>6-Mo Hours</Text>
                          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.success }}>
                            {Math.round(laborQuery.data.reduce((s: number, m: any) => s + m.totalMinutes, 0) / 60)}h
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Monthly Labor Hours</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Total hours worked each month</Text>
                      <LineChart data={laborHoursTrend} colors={colors} lineColor={colors.success} fillColor={colors.success} />
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ─── Taxes & Insurance ─────────────────────────────── */}
            {activeSection === "taxes" && (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {canSeeDollars ? (
                  <>
                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Tax & Insurance Breakdown</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Distribution of taxes, workers comp, and liability insurance</Text>
                      <DonutChart data={taxData} colors={colors} sliceColors={CHART_COLORS} />
                    </View>

                    {/* Tax summary cards */}
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                      <View style={[styles.summaryCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Total Tax</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>{fmt$(taxSummary.totalTax)}</Text>
                      </View>
                      <View style={[styles.summaryCard, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "40" }]}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Workers Comp</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.warning }}>{fmt$(taxSummary.totalWC)}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                      <View style={[styles.summaryCard, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Liability Ins</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.error }}>{fmt$(taxSummary.totalLiability)}</Text>
                      </View>
                      <View style={[styles.summaryCard, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>Grand Total</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.success }}>{fmt$(taxSummary.grandTotal)}</Text>
                      </View>
                    </View>

                    {/* Per-job breakdown table */}
                    {taxQuery.data && taxQuery.data.length > 0 && (
                      <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Per-Job Breakdown</Text>
                        <View style={{ marginTop: 8 }}>
                          <View style={{ flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                            <Text style={{ flex: 2, fontSize: 10, fontWeight: "700", color: colors.muted }}>Job</Text>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: colors.muted, textAlign: "right" }}>Tax</Text>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: colors.muted, textAlign: "right" }}>WC</Text>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: colors.muted, textAlign: "right" }}>Ins</Text>
                          </View>
                          {taxQuery.data.map((j: any, i: number) => (
                            <View key={i} style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border + "40" }}>
                              <Text style={{ flex: 2, fontSize: 11, color: colors.foreground }} numberOfLines={1}>{j.jobName}</Text>
                              <Text style={{ flex: 1, fontSize: 11, color: colors.foreground, textAlign: "right" }}>{fmt$(j.taxCost)}</Text>
                              <Text style={{ flex: 1, fontSize: 11, color: colors.foreground, textAlign: "right" }}>{fmt$(j.workersCompCost)}</Text>
                              <Text style={{ flex: 1, fontSize: 11, color: colors.foreground, textAlign: "right" }}>{fmt$(j.liabilityInsCost)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={{ padding: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 40 }}>🔒</Text>
                    <Text style={{ color: colors.muted, marginTop: 8, textAlign: "center" }}>Tax information is only visible to owners and office managers.</Text>
                  </View>
                )}
              </View>
            )}

            {/* ─── Budget Burn-Down ──────────────────────────────── */}
            {activeSection === "burndown" && (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {canSeeDollars ? (
                  <>
                    <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chartTitle, { color: colors.foreground }]}>Budget Burn-Down</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Budget vs actual spending per job — red means over 90% used</Text>
                      <BurndownChart data={burndownData} colors={colors} />
                    </View>

                    {/* Job-by-job breakdown */}
                    {burndownData && burndownData.length > 0 && (
                      <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Detailed Breakdown</Text>
                        <View style={{ marginTop: 8 }}>
                          {burndownData.map((j: any, i: number) => {
                            const pct = j.budget > 0 ? (j.spent / j.budget) * 100 : 0;
                            const barColor = pct > 90 ? colors.error : pct > 70 ? colors.warning : colors.success;
                            return (
                              <View key={i} style={{ marginBottom: 12 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{j.jobName}</Text>
                                  <Text style={{ fontSize: 11, color: barColor, fontWeight: "700" }}>{pct.toFixed(1)}%</Text>
                                </View>
                                <View style={{ height: 8, backgroundColor: colors.border + "40", borderRadius: 4, overflow: "hidden" }}>
                                  <View style={{ height: 8, width: `${Math.min(pct, 100)}%` as any, backgroundColor: barColor, borderRadius: 4 }} />
                                </View>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                                  <Text style={{ fontSize: 10, color: colors.muted }}>Spent: {fmt$(j.spent)}</Text>
                                  <Text style={{ fontSize: 10, color: colors.muted }}>Budget: {fmt$(j.budget)}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={{ padding: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 40 }}>🔒</Text>
                    <Text style={{ color: colors.muted, marginTop: 8, textAlign: "center" }}>Budget information is only visible to owners and office managers.</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </CWrapper>
  );
}

const styles = StyleSheet.create({
  sectionTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dateInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
