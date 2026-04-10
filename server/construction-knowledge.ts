import { readFileSync } from "fs";
import { join } from "path";

// Load all knowledge base files at startup
// Use process.cwd() + "server/data" for reliable resolution in both dev (tsx) and production (esbuild)
const dataDir = join(process.cwd(), "server", "data");

let steelProfiles: any = {};
let simpsonHardware: any = {};
let utahCodes: any = {};
let constructionRef: any = {};

try { steelProfiles = JSON.parse(readFileSync(join(dataDir, "aisc-steel-profiles.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load steel profiles:", e); }
try { simpsonHardware = JSON.parse(readFileSync(join(dataDir, "simpson-hardware.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load Simpson hardware:", e); }
try { utahCodes = JSON.parse(readFileSync(join(dataDir, "utah-building-codes.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load Utah codes:", e); }
try { constructionRef = JSON.parse(readFileSync(join(dataDir, "construction-reference.json"), "utf-8")); } catch (e) { console.warn("[Knowledge] Failed to load construction reference:", e); }

// Count total steel shapes
const steelCategories = [
  "w_shapes", "hp_shapes", "s_shapes", "c_channels", "mc_channels",
  "l_angles", "hss_rectangular", "hss_square", "hss_round",
  "pipe_shapes", "wt_shapes", "m_shapes"
];
let totalSteel = 0;
for (const cat of steelCategories) {
  if (Array.isArray(steelProfiles[cat])) totalSteel += steelProfiles[cat].length;
}

console.log("[Knowledge] Loaded construction knowledge base:",
  `Steel: ${totalSteel} total shapes (${steelCategories.filter(c => Array.isArray(steelProfiles[c]) && steelProfiles[c].length > 0).join(", ")}),`,
  `Simpson: ${Object.keys(simpsonHardware).length} categories,`,
  `Utah: ${Object.keys(utahCodes.jurisdictions || {}).length} jurisdictions,`,
  `Reference: ${Object.keys(constructionRef).length} sections`
);

// ── Steel Profile Lookup ──────────────────────────────────────────────────
export function lookupSteelProfile(designation: string): string {
  const d = designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
  
  // Try W-shapes first (they have the most detailed properties)
  if (steelProfiles.w_shapes) {
    for (const shape of steelProfiles.w_shapes) {
      const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
      if (shapeDesig === d || shapeDesig.replace("W", "") === d.replace("W", "")) {
        return `**${shape.designation}** (W-Shape — Wide Flange)\n` +
          `- Weight: ${shape.weight} lbs/ft\n` +
          `- Depth (d): ${shape.depth} in\n` +
          `- Flange Width (bf): ${shape.width} in\n` +
          `- Flange Thickness (tf): ${shape.tf} in\n` +
          `- Web Thickness (tw): ${shape.tw} in\n` +
          `- Area: ${shape.area} in²\n` +
          `- Moment of Inertia Ix: ${shape.Ix} in⁴\n` +
          `- Moment of Inertia Iy: ${shape.Iy} in⁴\n` +
          `- Section Modulus Sx: ${shape.Sx} in³\n` +
          `- Section Modulus Sy: ${shape.Sy} in³\n` +
          `Source: AISC Steel Construction Manual, 16th Edition`;
      }
    }
  }
  
  // Category display name mapping
  const categoryNames: Record<string, string> = {
    "s_shapes": "S-Shape (American Standard Beam)",
    "hp_shapes": "HP-Shape (Bearing Pile)",
    "c_channels": "C-Channel (American Standard Channel)",
    "mc_channels": "MC-Channel (Miscellaneous Channel)",
    "l_angles": "L-Angle (Structural Angle)",
    "hss_rectangular": "HSS Rectangular (Hollow Structural Section)",
    "hss_square": "HSS Square (Hollow Structural Section)",
    "hss_round": "HSS Round (Hollow Structural Section)",
    "pipe_shapes": "Pipe (Standard/Extra Strong/Double Extra Strong)",
    "wt_shapes": "WT-Shape (Structural Tee cut from W-beam)",
    "m_shapes": "M-Shape (Miscellaneous Beam)",
  };
  
  // Try all other shape categories
  for (const category of steelCategories.filter(c => c !== "w_shapes")) {
    if (steelProfiles[category] && Array.isArray(steelProfiles[category])) {
      for (const shape of steelProfiles[category]) {
        const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "");
        if (shapeDesig === d.toUpperCase() || shapeDesig.includes(d.toUpperCase()) || d.toUpperCase().includes(shapeDesig)) {
          const catName = categoryNames[category] || category.replace(/_/g, " ").toUpperCase();
          let result = `**${shape.designation}** (${catName})\n`;
          for (const [key, val] of Object.entries(shape)) {
            if (key !== "designation") {
              const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
              result += `- ${label}: ${val}\n`;
            }
          }
          result += `Source: AISC Steel Construction Manual, 16th Edition`;
          return result;
        }
      }
    }
  }
  
  // Check reference data (plate, rebar, bolts, welds)
  if (d.includes("PLATE") || d.includes("PL")) {
    const plates = steelProfiles.plate_weights;
    if (plates && plates.thicknesses) {
      let result = "**Steel Plate Weight Reference:**\n";
      result += `${plates.note}\n\n`;
      for (const p of plates.thicknesses) {
        result += `- ${p.gauge} (${p.thickness_in}"): ${p.weight_psf} lb/ft²\n`;
      }
      result += `\nSource: AISC Steel Construction Manual`;
      return result;
    }
  }
  
  if (d.includes("REBAR") || d.includes("#")) {
    const rebar = steelProfiles.rebar;
    if (rebar) {
      // Try to find specific bar size
      for (const bar of rebar) {
        if (d.includes(bar.bar_size.toUpperCase())) {
          return `**${bar.bar_size} Rebar:**\n` +
            `- Diameter: ${bar.diameter_in} in\n` +
            `- Cross-sectional Area: ${bar.area_in2} in²\n` +
            `- Weight: ${bar.weight_plf} lbs/ft\n` +
            `Source: ASTM A615/A706`;
        }
      }
      // Show all rebar
      let result = "**Rebar Reference:**\n";
      for (const bar of rebar) {
        result += `- ${bar.bar_size}: ${bar.diameter_in}" dia, ${bar.area_in2} in², ${bar.weight_plf} lbs/ft\n`;
      }
      result += `Source: ASTM A615/A706`;
      return result;
    }
  }
  
  // List available categories
  const availableCats = steelCategories
    .filter(c => Array.isArray(steelProfiles[c]) && steelProfiles[c].length > 0)
    .map(c => `${c.replace(/_/g, " ")} (${steelProfiles[c].length})`)
    .join(", ");
  
  return `Steel profile "${designation}" not found in the AISC database.\n\n` +
    `**Available categories (${totalSteel} total shapes):** ${availableCats}\n\n` +
    `Try formats like: W8x44, S8x23, HP12x53, C10x30, MC10x28.5, L4x4x1/4, HSS6x6x1/4, HSS8.625x0.500, PIPE 6 STD, WT9x25, M10x9\n` +
    `Also available: plate weights, rebar (#3-#18), bolt data (A325/A490), weld data (E70XX)`;
}

// ── Steel Weight Calculator ───────────────────────────────────────────────
export function calculateSteelWeight(designation: string, lengthFt: number): string {
  const d = designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
  
  // Search all categories that have weight data
  const weightCategories = [
    "w_shapes", "s_shapes", "hp_shapes", "c_channels", "mc_channels",
    "l_angles", "hss_rectangular", "hss_square", "hss_round",
    "pipe_shapes", "wt_shapes", "m_shapes"
  ];
  
  for (const category of weightCategories) {
    if (steelProfiles[category] && Array.isArray(steelProfiles[category])) {
      for (const shape of steelProfiles[category]) {
        const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
        if (shapeDesig === d || shapeDesig.replace(/^[A-Z]+/, "") === d.replace(/^[A-Z]+/, "") || d.includes(shapeDesig) || shapeDesig.includes(d)) {
          // Get weight - different field names in different categories
          const weightPerFt = shape.weight_lb_ft || shape.weight;
          if (!weightPerFt) continue;
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
  
  return `Could not find "${designation}" to calculate weight. Try W8x44, C10x30, HSS6x6x1/4, L4x4x1/4, etc.`;
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
      // Use the expanded rebar data from steel profiles if available
      if (steelProfiles.rebar) {
        result += "**Rebar Sizes (ASTM A615/A706):**\n";
        for (const r of steelProfiles.rebar) {
          result += `- ${r.bar_size}: ${r.diameter_in}" dia, ${r.area_in2} in², ${r.weight_plf} lbs/ft\n`;
        }
      } else {
        result += "**Rebar Sizes:**\n";
        for (const r of concrete.rebar_sizes || []) {
          result += `- ${r.size}: ${r.diameter_in}" dia, ${r.weight_lb_ft} lbs/ft, ${r.area_sq_in} in² area\n`;
        }
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
  
  // Steel erection / bolts / welds
  if (t.includes("bolt") || t.includes("weld") || t.includes("steel erection") || t.includes("torque")) {
    let result = "";
    
    if (t.includes("bolt") || t.includes("torque")) {
      // Use expanded bolt data from steel profiles if available
      const boltData = steelProfiles.bolt_data;
      if (boltData) {
        result += "**Structural Bolt Reference (AISC/RCSC):**\n\n";
        result += `Grades: ${boltData.grades.join(", ")}\n`;
        result += `Common Diameters: ${boltData.common_diameters_in.map((d: number) => d + '"').join(", ")}\n\n`;
        result += "**A325 Single Shear Capacity (threads NOT excluded):**\n";
        for (const [size, cap] of Object.entries(boltData.a325_shear_capacity_kips || {})) {
          if (size !== "note") result += `- ${size}" dia: ${cap} kips\n`;
        }
        result += "\n**A490 Single Shear Capacity (threads NOT excluded):**\n";
        for (const [size, cap] of Object.entries(boltData.a490_shear_capacity_kips || {})) {
          if (size !== "note") result += `- ${size}" dia: ${cap} kips\n`;
        }
        result += `\nSource: AISC Steel Construction Manual`;
      } else {
        const steel = constructionRef.steel_erection_reference;
        if (steel) {
          result += "**Bolt Pretension Values (A325, kips):**\n";
          for (const [size, val] of Object.entries(steel.bolt_torque_values || {})) {
            if (size !== "note") result += `- ${size.replace(/_/g, " ")}: ${val} kips\n`;
          }
        }
      }
    } else if (t.includes("weld")) {
      // Use expanded weld data from steel profiles if available
      const weldData = steelProfiles.weld_data;
      if (weldData) {
        result += "**Fillet Weld Reference (AISC 360):**\n\n";
        result += `Electrode: ${weldData.electrode}\n\n`;
        result += "**Fillet Weld Capacity (kips per inch of weld length):**\n";
        for (const [size, cap] of Object.entries(weldData.fillet_weld_capacity_kips_per_in || {})) {
          if (size !== "note") result += `- ${size}" leg: ${cap} kips/in\n`;
        }
        result += "\n**Minimum Fillet Weld Size (AISC Table J2.4):**\n";
        for (const [thickness, minSize] of Object.entries(weldData.minimum_fillet_weld_size || {})) {
          if (thickness !== "note") result += `- Material ${thickness.replace(/_/g, " ")}: ${minSize}" min weld\n`;
        }
        result += `\nSource: AISC 360-22`;
      } else {
        const steel = constructionRef.steel_erection_reference;
        if (steel) {
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
        }
      }
    } else {
      const steel = constructionRef.steel_erection_reference;
      if (steel) {
        result += "**OSHA Steel Erection Requirements:**\n";
        for (const req of steel.osha_steel_erection_requirements || []) {
          result += `- ${req}\n`;
        }
      }
    }
    return result || "Steel erection data not available.";
  }
  
  // Plate weights
  if (t.includes("plate")) {
    const plates = steelProfiles.plate_weights;
    if (plates && plates.thicknesses) {
      let result = "**Steel Plate Weight Reference:**\n";
      result += `${plates.note}\n\n`;
      for (const p of plates.thicknesses) {
        result += `- ${p.gauge} (${p.thickness_in}"): ${p.weight_psf} lb/ft²\n`;
      }
      result += `\nSource: AISC Steel Construction Manual`;
      return result;
    }
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
  
  return `Topic "${topic}" not found in the construction reference. Try: steel profiles, Simpson hardware, lumber, concrete, crane/rigging, safety, framing, welding, bolts, plate weights, rebar, inspections, or a specific Utah jurisdiction.`;
}

// ── Get condensed knowledge summary for system prompt ─────────────────────
export function getKnowledgeSummary(): string {
  return `
## Construction Knowledge Base — BUILT-IN REFERENCE DATA (${totalSteel} steel shapes + reference data)
You have a comprehensive construction knowledge base loaded. You can look up ANY of the following instantly using the construction_lookup tool:

**AISC Steel Profiles (COMPLETE DATABASE — ${totalSteel} shapes):**
- W-shapes: ${steelProfiles.w_shapes?.length || 0} shapes (W4x13 through W44x335) — full section properties
- S-shapes: ${steelProfiles.s_shapes?.length || 0} shapes (American Standard Beams)
- HP-shapes: ${steelProfiles.hp_shapes?.length || 0} shapes (Bearing Piles)
- C-channels: ${steelProfiles.c_channels?.length || 0} shapes (American Standard Channels C3x4.1 through C15x50)
- MC-channels: ${steelProfiles.mc_channels?.length || 0} shapes (Miscellaneous Channels MC3x7.1 through MC18x58)
- L-angles: ${steelProfiles.l_angles?.length || 0} shapes (Equal & Unequal Leg Angles L2x2x1/8 through L8x8x1-1/8)
- HSS rectangular: ${steelProfiles.hss_rectangular?.length || 0} shapes (Hollow Structural Sections)
- HSS square: ${steelProfiles.hss_square?.length || 0} shapes (HSS2x2 through HSS16x16)
- HSS round: ${steelProfiles.hss_round?.length || 0} shapes (HSS1.900 through HSS20.000)
- Pipe: ${steelProfiles.pipe_shapes?.length || 0} shapes (STD, XH, XXH — PIPE 1 through PIPE 12)
- WT-shapes: ${steelProfiles.wt_shapes?.length || 0} shapes (Structural Tees WT2x6.5 through WT22x167.5)
- M-shapes: ${steelProfiles.m_shapes?.length || 0} shapes (Miscellaneous Beams)

**Also includes:** Steel plate weights (1/8" through 4"), rebar (#3-#18), bolt capacities (A325/A490), fillet weld capacities (E70XX), steel deck profiles (B-Deck, N-Deck, Roof Deck).

For each shape: weight/ft, dimensions, area, and section properties (Ix, Iy, Sx, Sy for all HSS and W-shapes).
You can calculate total weight for any member at any length.

**Utah Residential Steel Reference:**
Common sizes for custom homes: garage headers (W8-W12), floor beams (W10-W18), columns (HSS4x4-HSS8x8), moment frames (W10-W14 with HSS columns), ridge beams (W8-W12), lintels (L-angles).
Snow loads by area, seismic design categories, material grades (A992, A500, A36), connection types, Simpson Strong-Tie steel-to-wood connectors.

**Simpson Strong-Tie Hardware (FULL CATALOG):**
Framing angles, face-mount joist hangers, top-flange hangers, post bases, post caps, hurricane ties & straps, holdowns, heavy beam hangers, misc connectors.
For each: allowable loads, fastener requirements, installation notes, common uses.

**Utah Building Codes (ALL JURISDICTIONS):**
Summit County, Park City, Powder Mountain, Morgan County, Layton, Salt Lake City, Coalville.
For each: snow loads, wind speed, seismic category, frost depth, climate zone, special requirements, permit requirements.

**Construction Reference:**
Lumber properties, concrete, crane & rigging safety, steel erection, safety, material weights, fastener schedules.

**IMPORTANT:** When a user asks about ANY of these topics, use the construction_lookup tool to get the exact data. Don't guess from memory — use the tool for precise numbers.
`;
}
