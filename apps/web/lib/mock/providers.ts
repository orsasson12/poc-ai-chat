import {
  mockTenant, mockAssistant, mockKnowledgeItems, mockConversations,
  mockMessages, mockSecurityEvents, mockMetrics, mockTopQuestions,
  generateMockVolumeData, mockTeamMembers, mockUser,
} from "./data";
import type { WidgetConfig, SafetyResult, DashboardMetrics, CardData } from "@bizassist/types";

export function getMockUser() { return mockUser; }
export function getMockTenant() { return mockTenant; }
export function getMockAssistant() { return mockAssistant; }
export function getMockKnowledgeItems() { return mockKnowledgeItems; }
export function getMockConversations() { return mockConversations; }
export function getMockMessages(conversationId: string) { return mockMessages[conversationId] ?? []; }
export function getMockSecurityEvents() { return mockSecurityEvents; }
export function getMockTeamMembers() { return mockTeamMembers; }
export function getMockMetrics(): DashboardMetrics { return mockMetrics; }
export function getMockTopQuestions() { return mockTopQuestions; }
export function getMockVolumeData() { return generateMockVolumeData(); }

export function getMockWidgetConfig(): WidgetConfig {
  return {
    name: mockAssistant.name,
    greeting: mockAssistant.greeting,
    avatarUrl: mockAssistant.avatarUrl,
    widgetColor: mockAssistant.widgetColor,
    widgetPosition: mockAssistant.widgetPosition,
    launcherAnimation: mockAssistant.launcherAnimation,
    launcherAccentColor: mockAssistant.launcherAccentColor,
    launcherAnimationIntervalSec: mockAssistant.launcherAnimationIntervalSec,
    isActive: mockAssistant.isActive,
    suggestedQuestions: [
      "What are your office hours?",
      "What insurance do you accept?",
      "How do I schedule an appointment?",
      "What services do you offer?",
    ],
  };
}

export function mockEmbedding(): number[] {
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}

export function mockSafetyCheck(): SafetyResult {
  return { passed: true, blocked: false, cleanedMessage: undefined };
}

export function getMockCards(): Record<string, CardData> {
  const cards: Record<string, CardData> = {};
  for (const item of mockKnowledgeItems) {
    if (item.type === "structured" && item.metadata) {
      cards[item.id] = {
        knowledgeItemId: item.id,
        title: item.title,
        imageUrl: item.metadata.imageUrl ?? null,
        cardType: item.metadata.cardType,
        fields: item.metadata.fields,
        sourceUrl: item.sourceUrl,
      };
    }
  }
  return cards;
}

export function mockChatResponse(): string {
  const responses = [
    "Our office hours are Monday through Friday, 8 AM to 6 PM, and Saturday 9 AM to 2 PM.",
    "Yes, we accept Delta Dental, Cigna, Aetna, MetLife, and most PPO plans.",
    "You can schedule an appointment by calling (555) 123-4567 or using our online booking form.",
    "We offer general dentistry, cosmetic dentistry, orthodontics, and emergency dental services.",
    "We're located at 123 Smile Street, Suite 100, Springfield, IL 62701.",
    "Great question! Here is information about our teeth whitening service:\n\n[CARD:ki_004]\n\nWould you like to schedule an appointment?",
    "Here is information about one of our dentists:\n\n[CARD:ki_005]\n\nWould you like to know more about our team?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
