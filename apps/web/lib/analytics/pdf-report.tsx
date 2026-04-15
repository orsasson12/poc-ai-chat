import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { AnalyticsOverview } from "./types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#6B7280" },
  savings: {
    marginTop: 12,
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  savingsLabel: { fontSize: 10, color: "#6B7280", textTransform: "uppercase" },
  savingsAmount: { fontSize: 28, fontWeight: 700, marginTop: 4, color: "#2563EB" },
  savingsSub: { marginTop: 4, fontSize: 10, color: "#6B7280" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 8,
  },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  kpiCell: {
    width: "33.33%",
    paddingRight: 6,
    paddingBottom: 10,
  },
  kpiLabel: { fontSize: 9, color: "#6B7280" },
  kpiValue: { fontSize: 16, fontWeight: 700, marginTop: 2 },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
  },
  listText: { flex: 1, paddingRight: 8 },
  listCount: { color: "#6B7280", fontSize: 10 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 9,
    color: "#9CA3AF",
    textAlign: "center",
  },
});

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

interface ReportProps {
  overview: AnalyticsOverview;
  businessName: string;
  generatedAt: string;
}

export function AnalyticsReport({
  overview,
  businessName,
  generatedAt,
}: ReportProps) {
  const { kpis, savings, topQuestions, trends } = overview;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>BizAssist Analytics Report</Text>
          <Text style={styles.subtitle}>
            {businessName} — {overview.range.startDate} to {overview.range.endDate}
          </Text>
        </View>

        <View style={styles.savings}>
          <Text style={styles.savingsLabel}>{savings.rangeLabel}</Text>
          <Text style={styles.savingsAmount}>
            BizAssist saved you {formatCurrency(savings.totalSavedCents)}
          </Text>
          <Text style={styles.savingsSub}>
            {savings.deflectedCount.toLocaleString()} conversations handled
            without a human agent ·{" "}
            {formatCurrency(savings.costPerTicketCents)}/ticket assumption
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Key Metrics</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Total conversations</Text>
            <Text style={styles.kpiValue}>{kpis.totalConversations.toLocaleString()}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Resolution rate</Text>
            <Text style={styles.kpiValue}>{Math.round(kpis.resolutionRate * 100)}%</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Avg confidence</Text>
            <Text style={styles.kpiValue}>{Math.round(kpis.avgConfidence * 100)}%</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>CSAT score</Text>
            <Text style={styles.kpiValue}>{Math.round(kpis.csatScore * 100)}%</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Avg response time</Text>
            <Text style={styles.kpiValue}>{(kpis.avgResponseMs / 1000).toFixed(1)}s</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Avg messages / conv</Text>
            <Text style={styles.kpiValue}>{kpis.avgMessagesPerConv.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Top Questions</Text>
        <View>
          {topQuestions.length === 0 ? (
            <Text style={{ fontSize: 10, color: "#6B7280" }}>No data for this period.</Text>
          ) : (
            topQuestions.map((q, i) => (
              <View key={`q-${i}`} style={styles.listRow}>
                <Text style={styles.listText}>
                  {i + 1}. {q.question}
                </Text>
                <Text style={styles.listCount}>{q.count}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Conversation length</Text>
        <View>
          {trends.lengthHistogram.map((b, i) => (
            <View key={`b-${i}`} style={styles.listRow}>
              <Text style={styles.listText}>{b.bucket} messages</Text>
              <Text style={styles.listCount}>{b.count}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated {generatedAt} by BizAssist · Open gaps: {overview.openGapCount}
        </Text>
      </Page>
    </Document>
  );
}
