import {
  VolumeChart,
  ResolutionRateChart,
  TopQuestionsChart,
} from "@/components/dashboard/analytics-charts";
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

export default function AnalyticsPage() {
  const volumeData = generateMockVolumeData();
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

      <TopQuestionsChart data={mockTopQuestions} />
    </div>
  );
}
