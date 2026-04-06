import {
  VolumeChart,
  ResolutionRateChart,
  TopQuestionsChart,
} from "@/components/dashboard/analytics-charts";
import { getSessionContext } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { generateMockVolumeData, mockTopQuestions } from "@/lib/mock/data";

function generateResolutionData() {
  const now = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * 86400000);
    return {
      date: d.toISOString().slice(5, 10),
      rate: Math.floor(Math.random() * 20) + 70,
    };
  });
}

export default async function AnalyticsPage() {
  const ctx = await getSessionContext();
  const useDb = hasDatabase() && !!ctx;

  const [volumeData, topQuestions] = await Promise.all([
    useDb ? queries.getConversationVolume(ctx.tenant.id) : generateMockVolumeData(),
    useDb ? queries.getTopQuestions(ctx.tenant.id) : mockTopQuestions,
  ]);

  // Resolution data is still generated (would need daily aggregation table for real data)
  const resolutionData = generateResolutionData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Insights into your assistant&apos;s performance over time
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VolumeChart data={volumeData} />
        <ResolutionRateChart data={resolutionData} />
      </div>

      <TopQuestionsChart data={topQuestions} />
    </div>
  );
}
