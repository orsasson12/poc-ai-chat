import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/dashboard/status-badge";
import { truncate } from "@/lib/utils";
import type { SecurityEvent } from "@bizassist/types";

interface SecurityEventLogProps {
  events: SecurityEvent[];
}

export function SecurityEventLog({ events }: SecurityEventLogProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event Type</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Input Preview</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead>Blocked</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                {event.eventType}
              </code>
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.severity} />
            </TableCell>
            <TableCell className="max-w-[240px] text-sm text-muted-foreground">
              {truncate(event.inputText, 60)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-sm">
              {event.classificationScore.toFixed(2)}
            </TableCell>
            <TableCell>
              {event.blocked ? (
                <Badge variant="destructive" className="text-xs">
                  Blocked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Allowed
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {event.createdAt.toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
