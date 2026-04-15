"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download } from "lucide-react";

interface SarRequest {
  id: string;
  type: string;
  subjectEmail: string | null;
  subjectIdentifier: string | null;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  errorMsg: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="secondary">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "in_progress":
      return <Badge>In progress</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

export function SarPanel() {
  const [requests, setRequests] = useState<SarRequest[] | null>(null);
  const [email, setEmail] = useState("");
  const [visitorId, setVisitorId] = useState("");
  const [notes, setNotes] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance/sar");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      toast.error("Failed to load SAR history");
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleExport = useCallback(async () => {
    if (!email && !visitorId) {
      toast.error("Provide an email or visitor ID");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/compliance/sar/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          visitorId: visitorId || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bizassist-sar-export-${email || visitorId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready");
      await loadHistory();
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }, [email, visitorId, notes, loadHistory]);

  const handleDelete = useCallback(async () => {
    if (confirm !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    if (!email && !visitorId) {
      toast.error("Provide an email or visitor ID");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/compliance/sar/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          visitorId: visitorId || undefined,
          notes: notes || undefined,
          confirm: "DELETE",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const total =
        (data.counts?.conversations ?? 0) +
        (data.counts?.leads ?? 0) +
        (data.counts?.messages ?? 0);
      toast.success(`Erased ${total} records for ${email || visitorId}`);
      setEmail("");
      setVisitorId("");
      setNotes("");
      setConfirm("");
      await loadHistory();
    } catch {
      toast.error("Deletion failed");
    } finally {
      setDeleting(false);
    }
  }, [email, visitorId, notes, confirm, loadHistory]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">File a subject request</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            File an Article 15 export or Article 17 erasure on behalf of an
            end-customer. Provide an email address, a visitor ID, or both. The
            request is logged under your account.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sar-email">Customer email</Label>
              <Input
                id="sar-email"
                type="email"
                placeholder="customer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sar-visitor">Visitor / session ID</Label>
              <Input
                id="sar-visitor"
                placeholder="v_abc123"
                value={visitorId}
                onChange={(e) => setVisitorId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sar-notes">Notes (internal)</Label>
            <Textarea
              id="sar-notes"
              rows={2}
              maxLength={1000}
              placeholder="Support ticket reference, requester details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {exporting ? "Exporting…" : "Export data (Art. 15)"}
            </Button>
            <div className="flex items-center gap-2">
              <Input
                placeholder='Type DELETE to confirm'
                className="w-44"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || confirm !== "DELETE"}
              >
                {deleting ? "Erasing…" : "Erase data (Art. 17)"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant self-export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Download every row BizAssist stores about your tenant — for your
            own right-of-access against us as the processor.
          </p>
          <a
            href="/api/compliance/tenant-export"
            className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download tenant export (JSON)
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests === null ? (
            <div className="p-6">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No subject requests filed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="capitalize">
                      {r.type.replace("_", " ")}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">
                      {r.subjectEmail ?? r.subjectIdentifier ?? "—"}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.requestedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.completedAt
                        ? new Date(r.completedAt).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
