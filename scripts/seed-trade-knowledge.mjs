import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const knowledge = [
  // FRAMING
  { tradeSlug: 'framing', category: 'common_tasks', title: 'Standard Framing Tasks', content: 'Wall framing (interior/exterior), floor joist installation, roof truss/rafter setting, header installation, blocking, sheathing, hold-down and strap installation, beam setting, stair framing, soffit framing' },
  { tradeSlug: 'framing', category: 'scheduling', title: 'Framing Schedule Template', content: 'Typical residential framing: Day 1-2: Sill plates & floor joists. Day 3-4: Subfloor & wall layout. Day 5-7: Wall framing & standing. Day 8-9: Beam/header setting. Day 10-12: Roof trusses/rafters. Day 13-14: Sheathing & blocking. Day 15: Hardware, straps, hold-downs.' },
  { tradeSlug: 'framing', category: 'safety', title: 'Framing Safety Protocols', content: 'Fall protection required above 6ft. Hard hats mandatory. Nail gun safety: never bypass safety contact. Truss bracing per manufacturer specs. Ladder safety: 3-point contact. Proper lifting technique for heavy lumber. Eye protection when cutting.' },
  { tradeSlug: 'framing', category: 'materials', title: 'Common Framing Materials', content: 'Dimensional lumber (2x4, 2x6, 2x8, 2x10, 2x12), engineered lumber (LVL, TJI, glulam), plywood/OSB sheathing, Simpson hardware (A35, H10, LSTA, HD), nails (16d sinker, 8d, 10d), screws, adhesive, sill seal, anchor bolts' },
  { tradeSlug: 'framing', category: 'terminology', title: 'Framing Terminology', content: 'King stud, jack stud, cripple, header, sill plate, top plate, double top plate, rim joist, blocking, fire blocking, let-in brace, shear wall, hold-down, Simpson strap, bird mouth, ridge board, collar tie, rafter tail, fascia, soffit' },
  { tradeSlug: 'framing', category: 'productivity_tips', title: 'Framing Efficiency', content: 'Pre-cut repetitive members. Layout walls on deck before standing. Use wall jacks for heavy walls. Pre-assemble headers. Cut all cripples at once. Mark layout on plates before framing. Use chalk lines for sheathing alignment.' },
  { tradeSlug: 'framing', category: 'cost_benchmarks', title: 'Framing Cost Ranges', content: 'Residential framing labor: $4-8/sq ft. Commercial framing: $6-12/sq ft. Truss setting: $1.50-3/sq ft. Sheathing: $1-2/sq ft labor. Average crew: 4-6 framers. Production rate: 300-500 sq ft/day for walls.' },

  // STEEL ERECTION
  { tradeSlug: 'steel_erection', category: 'common_tasks', title: 'Steel Erection Tasks', content: 'Column setting, beam installation, joist/deck placement, moment frame connections, bracing installation, bolt torquing, welding, plumbing/leveling, grouting base plates, safety cable installation, crane coordination' },
  { tradeSlug: 'steel_erection', category: 'scheduling', title: 'Steel Erection Schedule', content: 'Pre-erection: Anchor bolt survey, crane planning, rigging plan. Week 1: Columns & primary beams. Week 2: Secondary beams & bracing. Week 3: Joists & deck. Week 4: Connections, bolting, welding, touch-up paint. Always: Safety cables before walking steel.' },
  { tradeSlug: 'steel_erection', category: 'safety', title: 'Steel Erection Safety (OSHA 1926 Subpart R)', content: 'Fall protection at 15ft for connectors, 6ft for all others. 100% tie-off required. Controlled decking zone max 90ft. Column anchor bolts: min 4 per column. Double connections required. No riding the load. Tag lines on all picks. Crane signals: standard hand signals or radio.' },
  { tradeSlug: 'steel_erection', category: 'terminology', title: 'Steel Terminology', content: 'W-shape, HSS, angle, channel, base plate, moment connection, shear tab, gusset plate, stiffener, web, flange, cope, erection bolt, drift pin, spud wrench, come-along, choker, shackle, spreader bar, headache ball' },
  { tradeSlug: 'steel_erection', category: 'equipment', title: 'Steel Erection Equipment', content: 'Crane (mobile/tower), man lifts, spud wrenches, drift pins, torque wrenches, impact wrenches, come-alongs, chain falls, chokers, shackles, tag lines, safety harnesses, retractable lanyards, beam clamps' },

  // GENERAL CONTRACTOR
  { tradeSlug: 'general_contractor', category: 'common_tasks', title: 'GC Coordination Tasks', content: 'Scheduling subcontractors, permit management, inspections coordination, material procurement, change order management, RFI processing, submittals review, safety meetings, progress reporting, budget tracking, punch list management' },
  { tradeSlug: 'general_contractor', category: 'scheduling', title: 'GC Master Schedule', content: 'Phase 1: Site work & foundation. Phase 2: Framing & rough-in. Phase 3: MEP rough-in (mechanical, electrical, plumbing). Phase 4: Insulation & drywall. Phase 5: Finishes (paint, flooring, trim). Phase 6: MEP finish. Phase 7: Punch list & CO. Critical path: foundation → framing → roof dry-in → MEP → inspections.' },
  { tradeSlug: 'general_contractor', category: 'best_practices', title: 'GC Best Practices', content: 'Weekly coordination meetings with all subs. 3-week look-ahead schedule. Daily site walks. Photo documentation daily. RFI response within 48hrs. Change orders documented before work starts. Safety meeting every Monday. Maintain clean site.' },

  // CONCRETE
  { tradeSlug: 'concrete', category: 'common_tasks', title: 'Concrete Tasks', content: 'Form setting, rebar tying, anchor bolt placement, pour coordination, finishing (broom, trowel, stamped), curing, form stripping, flatwork, foundations, walls, columns, grade beams, retaining walls' },
  { tradeSlug: 'concrete', category: 'scheduling', title: 'Concrete Schedule', content: 'Day 1-2: Excavation & grading. Day 3: Form setting. Day 4: Rebar & embeds. Day 5: Inspection & pour prep. Day 6: Pour day (coordinate pump truck, finishers). Day 7-10: Cure time (min 7 days). Day 11: Strip forms. Flatwork: form, pour, finish same day for small pours.' },
  { tradeSlug: 'concrete', category: 'safety', title: 'Concrete Safety', content: 'Wet concrete is caustic — wear boots, gloves, eye protection. Silica dust protection when cutting/grinding. Proper lifting for forms. Trench safety for foundations. Pump truck setup: overhead power lines clearance. Never walk on fresh pour.' },

  // ELECTRICAL
  { tradeSlug: 'electrical', category: 'common_tasks', title: 'Electrical Tasks', content: 'Service entrance, panel installation, rough-in wiring, outlet/switch placement, lighting installation, low voltage (data/phone), fire alarm, generator hookup, EV charger installation, inspection coordination' },
  { tradeSlug: 'electrical', category: 'scheduling', title: 'Electrical Schedule', content: 'Phase 1 (rough-in): After framing, before insulation. Run all circuits, boxes, conduit. Phase 2 (trim-out): After paint. Install devices, fixtures, covers. Phase 3: Panel terminations, testing, inspection. Coordinate with HVAC for dedicated circuits.' },

  // PLUMBING
  { tradeSlug: 'plumbing', category: 'common_tasks', title: 'Plumbing Tasks', content: 'Underground rough-in (sewer, water), top-out (vents, supply lines), fixture installation, water heater, gas piping, drain testing, pressure testing, backflow prevention, hose bibs, irrigation tie-in' },
  { tradeSlug: 'plumbing', category: 'scheduling', title: 'Plumbing Schedule', content: 'Phase 1 (underground): Before slab pour. Sewer, water main, stub-ups. Phase 2 (rough-in): After framing. Supply, drain, vent piping. Phase 3 (trim): After paint. Fixtures, faucets, toilets, water heater. Coordinate with concrete for slab penetrations.' },

  // PAINTING
  { tradeSlug: 'painting', category: 'common_tasks', title: 'Painting Tasks', content: 'Surface preparation (sanding, patching, caulking), priming, interior painting (walls, ceilings, trim), exterior painting, staining, cabinet finishing, texture application, wallpaper, epoxy coatings, pressure washing' },
  { tradeSlug: 'painting', category: 'scheduling', title: 'Painting Schedule', content: 'After drywall finishing and before flooring. Day 1: Prep & prime (patch, caulk, mask). Day 2-3: First coat walls & ceilings. Day 4: Second coat. Day 5: Trim & doors. Day 6: Touch-up & detail. Exterior: after siding, before landscaping. Weather dependent — no painting below 50°F.' },
  { tradeSlug: 'painting', category: 'materials', title: 'Painting Materials', content: 'Interior latex (flat, eggshell, satin, semi-gloss), exterior acrylic, primers (PVA, shellac, oil-based), caulk, painters tape, drop cloths, rollers (various nap), brushes, sprayers (airless, HVLP), sandpaper, wood filler, texture compound' },
  { tradeSlug: 'painting', category: 'cost_benchmarks', title: 'Painting Cost Ranges', content: 'Interior painting: $1.50-3.50/sq ft. Exterior: $2-5/sq ft. Cabinet refinishing: $3,000-8,000 per kitchen. Trim/doors: $2-5/linear ft. Average crew: 2-4 painters. Production: 400-800 sq ft/day per painter for walls.' },
  { tradeSlug: 'painting', category: 'safety', title: 'Painting Safety', content: 'Ventilation required for all interior work. Respirator for spray application. Lead paint testing on pre-1978 buildings. Ladder safety. Drop cloth all surfaces. VOC awareness — use low-VOC products when possible. Eye protection when scraping/sanding.' },

  // CONSTRUCTION / HOME CLEANING
  { tradeSlug: 'construction_cleaning', category: 'common_tasks', title: 'Construction Cleaning Tasks', content: 'Rough clean (after framing/drywall), final clean (before CO), window cleaning, pressure washing, debris removal, dust removal, floor cleaning, appliance cleaning, fixture polishing, punch list cleaning' },
  { tradeSlug: 'construction_cleaning', category: 'scheduling', title: 'Cleaning Schedule', content: 'Rough clean: After drywall, before paint. Remove all debris, sweep, vacuum. Final clean: After all trades complete, before final inspection. Windows, fixtures, appliances, floors. Touch-up clean: Day of walkthrough. Budget 1-2 days for rough clean, 2-3 days for final clean per 2,000 sq ft.' },
  { tradeSlug: 'construction_cleaning', category: 'materials', title: 'Cleaning Materials & Equipment', content: 'Industrial vacuum, mop & bucket, window squeegees, razor scrapers, pressure washer, cleaning chemicals (degreaser, glass cleaner, multi-surface), trash bags, brooms, dust pans, microfiber cloths, floor scrubber' },
  { tradeSlug: 'construction_cleaning', category: 'cost_benchmarks', title: 'Cleaning Cost Ranges', content: 'Rough clean: $0.15-0.30/sq ft. Final clean: $0.25-0.50/sq ft. Window cleaning: $3-8/window. Pressure washing: $0.15-0.40/sq ft. Average crew: 2-4 cleaners. Production: 1,500-3,000 sq ft/day for final clean.' },
  { tradeSlug: 'construction_cleaning', category: 'safety', title: 'Cleaning Safety', content: 'PPE: gloves, eye protection, dust masks. Chemical handling: read SDS sheets. Ladder safety for high areas. Slip hazards on wet floors. Proper ventilation when using chemicals. Heavy lifting technique for debris.' },
  { tradeSlug: 'construction_cleaning', category: 'quality_checks', title: 'Cleaning Quality Checklist', content: 'All windows clean inside and out. No dust on ledges, sills, or trim. Floors swept, mopped, no scuff marks. Appliances clean inside and out. Light fixtures clean. No paint drips on floors/trim. Cabinets clean inside. All stickers/labels removed. No debris in any room.' },

  // HVAC
  { tradeSlug: 'hvac', category: 'common_tasks', title: 'HVAC Tasks', content: 'Ductwork installation, equipment setting (furnace, AC, heat pump), refrigerant piping, thermostat wiring, ventilation, exhaust fans, mini-split installation, start-up and commissioning, balancing, filter installation' },

  // ROOFING
  { tradeSlug: 'roofing', category: 'common_tasks', title: 'Roofing Tasks', content: 'Tear-off, decking repair, underlayment, shingle/tile/metal installation, flashing, ridge vent, valley installation, drip edge, gutter installation, skylight flashing, chimney flashing, flat roof systems (TPO, EPDM, built-up)' },
  { tradeSlug: 'roofing', category: 'cost_benchmarks', title: 'Roofing Cost Ranges', content: 'Asphalt shingles: $3-5/sq ft installed. Metal roofing: $7-14/sq ft. Tile: $10-18/sq ft. Flat roof (TPO): $5-8/sq ft. Tear-off: $1-2/sq ft. Average crew: 4-6 roofers. Production: 15-25 squares/day for shingles.' },

  // DRYWALL
  { tradeSlug: 'drywall', category: 'common_tasks', title: 'Drywall Tasks', content: 'Board hanging, taping, mudding (3 coats), sanding, corner bead installation, texture application (orange peel, knockdown, smooth), patching, fire-rated assemblies, moisture-resistant board in wet areas' },
  { tradeSlug: 'drywall', category: 'cost_benchmarks', title: 'Drywall Cost Ranges', content: 'Hang & finish: $1.50-3/sq ft. Hang only: $0.75-1.25/sq ft. Finish only: $0.75-1.50/sq ft. Texture: $0.30-0.80/sq ft. Average crew: 2-4 hangers + 2-3 tapers. Production: 40-60 sheets/day hanging (4-person crew).' },

  // FLOORING
  { tradeSlug: 'flooring', category: 'common_tasks', title: 'Flooring Tasks', content: 'Subfloor preparation, hardwood installation, tile setting, carpet installation, LVP/LVT installation, grout, baseboards, transitions, floor leveling, moisture testing, underlayment' },

  // LANDSCAPING
  { tradeSlug: 'landscaping', category: 'common_tasks', title: 'Landscaping Tasks', content: 'Grading, sod installation, irrigation system, hardscape (pavers, retaining walls), planting, mulching, drainage solutions, outdoor lighting, fencing, deck/patio construction' },

  // MASONRY
  { tradeSlug: 'masonry', category: 'common_tasks', title: 'Masonry Tasks', content: 'Brick laying, block wall construction, stone veneer, mortar mixing, tuck pointing, fireplace construction, retaining walls, foundation waterproofing, tile installation, grout' },

  // WELDING
  { tradeSlug: 'welding', category: 'common_tasks', title: 'Welding Tasks', content: 'MIG welding, TIG welding, stick welding, structural welding, pipe welding, fabrication, handrail installation, gate fabrication, repair welding, inspection prep, weld testing' },
  { tradeSlug: 'welding', category: 'safety', title: 'Welding Safety', content: 'Welding helmet with proper shade. Fire watch required. Ventilation for fumes. No welding near flammables. Hot work permit. Inspect equipment before use. Proper grounding. UV protection for skin. Fire extinguisher within reach.' },

  // DEMOLITION
  { tradeSlug: 'demolition', category: 'common_tasks', title: 'Demolition Tasks', content: 'Interior demolition, structural demolition, selective demolition, asbestos abatement coordination, debris hauling, concrete breaking, site clearing, utility disconnection coordination, dust control' },

  // INSULATION
  { tradeSlug: 'insulation', category: 'common_tasks', title: 'Insulation Tasks', content: 'Batt insulation, blown-in insulation, spray foam, rigid board, vapor barrier, air sealing, attic insulation, crawl space insulation, pipe insulation, sound insulation' },

  // EXCAVATION
  { tradeSlug: 'excavation', category: 'common_tasks', title: 'Excavation Tasks', content: 'Site grading, trenching, foundation excavation, utility trenching, backfill, compaction, drainage installation, retention ponds, road base, soil testing coordination' },

  // WINDOWS & DOORS
  { tradeSlug: 'windows_doors', category: 'common_tasks', title: 'Window & Door Tasks', content: 'Window installation, door hanging, weatherstripping, flashing, caulking, hardware installation, glass replacement, sliding door installation, garage door installation, trim/casing' },
];

