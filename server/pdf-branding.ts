/**
 * Shared PDF branding helper — fetches company logo + brand color for PDF generation.
 * All PDF generators (payroll, job completion, field reports) use this to apply
 * per-company branding instead of hardcoded BuildTrack Pro defaults.
 */
import * as db from "./db";

export interface CompanyBranding {
  companyName: string;
  logoBuffer: Buffer | null;
  brandColor: string; // hex color for accents, headers, dividers
}

const DEFAULT_BRAND_COLOR = "#D4AF37"; // BuildTrack Pro gold
const DEFAULT_COMPANY_NAME = "BuildTrack Pro";

// Cache logo buffers per company to avoid re-downloading on every page
const logoCache = new Map<number, { buffer: Buffer | null; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch company branding for PDF generation.
 * Returns the company's logo (as a Buffer for pdfkit), brand color, and name.
 * Falls back to BuildTrack Pro defaults if company has no custom branding.
 */
export async function getCompanyBranding(companyId?: number): Promise<CompanyBranding> {
  if (!companyId) {
    return { companyName: DEFAULT_COMPANY_NAME, logoBuffer: null, brandColor: DEFAULT_BRAND_COLOR };
  }

  const company = await db.getCompanyById(companyId);
  if (!company) {
    return { companyName: DEFAULT_COMPANY_NAME, logoBuffer: null, brandColor: DEFAULT_BRAND_COLOR };
  }

  const brandColor = (company as any).brandColor || DEFAULT_BRAND_COLOR;
  const companyName = company.name || DEFAULT_COMPANY_NAME;

  // Fetch logo
  let logoBuffer: Buffer | null = null;
  if (company.logoUrl) {
    // Check cache
    const cached = logoCache.get(companyId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      logoBuffer = cached.buffer;
    } else {
      try {
        const response = await fetch(company.logoUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          logoBuffer = Buffer.from(arrayBuffer);
          logoCache.set(companyId, { buffer: logoBuffer, fetchedAt: Date.now() });
        }
      } catch (err) {
        console.error(`[pdf-branding] Failed to fetch logo for company ${companyId}:`, err);
      }
    }
  }

  return { companyName, logoBuffer, brandColor };
}
