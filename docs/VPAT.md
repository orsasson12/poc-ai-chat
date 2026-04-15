# Voluntary Product Accessibility Template (VPAT)

## BizAssist Chat Widget — WCAG 2.1 AA Conformance Report

**Product:** BizAssist Embeddable Chat Widget
**Version:** 1.0
**Report Date:** 2026-04-12
**Contact:** accessibility@bizassist.ai

---

## Conformance Level

**WCAG 2.1 Level AA — Supports**

The BizAssist Chat Widget supports WCAG 2.1 Level AA. All Level A and Level AA success criteria are met for the chat widget component.

---

## Success Criteria, Conformance Level, and Remarks

### Principle 1: Perceivable

| Criterion | Level | Conformance | Remarks |
|-----------|-------|-------------|---------|
| 1.1.1 Non-text Content | A | Supports | All images have alt text. Decorative SVGs use aria-hidden. Interactive elements have aria-labels. |
| 1.3.1 Info and Relationships | A | Supports | Semantic HTML: header, article, dl/dt/dd, form, role=log, role=dialog. |
| 1.3.2 Meaningful Sequence | A | Supports | DOM order matches visual reading order. |
| 1.3.3 Sensory Characteristics | A | Supports | Instructions don't rely solely on shape, size, or location. |
| 1.4.1 Use of Color | A | Supports | Color is not the sole means of conveying information. |
| 1.4.3 Contrast (Minimum) | AA | Supports | Widget color validated at configuration. Pre-built themes all ≥4.5:1. Auto-suggest for failing colors. |
| 1.4.4 Resize Text | AA | Supports | Functional at 200% browser zoom. Uses relative units. |
| 1.4.5 Images of Text | AA | Supports | No images of text used. |
| 1.4.11 Non-text Contrast | AA | Supports | Focus indicators, button borders, and input outlines ≥3:1. |

### Principle 2: Operable

| Criterion | Level | Conformance | Remarks |
|-----------|-------|-------------|---------|
| 2.1.1 Keyboard | A | Supports | All functionality keyboard accessible. Enter/Space to open, Escape to close, Tab navigation, Enter to send. |
| 2.1.2 No Keyboard Trap | A | Supports | Focus trap allows Escape exit. Tab wraps within modal. |
| 2.4.1 Bypass Blocks | A | Not Applicable | Widget is a single-purpose component, not a full page. |
| 2.4.3 Focus Order | A | Supports | Focus moves to widget on open, returns to trigger on close. |
| 2.4.4 Link Purpose | A | Supports | Source links and card links have descriptive text + aria-labels. |
| 2.4.7 Focus Visible | AA | Supports | 3px solid outline on :focus-visible for all interactive elements. |
| 2.5.5 Target Size | AAA | Supports | All touch targets ≥44x44px (exceeds AA requirement). |

### Principle 3: Understandable

| Criterion | Level | Conformance | Remarks |
|-----------|-------|-------------|---------|
| 3.1.1 Language of Page | A | Supports | Chat page declares lang attribute. |
| 3.2.1 On Focus | A | Supports | No unexpected context changes on focus. |
| 3.2.2 On Input | A | Supports | Form submission requires explicit Enter or button click. |
| 3.3.1 Error Identification | A | Supports | Failed sends show clear error text with retry option. |
| 3.3.2 Labels or Instructions | A | Supports | Input has descriptive aria-label including keyboard hints. |

### Principle 4: Robust

| Criterion | Level | Conformance | Remarks |
|-----------|-------|-------------|---------|
| 4.1.1 Parsing | A | Supports | Valid HTML output from React rendering. |
| 4.1.2 Name, Role, Value | A | Supports | All interactive elements have proper ARIA roles, names, and states. |
| 4.1.3 Status Messages | AA | Supports | ARIA live regions announce: widget state changes, typing indicators, streaming completion, agent handoff, errors. |

---

## Testing Methodology

### Automated Testing
- **axe-core** integrated in CI pipeline
- Runs against the chat widget in both standalone and iframe-embedded modes

### Manual Testing
- **NVDA** on Windows (Chrome, Firefox)
- **VoiceOver** on macOS (Safari) and iOS (Safari)
- **TalkBack** on Android (Chrome)
- Keyboard-only navigation testing
- 200% browser zoom testing
- prefers-reduced-motion testing

### Browser Matrix
| Browser | Version | Screen Reader | Status |
|---------|---------|--------------|--------|
| Chrome | 120+ | NVDA | Tested |
| Firefox | 120+ | NVDA | Tested |
| Safari | 17+ | VoiceOver | Tested |
| Edge | 120+ | Narrator | Tested |
| Chrome Android | Latest | TalkBack | Tested |
| Safari iOS | 17+ | VoiceOver | Tested |

---

## Maintenance

This VPAT is reviewed and updated:
- When new features are added to the chat widget
- When accessibility-related bugs are reported
- Quarterly as part of the product accessibility audit

**Last reviewed:** 2026-04-12
