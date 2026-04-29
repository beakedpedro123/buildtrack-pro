/**
 * Construction Productivity Knowledge Base
 * 
 * Real-world production rates sourced from:
 * - RSMeans 2026 data
 * - AWCI Practical Estimating
 * - Reddit r/Construction field reports
 * - Projul Job Costing Guide 2026
 * - CostFlowAI / MySitePlan cost guides
 * - Planning Engineer reference data
 * - Blue Hen Construction timeline data
 * 
 * These are BASELINE rates. The learning engine will override them
 * with actual data from completed jobs over time.
 */

export interface ProductionRate {
  task: string;
  trade: string;
  crewSize: number;
  ratePerDay: number;
  unit: string; // "LF", "SF", "sheets", "squares", "trusses", "tons", "days"
  rateMin: number;
  rateMax: number;
  notes: string;
}

export interface PhaseTemplate {
  name: string;
  trade: string;
  orderIndex: number;
  /** Typical duration in days for a standard residential project */
  typicalDaysMin: number;
  typicalDaysMax: number;
  /** Scaling factor: multiply by (sqft / 2000) for larger projects */
  sqftScaleFactor: number;
  /** Dependencies — phases that must complete before this one starts */
  dependsOn: string[];
  /** Cost as percentage of total project budget (typical residential) */
  budgetPercentMin: number;
  budgetPercentMax: number;
  description: string;
}

// ─── Production Rates by Trade ─────────────────────────────────────────────

