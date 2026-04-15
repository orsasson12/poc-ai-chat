"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { AnalyticsOverview } from "@/lib/analytics/types";
import { OverviewTab } from "./overview-tab";
import { GapsTab } from "./gaps-tab";
import { QuestionsTab } from "./questions-tab";
import { SourcesTab } from "./sources-tab";

interface AnalyticsTabsProps {
  overview: AnalyticsOverview;
  assistantId: string | null;
}

export function AnalyticsTabs({ overview, assistantId }: AnalyticsTabsProps) {
  return (
    <Tabs defaultValue="overview" className="flex flex-col gap-6">
      <TabsList className="w-full justify-start overflow-x-auto md:w-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="gaps" className="gap-2">
          Knowledge gaps
          {overview.openGapCount > 0 && (
            <Badge variant="secondary" className="h-5 min-w-[1.25rem] px-1.5">
              {overview.openGapCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="questions">Questions</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-0">
        <OverviewTab overview={overview} />
      </TabsContent>

      <TabsContent value="gaps" className="mt-0">
        <GapsTab assistantId={assistantId} />
      </TabsContent>

      <TabsContent value="questions" className="mt-0">
        <QuestionsTab />
      </TabsContent>

      <TabsContent value="sources" className="mt-0">
        <SourcesTab />
      </TabsContent>
    </Tabs>
  );
}
