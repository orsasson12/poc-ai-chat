import type {
  AnalyticsOverview,
  KnowledgeGapSummary,
  KnowledgeGapDetail,
  QuestionAnalytics,
  SourceAnalytics,
} from "@/lib/analytics/types";

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildVolumeTrend(days: number): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({
      date: daysAgoIso(i),
      count: 20 + Math.round(Math.sin(i / 3) * 8 + Math.random() * 12),
    });
  }
  return out;
}

function buildConfidenceTrend(days: number): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({
      date: daysAgoIso(i),
      value: 0.72 + Math.sin(i / 5) * 0.08 + (Math.random() - 0.5) * 0.04,
    });
  }
  return out;
}

function buildCsatTrend(days: number) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({
      date: daysAgoIso(i),
      positive: 8 + Math.floor(Math.random() * 6),
      neutral: 2 + Math.floor(Math.random() * 3),
      negative: Math.floor(Math.random() * 2),
    });
  }
  return out;
}

export function getMockAnalyticsOverview(days = 30): AnalyticsOverview {
  const volume = buildVolumeTrend(days);
  const totalConversations = volume.reduce((sum, v) => sum + v.count, 0);
  const deflectedCount = Math.round(totalConversations * 0.84);
  const costPerTicketCents = 500;

  return {
    range: {
      days,
      startDate: daysAgoIso(days - 1),
      endDate: daysAgoIso(0),
    },
    kpis: {
      totalConversations,
      resolutionRate: 0.87,
      avgConfidence: 0.76,
      csatScore: 0.82,
      avgResponseMs: 1420,
      deflectedCount,
      fallbackRate: 0.09,
      avgMessagesPerConv: 4.6,
    },
    trends: {
      volume,
      confidence: buildConfidenceTrend(days),
      csat: buildCsatTrend(days),
      lengthHistogram: [
        { bucket: "1-2", count: 42 },
        { bucket: "3-5", count: 168 },
        { bucket: "6-10", count: 91 },
        { bucket: "11-20", count: 23 },
        { bucket: "20+", count: 6 },
      ],
    },
    savings: {
      deflectedCount,
      costPerTicketCents,
      totalSavedCents: deflectedCount * costPerTicketCents,
      rangeLabel: `Last ${days} days`,
    },
    topQuestions: [
      { question: "What are your shipping costs?", count: 47 },
      { question: "Do you ship internationally?", count: 38 },
      { question: "How do I return an item?", count: 29 },
      { question: "What is your return policy?", count: 26 },
      { question: "How long does delivery take?", count: 21 },
      { question: "Do you offer refunds?", count: 18 },
      { question: "Can I change my order?", count: 15 },
      { question: "Do you have a physical store?", count: 12 },
    ],
    openGapCount: 4,
  };
}

export function getMockKnowledgeGaps(): KnowledgeGapSummary[] {
  return [
    {
      id: "gap_mock_1",
      label: "International shipping costs",
      questionCount: 47,
      avgConfidence: 0.31,
      lastSeenAt: daysAgoIso(0),
      firstSeenAt: daysAgoIso(18),
      status: "open",
      representativeQuestion: "How much does shipping to Canada cost?",
      suggestedQuestion: "What are the shipping costs for international orders?",
    },
    {
      id: "gap_mock_2",
      label: "Bulk / wholesale pricing",
      questionCount: 23,
      avgConfidence: 0.22,
      lastSeenAt: daysAgoIso(1),
      firstSeenAt: daysAgoIso(12),
      status: "open",
      representativeQuestion: "Do you offer discounts for orders over 100 units?",
      suggestedQuestion: "Do you offer bulk or wholesale pricing?",
    },
    {
      id: "gap_mock_3",
      label: "Product warranty period",
      questionCount: 17,
      avgConfidence: 0.38,
      lastSeenAt: daysAgoIso(2),
      firstSeenAt: daysAgoIso(20),
      status: "open",
      representativeQuestion: "How long is the warranty on this product?",
      suggestedQuestion: "What is the warranty period for your products?",
    },
    {
      id: "gap_mock_4",
      label: "Gift card redemption",
      questionCount: 9,
      avgConfidence: 0.41,
      lastSeenAt: daysAgoIso(3),
      firstSeenAt: daysAgoIso(14),
      status: "open",
      representativeQuestion: "How do I use a gift card at checkout?",
      suggestedQuestion: "How do I redeem a gift card?",
    },
  ];
}

export function getMockKnowledgeGapDetail(id: string): KnowledgeGapDetail | null {
  const summary = getMockKnowledgeGaps().find((g) => g.id === id);
  if (!summary) return null;

  return {
    ...summary,
    questions: [
      {
        messageId: "msg_mock_a",
        text: "How much is shipping to Canada?",
        conversationId: "conv_mock_1",
        createdAt: daysAgoIso(0),
      },
      {
        messageId: "msg_mock_b",
        text: "What does it cost to ship to Europe?",
        conversationId: "conv_mock_2",
        createdAt: daysAgoIso(1),
      },
      {
        messageId: "msg_mock_c",
        text: "Do you ship internationally and how much?",
        conversationId: "conv_mock_3",
        createdAt: daysAgoIso(2),
      },
    ],
    suggestedAnswer:
      "We ship internationally to over 30 countries. Shipping costs are calculated at checkout based on destination and order weight. Typical rates range from $15-$45 USD.",
  };
}

export function getMockQuestionAnalytics(): QuestionAnalytics {
  return {
    top: [
      { question: "What are your shipping costs?", count: 47 },
      { question: "Do you ship internationally?", count: 38 },
      { question: "How do I return an item?", count: 29 },
      { question: "What is your return policy?", count: 26 },
      { question: "How long does delivery take?", count: 21 },
    ],
    trending: [
      { question: "Do you have a Black Friday sale?", count: 24, previousCount: 3, changePct: 700 },
      { question: "When will you restock item X?", count: 18, previousCount: 5, changePct: 260 },
      { question: "Is there a student discount?", count: 12, previousCount: 4, changePct: 200 },
    ],
    lowConfidence: [
      { question: "How much is shipping to Canada?", avgConfidence: 0.31, count: 14 },
      { question: "Do you offer wholesale pricing?", avgConfidence: 0.22, count: 9 },
      { question: "Warranty period for product X?", avgConfidence: 0.38, count: 7 },
    ],
  };
}

export function getMockSourceAnalytics(): SourceAnalytics {
  return {
    items: [
      {
        id: "ki_mock_1",
        title: "Shipping & Delivery FAQ",
        type: "manual_qa",
        usageCount: 182,
        avgConfidenceWhenUsed: 0.89,
        positiveFeedback: 41,
        negativeFeedback: 3,
      },
      {
        id: "ki_mock_2",
        title: "Return Policy",
        type: "document",
        usageCount: 134,
        avgConfidenceWhenUsed: 0.91,
        positiveFeedback: 28,
        negativeFeedback: 2,
      },
      {
        id: "ki_mock_3",
        title: "Product Catalog",
        type: "structured",
        usageCount: 96,
        avgConfidenceWhenUsed: 0.78,
        positiveFeedback: 19,
        negativeFeedback: 6,
      },
      {
        id: "ki_mock_4",
        title: "About Us",
        type: "url",
        usageCount: 31,
        avgConfidenceWhenUsed: 0.84,
        positiveFeedback: 7,
        negativeFeedback: 1,
      },
    ],
  };
}
