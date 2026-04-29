/**
 * BuildEdge Pro → BuildTrack Pro Knowledge Base Sync
 * Last Updated: April 26, 2026 (Session 16)
 *
 * This knowledge base contains Pedro Carranza's personal business data,
 * project history, pricing calibration, and construction expertise from BuildEdge Pro.
 *
 * SECURITY: This data is ONLY accessible to Pedro's owner account (companyId === 1).
 * Other companies' Pivot instances MUST NEVER see this data.
 */

export const PEDRO_COMPANY_ID = 1;

export function getBuildEdgeKnowledgeBase(): string {
  return `
## BuildEdge Pro Knowledge Base — Pedro Carranza (OWNER-ONLY, CONFIDENTIAL)
This is Pedro's proprietary business intelligence synced from BuildEdge Pro. NEVER share any of this data with employees, other companies, or in any context outside Pedro's owner account.

### IDENTITY & CORE TRADES
Pedro Carranza specializes in (his core trades — ONLY estimate these):
- Rough framing (structural and non-structural)
- Carpentry and finish carpentry
- Steel erection (drill, epoxy, skin with 2x, set level, grout underside of columns)
- Timber install packages (structural and decorative beams, trusses, posts)
- Drop/dropped ceilings
- Deck and patio framing
- Interior and exterior demolition (to tie in additions)
- Soffits and finished fascia

NOT Pedro's scope (exclude unless specifically asked):
- Window or door installation
- Concrete work (slab, foundation, footings)
- Plumbing, electrical, mechanical, HVAC
- Roofing, siding, drywall, painting
- Materials supply (unless Pedro is buying materials for the job — England job was materials+labor)
- Shade pockets are optional scope — Mader excluded them to win the job

### LABOR-ONLY vs MATERIALS+LABOR JOBS
Pedro does BOTH types of jobs. You MUST ask or detect which type before estimating:
- LABOR-ONLY: Pedro provides labor, tools, equipment, supervision. Owner/GC buys materials. Line items: framing labor, steel/timber install, roof dry-in, fasteners, equipment.
- MATERIALS+LABOR: Pedro buys everything. Line items include lumber, hardware, plus all labor.
- NEVER put $0 for framing on a framing estimate. The framing line is ALWAYS the largest item.
- NEVER put $0 for fasteners. Fasteners are always $1,000-2,500 depending on job size.
- Roof dry-in is ALWAYS a separate line item when Pedro is sheathing and drying in the roof.

### PRICING CHAIN — Sub-to-Framer vs Direct-to-GC
Sometimes Pedro works directly for the GC. Sometimes another framing company (middleman) hires Pedro as a sub.
- Direct-to-GC: Pedro charges full rate (e.g., $35K for a porte cochere)
- Sub-to-Framer: Pedro charges less because the middleman marks up 15-25% to the GC
- Example: Chateaux Porte Cochere — Pedro charged Masterpiece Trade Services $29,600. Masterpiece likely charged Neon Peaks (GC) ~$35,600.

### CRITICAL ESTIMATING RULES (NEVER VIOLATE)
1. NEVER generate an estimate with $0 for the main framing line item
2. NEVER generate an estimate with $0 for fasteners
3. ALWAYS include roof dry-in as a separate line when roof sheathing is in scope
4. ALWAYS include equipment/crane fees when steel or timber is in scope ($4,000-6,000 minimum)
5. Steel/timber install is EXPENSIVE skilled work — minimum $8/sqft for labor
6. For small structures (under 1,500 sqft) with steel+timber, rate is $25-35/sqft all-in labor
7. Use the REAL Chateaux numbers as calibration baseline

### PEDRO'S COMPLETE PROJECT DATABASE (22 real projects — use as calibration)

**FRAMING PROJECTS:**
- Keener/Taylor: $373,808 | 13,337 sqft | Park City luxury | $17.35/sqft (WON)
- Eller Residence: $336,195 | 7,565 sqft | Kamas high-complexity | $25.94/sqft (WON)
- Marcella Lot 45: $311,040 | 9,155 sqft | Wasatch luxury | $21.05/sqft (WON)
- Swanson Residence: $226,534 | 8,734 sqft | Coalville new home | $25.94/sqft labor-only (walls $55K, floors $47.7K, roof $68.6K, timber $16K, dropped ceilings $13.7K, steel $4.2K, fasteners $6.7K, equipment $14.5K)
- Mader Residence: $194,068 | 5,722 sqft | Park City addition/remodel | $33.91/sqft labor-only (framing $62K, structural timber $14.6K, non-structural timber $9.9K, dropped ceiling $11.2K, steel $39.5K, decks $38.4K, fasteners $5.2K, equipment $13.2K) — shade pockets EXCLUDED to win job
- Mountain Villas (Buian): $491,664 | two units | Morgan County (WON)
- Copeland Residence: $116,419 | 8,452 sqft | Heber/Peoa | $13.77/sqft labor-only (framing $99.1K, dropped ceilings $1.5K, timber $7.8K, fasteners $3.2K, equipment $4.8K)
- Beehive Riverton Phase 2: $310,531 | 9,764 sqft | Riverton assisted living | $31.80/sqft WITH materials (walls $58.8K, roof $75.6K, fasteners $4.7K, hardware+material $55.7K, trusses $108.5K, equipment $7.2K)
- Hardy Residence: $41,055 | 3,903 sqft | Utah simple | $10.52/sqft (framing $29.2K, timber $4.25K, fasteners $3K, equipment $4.6K)
- Blanchette Addition: $24,770 | 1,073 sqft | Summit County addition | $23.08/sqft labor-only (demo $4.24K, framing+sheathing $7.68K, roof framing $8.35K, fasteners $1.4K, equipment $3.1K)
- Stein Eriksen Lodge: $3,887 | 180 sqft | Park City repair | $21.59/sqft (demo $676, subfloor $725, materials $890, insulation $216, fasteners $80, reframe $900, haul-off $400)

**STEEL/TIMBER PROJECTS:**
- Chateaux Porte Cochere: $29,600 | 960 sqft | Deer Valley | $30.83/sqft labor-only (framing $13.6K, steel+timber $8.1K, roof dry-in $1.8K, fasteners $1.5K, equipment $4.6K)
- Alder & Tweed: $82,990 | commercial T.I. | steel subbed out

**DECK PROJECTS:**
- Payne Deck Remodel: $64,506 | 2,152 sqft | Deer Valley | $29.97/sqft (demo $6.45K, framing $24.6K, sheathing $9.5K, T&G underside $16.1K, fasteners $4.2K, equipment $3.6K)
- Ridge at Silver Lake: $139,656 | 24 decks | Park City | $5,519/deck (demo $1,729/deck, soffit $896/deck, steel+joist $690/deck, decking+trim $2,304/deck, fasteners $1.6K, equipment $3.2K)
- McBeth Hot Tub Deck: $14,970 | Park City specialty (inspect $2.89K, concrete demo $6.75K, rebuild $3.45K, labor $1.33K, fasteners $550)

**ROOF PROJECTS:**
- Burke Shed Roof: $16,820 | 137 sqft | Park City | $122.77/sqft labor-only (post+beam $3.4K, rafters+sheathing+dry-in $5.92K, fascia+T&G $3.85K, fasteners $1.4K, equipment $2.25K)
- Park City Roof Addition (Hector): $21,576 | 309 sqft | Park City | $69.83/sqft (demo $2.1K, post+beam $4.05K, rafters+sheathing $4.63K, timber materials $6.5K, fasteners $1.2K, equipment $3K)

**SIDING/SOFFIT PROJECTS:**
- Collins (Powder Mountain): $120,115 | 11,970 sqft | Eden | $10.03/sqft (exterior cladding $37.56K, interior wood ceiling $68.5K, fasteners $4.75K, equipment $9.3K)

**OTHER:**
- England Renovation: $59,866 + change orders | Heber | materials-included job
- Albright Garage: $8,664 | 1,120 sqft garage | SLC
- Johansen: $242,000 | WON
- Daybreaker: $127,000 | WON

### QUICK PROJECT LOOKUP
Framing new build: Hardy $10.52/sqft, Copeland $13.77/sqft, Keener $17.35/sqft, Swanson $25.94/sqft, Eller $25.94/sqft
Addition/remodel: Blanchette $23.08/sqft, Mader $33.91/sqft, Stein Eriksen $21.59/sqft
Deck: Payne $29.97/sqft, Ridge $5,519/deck, McBeth $14,970 specialty
Roof: Burke $122.77/sqft (small), Hector $69.83/sqft (small)
Siding/soffit: Collins $10.03/sqft (large volume)
Steel+timber: Chateaux $30.83/sqft labor-only
With materials: Beehive $31.80/sqft, England $59,866

### FRAMING RATE TIERS (from Pedro's actual data + Utah market research)
- Standalone garage: $6-8/sqft
- Commercial T.I.: $8-10/sqft
- Simple new build (valley): $10-14/sqft (Hardy $10.52, Copeland $13.77)
- Standard luxury new construction: $17-26/sqft (Keener $17.35, Eller $25.94, Swanson $25.94)
- Addition/remodel (mountain): $23-34/sqft (Blanchette $23.08, Mader $33.91)
- Small steel+timber structures: $25-35/sqft labor-only (Chateaux $30.83)
- Small roof/specialty: $70-123/sqft (Hector $69.83, Burke $122.77) — small jobs have high per-sqft due to fixed costs
- Assisted living/commercial with materials: $31-32/sqft (Beehive $31.80)

### UTAH MARKET RATES (2025-2026 research)
- National framing labor: $4-$10/sqft | Utah: $4-$13/sqft | Utah with materials: $11-$30/sqft
- Utah custom homes: $15-$35/sqft (labor + materials)
- Park City premium: +20-50% over SLC baseline
- Deck labor Utah: $15-$35/sqft | Composite/Trex installed: $40-$80/sqft
- Roofing Utah: $1.75-$5.50/sqft shingles | Metal: $5-$22/sqft
- Demolition: $4-$17/sqft national | $5-$15/sqft Utah
- T&G/wood siding: $9-$16/sqft installed | Labor only: $5-$9/sqft
- Soffit: $1.50-$4/linear foot labor | Fascia: $6-$20/linear foot
- Steel I-beam install: $6-$20/sqft or $1,000-$20,000 per beam

### LINE ITEM BENCHMARKS (from Pedro's actual data)
- Steel erection: $4.2K (light) to $39.5K (heavy) — Mader had $39.5K for full steel package
- Equipment/crane rental: $2,250 (small) to $14,500 (large) — scales with project size
- Fasteners: $80 (tiny repair) to $6,700 (large new build) — typically 2-4% of total
- Dropped ceilings: $1,500 (minimal) to $13,742 (full project) — $8-15/sqft
- Timber packages: $4,250 (simple) to $15,950 (complex) — structural vs decorative split
- Deck framing: $14-30/sqft depending on complexity and location
- Demo: $676 (small repair) to $41,496 (24 decks) — varies wildly by scope
- T&G install: $7.50/sqft (Payne deck underside) to $10/sqft
- Exterior cladding: $3.14/sqft (Collins large volume)
- Interior wood ceiling: $5.72/sqft (Collins large volume)
- Soffit under decks: $896/deck (Ridge at Silver Lake)

### REGIONAL MULTIPLIERS (confirmed by Pedro's actual project data)
- Deer Valley / Royal Street / Empire Pass: 1.50x (Chateaux $30.83/sqft, Payne $29.97/sqft)
- Park City / Summit County: 1.35x (Mader $33.91/sqft, Blanchette $23.08/sqft, Burke $122.77/sqft)
- Coalville / East Summit: 1.10x (Swanson $25.94/sqft — large complex home)
- Wasatch County (Heber, Midway, Kamas, Peoa): 1.00-1.10x (Copeland $13.77/sqft in Peoa)
- Powder Mountain / Eden / Morgan County: 1.15-1.25x (Collins $10.03/sqft — siding volume job)
- Riverton / SLC Valley: 1.00x baseline (Beehive $31.80/sqft — but included materials)
- Utah County: 0.90x
- St. George: 0.85x
- Seasonal premium: winter work +15-20% (snow removal, access, heating)
- Labor availability: tight May-Sept (peak season), easier Oct-Apr

### STANDARD RATES & TERMS
- Change orders: $55/man hour (negotiable with GC)
- Snow removal: $55/man hour
- Payment terms: 30% deposit, 35% at framing completion, 35% at final

### LUMBER PRICING (Sunpro Heber actuals 2025-2026)
**Dimensional lumber (Fir S4S Dry, 2&BTR):**
- 2x4-12: $6.34-$9.28 EA | 2x4-16: $9.52-$9.80 EA | 2x4 precut stud (92-5/8"): $2.79 EA
- 2x6-10: $7.03 EA | 2x6-12: $8.70-$8.95 EA | 2x6-16: $13.41-$14.39 EA | 2x6-20: $18.31 EA
- 2x8-12: $12.16 EA | 2x8-16: $19.66 EA
- 2x10-12: $16.65-$23.13 EA | 2x10-14: $27.12 EA | 2x10-16: $30.61 EA
- 2x12-12: $20.94 EA | 2x12-16: $35.29 EA | 2x12-20: $49.59 EA
- 6x6-12 DF Green: $56.48 EA | 4x4 Green S4S: $5.19 EA

**Treated lumber (Borate .17 Treated Plate, Sunpro Heber actuals):**
- 2x4-16 Borate Treated: $11.82-$12.38 EA
- 2x6-16 Borate Treated: $17.62-$19.48 EA

**Engineered lumber (Sunpro Heber actuals):**
- RFPI 400 I-Joist 2-1/16"x11-7/8": $3.96-$3.99/lf
- RFPI 70 I-Joist 2-5/16"x11-7/8": $6.74/lf
- 9-1/2" LVL 2.0E: $6.15/lf
- 14" LVL 2.0E: $9.59/lf
- 1-1/8"x11-7/8"x16' Rim Board: $39.56 EA

**Glulam beams (Sunpro Heber actuals, Johansen Skyline quote):**
- 3-1/2"x15" Glulam: $27.98/lf | 3-1/2"x19-1/2" Glulam: $38.88/lf
- 5-1/2"x15" Glulam: $35.53/lf | 5-1/2"x18" Glulam: $43.60/lf

**Sheathing & panels:**
- 7/16" OSB sheathing: $10.71-$12.31 EA
- 19/32" OSB sheathing: $17.58-$19.02 EA
- 23/32" T&G OSB (Advantech): $19.96-$42.00 EA (Advantech premium)
- 19/32" Plywood clip: $0.17 EA

**Hardware (Simpson Strong-Tie, Sunpro actuals):**
- 18GA Framing Angle (galv): $0.76 EA
- Adj Slope/Skew U Hanger ZMAX: $28.05 EA
- 4x10 Face Mount Hanger: $13.13 EA
- 6x6 AB/ABE Hybrid Adj Post Base ZMAX: $37.13 EA
- Coil Strap 16GA-1-1/4"x25': $68.98
- 1/2"-7" Wedge Anchor: $1.77 EA

**Composite decking (Timbertech Prime, Sunpro actuals):**
- 1x6 Timbertech Prime-Groove Dark Cocoa: $3.29/lf
- Concealoc Fasteners: ~$1.95/sqft
- Delivery: $85-$100 per load (Sunpro Heber standard)

**Pedro's real lumber jobs at Sunpro Heber:**
- England Residence (Quote 947191, Jan 2026): $26,703.59 total — full framing package
- Gutierrez Addition (Quote 943517, Nov 2025): $9,642.00 — I-joists + framing
- Johansen Skyline (Quote 945958, Dec 2025): $9,981.09 — glulam + framing
- 2519 Daybreaker Drive Deck (Quote 950859, Feb 2026): $11,781.21 — Timbertech deck
- Rosenblum (Quote 942044, Oct 2025): $1,811.89 — Advantech + I-joists only (partial)
- Buian (Quote 928096, May 2025): $4,114.39 — 14" LVL beams + hardware only

### LUMBER ACCURACY NOTES
- Roof plywood must use actual roof surface area (floor area x pitch factor), NOT floor area
- Pitch factors: 3/12=1.03, 4/12=1.05, 6/12=1.12, 8/12=1.20, 10/12=1.30, 12/12=1.41
- Treated lumber required: sill plates on concrete, crawlspace members, deck ledgers, any member within 6" of grade
- For additions/remodels: only count NEW framing, not existing structure
- Always add 10-15% waste factor to lumber quantities

### SPECIALTY LINE ITEMS
- Drop/dropped ceilings: $8-15/sqft (Mader: $11,200; Eller: $22,140; Marcella: $26,320)
- Shade pockets: $4,000-8,000 depending on size and complexity — NOTE: Mader excluded shade pockets to win the job
- Soffits: $12-18 linear foot
- Exterior fascia: $8-14 linear foot
- Timber packages: split into structural ($14,600 Mader) and non-structural ($9,900 Mader)
- Deck/patio framing: $38,368 for 2,537 sqft at Mader = $15.12/sqft

### DEEP FRAMING & STRUCTURAL KNOWLEDGE
**Headers & Beams:**
- Standard header sizes: 4x6 (up to 4' span), 4x8 (up to 6'), 4x10 (up to 8'), 4x12 (up to 10'), doubled 2x10/2x12 with 1/2" plywood spacer for 2x6 walls
- LVL headers: 1-3/4"x9-1/2" (up to 8'), 1-3/4"x11-7/8" (up to 12'), doubled/tripled for wider spans
- Glulam beams: 3-1/2"x15" (up to 16' span), 5-1/2"x15" (up to 20'), 5-1/2"x18" (up to 24'), 6-3/4"x21" (long spans)
- Flush beams vs drop beams: flush beams need joist hangers, drop beams need post-to-beam connectors
- Point loads: every beam end needs a post or bearing wall below — check structural for point load callouts and verify bearing path to foundation
- Cantilevers: max 1/3 of back-span, verify blocking at bearing point and doubled rim joist

**Bearing Walls vs Partition Walls:**
- Bearing walls carry loads from above — identified on structural plans with bold lines or "BRG" notation
- Partition walls are non-structural — can be single top plate, no hold-downs needed
- When framing bearing walls: double top plate required, studs must stack over supports below
- At bearing wall intersections: verify continuous load path from roof to foundation
- Bearing walls removed during remodel MUST be replaced with engineered beam + posts

**Rim Board & Floor System:**
- Rim board at every floor edge — 1-1/8"x11-7/8" for I-joist systems
- I-joist blocking panels at bearing points and mid-span per engineer
- Squash blocks under point loads where I-joists meet bearing walls
- Web stiffeners on I-joists at concentrated loads
- Bridging/blocking at 8' intervals for floor joists over 12' span

**Simpson Strong-Tie Hardware (common residential):**
- Hold-downs: HDU2 (3,075 lbs), HDU5 (4,565 lbs), HDU8 (6,340 lbs), HDU11 (9,285 lbs), PAHD (pre-attached)
- Anchor bolts: 1/2"x10" J-bolt @6' O.C. standard, 5/8" for shear walls
- Post bases: ABU/ABE series (adjustable), CB/CBS (column base), EPB (elevated post base)
- Joist hangers: LUS (light), HUS (heavy), HSUR (skewed/sloped), HU (face mount)
- Straps: LSTA (lateral), MSTA (medium), CMST (coiled), MST (heavy)
- Angles: A34, A35, L50, L70, L90 — verify gauge and nail count per plan
- Tie-downs for multi-story: continuous rod systems (ATS, ATUD) — check rod diameter and coupler locations per floor

**Shear Walls:**
- Identified on structural plans with bold diagonal lines or "SW" notation
- Nail patterns: 8d@6"/12" (standard), 8d@4"/12" (moderate), 8d@3"/12" (high-load), 8d@2"/12" (extreme)
- Sheathing: 15/32" structural plywood or 7/16" OSB — check plan spec, some engineers require plywood only
- Edge nailing: nails must be 3/8" minimum from panel edge
- Hold-down at each end of every shear wall segment — verify model matches plan
- Anchor bolt spacing tightens at shear walls: typically 1'-0" to 2'-0" O.C.
- Blocking required at all horizontal panel joints in shear walls
- Shear transfer: verify drag struts/collectors at top of shear walls connecting to diaphragm

**Nail Schedule (IRC/IBC standard — verify against plan):**
- Framing structural: 16d common (3-1/2") or 16d sinker (3-1/4") — stud to plate, header to trimmer, rafter to plate
- Sheathing walls: 8d common @6"/12" (edges/field) or 8d@4"/12" at braced wall panels
- Sheathing floor: 10d common or 8d deformed @6"/12" for subfloor, glue+nail preferred
- Sheathing roof: 8d common @6"/12" standard, 8d@4"/12" at high-wind zones
- Shear walls: per schedule on plans — typically 8d@6"/12" to 8d@2"/12" depending on load
- Joist to sill/plate: 3-16d toenail or Simpson clip per code
- Rafter/truss to plate: 3-16d toenail or H2.5 hurricane clip per plan
- Top plates: 16d @16" O.C. staggered, splice plates minimum 48" lap with 8-16d nails
- Blocking: 2-16d each end minimum, 3-16d at shear wall blocking

**Fire Stops & Blocking:**
- Fire blocking required at: floor/ceiling intersections, soffits, dropped ceilings, stair stringers, concealed spaces over 10' in any direction
- Bathroom blocking: 34" AFF for grab bars (per ADA), backing for towel bars, medicine cabinets
- Kitchen blocking: upper cabinet mounting at 54" AFF, range hood backing
- Stair blocking: at top and bottom of stringer, mid-span for runs over 12'
- Exterior wall fire blocking: at each floor level, at soffits, at band joist

### STRUCTURAL CHECKLIST GENERATION RULES
- Organize by room/space as labeled on the architectural plans
- Each checklist item MUST reference the specific detail number and page (e.g., "Blocking for fire stop per Detail 112/Page S501")
- Only include items in Pedro's scope: framing, blocking, fire stops, hold-downs, shear walls, headers, beams, posts, steel connections, deck framing, soffits
- Exclude: plumbing backing, electrical boxes, HVAC chases, insulation, drywall, roofing, concrete
- For each room, check: (1) wall framing (2) headers (3) shear walls (4) blocking (5) floor/ceiling (6) connections

### FOREMAN CHEAT SHEET GENERATION RULES
- Sections: (1) Nail Schedule (2) Metal Connectors & Hangers (3) Shear Walls (4) Misc Notes
- Pull nail schedule from the general notes page (S0/S001)
- Pull connector schedule from the structural details and plans
- Pull shear wall schedule from the shear wall plan or general notes
- Always include the engineer's special inspection requirements

### ESTIMATING BEST PRACTICES
- Always break estimates into clear line items: framing labor, steel/timber install, roof dry-in, fasteners, equipment, misc/contingency
- For labor-only jobs: NEVER include material costs
- For materials+labor jobs: include full lumber package, hardware, plus labor
- Contingency: add 5-10% for field conditions
- Change orders: document in writing with hourly rate ($55/hr)
- Payment terms: 30% deposit, 35% at framing complete, 35% at close
- Insurance: Carranza carries general liability and workers comp

### SCOPE CLARIFICATION QUESTIONS
When estimating, always ask:
- Is this labor-only or materials+labor?
- Does scope include roof dry-in or just framing?
- Are shade pockets included or excluded?
- Is steel erection included or subbed to specialist?
- What's the project timeline?
- Are there any site constraints?
- What's the GC's payment history?

### RED FLAGS IN ESTIMATES
- Unusually low framing rates (under $10/sqft for new build)
- Missing fasteners or hardware line item
- No equipment/crane fee for steel jobs
- Roof dry-in missing when roof sheathing is in scope
- No contingency on complex/custom work
- Scope creep without documented change order process

### COMMON MISTAKES TO AVOID
- Underestimating roof sheathing quantity (always use actual roof area, not floor area)
- Forgetting treated lumber for sill plates and crawlspace members
- Missing hold-downs and anchor bolts in shear wall pricing
- Underpricing steel erection (it's skilled, dangerous work)
- Not accounting for site access/parking challenges
- Forgetting delivery costs on large lumber packages

### WHEN TO WALK AWAY
- Scope is vague and GC won't clarify
- Budget is unrealistic for the scope
- GC has poor payment history
- Site conditions are hazardous or extreme
- Timeline is impossible
- Estimate is being used as a low-ball anchor

### COMMUNICATION WITH GC
- Provide estimate in writing with clear scope, exclusions, and assumptions
- Include T&C on every estimate
- Follow up within 3 days if no response
- Document all scope changes in writing
- Weekly progress photos and payment requests
- Final walkthrough before releasing lien waiver

### TEAM COORDINATION
- Foreman gets a copy of the estimate with crew assignments
- Weekly job meetings to track progress vs. estimate
- Flag any scope changes immediately
- Track actual hours and materials for future estimates
- Debrief after job close — what went well, what to improve next time

### 2026 TAX RATES — UTAH & FEDERAL (OWNER-ONLY)
Use these exact rates for all payroll, burden, and tax calculations:

**Federal Taxes (2026):**
- Social Security (OASDI): 6.2% employee + 6.2% employer = 12.4% total
- SS Wage Base: $184,500 (projected 2026 — no SS tax on wages above this)
- Medicare: 1.45% employee + 1.45% employer = 2.9% total (no wage cap)
- Additional Medicare: 0.9% on wages over $200K (single) / $250K (married)
- FUTA: 6.0% gross, 5.4% credit = 0.6% effective on first $7,000 per employee
- Federal income tax brackets (2026 Single): 10% ($0-$11,925), 12% ($11,926-$48,475), 22% ($48,476-$103,350), 24% ($103,351-$197,300), 32% ($197,301-$250,525), 35% ($250,526-$626,350), 37% ($626,351+)
- Federal income tax brackets (2026 MFJ): 10% ($0-$23,850), 12% ($23,851-$96,950), 22% ($96,951-$206,700), 24% ($206,701-$394,600), 32% ($394,601-$501,050), 35% ($501,051-$751,600), 37% ($751,601+)
- Standard deduction 2026: $15,700 (single), $31,400 (MFJ), $23,500 (HoH)

**Utah State Taxes (2026):**
- Utah income tax: 4.65% flat rate (effective 2026)
- Utah taxpayer credit: 6% of federal deductions (reduces effective rate)
- SUTA (State Unemployment): 0.2% to 7.1% on first $50,700 per employee
- New employer SUTA rate: ~1.2% (construction industry may be higher)
- Utah does not have local/city income taxes

**Workers Compensation Rates (Utah 2026, per $100 of payroll):**
- 5403 Carpentry — NOC (framing, rough carpentry): $10.18
- 5059 Iron/Steel Erection — NOC: $4.77
- 5022 Masonry — NOC: $7.56
- 5190 Electrical Wiring: $5.82
- 5183 Plumbing — NOC: $6.41
- 5474 Painting — exterior: $8.93
- 5437 Finish carpentry, cabinet install: $5.21
- 5213 Concrete work — NOC: $6.89
- 5551 Roofing — all kinds: $9.45
- 5645 Carpentry — detached one/two family: $5.12
- 6217 Excavation — NOC: $4.35
- 5102 Iron/Steel erection — buildings < 2 stories: $3.87
- 8810 Clerical office employees: $0.18
- 8742 Salespersons — outside: $0.25
- 5606 Contractor — executive supervisor: $12.54
- 5221 Concrete/cement work — floors: $7.12
- 5538 Sheet metal work — installation: $6.78
- 5535 HVAC ductwork: $4.56
- 5480 Plastering/stucco: $3.92
- 5020 Ceiling installation: $8.34

**Pedro's Typical Burden Rate (framing crew, class 5403):**
- Base wage: $25-35/hr
- Employer SS (6.2%): +$1.55-$2.17/hr
- Employer Medicare (1.45%): +$0.36-$0.51/hr
- Workers Comp (10.18/$100): +$2.55-$3.56/hr
- GL Insurance (~1.5%): +$0.38-$0.53/hr
- FUTA+SUTA (amortized): +$0.15-$0.25/hr
- TOTAL BURDEN: ~$5.00-$7.00/hr on top of base wage
- FULLY BURDENED RATE: $30-42/hr (what each worker REALLY costs Pedro)
- To break even billing: charge at least the fully burdened rate
- For profit: bill at $45-55/hr (20-50% markup over burdened rate)

### ACCOUNTING AUTOMATION — WHAT PIVOT CAN DO FOR PEDRO
Pivot has a built-in accounting_calculator tool that replaces much of what an accountant does:

**Payroll Calculations (use accounting_calculator with calc_type="payroll_tax"):**
- Calculate exact federal income tax withholding per pay period
- Calculate FICA (SS + Medicare) for both employee and employer
- Calculate Utah state tax withholding (4.65% flat)
- Show net pay after all deductions
- Show true employer cost per pay period

**Burden Rate Analysis (calc_type="burden_rate"):**
- Calculate fully burdened hourly rate for any employee
- Include all employer taxes, WC, GL insurance
- Show annual cost breakdown
- Recommend billing rates for profit

**Job Profitability (calc_type="job_profit_loss"):**
- Full P&L statement per job
- Direct costs (labor, materials, equipment)
- Indirect costs (labor burden, overhead allocation)
- Gross and net profit margins
- Industry benchmark comparison

**Workers Comp Estimates (calc_type="workers_comp_estimate"):**
- Premium calculation by class code
- Per-hour WC cost for any employee
- Full rate table for all construction class codes

**Overhead Allocation (calc_type="overhead_allocation"):**
- Distribute monthly overhead across active jobs
- Equal or revenue-weighted allocation
- Per-job daily/weekly/monthly overhead cost
- Typical construction overhead categories

**Certified Payroll (calc_type="certified_payroll"):**
- Davis-Bacon / state prevailing wage calculations
- Per-employee compensation breakdown
- Multi-employee payroll totals
- WH-347 form data preparation

**Overtime Analysis (calc_type="overtime_cost"):**
- True cost of OT including burden
- Effective hourly rate calculation
- Each OT hour costs ~$38-48 for a $25/hr framing worker

**Annual Employee Cost (calc_type="annual_employee_cost"):**
- Full annual cost including all taxes and insurance
- Monthly and true hourly cost
- Helps Pedro decide hire vs. sub decisions

**Markup vs Margin (calc_type="markup_margin"):**
- Convert between markup % and margin %
- Quick reference: 20% markup = 16.7% margin, 25% markup = 20% margin, 50% markup = 33.3% margin

### CONSTRUCTION MATH — EXPANDED CAPABILITIES
Pivot's construction_math tool now includes these calculation types:

**Roof & Rafter Math:**
- pitch_to_degrees, degrees_to_pitch, common_rafter_length, hip_valley_rafter_length
- compound_angle_same_direction, compound_angle_opposite_direction
- irregular_valley, rafter_total_length, jack_rafter_difference
- ridge_height, roof_area, speed_square_lookup, angle_from_measurements
- two_roof_intersection — COMPLETE geometry for two roofs meeting (different pitches, valley angles, jack rafter side cuts, backing angles)

**Arch & Circle Math:**
- arch_radius — calculate radius from chord+height, or arc from radius+angle
- circle_geometry — circumference, area, arc length, sector area, common fractions

**Volume & Area:**
- concrete_volume — slabs, footings, walls, columns/piers with CY and bag counts
- area_perimeter — rectangle, triangle, circle, trapezoid with diagonals
- board_feet — lumber board feet with waste factor and common reference

**Structural:**
- steel_beam_moment — W-shape beam analysis with bending stress, deflection check, and utilization ratio (50+ beam sizes in database)
- material_weight — weight estimates for 15+ construction materials

**Layout & Grade:**
- stair_stringer — complete stair layout with riser/tread dimensions
- percent_grade — slope percentage, angle, ADA compliance check
- diagonal_brace — brace length and angle calculation
- rake_wall_studs — complete stud cut list for angled walls
- pythagorean — basic right triangle calculations

### UTAH CONSTRUCTION REGULATIONS (OWNER REFERENCE)
**Building Codes:**
- Utah adopts IRC 2021 for residential, IBC 2021 for commercial (as of 2025)
- Summit County: additional snow load requirements (60-100 psf ground snow load depending on elevation)
- Park City: design review required for all new construction, strict height limits
- Morgan County: less restrictive than Summit, but still IRC 2021 base
- Wasatch County: IRC 2021 with local amendments

**Licensing:**
- Utah contractor license required: S200 (General Building), S210 (Framing), E100 (General Engineering)
- Pedro should carry: S210 Framing Contractor license
- Subcontractors must be licensed for their trade
- Business license required in each municipality where work is performed

**OSHA Requirements (Construction):**
- Fall protection required at 6' or more (29 CFR 1926.501)
- Scaffolding: must be erected by competent person
- Hard hats required on all construction sites
- Eye protection required for power tool use
- Steel erection: connector must have fall protection at all times
- Crane signals: designated signalman required

**Utah-Specific:**
- Lien rights: file preliminary notice within 20 days of first work
- Mechanics lien: must file within 180 days of completion
- Payment: owner must pay within 30 days of invoice (Utah Prompt Payment Act)
- Retainage: max 5% on private projects, released within 45 days of completion
- Workers comp: REQUIRED for all employers in Utah (no exceptions for construction)
- Utah OSHA (UOSH): state-run program, mirrors federal OSHA
`;
}
