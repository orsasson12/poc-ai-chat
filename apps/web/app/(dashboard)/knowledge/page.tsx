import { KnowledgeUpload } from "@/components/dashboard/knowledge-upload";
import { KnowledgeTable } from "@/components/dashboard/knowledge-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockKnowledgeItems } from "@/lib/mock/data";

export default function KnowledgePage() {
  const totalChunks = mockKnowledgeItems.reduce(
    (sum, item) => sum + item.chunkCount,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <p className="text-muted-foreground">
          Manage the content your assistant uses to answer questions
        </p>
      </div>

      <KnowledgeUpload />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Knowledge Items</CardTitle>
            <div className="text-sm text-muted-foreground">
              {mockKnowledgeItems.length} items &middot; {totalChunks} chunks
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <KnowledgeTable items={mockKnowledgeItems} />
        </CardContent>
      </Card>
    </div>
  );
}
