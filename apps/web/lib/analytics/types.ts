export interface AnalyticsRange {
  days: number;
  startDate: string; // ISO date
  endDate: string;
}

export interface AnalyticsOverview {
  range: AnalyticsRange;
  kpis: {
    totalConversations: number;
    resolutionRate: number;
    avgConfidence: number;
    csatScore: number;
    avgResponseMs: number;
    deflectedCount: number;
    fallbackRate: number;
    avgMessagesPerConv: number;
  };
  trends: {
    volume: { date: string; count: number }[];
    confidence: { date: string; value: number }[];
    csat: { date: string; positive: number; neutral: number; negative: number }[];
    lengthHistogram: { bucket: string; count: number }[];
  };
  savings: {
    deflectedCount: number;
    costPerTicketCents: number;
    totalSavedCents: number;
    rangeLabel: string;
  };
  topQuestions: { question: string; count: number }[];
  openGapCount: number;
}

export interface KnowledgeGapSummary {
  id: string;
  label: string;
  questionCount: number;
  avgConfidence: number | null;
  lastSeenAt: string;
  firstSeenAt: string;
  status: "open" | "resolved" | "dismissed";
  representativeQuestion: string;
  suggestedQuestion: string | null;
}

export interface KnowledgeGapDetail extends KnowledgeGapSummary {
  questions: {
    messageId: string;
    text: string;
    conversationId: string;
    createdAt: string;
  }[];
  suggestedAnswer: string | null;
}

export interface QuestionAnalytics {
  top: { question: string; count: number }[];
  trending: {
    question: string;
    count: number;
    previousCount: number;
    changePct: number;
  }[];
  lowConfidence: {
    question: string;
    avgConfidence: number;
    count: number;
  }[];
}

export interface SourceAnalyticsItem {
  id: string;
  title: string;
  type: string;
  usageCount: number;
  avgConfidenceWhenUsed: number | null;
  positiveFeedback: number;
  negativeFeedback: number;
}

export interface SourceAnalytics {
  items: SourceAnalyticsItem[];
}
