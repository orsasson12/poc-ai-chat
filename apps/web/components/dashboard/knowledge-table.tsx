"use client";

import { toast } from "sonner";
import { FileText, Globe, MessageSquareText, Database, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { KnowledgeItem, KnowledgeItemType } from "@bizassist/types";

const typeIcons: Record<KnowledgeItemType, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  url: Globe,
  manual_qa: MessageSquareText,
  structured: Database,
};

const typeLabels: Record<KnowledgeItemType, string> = {
  document: "Document",
  url: "URL",
  manual_qa: "Q&A",
  structured: "Structured",
};

interface KnowledgeTableProps {
  items: KnowledgeItem[];
}

export function KnowledgeTable({ items }: KnowledgeTableProps) {
  function handleDelete(item: KnowledgeItem) {
    toast.success(`"${item.title}" deleted`, {
      description: "The item has been removed from your knowledge base.",
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Chunks</TableHead>
          <TableHead>Added</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const Icon = typeIcons[item.type];
          return (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate max-w-[200px]">
                    {item.title}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {typeLabels[item.type]}
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {item.chunkCount}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.createdAt.toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete "${item.title}"`}
                  onClick={() => handleDelete(item)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
