export { detectEscalation, getDefaultEscalationRules } from "./detect";
export type { EscalationRule, ConversationSignals, DetectionResult } from "./detect";
export { buildEscalationContext } from "./context";
export { sendEscalationEmail } from "./email";
export { isWithinBusinessHours, getNextOpenTime } from "./business-hours";
export type { BusinessHoursConfig } from "./business-hours";
export { deliverWebhook, formatSlackPayload, formatZendeskPayload, formatHubSpotPayload } from "./webhook";
export type { WebhookPayload } from "./webhook";
