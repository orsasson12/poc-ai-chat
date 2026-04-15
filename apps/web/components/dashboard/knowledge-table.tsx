"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Globe,
  MessageSquareText,
  Database,
  Trash2,
  CheckCircle,
  PauseCircle,
  Star,
} from "lucide-react";
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
  const router = useRouter();

  async function handleStatusChange(item: KnowledgeItem, status: "active" | "paused") {
    const res = await fetch("/api/ingest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeItemId: item.id, status }),
    });

    if (res.ok) {
      toast.success(
        status === "active"
          ? `"${item.title}" approved`
          : `"${item.title}" paused`,
      );
      router.refresh();
    } else {
      toast.error("Failed to update status");
    }
  }

  async function handleToggleFeatured(item: KnowledgeItem) {
    const res = await fetch("/api/ingest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeItemId: item.id, featured: !item.featured }),
    });

    if (res.ok) {
      toast.success(
        item.featured
          ? `"${item.title}" removed from featured`
          : `"${item.title}" added to featured`,
      );
      router.refresh();
    } else {
      toast.error("Failed to update featured status");
    }
  }

  async function handleDelete(item: KnowledgeItem) {
    const res = await fetch("/api/ingest", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeItemId: item.id }),
    });

    if (res.ok) {
      toast.success(`"${item.title}" deleted`, {
        description: "The item has been removed from your knowledge base.",
      });
      router.refresh();
    } else {
      toast.error("Failed to delete item");
    }
  }

  function createToggleFeaturedHandler(item: KnowledgeItem) {
    return () => handleToggleFeatured(item);
  }

  function createActivateHandler(item: KnowledgeItem) {
    return () => handleStatusChange(item, "active");
  }

  function createPauseHandler(item: KnowledgeItem) {
    return () => handleStatusChange(item, "paused");
  }

  function createDeleteHandler(item: KnowledgeItem) {
    return () => handleDelete(item);
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
          <TableHead className="w-24" />
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
                {new Date(item.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {item.type === "structured" && item.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={item.featured ? `Remove "${item.title}" from featured` : `Feature "${item.title}"`}
                      onClick={createToggleFeaturedHandler(item)}
                      className={item.featured ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground hover:text-yellow-500"}
                    >
                      <Star className={`size-4 ${item.featured ? "fill-current" : ""}`} />
                    </Button>
                  )}
                  {item.status !== "active" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Approve "${item.title}"`}
                      onClick={createActivateHandler(item)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <CheckCircle className="size-4" />
                    </Button>
                  )}
                  {item.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Pause "${item.title}"`}
                      onClick={createPauseHandler(item)}
                      className="text-amber-600 hover:text-amber-700"
                    >
                      <PauseCircle className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete "${item.title}"`}
                    onClick={createDeleteHandler(item)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
