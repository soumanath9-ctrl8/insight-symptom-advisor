import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n";
import {
  historyMatchStrength,
  type HistoryEntry,
} from "@/lib/history";

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
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {t.historyEmpty}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {[...entries].reverse().map((entry) => {
        const matchStrength =
          historyMatchStrength(entry);

        return (
          <Card
            key={entry.id}
            className="border-border/70 shadow-soft"
          >
            <CardContent className="space-y-2 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {new Date(entry.date).toLocaleString()}
                </span>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {t.urgency[entry.urgency]}
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
                {entry.symptoms}
              </p>

              <p className="text-sm text-muted-foreground">
                {entry.topCondition} · {matchStrength}%{" "}
                Symptom Match Strength
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}