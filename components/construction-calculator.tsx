import { useColors } from "@/hooks/use-colors";
import { useState, useCallback } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

type CalcMode = "standard" | "area" | "concrete" | "material" | "payroll" | "staircase";

interface CalcResult {
  label: string;
  value: string;
  unit?: string;
}

export function ConstructionCalculator({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const [mode, setMode] = useState<CalcMode>("standard");
  const [results, setResults] = useState<CalcResult[]>([]);

  // Standard calculator state
  const [display, setDisplay] = useState("0");
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [memory, setMemory] = useState(0);

  // Area/Volume inputs
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [unit, setUnit] = useState<"ft" | "m">("ft");

  // Concrete inputs
  const [bags60, setBags60] = useState("");
  const [bags80, setBags80] = useState("");

  // Material inputs
  const [boardLength, setBoardLength] = useState("");
  const [boardWidth, setBoardWidth] = useState("");
  const [spacing, setSpacing] = useState("16");
  const [wastePct, setWastePct] = useState("10");

  // Payroll inputs
  const [hourlyRate, setHourlyRate] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("");
  const [numEmployees, setNumEmployees] = useState("1");
  const [taxRate, setTaxRate] = useState("7.65");
  const [wcRate, setWcRate] = useState("15");

  // Staircase inputs
  const [totalRise, setTotalRise] = useState("");
  const [riserHeight, setRiserHeight] = useState("7.5");
  const [treadDepth, setTreadDepth] = useState("10");

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Standard Calculator Logic ───
  const inputDigit = (digit: string) => {
    haptic();
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? digit : display + digit);
    }
  };

  const inputDecimal = () => {
    haptic();
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes(".")) setDisplay(display + ".");
  };

  const clearAll = () => {
    haptic();
    setDisplay("0");
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const toggleSign = () => {
    haptic();
    const val = parseFloat(display);
    setDisplay(String(-val));
  };

  const inputPercent = () => {
    haptic();
    const val = parseFloat(display);
    setDisplay(String(val / 100));
  };

  const performOperation = (nextOp: string) => {
    haptic();
    const current = parseFloat(display);
    if (prevValue !== null && operator && !waitingForOperand) {
      let result = prevValue;
      switch (operator) {
        case "+": result = prevValue + current; break;
        case "-": result = prevValue - current; break;
        case "×": result = prevValue * current; break;
        case "÷": result = current !== 0 ? prevValue / current : 0; break;
      }
      setDisplay(String(parseFloat(result.toFixed(8))));
      setPrevValue(result);
    } else {
      setPrevValue(current);
    }
    setOperator(nextOp === "=" ? null : nextOp);
    setWaitingForOperand(true);
  };

  const memoryAdd = () => { haptic(); setMemory(memory + parseFloat(display)); };
  const memorySubtract = () => { haptic(); setMemory(memory - parseFloat(display)); };
  const memoryRecall = () => { haptic(); setDisplay(String(memory)); setWaitingForOperand(true); };
  const memoryClear = () => { haptic(); setMemory(0); };

  // ─── Conversion helpers ───
  const toFeet = (val: number) => unit === "m" ? val * 3.28084 : val;
  const unitLabel = unit === "m" ? "m" : "ft";
  const areaUnit = unit === "m" ? "m²" : "ft²";
  const volUnit = unit === "m" ? "m³" : "ft³";

  // ─── Area/Volume Calculator ───
  const calcArea = useCallback(() => {
    haptic();
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const d = parseFloat(depth) || 0;
    const area = l * w;
    const res: CalcResult[] = [
      { label: "Area", value: area.toFixed(2), unit: areaUnit },
      { label: "Perimeter", value: ((l + w) * 2).toFixed(2), unit: unitLabel },
    ];
    if (d > 0) {
      const vol = area * d;
      const cubicYards = unit === "ft" ? vol / 27 : vol * 1.30795;
      res.push({ label: "Volume", value: vol.toFixed(2), unit: volUnit });
      res.push({ label: "Cubic Yards", value: cubicYards.toFixed(2), unit: "yd³" });
    }
    setResults(res);
  }, [length, width, depth, unit]);

  // ─── Concrete Calculator ───
  const calcConcrete = useCallback(() => {
    haptic();
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const d = parseFloat(depth) || 0;
    const lFt = toFeet(l);
    const wFt = toFeet(w);
    const dFt = toFeet(d);
    const cubicFt = lFt * wFt * dFt;
    const cubicYards = cubicFt / 27;
    const bags60Count = Math.ceil(cubicFt / 0.45);
    const bags80Count = Math.ceil(cubicFt / 0.6);
    setResults([
      { label: "Volume", value: cubicFt.toFixed(1), unit: "ft³" },
      { label: "Cubic Yards", value: cubicYards.toFixed(2), unit: "yd³" },
      { label: "60lb Bags Needed", value: String(bags60Count), unit: "bags" },
      { label: "80lb Bags Needed", value: String(bags80Count), unit: "bags" },
      { label: "Est. Cost (truck @$150/yd)", value: "$" + (cubicYards * 150).toFixed(0) },
    ]);
  }, [length, width, depth, unit]);

  // ─── Material/Framing Calculator ───
  const calcMaterial = useCallback(() => {
    haptic();
    const l = parseFloat(boardLength) || 0;
    const w = parseFloat(boardWidth) || 0;
    const sp = parseFloat(spacing) || 16;
    const waste = parseFloat(wastePct) || 10;
    const area = l * w;
    // Studs/joists needed
    const count = Math.ceil((l * 12) / sp) + 1;
    const withWaste = Math.ceil(count * (1 + waste / 100));
    // Board feet
    const boardFeet = (l * w * (1.5 / 12)); // rough estimate for 2x material
    // Sheets of plywood (4x8)
    const sheets = Math.ceil(area / 32);
    const sheetsWithWaste = Math.ceil(sheets * (1 + waste / 100));
    setResults([
      { label: "Area", value: area.toFixed(1), unit: "ft²" },
      { label: `Studs/Joists (${sp}" OC)`, value: String(count) },
      { label: `With ${waste}% Waste`, value: String(withWaste), unit: "pieces" },
      { label: "Plywood Sheets (4×8)", value: String(sheets) },
      { label: `Sheets w/ Waste`, value: String(sheetsWithWaste) },
      { label: "Linear Feet", value: (count * w).toFixed(0), unit: "LF" },
    ]);
  }, [boardLength, boardWidth, spacing, wastePct]);

  // ─── Payroll Calculator ───
  const calcPayroll = useCallback(() => {
    haptic();
    const rate = parseFloat(hourlyRate) || 0;
    const reg = parseFloat(hoursWorked) || 0;
    const ot = parseFloat(overtimeHours) || 0;
    const emps = parseInt(numEmployees) || 1;
    const tax = parseFloat(taxRate) || 7.65;
    const wc = parseFloat(wcRate) || 15;
    const regPay = rate * reg;
    const otPay = rate * 1.5 * ot;
    const grossPerEmp = regPay + otPay;
    const totalGross = grossPerEmp * emps;
    const employerTax = totalGross * (tax / 100);
    const workersComp = totalGross * (wc / 100);
    const totalCost = totalGross + employerTax + workersComp;
    setResults([
      { label: "Regular Pay/Person", value: "$" + regPay.toFixed(2) },
      { label: "Overtime Pay/Person", value: "$" + otPay.toFixed(2) },
      { label: "Gross Per Employee", value: "$" + grossPerEmp.toFixed(2) },
      { label: `Total Gross (${emps} emp)`, value: "$" + totalGross.toFixed(2) },
      { label: `Employer Tax (${tax}%)`, value: "$" + employerTax.toFixed(2) },
      { label: `Workers Comp (${wc}%)`, value: "$" + workersComp.toFixed(2) },
      { label: "Total Labor Cost", value: "$" + totalCost.toFixed(2) },
      { label: "Cost Per Hour", value: "$" + (totalCost / ((reg + ot) * emps || 1)).toFixed(2) },
    ]);
  }, [hourlyRate, hoursWorked, overtimeHours, numEmployees, taxRate, wcRate]);

  // ─── Staircase Calculator ───
  const calcStairs = useCallback(() => {
    haptic();
    const rise = parseFloat(totalRise) || 0;
    const rh = parseFloat(riserHeight) || 7.5;
    const td = parseFloat(treadDepth) || 10;
    const numRisers = Math.ceil(rise / rh);
    const numTreads = numRisers - 1;
    const actualRiser = rise / numRisers;
    const totalRun = numTreads * td;
    const stringerLength = Math.sqrt(rise * rise + totalRun * totalRun);
    setResults([
      { label: "Number of Risers", value: String(numRisers) },
      { label: "Number of Treads", value: String(numTreads) },
      { label: "Actual Riser Height", value: actualRiser.toFixed(2), unit: "in" },
      { label: "Total Run", value: totalRun.toFixed(1), unit: "in" },
      { label: "Stringer Length", value: stringerLength.toFixed(1), unit: "in" },
      { label: "Stringer Length", value: (stringerLength / 12).toFixed(2), unit: "ft" },
    ]);
  }, [totalRise, riserHeight, treadDepth]);

  const modes: { key: CalcMode; label: string; icon: string }[] = [
    { key: "standard", label: "Standard", icon: "🔢" },
    { key: "area", label: "Area", icon: "📐" },
    { key: "concrete", label: "Concrete", icon: "🏗️" },
    { key: "material", label: "Framing", icon: "🪵" },
    { key: "payroll", label: "Payroll", icon: "💰" },
    { key: "staircase", label: "Stairs", icon: "🪜" },
  ];

  const switchMode = (m: CalcMode) => {
    haptic();
    setMode(m);
    setResults([]);
  };

  const renderInput = (label: string, value: string, onChange: (v: string) => void, placeholder?: string, suffix?: string) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder || "0"}
          placeholderTextColor={colors.muted + "60"}
          keyboardType="decimal-pad"
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: "600",
            color: colors.foreground,
            backgroundColor: colors.surface,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        {suffix && (
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginLeft: 8 }}>{suffix}</Text>
        )}
      </View>
    </View>
  );

  const renderResults = () => {
    if (results.length === 0) return null;
    return (
      <View style={{ marginTop: 12, backgroundColor: colors.primary + "08", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.primary + "20" }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, marginBottom: 8 }}>Results</Text>
        {results.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: i < results.length - 1 ? 0.5 : 0, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }}>{r.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
              {r.value}{r.unit ? ` ${r.unit}` : ""}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // Standard calculator button
  const CalcBtn = ({ label, onPress, bg, textColor, wide }: { label: string; onPress: () => void; bg?: string; textColor?: string; wide?: boolean }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={{
        flex: wide ? 2 : 1,
        backgroundColor: bg || colors.surface,
        borderRadius: 12,
        paddingVertical: 14,
        marginHorizontal: 3,
        marginVertical: 3,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600", color: textColor || colors.foreground }}>{label}</Text>
    </TouchableOpacity>
  );

  const renderStandardCalc = () => (
    <View>
      {/* Display */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
        {memory !== 0 && <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>M: {memory}</Text>}
        {operator && <Text style={{ fontSize: 13, color: colors.muted }}>{prevValue} {operator}</Text>}
        <Text style={{ fontSize: 36, fontWeight: "700", color: colors.foreground, textAlign: "right" }} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>
      {/* Memory row */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        <CalcBtn label="MC" onPress={memoryClear} textColor={colors.muted} />
        <CalcBtn label="MR" onPress={memoryRecall} textColor={colors.primary} />
        <CalcBtn label="M+" onPress={memoryAdd} textColor={colors.primary} />
        <CalcBtn label="M−" onPress={memorySubtract} textColor={colors.primary} />
      </View>
      {/* Calc grid */}
      <View style={{ flexDirection: "row" }}>
        <CalcBtn label="C" onPress={clearAll} bg={colors.muted + "30"} textColor={colors.foreground} />
        <CalcBtn label="±" onPress={toggleSign} bg={colors.muted + "30"} textColor={colors.foreground} />
        <CalcBtn label="%" onPress={inputPercent} bg={colors.muted + "30"} textColor={colors.foreground} />
        <CalcBtn label="÷" onPress={() => performOperation("÷")} bg={colors.primary} textColor="#fff" />
      </View>
      <View style={{ flexDirection: "row" }}>
        <CalcBtn label="7" onPress={() => inputDigit("7")} />
        <CalcBtn label="8" onPress={() => inputDigit("8")} />
        <CalcBtn label="9" onPress={() => inputDigit("9")} />
        <CalcBtn label="×" onPress={() => performOperation("×")} bg={colors.primary} textColor="#fff" />
      </View>
      <View style={{ flexDirection: "row" }}>
        <CalcBtn label="4" onPress={() => inputDigit("4")} />
        <CalcBtn label="5" onPress={() => inputDigit("5")} />
        <CalcBtn label="6" onPress={() => inputDigit("6")} />
        <CalcBtn label="−" onPress={() => performOperation("-")} bg={colors.primary} textColor="#fff" />
      </View>
      <View style={{ flexDirection: "row" }}>
        <CalcBtn label="1" onPress={() => inputDigit("1")} />
        <CalcBtn label="2" onPress={() => inputDigit("2")} />
        <CalcBtn label="3" onPress={() => inputDigit("3")} />
        <CalcBtn label="+" onPress={() => performOperation("+")} bg={colors.primary} textColor="#fff" />
      </View>
      <View style={{ flexDirection: "row" }}>
        <CalcBtn label="0" onPress={() => inputDigit("0")} wide />
        <CalcBtn label="." onPress={inputDecimal} />
        <CalcBtn label="=" onPress={() => performOperation("=")} bg={colors.primary} textColor="#fff" />
      </View>
      {/* Quick conversions */}
      <View style={{ marginTop: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>Quick Convert</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[
            { label: "ft→in", calc: () => setDisplay(String((parseFloat(display) * 12).toFixed(2))) },
            { label: "in→ft", calc: () => setDisplay(String((parseFloat(display) / 12).toFixed(4))) },
            { label: "ft→m", calc: () => setDisplay(String((parseFloat(display) * 0.3048).toFixed(4))) },
            { label: "m→ft", calc: () => setDisplay(String((parseFloat(display) * 3.28084).toFixed(4))) },
            { label: "yd³→ft³", calc: () => setDisplay(String((parseFloat(display) * 27).toFixed(2))) },
            { label: "ft²→m²", calc: () => setDisplay(String((parseFloat(display) * 0.0929).toFixed(4))) },
          ].map((c) => (
            <TouchableOpacity key={c.label} onPress={() => { haptic(); c.calc(); }} style={{ backgroundColor: colors.primary + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderAreaCalc = () => (
    <View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => { haptic(); setUnit("ft"); }} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: unit === "ft" ? colors.primary + "20" : colors.surface, borderWidth: 1, borderColor: unit === "ft" ? colors.primary : colors.border, alignItems: "center" }}>
          <Text style={{ fontWeight: "700", color: unit === "ft" ? colors.primary : colors.muted }}>Feet</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptic(); setUnit("m"); }} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: unit === "m" ? colors.primary + "20" : colors.surface, borderWidth: 1, borderColor: unit === "m" ? colors.primary : colors.border, alignItems: "center" }}>
          <Text style={{ fontWeight: "700", color: unit === "m" ? colors.primary : colors.muted }}>Meters</Text>
        </TouchableOpacity>
      </View>
      {renderInput("Length", length, setLength, "0", unitLabel)}
      {renderInput("Width", width, setWidth, "0", unitLabel)}
      {renderInput("Depth (optional)", depth, setDepth, "0", unitLabel)}
      <TouchableOpacity onPress={calcArea} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Calculate</Text>
      </TouchableOpacity>
      {renderResults()}
    </View>
  );

  const renderConcreteCalc = () => (
    <View>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Enter slab/footing dimensions</Text>
      {renderInput("Length", length, setLength, "0", "ft")}
      {renderInput("Width", width, setWidth, "0", "ft")}
      {renderInput("Depth/Thickness", depth, setDepth, "0", "ft")}
      <TouchableOpacity onPress={calcConcrete} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Calculate</Text>
      </TouchableOpacity>
      {renderResults()}
    </View>
  );

  const renderMaterialCalc = () => (
    <View>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Wall/floor framing estimator</Text>
      {renderInput("Wall/Floor Length", boardLength, setBoardLength, "0", "ft")}
      {renderInput("Wall/Floor Width", boardWidth, setBoardWidth, "0", "ft")}
      {renderInput("Stud/Joist Spacing", spacing, setSpacing, "16", "in OC")}
      {renderInput("Waste Factor", wastePct, setWastePct, "10", "%")}
      <TouchableOpacity onPress={calcMaterial} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Calculate</Text>
      </TouchableOpacity>
      {renderResults()}
    </View>
  );

  const renderPayrollCalc = () => (
    <View>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Estimate labor cost per week</Text>
      {renderInput("Hourly Rate", hourlyRate, setHourlyRate, "25.00", "$/hr")}
      {renderInput("Regular Hours", hoursWorked, setHoursWorked, "40", "hrs")}
      {renderInput("Overtime Hours", overtimeHours, setOvertimeHours, "0", "hrs")}
      {renderInput("Number of Employees", numEmployees, setNumEmployees, "1")}
      {renderInput("Employer Tax Rate", taxRate, setTaxRate, "7.65", "%")}
      {renderInput("Workers Comp Rate", wcRate, setWcRate, "15", "%")}
      <TouchableOpacity onPress={calcPayroll} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Calculate</Text>
      </TouchableOpacity>
      {renderResults()}
    </View>
  );

  const renderStaircaseCalc = () => (
    <View>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Calculate risers, treads, and stringer length</Text>
      {renderInput("Total Rise (floor to floor)", totalRise, setTotalRise, "0", "inches")}
      {renderInput("Riser Height", riserHeight, setRiserHeight, "7.5", "inches")}
      {renderInput("Tread Depth", treadDepth, setTreadDepth, "10", "inches")}
      <TouchableOpacity onPress={calcStairs} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Calculate</Text>
      </TouchableOpacity>
      {renderResults()}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Platform.OS === "ios" ? 56 : 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Construction Calculator</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Mode Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50, borderBottomWidth: 0.5, borderBottomColor: colors.border }} contentContainerStyle={{ paddingHorizontal: 12, alignItems: "center", paddingVertical: 6 }}>
          {modes.map((m) => (
            <TouchableOpacity
              key={m.key}
              onPress={() => switchMode(m.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 20,
                marginHorizontal: 3,
                backgroundColor: mode === m.key ? colors.primary + "18" : "transparent",
                borderWidth: 1,
                borderColor: mode === m.key ? colors.primary : "transparent",
              }}
            >
              <Text style={{ fontSize: 14, marginRight: 4 }}>{m.icon}</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: mode === m.key ? colors.primary : colors.muted }}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Calculator Content */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {mode === "standard" && renderStandardCalc()}
          {mode === "area" && renderAreaCalc()}
          {mode === "concrete" && renderConcreteCalc()}
          {mode === "material" && renderMaterialCalc()}
          {mode === "payroll" && renderPayrollCalc()}
          {mode === "staircase" && renderStaircaseCalc()}
        </ScrollView>
      </View>
    </Modal>
  );
}
