"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsOverview } from "@/lib/analytics/types";

interface VolumeTrendProps {
  data: AnalyticsOverview["trends"]["volume"];
}

export function VolumeTrendChart({ data }: VolumeTrendProps) {
  const chartData = data.map((d) => ({ date: d.date.slice(5), count: d.count }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Conversation Volume</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.ceil(chartData.length / 8)} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Conversations" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface ConfidenceTrendProps {
  data: AnalyticsOverview["trends"]["confidence"];
}

export function ConfidenceTrendChart({ data }: ConfidenceTrendProps) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    value: Math.round(d.value * 100),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Avg Confidence %</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.ceil(chartData.length / 8)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => [`${v}%`, "Confidence"]}
            />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Confidence" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface CsatTrendProps {
  data: AnalyticsOverview["trends"]["csat"];
}

export function CsatTrendChart({ data }: CsatTrendProps) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    positive: d.positive,
    neutral: d.neutral,
    negative: d.negative,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Customer Satisfaction</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.ceil(chartData.length / 8)} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="positive" stackId="a" fill="hsl(var(--primary))" name="Positive" />
            <Bar dataKey="neutral" stackId="a" fill="hsl(var(--muted-foreground))" name="Neutral" />
            <Bar dataKey="negative" stackId="a" fill="hsl(var(--destructive))" name="Negative" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface LengthHistogramProps {
  data: AnalyticsOverview["trends"]["lengthHistogram"];
}

export function ConversationLengthHistogram({ data }: LengthHistogramProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Conversation Length</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Conversations" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
