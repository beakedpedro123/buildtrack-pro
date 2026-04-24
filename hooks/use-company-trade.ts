import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "@buildtrack_company_trade";

export const TRADE_OPTIONS = [
  { key: "framing", label: "Framing", description: "Residential & commercial framing" },
  { key: "steel_erection", label: "Steel Erection", description: "Structural steel installation" },
  { key: "concrete", label: "Concrete", description: "Foundations, flatwork, tilt-up" },
  { key: "roofing", label: "Roofing", description: "Roof installation & repair" },
  { key: "electrical", label: "Electrical", description: "Electrical systems & wiring" },
  { key: "plumbing", label: "Plumbing", description: "Plumbing & piping systems" },
  { key: "hvac", label: "HVAC", description: "Heating, ventilation & AC" },
  { key: "drywall", label: "Drywall", description: "Drywall hanging, taping & finishing" },
  { key: "painting", label: "Painting", description: "Interior & exterior painting" },
  { key: "flooring", label: "Flooring", description: "Tile, hardwood, carpet installation" },
  { key: "siding", label: "Siding & Exterior", description: "Siding, stucco, exterior finish" },
  { key: "masonry", label: "Masonry", description: "Brick, block, stone work" },
  { key: "general_contractor", label: "General Contractor", description: "Full project management (all trades)" },
] as const;

export type TradeKey = (typeof TRADE_OPTIONS)[number]["key"];

export function useCompanyTrade() {
  const [trade, setTrade] = useState<TradeKey>("framing");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) setTrade(val as TradeKey);
      setLoaded(true);
    });
  }, []);

  const updateTrade = useCallback(async (newTrade: TradeKey) => {
    setTrade(newTrade);
    await AsyncStorage.setItem(STORAGE_KEY, newTrade);
  }, []);

  return { trade, updateTrade, loaded };
}

/**
 * Get trade-specific schedule phases.
 * Only returns phases relevant to the selected trade.
 * General contractors get all phases.
 */
