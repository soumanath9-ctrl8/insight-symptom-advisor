import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n";
import type { HistoryEntry } from "@/lib/history";

export function SymptomTimeline({
  entries,
  onRemove,
}: {
  entries: HistoryEntry[];
  onRemove: (id: string) => void;
}) {
  const { t } = useLang();

  if (entries.length === 0) {
    return (
      <Card className="border-border/70 shadow-soft">
        <CardContent className="pt-6 text-sm text-muted-foreground">{t.historyEmpty}</CardContent>
      </Card>
    );
  }

  const data = entries.map((e) => ({
    label: new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    severity: e.severity,
  }));

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-soft">
        <CardHeader>
          <CardTitle className="font-display text-xl font-normal">{t.severityOverTime}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                stroke="var(--muted-foreground)"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="severity"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "var(--primary)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-display text-xl">{t.entries}</h3>
        {[...entries].reverse().map((e) => (
          <Card key={e.id} className="border-border/70 shadow-soft">
            <CardContent className="space-y-2 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {new Date(e.date).toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t.urgency[e.urgency]}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(e.id)}
                    aria-label={t.remove}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm">{e.symptoms}</p>
              <p className="text-sm text-muted-foreground">
                {e.topCondition} · {e.severity}/10
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
