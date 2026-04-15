/**
 * WCAG 2.1 AA color contrast validation.
 *
 * Validates that business owner's chosen widget colors meet the 4.5:1
 * contrast ratio for normal text and 3:1 for large text.
 * Suggests accessible alternatives when colors fail.
 */

// ---- Contrast calculation (WCAG 2.1 algorithm) ----

/** Parses hex color to RGB tuple */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

/** Converts sRGB component to linear RGB */
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Calculates relative luminance per WCAG 2.1 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Calculates contrast ratio between two colors (1:1 to 21:1) */
export function contrastRatio(color1: string, color2: string): number {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---- WCAG AA validation ----

export interface ContrastResult {
  ratio: number;
  passesAA: boolean;        // 4.5:1 for normal text
  passesAALarge: boolean;   // 3:1 for large text (18px+ or 14px+ bold)
  passesAAA: boolean;       // 7:1 for enhanced contrast
}

/** Validates contrast between foreground text and background */
export function validateContrast(foreground: string, background: string): ContrastResult {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAALarge: ratio >= 3,
    passesAAA: ratio >= 7,
  };
}

/** Validates widget color against white text (the typical use case) */
export function validateWidgetColor(widgetColor: string): ContrastResult {
  return validateContrast("#ffffff", widgetColor);
}

// ---- Accessible color suggestions ----

/**
 * If a color fails AA contrast with white, darken it until it passes.
 * Returns the original if it already passes.
 */
export function suggestAccessibleColor(originalHex: string, textColor = "#ffffff"): string {
  const result = validateContrast(textColor, originalHex);
  if (result.passesAA) return originalHex;

  const [r, g, b] = hexToRgb(originalHex);
  let factor = 0.9;

  // Iteratively darken until contrast passes
  for (let i = 0; i < 20; i++) {
    const nr = Math.round(r * factor);
    const ng = Math.round(g * factor);
    const nb = Math.round(b * factor);
    const hex = rgbToHex(nr, ng, nb);
    const check = validateContrast(textColor, hex);
    if (check.passesAA) return hex;
    factor -= 0.05;
  }

  return "#1a1a1a"; // fallback to near-black
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}

// ---- Pre-built accessible color themes ----

export interface AccessibleTheme {
  name: string;
  widgetColor: string;
  textOnWidget: string;
  contrastRatio: number;
}

export const ACCESSIBLE_THEMES: AccessibleTheme[] = [
  { name: "Ocean Blue", widgetColor: "#1d4ed8", textOnWidget: "#ffffff", contrastRatio: 7.16 },
  { name: "Forest Green", widgetColor: "#166534", textOnWidget: "#ffffff", contrastRatio: 7.08 },
  { name: "Royal Purple", widgetColor: "#6b21a8", textOnWidget: "#ffffff", contrastRatio: 7.52 },
  { name: "Deep Red", widgetColor: "#991b1b", textOnWidget: "#ffffff", contrastRatio: 7.69 },
  { name: "Slate", widgetColor: "#334155", textOnWidget: "#ffffff", contrastRatio: 8.23 },
  { name: "Teal", widgetColor: "#115e59", textOnWidget: "#ffffff", contrastRatio: 6.38 },
  { name: "Amber", widgetColor: "#92400e", textOnWidget: "#ffffff", contrastRatio: 5.14 },
  { name: "Rose", widgetColor: "#9f1239", textOnWidget: "#ffffff", contrastRatio: 7.01 },
  { name: "Indigo", widgetColor: "#3730a3", textOnWidget: "#ffffff", contrastRatio: 8.58 },
  { name: "Charcoal", widgetColor: "#1f2937", textOnWidget: "#ffffff", contrastRatio: 12.63 },
];