export function getTradeSchedulePhases(trade: TradeKey): Array<{
  name: string;
  tasks: string[];
  days: number;
}> {
  // Core phases every trade needs
  const sitePrep = { name: "Site Prep", tasks: ["Clear & grade lot", "Set up temp utilities", "Survey & stake"], days: 5 };
  const punchList = { name: "Punch List", tasks: ["Walk-through inspection", "Deficiency corrections", "Final clean"], days: 5 };
  const finalInspection = { name: "Final Inspection", tasks: ["Building dept inspection", "Certificate of occupancy", "Client walk-through"], days: 3 };

  const tradePhases: Record<string, Array<{ name: string; tasks: string[]; days: number }>> = {
    framing: [
      sitePrep,
      { name: "Layout & Prep", tasks: ["Review plans & takeoffs", "Material delivery & staging", "Snap chalk lines & layout"], days: 3 },
      { name: "Sill Plates & Floor System", tasks: ["Set sill plates & anchor bolts", "Install floor joists & hangers", "Subfloor sheathing (glue & nail)"], days: 5 },
      { name: "Wall Framing – 1st Floor", tasks: ["Build & raise exterior walls", "Build & raise interior walls", "Plumb, line & brace walls", "Install headers & cripples"], days: 7 },
      { name: "Wall Framing – 2nd Floor", tasks: ["2nd floor joists & sheathing", "Build & raise 2nd floor walls", "Plumb, line & brace 2nd floor"], days: 7 },
      { name: "Roof System", tasks: ["Set roof trusses / rafters", "Install ridge beam (if applicable)", "Fascia & subfascia", "Roof sheathing"], days: 7 },
      { name: "Sheathing & Wrap", tasks: ["Wall sheathing (OSB/plywood)", "House wrap / WRB installation", "Window & door bucks"], days: 5 },
      { name: "Stairs & Blocking", tasks: ["Frame stairs & landings", "Install backing & blocking", "Fire blocking per code"], days: 4 },
      { name: "Exterior Trim", tasks: ["Finished fascia & soffit", "Exterior window/door trim", "Porch / deck framing"], days: 5 },
      punchList,
      finalInspection,
    ],
    steel_erection: [
      sitePrep,
      { name: "Pre-Erection", tasks: ["Review steel drawings & RFIs", "Verify anchor bolt layout", "Stage & sort steel members", "Crane mobilization"], days: 5 },
      { name: "Column Erection", tasks: ["Set base plates & grout", "Erect columns – grid lines", "Plumb & brace columns", "Torque anchor bolts"], days: 7 },
      { name: "Beam & Girder Installation", tasks: ["Fly beams to elevation", "Bolt beam connections", "Install moment connections", "Weld critical joints"], days: 10 },
      { name: "Joist & Decking", tasks: ["Set bar joists / open web joists", "Install bridging & bracing", "Lay metal decking", "Weld deck to joists"], days: 7 },
      { name: "Miscellaneous Steel", tasks: ["Stair stringers & platforms", "Handrails & guardrails", "Embed plates & angles", "Lintels & shelf angles"], days: 5 },
      { name: "Quality & Inspection", tasks: ["Bolt inspection (tension)", "Weld inspection (UT/MT)", "Plumb & alignment survey", "Touch-up paint"], days: 4 },
      punchList,
      finalInspection,
    ],
    concrete: [
      sitePrep,
      { name: "Excavation", tasks: ["Excavate footings", "Grade & compact subgrade", "Install gravel base"], days: 5 },
      { name: "Formwork", tasks: ["Set footing forms", "Set wall forms", "Install rebar & mesh", "Set anchor bolts & embeds"], days: 7 },
      { name: "Concrete Placement", tasks: ["Pour footings", "Pour foundation walls", "Pour slab on grade", "Finish & cure concrete"], days: 10 },
      { name: "Flatwork", tasks: ["Form sidewalks & patios", "Pour & finish flatwork", "Saw cut control joints", "Apply sealer"], days: 5 },
      punchList,
      finalInspection,
    ],
    roofing: [
      sitePrep,
      { name: "Tear-Off & Prep", tasks: ["Remove existing roofing", "Inspect & repair decking", "Install ice & water shield"], days: 5 },
      { name: "Underlayment", tasks: ["Install synthetic underlayment", "Flash valleys & penetrations", "Install drip edge"], days: 3 },
      { name: "Roofing Installation", tasks: ["Install starter course", "Lay field shingles / panels", "Hip & ridge caps", "Install vents & boots"], days: 10 },
      { name: "Flashing & Details", tasks: ["Step flashing at walls", "Counter flashing", "Chimney & skylight flashing", "Gutter installation"], days: 5 },
      punchList,
      finalInspection,
    ],
    electrical: [
      sitePrep,
      { name: "Rough-In", tasks: ["Set panel location", "Run wire & conduit", "Install boxes & brackets", "Low voltage rough-in"], days: 10 },
      { name: "Service & Panel", tasks: ["Install meter base", "Set main panel", "Wire breakers", "Ground & bond system"], days: 5 },
      { name: "Trim & Finish", tasks: ["Install devices & covers", "Hang fixtures & fans", "Connect appliances", "Label panel schedule"], days: 7 },
      punchList,
      finalInspection,
    ],
    plumbing: [
      sitePrep,
      { name: "Underground", tasks: ["Trench & lay sewer line", "Install water service", "Stub up drains & vents"], days: 7 },
      { name: "Rough-In", tasks: ["DWV rough-in", "Water supply rough-in", "Gas line rough-in", "Test & pressure check"], days: 10 },
      { name: "Trim & Fixtures", tasks: ["Set fixtures (sinks, toilets)", "Connect water heater", "Install faucets & valves", "Final leak test"], days: 7 },
      punchList,
      finalInspection,
    ],
    hvac: [
      sitePrep,
      { name: "Rough-In", tasks: ["Install ductwork", "Set equipment pads", "Run refrigerant lines", "Install vents & registers"], days: 10 },
      { name: "Equipment", tasks: ["Set furnace / air handler", "Set condenser unit", "Connect gas & electrical", "Install thermostat"], days: 5 },
      { name: "Commissioning", tasks: ["Charge refrigerant", "Balance airflow", "Test heating & cooling", "Program controls"], days: 3 },
      punchList,
      finalInspection,
    ],
    drywall: [
      sitePrep,
      { name: "Hanging", tasks: ["Hang ceilings", "Hang walls", "Cut around outlets & windows", "Install corner bead"], days: 7 },
      { name: "Taping & Finishing", tasks: ["First coat (tape & mud)", "Second coat (fill)", "Third coat (skim)", "Sand smooth"], days: 10 },
      { name: "Touch-Up", tasks: ["Prime coat", "Inspect for imperfections", "Final sand & patch"], days: 3 },
      punchList,
      finalInspection,
    ],
    painting: [
      sitePrep,
      { name: "Prep", tasks: ["Mask & protect surfaces", "Caulk gaps & cracks", "Sand & prime bare wood", "Spot prime stains"], days: 5 },
      { name: "Interior Paint", tasks: ["Ceiling paint – 2 coats", "Wall paint – 2 coats", "Trim paint", "Touch-up & detail"], days: 10 },
      { name: "Exterior Paint", tasks: ["Power wash & prep", "Exterior primer", "Exterior paint – 2 coats", "Stain decks & fences"], days: 7 },
      punchList,
      finalInspection,
    ],
    flooring: [
      sitePrep,
      { name: "Subfloor Prep", tasks: ["Level & patch subfloor", "Install underlayment", "Acclimate materials"], days: 3 },
      { name: "Tile", tasks: ["Layout & snap lines", "Set tile with thinset", "Grout & seal"], days: 7 },
      { name: "Hardwood", tasks: ["Install hardwood planks", "Sand & finish", "Apply polyurethane"], days: 7 },
      { name: "Carpet & Vinyl", tasks: ["Install carpet pad & carpet", "Install vinyl / LVP", "Trim & transition strips"], days: 5 },
      punchList,
      finalInspection,
    ],
    siding: [
      sitePrep,
      { name: "Prep & Wrap", tasks: ["Install house wrap / WRB", "Flash windows & doors", "Install furring strips"], days: 5 },
      { name: "Siding Installation", tasks: ["Install starter strip", "Hang siding panels", "Cut around windows & doors", "Install J-channel & trim"], days: 10 },
      { name: "Finish", tasks: ["Caulk joints & gaps", "Install soffit & fascia", "Touch-up paint / stain"], days: 5 },
      punchList,
      finalInspection,
    ],
    masonry: [
      sitePrep,
      { name: "Foundation", tasks: ["Pour footings for masonry", "Lay first course", "Install rebar & grout cells"], days: 7 },
      { name: "Wall Construction", tasks: ["Lay block / brick courses", "Install lintels & bond beams", "Grout & reinforce", "Install ties & anchors"], days: 14 },
      { name: "Finish", tasks: ["Point & tool joints", "Clean masonry", "Apply sealer / waterproofing"], days: 5 },
      punchList,
      finalInspection,
    ],
    general_contractor: [
      sitePrep,
      { name: "Foundation", tasks: ["Excavate footings", "Form & pour footings", "Foundation walls", "Waterproofing", "Backfill"], days: 14 },
      { name: "Framing", tasks: ["Sill plates & floor joists", "Subfloor sheathing", "Wall framing", "Roof trusses", "Roof sheathing"], days: 21 },
      { name: "Roofing", tasks: ["Underlayment & flashing", "Shingle installation", "Ridge vents & caps"], days: 7 },
      { name: "Plumbing Rough-In", tasks: ["DWV rough", "Water supply rough", "Gas line rough"], days: 7 },
      { name: "Electrical Rough-In", tasks: ["Panel installation", "Wire runs & boxes", "Low voltage rough"], days: 7 },
      { name: "HVAC", tasks: ["Ductwork installation", "Unit placement", "Vent terminations"], days: 5 },
      { name: "Insulation", tasks: ["Exterior wall insulation", "Attic insulation", "Vapor barrier"], days: 5 },
      { name: "Drywall", tasks: ["Hang drywall", "Tape & mud", "Sand & prime"], days: 10 },
      { name: "Interior Trim", tasks: ["Door casings & baseboards", "Crown molding", "Stair railings"], days: 7 },
      { name: "Painting", tasks: ["Interior primer", "Interior paint – 2 coats", "Touch-up & detail"], days: 7 },
      { name: "Flooring", tasks: ["Tile installation", "Hardwood installation", "Carpet installation"], days: 7 },
      { name: "Final Mechanical", tasks: ["Plumbing fixtures", "Electrical fixtures", "HVAC commissioning"], days: 5 },
      { name: "Exterior Finish", tasks: ["Siding installation", "Exterior paint/stain", "Gutters & downspouts"], days: 10 },
      punchList,
      finalInspection,
    ],
  };

  return tradePhases[trade] || tradePhases.general_contractor;
}

