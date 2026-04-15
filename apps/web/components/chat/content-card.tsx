"use client";

import { Fragment } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CardData } from "@bizassist/types";

function formatFieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ContentCard({ data }: { data: CardData }) {
  return (
    <article className="my-2 max-w-[280px]" aria-label={`${data.cardType.replace(/_/g, " ")}: ${data.title}`}>
      <Card size="sm">
        {data.imageUrl && (
          <img
            src={data.imageUrl}
            alt={`Image for ${data.title}`}
            className="h-36 w-full object-cover"
            loading="lazy"
          />
        )}
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{data.title}</CardTitle>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {data.cardType.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {Object.entries(data.fields).map(([key, value]) => (
              <Fragment key={key}>
                <dt className="text-muted-foreground">{formatFieldLabel(key)}</dt>
                <dd className="font-medium">{String(value ?? "\u2014")}</dd>
              </Fragment>
            ))}
          </dl>
        </CardContent>
        {data.sourceUrl && (
          <CardFooter>
            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
              aria-label={`View details for ${data.title} (opens in new tab)`}
            >
              View details
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </CardFooter>
        )}
      </Card>
    </article>
  );
}
