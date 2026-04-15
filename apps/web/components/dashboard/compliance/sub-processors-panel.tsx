import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SUB_PROCESSORS } from "@/lib/compliance/sub-processors";
import { ExternalLink } from "lucide-react";

export function SubProcessorsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authorized sub-processors</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            The following third parties process data on your behalf as part of
            delivering BizAssist. Referenced in the Data Processing Agreement.
          </p>
          <p className="text-xs text-muted-foreground">
            Transfers: entries marked{" "}
            <Badge variant="secondary" className="mx-1">
              EU available
            </Badge>
            can be pinned to an EU region. Entries marked{" "}
            <Badge variant="outline" className="mx-1">
              Cross-border transfer
            </Badge>
            involve transit of personal data outside the EU, covered by
            Standard Contractual Clauses.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SUB_PROCESSORS.map((sp) => (
          <Card key={sp.id}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-2 text-base">
                <span>{sp.name}</span>
                {sp.euResidency === "eu" ? (
                  <Badge variant="secondary">EU available</Badge>
                ) : (
                  <Badge variant="outline">Cross-border transfer</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">{sp.purpose}</p>
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Location:</strong> {sp.location}
              </div>
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Data categories:</strong>
                <ul className="mt-1 list-disc pl-4">
                  {sp.dataCategories.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <a
                href={sp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {sp.url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
