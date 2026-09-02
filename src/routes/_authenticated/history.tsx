import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { LangContext, useLang, type Lang } from "@/lib/i18n";
import type { HistoryEntry } from "@/lib/history";
import { deleteCheck, listChecks } from "@/lib/history.functions";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SymptomTimeline } from "@/components/SymptomTimeline";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Symptom History — SymptomScope" },
      {
        name: "description",
        content:
          "Review your saved symptom checks and see how your AI-assessed risk percentage has changed over time.",
      },
      { property: "og:title", content: "Symptom History — SymptomScope" },
      {
        property: "og:description",
        content: "Your private timeline of AI-assessed symptom risk across past checks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryRoute,
});

function HistoryRoute() {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <HistoryBody />
    </LangContext.Provider>
  );
}

function HistoryBody() {
  const { t } = useLang();
  const listFn = useServerFn(listChecks);
  const deleteFn = useServerFn(deleteCheck);
  const queryClient = useQueryClient();

  const historyQuery = useQuery({ queryKey: ["checks"], queryFn: () => listFn({}) });
  const history: HistoryEntry[] = historyQuery.data ?? [];

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checks"] }),
  });

  return (
    <main className="min-h-screen bg-background">
      <ProfileMenu />
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-10 sm:py-16">
        <Button asChild variant="ghost" size="sm">
          <Link to="/checker">
            <ArrowLeft className="mr-2 size-4" /> {t.tabCheck}
          </Link>
        </Button>
        <h1 className="font-display text-3xl">{t.historyTitle}</h1>
        <SymptomTimeline entries={history} onRemove={(id) => removeMutation.mutate(id)} />
      </div>
    </main>
  );
}
