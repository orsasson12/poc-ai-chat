// ---- Enums ----
export type PlanType = "starter" | "professional" | "business";
export type TenantStatus = "active" | "suspended" | "cancelled";
export type KnowledgeItemType = "document" | "url" | "manual_qa" | "structured";
export type KnowledgeItemStatus = "pending" | "processing" | "active" | "error" | "paused";
export type MessageRole = "user" | "assistant";
export type MemberRole = "owner" | "admin" | "manager" | "viewer";
export type SecurityEventType =
  | "prompt_injection"
  | "content_moderation"
  | "pii_detected"
  | "canary_leak"
  | "scope_violation";
export type SecuritySeverity = "low" | "medium" | "high" | "critical";
export type SatisfactionScore = -1 | 0 | 1;
export type WidgetPosition = "bottom-right" | "bottom-left";

// ---- Core Entities ----
export interface Tenant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  plan: PlanType;
  status: TenantStatus;
  stripeCustomerId: string | null;
  createdAt: Date;
}

export interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  greeting: string;
  tone: string;
  fallbackMsg: string;
  escalationEmail: string | null;
  escalationWebhook: string | null;
  widgetColor: string;
  widgetPosition: WidgetPosition;
  isActive: boolean;
  confidenceThreshold: number;
  createdAt: Date;
}

export interface KnowledgeItem {
  id: string;
  tenantId: string;
  assistantId: string;
  type: KnowledgeItemType;
  title: string;
  content: string | null;
  sourceUrl: string | null;
  filePath: string | null;
  fileSize: number | null;
  status: KnowledgeItemStatus;
  chunkCount: number;
  errorMsg: string | null;
  createdAt: Date;
}

export interface Chunk {
  id: string;
  tenantId: string;
  knowledgeItemId: string;
  pineconeId: string;
  content: string;
  tokenCount: number;
  chunkIndex: number;
  heading: string | null;
}

export interface Conversation {
  id: string;
  tenantId: string;
  assistantId: string;
  sessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  messageCount: number;
  escalated: boolean;
  satisfaction: SatisfactionScore;
}

export interface Message {
  id: string;
  conversationId: string;
  tenantId: string;
  role: MessageRole;
  content: string;
  chunksUsed: string[];
  confidence: number | null;
  latencyMs: number | null;
  tokensUsed: number | null;
  isFallback: boolean;
  createdAt: Date;
}

export interface SecurityEvent {
  id: string;
  tenantId: string;
  conversationId: string | null;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  inputText: string;
  classificationScore: number;
  blocked: boolean;
  createdAt: Date;
}

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: MemberRole;
  invitedBy: string | null;
  acceptedAt: Date | null;
}

export interface UsageLog {
  id: string;
  tenantId: string;
  periodStart: Date;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
}

// ---- API Types ----
export interface ChatRequest {
  assistantId: string;
  message: string;
  sessionId: string;
  history?: { role: MessageRole; content: string }[];
}

export interface WidgetConfig {
  name: string;
  greeting: string;
  widgetColor: string;
  widgetPosition: WidgetPosition;
  isActive: boolean;
}

export interface SafetyResult {
  passed: boolean;
  blocked: boolean;
  eventType?: SecurityEventType;
  severity?: SecuritySeverity;
  score?: number;
  cleanedMessage?: string;
}

// ---- Dashboard Types ----
export interface DashboardMetrics {
  conversationsToday: number;
  conversationsWeek: number;
  conversationsMonth: number;
  resolutionRate: number;
  csatScore: number;
  unansweredCount: number;
  healthScore: number;
}

export interface TopQuestion {
  question: string;
  count: number;
}

export interface ConversationVolume {
  date: string;
  count: number;
}