/**
 * Get the trade-specific prompt context for Pivot schedule generation.
 */
export function getTradePromptContext(trade: TradeKey): string {
  const tradeLabel = TRADE_OPTIONS.find((t) => t.key === trade)?.label || trade;
  
  const tradeInstructions: Record<string, string> = {
    framing: `This is a FRAMING company. Generate schedule phases ONLY for framing work:
- Site Prep, Layout, Sill Plates & Floor System, Wall Framing (1st & 2nd floor), Roof System, Sheathing & Wrap, Stairs & Blocking, Exterior Trim, Punch List, Final Inspection.
- Do NOT include plumbing, electrical, HVAC, drywall, painting, flooring, or any other trade's work.
- Focus on lumber, sheathing, trusses, headers, blocking, and structural framing tasks.`,
    steel_erection: `This is a STEEL ERECTION company. Generate schedule phases ONLY for steel work:
- Pre-Erection, Column Erection, Beam & Girder Installation, Joist & Decking, Miscellaneous Steel, Quality & Inspection.
- Do NOT include concrete, framing, roofing, or other trades.`,
    general_contractor: `This is a GENERAL CONTRACTOR. Generate a complete construction schedule covering ALL trades and phases from site prep through final inspection.`,
  };

  return tradeInstructions[trade] || `This is a ${tradeLabel.toUpperCase()} company. Generate schedule phases ONLY for ${tradeLabel.toLowerCase()} work. Do NOT include other trades' work.`;
}