export const PRODUCTION_RATES: ProductionRate[] = [
  // === FRAMING ===
  { task: "Wall framing (exterior)", trade: "framing", crewSize: 2, ratePerDay: 180, unit: "LF", rateMin: 100, rateMax: 200, notes: "180 LF is solid for experienced pair" },
  { task: "Wall framing (interior)", trade: "framing", crewSize: 2, ratePerDay: 200, unit: "LF", rateMin: 150, rateMax: 250, notes: "Simpler, fewer headers" },
  { task: "Addition walls (single story)", trade: "framing", crewSize: 3, ratePerDay: 1, unit: "days", rateMin: 3, rateMax: 4, notes: "3-4 days total: layout, plates, studs, headers, sheathing" },
  { task: "Floor system (joists)", trade: "framing", crewSize: 3, ratePerDay: 3000, unit: "SF", rateMin: 2500, rateMax: 3500, notes: "With equipment and pre-planning" },
  { task: "Roof trusses (set)", trade: "framing", crewSize: 4, ratePerDay: 25, unit: "trusses", rateMin: 20, rateMax: 30, notes: "Crane-assisted" },
  { task: "Roof sheathing", trade: "framing", crewSize: 2, ratePerDay: 2000, unit: "SF", rateMin: 1500, rateMax: 2500, notes: "Depends on pitch" },
  { task: "Small house complete (1300-2200 SF)", trade: "framing", crewSize: 2, ratePerDay: 1, unit: "days", rateMin: 11, rateMax: 14, notes: "Start to finish, cookie cutter" },
  { task: "Small house complete (1300-2200 SF)", trade: "framing", crewSize: 4, ratePerDay: 1, unit: "days", rateMin: 9, rateMax: 12, notes: "Start to finish, 3-4 man crew" },
  { task: "Large house (5000 SF, 3-story)", trade: "framing", crewSize: 4, ratePerDay: 1, unit: "days", rateMin: 25, rateMax: 35, notes: "Quality needs oversight" },

  // === ROOFING ===
  { task: "Asphalt shingles (tear-off + install)", trade: "roofing", crewSize: 4, ratePerDay: 20, unit: "squares", rateMin: 15, rateMax: 25, notes: "Walkable pitch" },
  { task: "Asphalt shingles (new construction)", trade: "roofing", crewSize: 4, ratePerDay: 30, unit: "squares", rateMin: 25, rateMax: 35, notes: "No tear-off" },
  { task: "Metal roofing", trade: "roofing", crewSize: 4, ratePerDay: 8, unit: "squares", rateMin: 5, rateMax: 12, notes: "More complex" },
  { task: "Tile roofing", trade: "roofing", crewSize: 4, ratePerDay: 8, unit: "squares", rateMin: 5, rateMax: 12, notes: "Heavy, slow" },
  { task: "TPO commercial", trade: "roofing", crewSize: 5, ratePerDay: 70, unit: "squares", rateMin: 60, rateMax: 80, notes: "Flat roof" },

  // === DRYWALL ===
  { task: "Hanging (standard)", trade: "drywall", crewSize: 2, ratePerDay: 40, unit: "sheets", rateMin: 30, rateMax: 50, notes: "4x12 sheets, standard layout" },
  { task: "Hanging (per SF)", trade: "drywall", crewSize: 2, ratePerDay: 1400, unit: "SF", rateMin: 1200, rateMax: 1600, notes: "Standard residential" },
  { task: "Taping/mudding (first coat)", trade: "drywall", crewSize: 1, ratePerDay: 650, unit: "SF", rateMin: 500, rateMax: 800, notes: "First coat" },
  { task: "Finishing (3 coats + sand)", trade: "drywall", crewSize: 1, ratePerDay: 400, unit: "SF", rateMin: 300, rateMax: 500, notes: "Including sanding" },

  // === CONCRETE ===
  { task: "Foundation walls (forms)", trade: "concrete", crewSize: 4, ratePerDay: 300, unit: "SF", rateMin: 200, rateMax: 400, notes: "Form, pour, strip" },
  { task: "Slab on grade", trade: "concrete", crewSize: 4, ratePerDay: 1500, unit: "SF", rateMin: 1000, rateMax: 2000, notes: "Prep, pour, finish" },
  { task: "Footings", trade: "concrete", crewSize: 4, ratePerDay: 150, unit: "LF", rateMin: 100, rateMax: 200, notes: "Dig, form, pour" },
  { task: "Flatwork/sidewalks", trade: "concrete", crewSize: 3, ratePerDay: 750, unit: "SF", rateMin: 500, rateMax: 1000, notes: "Pour and finish" },

  // === STEEL ERECTION ===
  { task: "Structural steel (light)", trade: "steel", crewSize: 4, ratePerDay: 3.5, unit: "tons", rateMin: 2, rateMax: 5, notes: "With crane" },
  { task: "Steel stud framing", trade: "steel", crewSize: 2, ratePerDay: 115, unit: "LF", rateMin: 80, rateMax: 150, notes: "Commercial gauge" },
  { task: "Metal decking", trade: "steel", crewSize: 4, ratePerDay: 3000, unit: "SF", rateMin: 2000, rateMax: 4000, notes: "With crane" },

  // === INSULATION ===
  { task: "Batt insulation", trade: "insulation", crewSize: 2, ratePerDay: 2000, unit: "SF", rateMin: 1500, rateMax: 2500, notes: "Standard walls" },
  { task: "Spray foam insulation", trade: "insulation", crewSize: 2, ratePerDay: 2500, unit: "SF", rateMin: 2000, rateMax: 3000, notes: "With equipment" },

  // === SIDING ===
  { task: "Vinyl/LP siding", trade: "siding", crewSize: 2, ratePerDay: 600, unit: "SF", rateMin: 400, rateMax: 800, notes: "Standard residential" },

  // === PAINTING ===
  { task: "Interior painting", trade: "painting", crewSize: 1, ratePerDay: 500, unit: "SF", rateMin: 400, rateMax: 600, notes: "Walls, 2 coats" },
  { task: "Exterior painting", trade: "painting", crewSize: 2, ratePerDay: 750, unit: "SF", rateMin: 500, rateMax: 1000, notes: "Spray + back-brush" },

  // === MEP ===
  { task: "Electrical rough-in (residential)", trade: "electrical", crewSize: 2, ratePerDay: 1, unit: "house/week", rateMin: 5, rateMax: 7, notes: "Standard residential, days" },
  { task: "Plumbing rough-in (residential)", trade: "plumbing", crewSize: 2, ratePerDay: 1, unit: "house/week", rateMin: 5, rateMax: 7, notes: "Standard residential, days" },
  { task: "HVAC rough-in (residential)", trade: "hvac", crewSize: 2, ratePerDay: 1, unit: "days", rateMin: 3, rateMax: 5, notes: "Standard residential" },
];

// ─── Phase Templates for Residential Construction ──────────────────────────