// Insert all knowledge entries
let inserted = 0;
for (const k of knowledge) {
  try {
    await conn.query(
      'INSERT INTO trade_knowledge (tradeSlug, category, title, content, source) VALUES (?, ?, ?, ?, ?)',
      [k.tradeSlug, k.category, k.title, k.content, 'system']
    );
    inserted++;
  } catch (e) {
    console.log(`Skipped duplicate: ${k.tradeSlug} - ${k.title}`);
  }
}

// Insert benchmarks
const benchmarks = [
  { tradeSlug: 'framing', metricName: 'Labor cost per sq ft (residential)', metricValue: 6.0, unit: '$/sqft', sampleSize: 150 },
  { tradeSlug: 'framing', metricName: 'Wall framing production rate', metricValue: 400, unit: 'sqft/day', sampleSize: 120 },
  { tradeSlug: 'steel_erection', metricName: 'Steel erection rate', metricValue: 8, unit: 'tons/day', sampleSize: 80 },
  { tradeSlug: 'steel_erection', metricName: 'Labor cost per ton', metricValue: 850, unit: '$/ton', sampleSize: 80 },
  { tradeSlug: 'concrete', metricName: 'Foundation pour rate', metricValue: 50, unit: 'yards/day', sampleSize: 100 },
  { tradeSlug: 'painting', metricName: 'Interior painting rate', metricValue: 600, unit: 'sqft/day/painter', sampleSize: 200 },
  { tradeSlug: 'painting', metricName: 'Labor cost per sq ft (interior)', metricValue: 2.5, unit: '$/sqft', sampleSize: 200 },
  { tradeSlug: 'construction_cleaning', metricName: 'Final clean rate', metricValue: 2000, unit: 'sqft/day/crew', sampleSize: 100 },
  { tradeSlug: 'construction_cleaning', metricName: 'Final clean cost per sq ft', metricValue: 0.35, unit: '$/sqft', sampleSize: 100 },
  { tradeSlug: 'roofing', metricName: 'Shingle installation rate', metricValue: 20, unit: 'squares/day', sampleSize: 90 },
  { tradeSlug: 'drywall', metricName: 'Hang & finish cost per sq ft', metricValue: 2.25, unit: '$/sqft', sampleSize: 130 },
  { tradeSlug: 'electrical', metricName: 'Rough-in cost per sq ft', metricValue: 4.5, unit: '$/sqft', sampleSize: 110 },
  { tradeSlug: 'plumbing', metricName: 'Rough-in cost per fixture', metricValue: 450, unit: '$/fixture', sampleSize: 100 },
  { tradeSlug: 'general_contractor', metricName: 'Overhead rate', metricValue: 15, unit: '%', sampleSize: 200 },
  { tradeSlug: 'general_contractor', metricName: 'Profit margin target', metricValue: 10, unit: '%', sampleSize: 200 },
];

let bInserted = 0;
for (const b of benchmarks) {
  try {
    await conn.query(
      'INSERT INTO trade_benchmarks (tradeSlug, metricName, metricValue, unit, sampleSize) VALUES (?, ?, ?, ?, ?)',
      [b.tradeSlug, b.metricName, b.metricValue, b.unit, b.sampleSize]
    );
    bInserted++;
  } catch (e) {
    console.log(`Skipped benchmark: ${b.tradeSlug} - ${b.metricName}`);
  }
}

console.log(`Seeded ${inserted} trade knowledge entries and ${bInserted} benchmarks.`);
await conn.end();
