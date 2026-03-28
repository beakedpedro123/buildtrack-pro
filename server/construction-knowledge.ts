import { readFileSync } from "fs";
import { join } from "path";

// Load all knowledge base files at startup
const dataDir = join(import.meta.dirname || __dirname, "data");

let steelProfiles: any = {};
let simpsonHardware: any = {};
let utahCodes: any = {};
let constructionRef: any = {};

try { steelProfiles = JSON.parse(readFileSync(join(dataDir, "aisc-steel-profiles.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load steel profiles:", e); }
try { simpsonHardware = JSON.parse(readFileSync(join(dataDir, "simpson-hardware.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load Simpson hardware:", e); }
try { utahCodes = JSON.parse(readFileSync(join(dataDir, "utah-building-codes.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load Utah codes:", e); }
try { constructionRef = JSON.parse(readFileSync(join(dataDir, "construction-reference.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load construction reference:", e); }

console.log("[Knowledge] Loaded construction knowledge base:",
  `Steel: ${steelProfiles.w_shapes?.length || 0} W-shapes,`,
  `Simpson: ${Object.keys(simpsonHardware).length} categories,`,
  `Utah: ${Object.keys(utahCodes.jurisdictions || {}).length} jurisdictions,`,
  `Reference: ${Object.keys(constructionRef).length} sections`
);

// ── Steel Profile Lookup ──────────────────────────────────────────────────
export function lookupSteelProfile(designation: string): string {
  const d = designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
  
  // Try W-shapes first
  if (steelProfiles.w_shapes) {
    for (const shape of steelProfiles.w_shapes) {
      const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
      if (shapeDesig === d || shapeDesig.replace("W", "") === d.replace("W", "")) {
        return `**${shape.designation}** (W-Shape — Wide Flange)\n` +
          `- Weight: ${shape.weight_lb_ft} lbs/ft\n` +
          `- Depth (d): ${shape.d_in} in\n` +
          `- Flange Width (bf): ${shape.bf_in} in\n` +
          `- Flange Thickness (tf): ${shape.tf_in} in\n` +
          `- Web Thickness (tw): ${shape.tw_in} in\n` +
          `- Area: ${shape.A_in2} in²\n` +
          `- Moment of Inertia Ix: ${shape.Ix_in4} in⁴\n` +
          `- Moment of Inertia Iy: ${shape.Iy_in4} in⁴\n` +
          `- Section Modulus Sx: ${shape.Sx_in3} in³\n` +
          `- Section Modulus Sy: ${shape.Sy_in3} in³\n` +
          `- Radius of Gyration rx: ${shape.rx_in} in\n` +
          `- Radius of Gyration ry: ${shape.ry_in} in\n` +
          `- Plastic Modulus Zx: ${shape.Zx_in3} in³\n` +
          `Source: AISC Steel Construction Manual, 15th Edition`;
      }
    }
  }
  
  // Try other shapes
  for (const category of ["s_shapes", "hp_shapes", "c_shapes", "mc_shapes", "l_shapes", "wt_shapes", "hss_shapes", "pipe_shapes"]) {
    if (steelProfiles[category]) {
      for (const shape of steelProfiles[category]) {
        const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "");
        if (shapeDesig === d.toUpperCase() || shapeDesig.includes(d.toUpperCase())) {
          let result = `**${shape.designation}** (${category.replace("_shapes", "").toUpperCase()} Shape)\n`;
          for (const [key, val] of Object.entries(shape)) {
            if (key !== "designation") {
              result += `- ${key}: ${val}\n`;
            }
          }
          result += `Source: AISC Steel Construction Manual, 15th Edition`;
          return result;
        }
      }
    }
  }
  
  return `Steel profile "${designation}" not found in the AISC database. Try a format like W8x44, W12x26, S8x23, HP12x53, C10x30, HSS6x6x1/4, etc.`;
}

// ── Steel Weight Calculator ───────────────────────────────────────────────
export function calculateSteelWeight(designation: string, lengthFt: number): string {
  const d = designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
  
  for (const category of ["w_shapes", "s_shapes", "hp_shapes", "c_shapes", "mc_shapes", "hss_shapes", "pipe_shapes"]) {
    if (steelProfiles[category]) {
      for (const shape of steelProfiles[category]) {
        const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
        if (shapeDesig === d || shapeDesig.replace(/^[A-Z]+/, "") === d.replace(/^[A-Z]+/, "")) {
          const weightPerFt = shape.weight_lb_ft;
          const totalWeight = weightPerFt * lengthFt;
          return `**${shape.designation} at ${lengthFt} ft:**\n` +
            `- Weight per foot: ${weightPerFt} lbs/ft\n` +
            `- Total weight: ${totalWeight.toLocaleString()} lbs (${(totalWeight / 2000).toFixed(2)} tons)\n` +
            `- **Safety note:** Ensure crane/rigging capacity exceeds ${Math.ceil(totalWeight * 1.25).toLocaleString()} lbs (25% safety factor)\n` +
            `Source: AISC Steel Construction Manual`;
        }
      }
    }
  }
  
  return `Could not find "${designation}" to calculate weight. Try W8x44, W12x26, etc.`;
}

// ── Simpson Hardware Lookup ───────────────────────────────────────────────
export function lookupSimpsonHardware(model: string): string {
  const m = model.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  
  for (const category of Object.keys(simpsonHardware)) {
    if (category === "source" || category === "note" || category === "last_updated") continue;
    const items = simpsonHardware[category];
    if (!Array.isArray(items)) continue;
    
    for (const item of items) {
      const itemModel = (item.model || "").toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
      if (itemModel === m || itemModel.includes(m) || m.includes(itemModel)) {
        let result = `**${item.model}** — ${item.description}\n`;
        result += `Category: ${category.replace(/_/g, " ")}\n`;
        if (item.gauge) result += `- Gauge: ${item.gauge}\n`;
        if (item.material) result += `- Material: ${item.material}\n`;
        if (item.joist_size) result += `- Joist Size: ${item.joist_size}\n`;
        if (item.post_size) result += `- Post Size: ${item.post_size}\n`;
        if (item.allowable_download_DF) result += `- Allowable Download (DF/SP): ${item.allowable_download_DF} lbs\n`;
        if (item.allowable_download_SPF) result += `- Allowable Download (SPF): ${item.allowable_download_SPF} lbs\n`;
        if (item.allowable_uplift_DF) result += `- Allowable Uplift (DF/SP): ${item.allowable_uplift_DF} lbs\n`;
        if (item.allowable_lateral_DF) result += `- Allowable Lateral (DF/SP): ${item.allowable_lateral_DF} lbs\n`;
        if (item.allowable_tension_DF) result += `- Allowable Tension (DF/SP): ${item.allowable_tension_DF} lbs\n`;
        if (item.fasteners) result += `- Fasteners: ${item.fasteners}\n`;
        if (item.uses) result += `- Common Uses: ${item.uses}\n`;
        if (item.installation_notes) result += `- Installation Notes: ${item.installation_notes}\n`;
        result += `Source: Simpson Strong-Tie Wood Construction Connectors Catalog`;
        return result;
      }
    }
  }
  
  return `Simpson hardware "${model}" not found. Try models like A35, LUS26, LUS210, HHUS410, H1, HDU4, MSTA36, CB44, etc.`;
}

// ── Utah Building Code Lookup ─────────────────────────────────────────────
export function lookupUtahCode(jurisdiction: string): string {
  const j = jurisdiction.toLowerCase().replace(/\s+/g, "_").replace(/county|city/gi, "").trim().replace(/^_|_$/g, "");
  
  const jurisdictions = utahCodes.jurisdictions || {};
  let found: any = null;
  let key = "";
  
  for (const [k, v] of Object.entries(jurisdictions)) {
    const kNorm = k.toLowerCase().replace(/_/g, "");
    const jNorm = j.replace(/_/g, "");
    if (kNorm.includes(jNorm) || jNorm.includes(kNorm)) {
      found = v;
      key = k;
      break;
    }
  }
  
  // Also try matching by name field
  if (!found) {
    for (const [k, v] of Object.entries(jurisdictions) as [string, any][]) {
      if (v.name && v.name.toLowerCase().includes(j.replace(/_/g, " "))) {
        found = v;
        key = k;
        break;
      }
    }
  }
  
  if (!found) {
    const available = Object.values(jurisdictions).map((v: any) => v.name).join(", ");
    return `Jurisdiction "${jurisdiction}" not found. Available: ${available}`;
  }
  
  let result = `**${(found as any).name}** Building Code Summary\n`;
  if ((found as any).building_department) result += `- Building Dept: ${(found as any).building_department}\n`;
  if ((found as any).phone) result += `- Phone: ${(found as any).phone}\n`;
  if ((found as any).website) result += `- Website: ${(found as any).website}\n`;
  result += `- Ground Snow Load: ${(found as any).ground_snow_load_psf} psf\n`;
  result += `- Wind Speed: ${(found as any).wind_speed_mph} mph\n`;
  result += `- Seismic Design Category: ${(found as any).seismic_design_category}\n`;
  result += `- Frost Depth: ${(found as any).frost_depth_inches} inches\n`;
  result += `- Climate Zone: ${(found as any).climate_zone}\n`;
  if ((found as any).special_requirements) {
    result += `\n**Special Requirements:**\n`;
    for (const req of (found as any).special_requirements) {
      result += `- ${req}\n`;
    }
  }
  if ((found as any).permit_requirements) {
    result += `\n**Permit Requirements:**\n`;
    for (const req of (found as any).permit_requirements) {
      result += `- ${req}\n`;
    }
  }
  return result;
}

// ── General Construction Reference Lookup ─────────────────────────────────
export function lookupConstructionReference(topic: string): string {
  const t = topic.toLowerCase();
  
  // Lumber properties
  if (t.includes("lumber") || t.includes("wood") || t.includes("span") || t.includes("joist") || t.includes("2x")) {
    const lumber = constructionRef.lumber_properties;
    if (!lumber) return "Lumber data not available.";
    
    let result = "**Lumber Reference Data:**\n\n";
    
    if (t.includes("weight")) {
      result += "**Dimensional Lumber Weights (lbs per lineal foot at 12% MC):**\n";
      for (const [size, weight] of Object.entries(lumber.dimensional_lumber_weights || {})) {
        if (size !== "note") result += `- ${size}: ${weight} lbs/ft\n`;
      }
    } else if (t.includes("span")) {
      result += "**Floor Joist Span Tables (DF-L No.2, 40psf LL, L/360):**\n";
      const spans = lumber.span_tables_floor_joists;
      if (spans) {
        for (const [spacing, sizes] of Object.entries(spans)) {
          if (spacing === "note") continue;
          result += `\n${spacing.replace("_", " ")} spacing:\n`;
          for (const [size, data] of Object.entries(sizes as any)) {
            result += `  - ${size}: ${(data as any).span_ft} ft max span\n`;
          }
        }
      }
    } else if (t.includes("species") || t.includes("grade") || t.includes("strength")) {
      result += "**Lumber Design Values (No.2 Grade):**\n";
      for (const sp of lumber.species_grades || []) {
        result += `- ${sp.species} (${sp.grade}): Fb=${sp.Fb}, Ft=${sp.Ft}, Fc=${sp.Fc}, Fv=${sp.Fv}, E=${sp.E.toLocaleString()} psi\n`;
      }
    } else {
      // General lumber info
      result += "**Dimensional Lumber Weights:**\n";
      for (const [size, weight] of Object.entries(lumber.dimensional_lumber_weights || {})) {
        if (size !== "note") result += `- ${size}: ${weight} lbs/ft\n`;
      }
    }
    return result;
  }
  
  // Concrete
  if (t.includes("concrete") || t.includes("rebar") || t.includes("footing")) {
    const concrete = constructionRef.concrete_reference;
    if (!concrete) return "Concrete data not available.";
    
    let result = "**Concrete Reference:**\n\n";
    if (t.includes("rebar")) {
      result += "**Rebar Sizes:**\n";
      for (const r of concrete.rebar_sizes || []) {
        result += `- ${r.size}: ${r.diameter_in}" dia, ${r.weight_lb_ft} lbs/ft, ${r.area_sq_in} in² area\n`;
      }
    } else if (t.includes("footing")) {
      result += "**Footing Requirements (Utah):**\n";
      const ft = concrete.footing_requirements_utah;
      if (ft) {
        for (const [k, v] of Object.entries(ft)) {
          result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
        }
      }
    } else {
      result += "**Mix Strengths:**\n";
      for (const [k, v] of Object.entries(concrete.mix_strengths || {})) {
        result += `- ${k}: ${v}\n`;
      }
      result += `\n**Coverage (per cubic yard):**\n`;
      for (const [k, v] of Object.entries(concrete.coverage || {})) {
        if (k !== "note") result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
      }
      result += `\nWeight: ${concrete.weight}\n`;
    }
    return result;
  }
  
  // Crane and rigging
  if (t.includes("crane") || t.includes("rigging") || t.includes("sling") || t.includes("lift")) {
    const crane = constructionRef.crane_and_rigging_safety;
    if (!crane) return "Crane data not available.";
    
    let result = "**Crane & Rigging Reference:**\n\n";
    if (t.includes("sling") || t.includes("rigging")) {
      result += "**Sling Angle Capacity Reduction:**\n";
      for (const [angle, cap] of Object.entries(crane.rigging_basics?.sling_capacity_reduction || {})) {
        result += `- ${angle.replace(/_/g, " ")}: ${cap}\n`;
      }
      result += `\nSafety Factor: ${crane.rigging_basics?.safety_factor}\n`;
      result += `Tag Lines: ${crane.rigging_basics?.tag_lines}\n`;
    } else {
      result += "**Common Mobile Cranes:**\n";
      for (const c of crane.common_mobile_cranes || []) {
        result += `- ${c.type}: ${c.max_capacity_lbs.toLocaleString()} lbs max, boom ${c.typical_boom_ft}\n`;
      }
      result += `\n**OSHA Crane Requirements:**\n`;
      for (const req of crane.osha_crane_requirements || []) {
        result += `- ${req}\n`;
      }
    }
    return result;
  }
  
  // Steel erection
  if (t.includes("bolt") || t.includes("weld") || t.includes("steel erection") || t.includes("torque")) {
    const steel = constructionRef.steel_erection_reference;
    if (!steel) return "Steel erection data not available.";
    
    let result = "**Steel Erection Reference:**\n\n";
    if (t.includes("bolt") || t.includes("torque")) {
      result += "**Bolt Pretension Values (A325, kips):**\n";
      for (const [size, val] of Object.entries(steel.bolt_torque_values || {})) {
        if (size !== "note") result += `- ${size.replace(/_/g, " ")}: ${val} kips\n`;
      }
    } else if (t.includes("weld")) {
      result += "**Welding Reference:**\n";
      const welding = steel.welding_basics;
      if (welding) {
        result += "\nCommon Processes:\n";
        for (const [k, v] of Object.entries(welding.common_processes || {})) {
          result += `- ${k}: ${v}\n`;
        }
        result += "\nMinimum Fillet Weld Sizes:\n";
        for (const [k, v] of Object.entries(welding.minimum_fillet_weld_sizes || {})) {
          result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
        }
      }
    } else {
      result += "**OSHA Steel Erection Requirements:**\n";
      for (const req of steel.osha_steel_erection_requirements || []) {
        result += `- ${req}\n`;
      }
    }
    return result;
  }
  
  // Safety
  if (t.includes("safety") || t.includes("fall") || t.includes("scaffold") || t.includes("excavat") || t.includes("osha")) {
    const safety = constructionRef.safety_reference;
    if (!safety) return "Safety data not available.";
    
    let result = "**Safety Reference:**\n\n";
    if (t.includes("fall")) {
      result += "**Fall Protection:**\n";
      for (const [k, v] of Object.entries(safety.fall_protection || {})) {
        result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
      }
    } else if (t.includes("scaffold")) {
      result += "**Scaffold Requirements:**\n";
      for (const req of safety.scaffold_requirements || []) {
        result += `- ${req}\n`;
      }
    } else if (t.includes("excavat") || t.includes("trench")) {
      result += "**Excavation Safety:**\n";
      for (const req of safety.excavation_safety || []) {
        result += `- ${req}\n`;
      }
    } else {
      // All safety
      result += "**Fall Protection:**\n";
      for (const [k, v] of Object.entries(safety.fall_protection || {})) {
        result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
      }
      result += "\n**Scaffold Requirements:**\n";
      for (const req of safety.scaffold_requirements || []) {
        result += `- ${req}\n`;
      }
    }
    return result;
  }
  
  // Weight calculations
  if (t.includes("weight") || t.includes("material weight")) {
    const weights = constructionRef.weight_calculation_helpers;
    if (!weights) return "Weight data not available.";
    
    let result = "**Common Material Weights (psf):**\n";
    for (const [k, v] of Object.entries(weights.common_material_weights_psf || {})) {
      result += `- ${k.replace(/_/g, " ")}: ${v} psf\n`;
    }
    result += `\n**Beam Weight Formula:** ${weights.beam_weight_formula}\n`;
    result += `**Example:** ${weights.example}\n`;
    return result;
  }
  
  // Framing requirements
  if (t.includes("framing") || t.includes("header") || t.includes("stud") || t.includes("nail") || t.includes("fastener")) {
    const framing = utahCodes.common_framing_requirements;
    if (!framing) return "Framing data not available.";
    
    let result = "**Framing Requirements (IRC):**\n\n";
    if (t.includes("header")) {
      result += "**Header Sizes:**\n";
      for (const [k, v] of Object.entries(framing.wall_framing?.headers || {})) {
        result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
      }
    } else if (t.includes("nail") || t.includes("fastener")) {
      result += "**Fastener Schedule:**\n";
      for (const [k, v] of Object.entries(framing.fastener_schedule || {})) {
        result += `- ${k.replace(/_/g, " ")}: ${v}\n`;
      }
    } else {
      result += "**Wall Framing:**\n";
      const wall = framing.wall_framing;
      if (wall) {
        result += `- Studs: ${wall.studs}\n`;
        result += `- Top Plates: ${wall.top_plates}\n`;
        result += `- Bottom Plate: ${wall.bottom_plate}\n`;
        result += `- Bracing: ${wall.bracing}\n`;
        result += `- Fire Blocking: ${wall.fire_blocking}\n`;
      }
    }
    return result;
  }
  
  // Inspection sequence
  if (t.includes("inspection") || t.includes("permit")) {
    const inspections = utahCodes.inspection_sequence;
    if (!inspections) return "Inspection data not available.";
    
    let result = "**Inspection Sequence:**\n";
    for (const step of inspections) {
      result += `${step}\n`;
    }
    return result;
  }
  
  return `Topic "${topic}" not found in the construction reference. Try: steel profiles, Simpson hardware, lumber, concrete, crane/rigging, safety, framing, welding, bolts, inspections, or a specific Utah jurisdiction.`;
}

// ── Get condensed knowledge summary for system prompt ─────────────────────
export function getKnowledgeSummary(): string {
  return `
## Construction Knowledge Base — BUILT-IN REFERENCE DATA
You have a comprehensive construction knowledge base loaded. You can look up ANY of the following instantly using the construction_lookup tool:

**AISC Steel Profiles (FULL DATABASE):**
All W-shapes (W4x13 through W44x335), S-shapes, HP-shapes, C-channels, MC-channels, L-angles, WT-shapes, HSS (hollow structural sections), and PIPE sections.
For each: weight/ft, depth, flange width, flange thickness, web thickness, area, Ix, Iy, Sx, Sy, rx, ry, Zx.
You can calculate total weight for any beam at any length.

**Simpson Strong-Tie Hardware (FULL CATALOG):**
Framing angles (A21, A23, A34, A35, A66, L50, L70, L90)
Face-mount joist hangers (LUS26, LUS28, LUS210, LUS212, LUS26-2, LUS28-2, LUS210-2, HUS26, HUS28, HUS210, HHUS410, HHUS412, HHUS414)
Top-flange hangers (LBV, DERA)
Post bases (ABU44, ABU46, ABU66, CB44, CB46, CB66)
Post caps (BC4, BC46, BC6, CC44, CC46, CC66)
Hurricane ties & straps (H1, H2.5A, H10A, LSTA12-24, MSTA36, MSTI28, ST6215, CS16)
Holdowns (HDU2, HDU4, HDU5, HDU8, HDU11, PAHD42)
Heavy beam hangers (GLB, LSSJ, HGQ)
Misc connectors (RTC2Z, MSTC28, DTT2Z, FB24, FB26)
For each: allowable loads, fastener requirements, installation notes, common uses.

**Utah Building Codes (ALL JURISDICTIONS):**
Summit County (115 psf snow, 36" frost), Park City (100 psf snow), Powder Mountain (150 psf snow, 42" frost!), Morgan County (60 psf), Layton (40 psf), Salt Lake City (30 psf), Coalville (75 psf).
For each: snow loads, wind speed, seismic category, frost depth, climate zone, special requirements, permit requirements, building department contact info.
Plus: state code base (2021 IRC/IBC), energy code requirements by climate zone, common framing requirements, fastener schedules, header sizes, inspection sequences, common code violations.

**Construction Reference:**
Lumber properties (species/grades, design values, weights, span tables for floor joists)
Concrete (mix strengths, coverage, rebar sizes, footing requirements)
Crane & rigging safety (crane types/capacities, sling angle reductions, OSHA requirements)
Steel erection (bolt pretension values, welding basics, OSHA steel erection rules)
Safety (fall protection, scaffolding, excavation)
Material weights (common building materials in psf)
Fastener schedules (nailing patterns per IRC)

**IMPORTANT:** When a user asks about ANY of these topics, use the construction_lookup tool to get the exact data. Don't guess from memory — use the tool for precise numbers. For hardware pictures, use the image_search tool.
`;
}
