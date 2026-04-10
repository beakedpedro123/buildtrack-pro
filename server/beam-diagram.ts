/**
 * Steel Beam Cross-Section Diagram Generator
 * 
 * Generates SVG diagrams of W-shape (wide flange) steel beams with
 * labeled dimensions, matching the style of professional AISC reference apps.
 * 
 * Returns an SVG string that can be served as an image endpoint.
 */

export interface BeamData {
  designation: string;
  weight: number;     // lbs/ft
  depth: number;      // inches (d)
  width: number;      // inches (bf - flange width)
  tw: number;         // inches (web thickness)
  tf: number;         // inches (flange thickness)
  area: number;       // in²
  Ix: number;         // in⁴
  Iy: number;         // in⁴
  Sx: number;         // in³
  Sy: number;         // in³
}

export function generateBeamSVG(beam: BeamData): string {
  const svgWidth = 600;
  const svgHeight = 720;
  
  // Drawing area for the beam cross-section
  const drawX = 80;
  const drawY = 60;
  const drawW = 340;
  const drawH = 420;
  
  // Scale the beam proportionally within the drawing area
  const d = beam.depth;    // total depth
  const bf = beam.width;   // flange width
  const tw = beam.tw;      // web thickness
  const tf = beam.tf;      // flange thickness
  
  // Calculate scale to fit the beam in the drawing area
  const scaleX = drawW / (bf * 1.8);
  const scaleY = drawH / (d * 1.3);
  const scale = Math.min(scaleX, scaleY);
  
  // Scaled dimensions
  const sD = d * scale;      // scaled depth
  const sBf = bf * scale;    // scaled flange width
  const sTw = tw * scale;    // scaled web thickness
  const sTf = tf * scale;    // scaled flange thickness
  
  // Center the beam in the drawing area
  const cx = drawX + drawW / 2;
  const cy = drawY + drawH / 2;
  
  // Beam outline coordinates (I-beam cross section)
  const left = cx - sBf / 2;
  const right = cx + sBf / 2;
  const top = cy - sD / 2;
  const bottom = cy + sD / 2;
  const webLeft = cx - sTw / 2;
  const webRight = cx + sTw / 2;
  
  // k dimension (distance from outer face of flange to web toe of fillet)
  // Approximate k as tf + fillet radius (use tf * 1.3 as approximation)
  const sK = sTf * 1.4;
  
  // Build the I-beam path (clockwise from top-left)
  const beamPath = [
    `M ${left} ${top}`,                           // Top-left of top flange
    `L ${right} ${top}`,                           // Top-right of top flange
    `L ${right} ${top + sTf}`,                     // Bottom-right of top flange
    `L ${webRight + sK * 0.3} ${top + sTf}`,      // Fillet start right
    `Q ${webRight} ${top + sTf + sK * 0.2} ${webRight} ${top + sK}`, // Fillet curve
    `L ${webRight} ${bottom - sK}`,                // Right side of web
    `Q ${webRight} ${bottom - sTf - sK * 0.2} ${webRight + sK * 0.3} ${bottom - sTf}`, // Bottom fillet right
    `L ${right} ${bottom - sTf}`,                  // Top-right of bottom flange
    `L ${right} ${bottom}`,                        // Bottom-right of bottom flange
    `L ${left} ${bottom}`,                         // Bottom-left of bottom flange
    `L ${left} ${bottom - sTf}`,                   // Top-left of bottom flange
    `L ${webLeft - sK * 0.3} ${bottom - sTf}`,    // Fillet start left
    `Q ${webLeft} ${bottom - sTf - sK * 0.2} ${webLeft} ${bottom - sK}`, // Bottom fillet left
    `L ${webLeft} ${top + sK}`,                    // Left side of web
    `Q ${webLeft} ${top + sTf + sK * 0.2} ${webLeft - sK * 0.3} ${top + sTf}`, // Top fillet left
    `L ${left} ${top + sTf}`,                      // Bottom-left of top flange
    `Z`
  ].join(" ");
  
  // Dimension line helpers
  const dimColor = "#333333";
  const dimFont = 'style="font-family: Inter, SF Pro, -apple-system, sans-serif; font-weight: 600;"';
  const labelFont = 'style="font-family: Inter, SF Pro, -apple-system, sans-serif; font-weight: 400;"';
  const accentColor = "#2196F3";  // Blue like the reference app
  
  // Dimension lines and labels
  const dimLines: string[] = [];
  
  // --- Flange Width (bf) - top horizontal dimension ---
  const bfDimY = top - 25;
  dimLines.push(`
    <line x1="${left}" y1="${bfDimY}" x2="${right}" y2="${bfDimY}" stroke="${dimColor}" stroke-width="1.5" marker-start="url(#arrowL)" marker-end="url(#arrowR)"/>
    <line x1="${left}" y1="${top - 5}" x2="${left}" y2="${bfDimY - 5}" stroke="${dimColor}" stroke-width="0.8" stroke-dasharray="3,2"/>
    <line x1="${right}" y1="${top - 5}" x2="${right}" y2="${bfDimY - 5}" stroke="${dimColor}" stroke-width="0.8" stroke-dasharray="3,2"/>
    <text x="${cx}" y="${bfDimY - 6}" text-anchor="middle" fill="${dimColor}" font-size="15" ${dimFont}>${bf}"</text>
  `);
  
  // --- Depth (d) - right vertical dimension ---
  const dDimX = right + 40;
  dimLines.push(`
    <line x1="${dDimX}" y1="${top}" x2="${dDimX}" y2="${bottom}" stroke="${dimColor}" stroke-width="1.5" marker-start="url(#arrowU)" marker-end="url(#arrowD)"/>
    <line x1="${right + 5}" y1="${top}" x2="${dDimX + 5}" y2="${top}" stroke="${dimColor}" stroke-width="0.8" stroke-dasharray="3,2"/>
    <line x1="${right + 5}" y1="${bottom}" x2="${dDimX + 5}" y2="${bottom}" stroke="${dimColor}" stroke-width="0.8" stroke-dasharray="3,2"/>
    <text x="${dDimX + 14}" y="${cy + 5}" text-anchor="start" fill="${dimColor}" font-size="15" ${dimFont}>${d}"</text>
  `);
  
  // --- Web Thickness (tw) - horizontal at mid-height ---
  const twDimY = cy;
  dimLines.push(`
    <line x1="${webLeft}" y1="${twDimY}" x2="${webRight}" y2="${twDimY}" stroke="${accentColor}" stroke-width="1.5" marker-start="url(#arrowLB)" marker-end="url(#arrowRB)"/>
    <text x="${cx}" y="${twDimY - 8}" text-anchor="middle" fill="${accentColor}" font-size="13" ${dimFont}>${tw}"</text>
  `);
  
  // --- Flange Thickness (tf) - left side of top flange ---
  const tfDimX = left - 12;
  dimLines.push(`
    <line x1="${tfDimX}" y1="${top}" x2="${tfDimX}" y2="${top + sTf}" stroke="${accentColor}" stroke-width="1.5" marker-start="url(#arrowUB)" marker-end="url(#arrowDB)"/>
    <line x1="${left - 3}" y1="${top}" x2="${tfDimX - 3}" y2="${top}" stroke="${accentColor}" stroke-width="0.6" stroke-dasharray="2,2"/>
    <line x1="${left - 3}" y1="${top + sTf}" x2="${tfDimX - 3}" y2="${top + sTf}" stroke="${accentColor}" stroke-width="0.6" stroke-dasharray="2,2"/>
    <text x="${tfDimX - 8}" y="${top + sTf / 2 + 5}" text-anchor="end" fill="${accentColor}" font-size="13" ${dimFont}>tf=${tf}"</text>
  `);
  
  // --- bf label (flange width label below beam) ---
  dimLines.push(`
    <text x="${cx}" y="${bottom + 22}" text-anchor="middle" fill="${dimColor}" font-size="13" ${labelFont}>bf = ${bf}"</text>
  `);
  
  // --- d label ---
  dimLines.push(`
    <text x="${dDimX + 14}" y="${cy + 22}" text-anchor="start" fill="${dimColor}" font-size="13" ${labelFont}>d = ${d}"</text>
  `);

  // Data table section (below the beam)
  const tableY = drawY + drawH + 30;
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <defs>
    <!-- Arrow markers -->
    <marker id="arrowR" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="${dimColor}"/></marker>
    <marker id="arrowL" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M8,0 L0,3 L8,6" fill="${dimColor}"/></marker>
    <marker id="arrowD" markerWidth="6" markerHeight="8" refX="3" refY="8" orient="auto"><path d="M0,0 L3,8 L6,0" fill="${dimColor}"/></marker>
    <marker id="arrowU" markerWidth="6" markerHeight="8" refX="3" refY="0" orient="auto"><path d="M0,8 L3,0 L6,8" fill="${dimColor}"/></marker>
    <marker id="arrowRB" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="${accentColor}"/></marker>
    <marker id="arrowLB" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M8,0 L0,3 L8,6" fill="${accentColor}"/></marker>
    <marker id="arrowDB" markerWidth="6" markerHeight="8" refX="3" refY="8" orient="auto"><path d="M0,0 L3,8 L6,0" fill="${accentColor}"/></marker>
    <marker id="arrowUB" markerWidth="6" markerHeight="8" refX="3" refY="0" orient="auto"><path d="M0,8 L3,0 L6,8" fill="${accentColor}"/></marker>
  </defs>
  
  <!-- Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="#FFFFFF" rx="12"/>
  
  <!-- Title bar -->
  <rect x="0" y="0" width="${svgWidth}" height="50" fill="#1a1a2e" rx="12"/>
  <rect x="0" y="12" width="${svgWidth}" height="38" fill="#1a1a2e"/>
  <text x="${svgWidth / 2}" y="33" text-anchor="middle" fill="#D4AF37" font-size="20" font-weight="bold" ${dimFont}>AISC : ${beam.designation}</text>
  
  <!-- Unit tabs -->
  <rect x="20" y="56" width="80" height="28" fill="#f0f0f0" rx="4"/>
  <text x="60" y="75" text-anchor="middle" fill="#333" font-size="13" font-weight="bold" ${dimFont}>Detail</text>
  <rect x="110" y="56" width="50" height="28" fill="${accentColor}" rx="4"/>
  <text x="135" y="75" text-anchor="middle" fill="white" font-size="13" font-weight="bold" ${dimFont}>in</text>
  
  <!-- Beam cross-section -->
  <path d="${beamPath}" fill="${accentColor}" fill-opacity="0.15" stroke="${accentColor}" stroke-width="2.5"/>
  
  <!-- Dimension lines -->
  ${dimLines.join("\n")}
  
  <!-- Data table -->
  <rect x="20" y="${tableY}" width="${svgWidth - 40}" height="40" fill="#f5f5f5" rx="8"/>
  <text x="${svgWidth / 2}" y="${tableY + 26}" text-anchor="middle" fill="#333" font-size="16" ${dimFont}>Area of Section :  <tspan font-weight="bold" font-size="18">${beam.area} in2</tspan></text>
  
  <!-- Weight row -->
  <rect x="20" y="${tableY + 50}" width="250" height="40" fill="#f5f5f5" rx="8"/>
  <text x="145" y="${tableY + 76}" text-anchor="middle" fill="#333" font-size="15" ${dimFont}>1 ft  =  <tspan font-weight="bold">${beam.weight} lb</tspan></text>
  
  <!-- Properties row -->
  <rect x="280" y="${tableY + 50}" width="280" height="40" fill="#f5f5f5" rx="8"/>
  <text x="420" y="${tableY + 76}" text-anchor="middle" fill="#333" font-size="13" ${dimFont}>Ix: ${beam.Ix} in4  |  Sx: ${beam.Sx} in3</text>
  
  <!-- Properties row 2 -->
  <rect x="20" y="${tableY + 100}" width="${svgWidth - 40}" height="36" fill="#f0f7ff" rx="8"/>
  <text x="${svgWidth / 2}" y="${tableY + 124}" text-anchor="middle" fill="#1565C0" font-size="13" ${dimFont}>Iy: ${beam.Iy} in4  |  Sy: ${beam.Sy} in3  |  Weight: ${beam.weight} lbs/ft</text>
  
  <!-- Footer -->
  <text x="${svgWidth / 2}" y="${svgHeight - 12}" text-anchor="middle" fill="#999" font-size="11" ${labelFont}>All Dimensions are in inches  •  Source: AISC Steel Construction Manual  •  BuildTrack Pro</text>
</svg>`;

  return svg;
}

/**
 * Find a W-shape beam by designation and generate its SVG diagram.
 * Returns null if the beam is not found.
 */
export function generateBeamDiagramForDesignation(
  designation: string,
  steelProfiles: any
): string | null {
  if (!steelProfiles?.w_shapes) return null;
  
  const d = designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
  
  for (const shape of steelProfiles.w_shapes) {
    const shapeDesig = shape.designation.toUpperCase().replace(/\s+/g, "").replace("X", "x");
    if (shapeDesig === d || shapeDesig.replace("W", "") === d.replace("W", "")) {
      return generateBeamSVG({
        designation: shape.designation,
        weight: shape.weight,
        depth: shape.depth,
        width: shape.width,
        tw: shape.tw,
        tf: shape.tf,
        area: shape.area,
        Ix: shape.Ix,
        Iy: shape.Iy,
        Sx: shape.Sx,
        Sy: shape.Sy,
      });
    }
  }
  
  return null;
}
