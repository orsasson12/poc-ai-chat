/**
 * WCAG 2.1 AA Audit Checklist for BizAssist Chat Widget.
 *
 * Each item maps to a specific WCAG success criterion.
 * Used for automated checks, manual testing protocols, and VPAT reporting.
 */

export interface AuditItem {
  id: string;
  criterion: string;     // e.g., "1.1.1"
  level: "A" | "AA" | "AAA";
  title: string;
  description: string;
  component: string;     // which component this applies to
  status: "pass" | "fail" | "partial" | "not_applicable";
  notes: string;
  automated: boolean;    // can be tested with axe-core
}

export const WIDGET_AUDIT_CHECKLIST: AuditItem[] = [
  // Perceivable
  {
    id: "1.1.1",
    criterion: "1.1.1",
    level: "A",
    title: "Non-text Content",
    description: "All non-text content has text alternatives",
    component: "widget.js, content-card, message-bubble",
    status: "pass",
    notes: "Chat bubble SVG has aria-hidden, bubble button has aria-label. Card images have descriptive alt text. Avatar images have alt text.",
    automated: true,
  },
  {
    id: "1.3.1",
    criterion: "1.3.1",
    level: "A",
    title: "Info and Relationships",
    description: "Information and relationships conveyed through presentation are programmatically determinable",
    component: "chat-window, content-card",
    status: "pass",
    notes: "Chat uses role=log for message area. Cards use article + dl for structured data. Header uses semantic header element.",
    automated: true,
  },
  {
    id: "1.3.2",
    criterion: "1.3.2",
    level: "A",
    title: "Meaningful Sequence",
    description: "Reading order matches visual order",
    component: "chat-window",
    status: "pass",
    notes: "Messages in DOM order match visual chronological order. Cards render inline with text flow.",
    automated: false,
  },
  {
    id: "1.4.1",
    criterion: "1.4.1",
    level: "A",
    title: "Use of Color",
    description: "Color is not the only means of conveying information",
    component: "message-bubble, feedback buttons",
    status: "pass",
    notes: "Feedback buttons use icons + aria-pressed state, not just color. Error messages include text, not just red color.",
    automated: false,
  },
  {
    id: "1.4.3",
    criterion: "1.4.3",
    level: "AA",
    title: "Contrast (Minimum)",
    description: "Text has 4.5:1 contrast ratio against background",
    component: "widget.js, all text elements",
    status: "pass",
    notes: "Widget color validated at configuration time via contrast.ts. Pre-built themes all meet 4.5:1. Auto-suggest darkens failing colors.",
    automated: true,
  },
  {
    id: "1.4.4",
    criterion: "1.4.4",
    level: "AA",
    title: "Resize Text",
    description: "Text can be resized up to 200% without loss of content",
    component: "chat-window, widget container",
    status: "pass",
    notes: "Widget uses rem/em units. Container scrolls on overflow. Mobile breakpoint goes full-screen. Tested at 200% browser zoom.",
    automated: false,
  },
  {
    id: "1.4.11",
    criterion: "1.4.11",
    level: "AA",
    title: "Non-text Contrast",
    description: "UI components and graphics have 3:1 contrast",
    component: "buttons, input, focus indicators",
    status: "pass",
    notes: "Focus indicators are 3px solid #005fcc (passes 3:1 against all backgrounds). Button borders meet 3:1.",
    automated: true,
  },
  // Operable
  {
    id: "2.1.1",
    criterion: "2.1.1",
    level: "A",
    title: "Keyboard",
    description: "All functionality available from keyboard",
    component: "widget.js, chat-input, feedback buttons",
    status: "pass",
    notes: "Bubble: Enter/Space to open. Widget: Escape to close. Input: Enter to send, Shift+Enter for newline. Feedback: Tab + Enter. Sources: Tab to expand.",
    automated: false,
  },
  {
    id: "2.1.2",
    criterion: "2.1.2",
    level: "A",
    title: "No Keyboard Trap",
    description: "Keyboard focus is not trapped without a way to exit",
    component: "widget.js (focus trap)",
    status: "pass",
    notes: "Focus trap in widget allows Escape to close and return focus. Tab wraps within modal. User can always exit.",
    automated: false,
  },
  {
    id: "2.4.3",
    criterion: "2.4.3",
    level: "A",
    title: "Focus Order",
    description: "Focus order preserves meaning and operability",
    component: "widget.js, chat-window",
    status: "pass",
    notes: "On open: focus moves to iframe. On close: focus returns to trigger button (state.focusedBeforeOpen). Tab order follows visual order.",
    automated: false,
  },
  {
    id: "2.4.7",
    criterion: "2.4.7",
    level: "AA",
    title: "Focus Visible",
    description: "Keyboard focus indicator is visible",
    component: "all interactive elements",
    status: "pass",
    notes: "3px solid outline with offset on :focus-visible. Applied to bubble, close button, input, send button, feedback buttons, retry button, source links.",
    automated: true,
  },
  {
    id: "2.5.5",
    criterion: "2.5.5",
    level: "AAA",
    title: "Target Size",
    description: "Touch targets are at least 44x44px",
    component: "all buttons",
    status: "pass",
    notes: "Bubble: 56x56. Send: min-w/h 44px. Feedback: min-w/h 44px. Close: min-w/h 44px. Card links: min-h 44px. Exceeded AA (which has no size requirement) for AAA bonus.",
    automated: false,
  },
  // Understandable
  {
    id: "3.3.1",
    criterion: "3.3.1",
    level: "A",
    title: "Error Identification",
    description: "Input errors are identified and described in text",
    component: "chat-window, message-bubble",
    status: "pass",
    notes: "Failed sends show 'Sorry, something went wrong. Please try again.' with retry button. Connection errors announced via live region.",
    automated: false,
  },
  // Robust
  {
    id: "4.1.2",
    criterion: "4.1.2",
    level: "A",
    title: "Name, Role, Value",
    description: "All UI components have accessible names and roles",
    component: "all interactive elements",
    status: "pass",
    notes: "Bubble: role=button + aria-label + aria-haspopup + aria-expanded. Container: role=dialog + aria-modal + aria-label. Input: aria-label. Buttons: aria-label. Feedback: aria-pressed.",
    automated: true,
  },
  {
    id: "4.1.3",
    criterion: "4.1.3",
    level: "AA",
    title: "Status Messages",
    description: "Status messages are programmatically determinable without focus",
    component: "chat-window, widget.js",
    status: "pass",
    notes: "Live region (role=status, aria-live=polite) announces: widget open/close, proactive messages, typing status, streaming completion, agent connection, errors.",
    automated: false,
  },
];

/**
 * Returns the overall conformance summary.
 */
export function getConformanceSummary() {
  const total = WIDGET_AUDIT_CHECKLIST.length;
  const passed = WIDGET_AUDIT_CHECKLIST.filter((i) => i.status === "pass").length;
  const failed = WIDGET_AUDIT_CHECKLIST.filter((i) => i.status === "fail").length;
  const partial = WIDGET_AUDIT_CHECKLIST.filter((i) => i.status === "partial").length;

  return {
    total,
    passed,
    failed,
    partial,
    conformanceLevel: failed === 0 ? "AA" : "Partial",
    percentage: Math.round((passed / total) * 100),
  };
}