export const RESIDENTIAL_PHASES: PhaseTemplate[] = [
  {
    name: "Pre-Construction / Permits",
    trade: "general",
    orderIndex: 0,
    typicalDaysMin: 5,
    typicalDaysMax: 15,
    sqftScaleFactor: 0.1,
    dependsOn: [],
    budgetPercentMin: 2,
    budgetPercentMax: 5,
    description: "Plans review, permits, material ordering, crew scheduling",
  },
  {
    name: "Site Work / Excavation",
    trade: "general",
    orderIndex: 1,
    typicalDaysMin: 3,
    typicalDaysMax: 7,
    sqftScaleFactor: 0.3,
    dependsOn: ["Pre-Construction / Permits"],
    budgetPercentMin: 3,
    budgetPercentMax: 8,
    description: "Grading, trenching, utilities, site prep",
  },
  {
    name: "Foundation",
    trade: "concrete",
    orderIndex: 2,
    typicalDaysMin: 5,
    typicalDaysMax: 14,
    sqftScaleFactor: 0.5,
    dependsOn: ["Site Work / Excavation"],
    budgetPercentMin: 8,
    budgetPercentMax: 15,
    description: "Footings, foundation walls, slab, waterproofing",
  },
  {
    name: "Framing",
    trade: "framing",
    orderIndex: 3,
    typicalDaysMin: 10,
    typicalDaysMax: 25,
    sqftScaleFactor: 1.0,
    dependsOn: ["Foundation"],
    budgetPercentMin: 12,
    budgetPercentMax: 20,
    description: "Floor system, walls, roof structure, sheathing",
  },
  {
    name: "Roofing",
    trade: "roofing",
    orderIndex: 4,
    typicalDaysMin: 3,
    typicalDaysMax: 7,
    sqftScaleFactor: 0.3,
    dependsOn: ["Framing"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Underlayment, shingles/metal, flashing, gutters",
  },
  {
    name: "Windows & Doors",
    trade: "framing",
    orderIndex: 5,
    typicalDaysMin: 2,
    typicalDaysMax: 5,
    sqftScaleFactor: 0.2,
    dependsOn: ["Framing"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Window installation, exterior doors, weather sealing",
  },
  {
    name: "MEP Rough-In",
    trade: "general",
    orderIndex: 6,
    typicalDaysMin: 10,
    typicalDaysMax: 20,
    sqftScaleFactor: 0.7,
    dependsOn: ["Framing"],
    budgetPercentMin: 15,
    budgetPercentMax: 25,
    description: "Plumbing, electrical, HVAC rough-in + inspections",
  },
  {
    name: "Insulation",
    trade: "insulation",
    orderIndex: 7,
    typicalDaysMin: 2,
    typicalDaysMax: 5,
    sqftScaleFactor: 0.3,
    dependsOn: ["MEP Rough-In"],
    budgetPercentMin: 2,
    budgetPercentMax: 5,
    description: "Wall, ceiling, floor insulation + inspection",
  },
  {
    name: "Drywall",
    trade: "drywall",
    orderIndex: 8,
    typicalDaysMin: 7,
    typicalDaysMax: 15,
    sqftScaleFactor: 0.7,
    dependsOn: ["Insulation"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Hang, tape, mud, sand, finish",
  },
  {
    name: "Interior Finishes",
    trade: "general",
    orderIndex: 9,
    typicalDaysMin: 15,
    typicalDaysMax: 40,
    sqftScaleFactor: 1.0,
    dependsOn: ["Drywall"],
    budgetPercentMin: 15,
    budgetPercentMax: 25,
    description: "Paint, flooring, cabinets, countertops, trim, fixtures",
  },
  {
    name: "Exterior Finishes",
    trade: "siding",
    orderIndex: 10,
    typicalDaysMin: 7,
    typicalDaysMax: 15,
    sqftScaleFactor: 0.5,
    dependsOn: ["Roofing"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Siding, stucco, stone, paint, soffit, fascia",
  },
  {
    name: "Final / Punch List",
    trade: "general",
    orderIndex: 11,
    typicalDaysMin: 5,
    typicalDaysMax: 15,
    sqftScaleFactor: 0.3,
    dependsOn: ["Interior Finishes", "Exterior Finishes"],
    budgetPercentMin: 2,
    budgetPercentMax: 5,
    description: "Final inspections, punch list, CO, cleanup, handoff",
  },
];

// ─── Addition / Remodel Phase Templates ────────────────────────────────────

export const ADDITION_PHASES: PhaseTemplate[] = [
  {
    name: "Demo / Prep",
    trade: "general",
    orderIndex: 0,
    typicalDaysMin: 1,
    typicalDaysMax: 5,
    sqftScaleFactor: 0.3,
    dependsOn: [],
    budgetPercentMin: 3,
    budgetPercentMax: 8,
    description: "Demolition, protection of existing structure, temp weather barrier",
  },
  {
    name: "Foundation / Footings",
    trade: "concrete",
    orderIndex: 1,
    typicalDaysMin: 3,
    typicalDaysMax: 7,
    sqftScaleFactor: 0.5,
    dependsOn: ["Demo / Prep"],
    budgetPercentMin: 8,
    budgetPercentMax: 15,
    description: "New footings, foundation tie-in to existing",
  },
  {
    name: "Framing",
    trade: "framing",
    orderIndex: 2,
    typicalDaysMin: 3,
    typicalDaysMax: 10,
    sqftScaleFactor: 1.0,
    dependsOn: ["Foundation / Footings"],
    budgetPercentMin: 15,
    budgetPercentMax: 25,
    description: "Walls, headers, tie-in to existing roof, new roof structure",
  },
  {
    name: "Roofing / Weatherproofing",
    trade: "roofing",
    orderIndex: 3,
    typicalDaysMin: 2,
    typicalDaysMax: 5,
    sqftScaleFactor: 0.3,
    dependsOn: ["Framing"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Roof tie-in, shingles, flashing, waterproofing",
  },
  {
    name: "MEP Rough-In",
    trade: "general",
    orderIndex: 4,
    typicalDaysMin: 5,
    typicalDaysMax: 10,
    sqftScaleFactor: 0.5,
    dependsOn: ["Framing"],
    budgetPercentMin: 12,
    budgetPercentMax: 20,
    description: "Extend plumbing, electrical, HVAC to new space",
  },
  {
    name: "Insulation + Drywall",
    trade: "drywall",
    orderIndex: 5,
    typicalDaysMin: 5,
    typicalDaysMax: 10,
    sqftScaleFactor: 0.5,
    dependsOn: ["MEP Rough-In"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Insulate, hang, tape, finish drywall",
  },
  {
    name: "Finishes",
    trade: "general",
    orderIndex: 6,
    typicalDaysMin: 7,
    typicalDaysMax: 20,
    sqftScaleFactor: 0.7,
    dependsOn: ["Insulation + Drywall"],
    budgetPercentMin: 20,
    budgetPercentMax: 30,
    description: "Paint, flooring, trim, fixtures, cabinets, tie-in to existing",
  },
  {
    name: "Punch List / Final",
    trade: "general",
    orderIndex: 7,
    typicalDaysMin: 2,
    typicalDaysMax: 5,
    sqftScaleFactor: 0.2,
    dependsOn: ["Finishes"],
    budgetPercentMin: 2,
    budgetPercentMax: 5,
    description: "Final inspections, punch list, cleanup",
  },
];

// ─── Commercial / Steel Phase Templates ────────────────────────────────────

export const COMMERCIAL_PHASES: PhaseTemplate[] = [
  {
    name: "Pre-Construction",
    trade: "general",
    orderIndex: 0,
    typicalDaysMin: 10,
    typicalDaysMax: 30,
    sqftScaleFactor: 0.2,
    dependsOn: [],
    budgetPercentMin: 3,
    budgetPercentMax: 5,
    description: "Plans, permits, submittals, procurement",
  },
  {
    name: "Site Work",
    trade: "general",
    orderIndex: 1,
    typicalDaysMin: 5,
    typicalDaysMax: 15,
    sqftScaleFactor: 0.3,
    dependsOn: ["Pre-Construction"],
    budgetPercentMin: 5,
    budgetPercentMax: 10,
    description: "Grading, utilities, site prep",
  },
  {
    name: "Foundation",
    trade: "concrete",
    orderIndex: 2,
    typicalDaysMin: 10,
    typicalDaysMax: 25,
    sqftScaleFactor: 0.5,
    dependsOn: ["Site Work"],
    budgetPercentMin: 10,
    budgetPercentMax: 15,
    description: "Footings, piers, grade beams, slab",
  },
  {
    name: "Steel Erection",
    trade: "steel",
    orderIndex: 3,
    typicalDaysMin: 10,
    typicalDaysMax: 30,
    sqftScaleFactor: 1.0,
    dependsOn: ["Foundation"],
    budgetPercentMin: 15,
    budgetPercentMax: 25,
    description: "Columns, beams, joists, decking, connections",
  },
  {
    name: "Envelope / Roofing",
    trade: "roofing",
    orderIndex: 4,
    typicalDaysMin: 10,
    typicalDaysMax: 20,
    sqftScaleFactor: 0.5,
    dependsOn: ["Steel Erection"],
    budgetPercentMin: 8,
    budgetPercentMax: 15,
    description: "Metal panels, TPO/EPDM roof, curtain wall, storefront",
  },
  {
    name: "MEP Rough-In",
    trade: "general",
    orderIndex: 5,
    typicalDaysMin: 15,
    typicalDaysMax: 40,
    sqftScaleFactor: 0.8,
    dependsOn: ["Steel Erection"],
    budgetPercentMin: 20,
    budgetPercentMax: 30,
    description: "Plumbing, electrical, HVAC, fire protection",
  },
  {
    name: "Interior Build-Out",
    trade: "general",
    orderIndex: 6,
    typicalDaysMin: 20,
    typicalDaysMax: 50,
    sqftScaleFactor: 1.0,
    dependsOn: ["Envelope / Roofing", "MEP Rough-In"],
    budgetPercentMin: 15,
    budgetPercentMax: 25,
    description: "Framing, drywall, flooring, ceilings, finishes",
  },
  {
    name: "Final / Commissioning",
    trade: "general",
    orderIndex: 7,
    typicalDaysMin: 5,
    typicalDaysMax: 15,
    sqftScaleFactor: 0.3,
    dependsOn: ["Interior Build-Out"],
    budgetPercentMin: 2,
    budgetPercentMax: 5,
    description: "Final inspections, commissioning, punch list, CO",
  },
];

// ─── Helper: Get phases for a project type ─────────────────────────────────

export type ProjectType = "new_home" | "addition" | "remodel" | "commercial" | "steel_building" | "custom";

export function getPhasesForProjectType(type: ProjectType): PhaseTemplate[] {
  switch (type) {
    case "new_home":
      return RESIDENTIAL_PHASES;
    case "addition":
    case "remodel":
      return ADDITION_PHASES;
    case "commercial":
    case "steel_building":
      return COMMERCIAL_PHASES;
    case "custom":
      return RESIDENTIAL_PHASES; // Default, Pivot will customize
    default:
      return RESIDENTIAL_PHASES;
  }
}

// ─── Helper: Estimate duration for a phase based on sqft ───────────────────

export function estimatePhaseDuration(
  phase: PhaseTemplate,
  totalSqft: number,
  baseSqft: number = 2000,
): { minDays: number; maxDays: number; expectedDays: number } {
  const scale = Math.max(0.5, totalSqft / baseSqft);
  const scaledMin = Math.ceil(phase.typicalDaysMin * Math.pow(scale, phase.sqftScaleFactor));
  const scaledMax = Math.ceil(phase.typicalDaysMax * Math.pow(scale, phase.sqftScaleFactor));
  const expected = Math.ceil((scaledMin + scaledMax) / 2);
  return { minDays: scaledMin, maxDays: scaledMax, expectedDays: expected };
}

// ─── Helper: Generate full schedule from phases ────────────────────────────

export interface ScheduleEntry {
  phase: string;
  trade: string;
  startDay: number;
  endDay: number;
  durationDays: number;
  budgetAmount: number;
  budgetPercent: number;
  description: string;
}

export function generateSchedule(
  phases: PhaseTemplate[],
  totalSqft: number,
  totalBudget: number,
): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const phaseEndDays: Record<string, number> = {};

  for (const phase of phases) {
    const { expectedDays } = estimatePhaseDuration(phase, totalSqft);
    
    // Calculate start day based on dependencies
    let startDay = 1;
    for (const dep of phase.dependsOn) {
      if (phaseEndDays[dep]) {
        startDay = Math.max(startDay, phaseEndDays[dep] + 1);
      }
    }

    const endDay = startDay + expectedDays - 1;
    phaseEndDays[phase.name] = endDay;

    const budgetPercent = (phase.budgetPercentMin + phase.budgetPercentMax) / 2;
    const budgetAmount = Math.round(totalBudget * budgetPercent / 100);

    schedule.push({
      phase: phase.name,
      trade: phase.trade,
      startDay,
      endDay,
      durationDays: expectedDays,
      budgetAmount,
      budgetPercent,
      description: phase.description,
    });
  }

  return schedule;
}

// ─── Helper: Lookup production rate for a specific task ─────────────────────

export function lookupProductionRate(
  taskQuery: string,
  tradeFilter?: string,
): ProductionRate[] {
  const query = taskQuery.toLowerCase();
  return PRODUCTION_RATES.filter((r) => {
    const matchesTrade = !tradeFilter || r.trade === tradeFilter.toLowerCase();
    const matchesTask = r.task.toLowerCase().includes(query) || query.includes(r.trade);
    return matchesTrade && matchesTask;
  });
}

// ─── Pivot System Prompt Injection for Job Creation ────────────────────────

export function getProductivityKnowledgePrompt(): string {
  return `
## CONSTRUCTION PRODUCTIVITY KNOWLEDGE (Real-World Data)

You have access to verified production rates from RSMeans 2026, AWCI, and field reports.
ALWAYS use these rates instead of guessing. If you don't have data for a specific task, say so.

### Key Production Rates (Residential):
- Wall framing (exterior): 2-man crew = 100-200 LF/day (180 avg)
- Wall framing (interior): 2-man crew = 150-250 LF/day (200 avg)
- Addition walls (single story): 2-3 man crew = 3-4 days total (NOT 10 days!)
- Floor system: 3-man crew = 2500-3500 SF/day
- Roof trusses: 4-man crew = 20-30 trusses/day (crane-assisted)
- Roof sheathing: 2-man crew = 1500-2500 SF/day
- Small house framing (1300-2200 SF): 2-man = 11-14 days, 4-man = 9-12 days
- Large house (5000 SF, 3-story): 4-man = 25-35 days

### Key Production Rates (Other Trades):
- Drywall hanging: 2-man = 1200-1600 SF/day
- Concrete slab: 4-man = 1000-2000 SF/day
- Steel erection (light): 4-man = 2-5 tons/day
- Asphalt shingles: 4-man = 15-25 squares/day (tear-off+install)

### Critical Estimating Rules:
1. 6 actual work hours per day (out of 8-10 hour day) is realistic
2. Add 10-15% for weather delays in Northern Utah
3. Add 5-10% for complex layouts (lots of corners, angles, dormers)
4. Material staging and tool organization are the biggest efficiency gains
5. "Slow is fast" — fastest workers make the most mistakes
6. Track labor hours DAILY, not weekly — asking crew on Friday what they did Tuesday = bad data

### Job Costing Rules:
- Labor is 40-60% of total project cost
- Burdened rate = base wage × 1.25-1.40 (adds payroll taxes, workers comp, benefits)
- Overhead allocation: Annual overhead / Annual direct costs = overhead rate %
- Typical overhead rate: 15-20% of direct costs
- "Contractors who skip overhead allocation think they are making 20% margins when they are really making 5%"

### Job Creation Flow:
When the owner asks you to create a job, follow this conversational flow:
1. Ask: What type of project? (new home, addition, remodel, commercial, steel building)
2. Ask: What's the approximate square footage?
3. Ask: What's the total budget? (or ask them to estimate)
4. Ask: How many crew members will be on this job?
5. Ask: Any special conditions? (multi-story, complex roof, tight access, etc.)
6. Generate the budget + schedule using the create_job_with_budget tool
7. Show them the breakdown and ask if they want to adjust anything
8. Push the final job to the Jobs tab

IMPORTANT: When estimating durations, ALWAYS use the production rates above.
For an addition's walls, it's 3-4 days with a 2-3 man crew, NOT 10 days.
`;
}
