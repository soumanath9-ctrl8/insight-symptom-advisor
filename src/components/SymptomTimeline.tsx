import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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

  /*
   * =========================================================
   * EMPTY STATE
   * =========================================================
   *
   * This component is intentionally a saved-check list only.
   *
   * It must NOT render:
   *
   * - Health Condition Trend graph
   * - Symptom Match Strength graph
   * - AI Assessed Risk Over Time graph
   *
   * Those visualizations belong to the parent history page.
   */

  if (entries.length === 0) {
    return (
      <Card className="border-border/70 shadow-soft">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {t.historyEmpty}
        </CardContent>
      </Card>
    );
  }

  /*
   * =========================================================
   * SAVED CHECK LIST
   * =========================================================
   *
   * Newest entries are shown first.
   */

  return (
    <div className="space-y-3">
      {[...entries]
        .reverse()
        .map((entry) => {
          const urgencyLabel =
            t.urgency[entry.urgency];

          return (
            <Card
              key={entry.id}
              className="border-border/70 shadow-soft"
            >
              <CardContent className="space-y-2 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {formatHistoryDate(
                      entry.date,
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {urgencyLabel}
                    </Badge>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onRemove(entry.id)
                      }
                      aria-label={t.remove}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm">
                  {entry.symptoms ||
                    "Symptom check"}
                </p>

                {entry.topCondition && (
                  <p className="text-sm text-muted-foreground">
                    {entry.topCondition}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

/*
 * =========================================================
 * DATE FORMATTER
 * =========================================================
 */

function formatHistoryDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}