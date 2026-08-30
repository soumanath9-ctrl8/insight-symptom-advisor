import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, AlertTriangle, Loader2, Stethoscope } from "lucide-react";

import { assessSymptoms, type Assessment } from "@/lib/symptoms.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SymptomScope — Check Your Symptoms with AI" },
      {
        name: "description",
        content:
          "Enter your symptoms and get a ranked disease risk assessment with plain-language explanations, red flags and suggested next steps.",
      },
      { property: "og:title", content: "SymptomScope — Check Your Symptoms with AI" },
      {
        property: "og:description",
        content:
          "Ranked possible conditions, risk levels and clear explanations from the symptoms you describe.",
      },
    ],
  }),
  component: Index,
});

const URGENCY_COPY: Record<Assessment["urgency"], string> = {
  "self-care": "Likely manageable at home",
  "see-a-doctor": "Worth a doctor's visit",
  urgent: "Seek care promptly",
  emergency: "Emergency — get help now",
};

const EXAMPLES = [
  "Dry cough, mild fever and loss of smell for 3 days",
  "Throbbing headache on one side, nausea, light sensitivity",
  "Burning when urinating and lower back ache",
];

function riskClasses(level: "low" | "moderate" | "high") {
  if (level === "high") return { text: "text-risk-high", bg: "bg-risk-high" };
  if (level === "moderate") return { text: "text-risk-moderate", bg: "bg-risk-moderate" };
  return { text: "text-risk-low", bg: "bg-risk-low" };
}

function Index() {
  const [symptoms, setSymptoms] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [duration, setDuration] = useState("");

  const run = useServerFn(assessSymptoms);
  const mutation = useMutation({
    mutationFn: (input: {
      symptoms: string;
      age?: string | undefined;
      sex?: string | undefined;
      duration?: string | undefined;
    }) =>
      run({ data: input }),
  });

  const result = mutation.data;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="size-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              SymptomScope
            </p>
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">
              Describe how you feel, get a reasoned risk check
            </h1>
          </div>
        </header>

        <Card className="border-border/70 shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-2xl font-normal">Your symptoms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="symptoms">What are you experiencing?</Label>
              <Textarea
                id="symptoms"
                rows={5}
                placeholder="e.g. sore throat, fever of 38.5, aching joints since Friday…"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setSymptoms(ex)}
                    className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" value={age} onChange={(e) => setAge(e.target.value)} placeholder="34" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <Input id="sex" value={sex} onChange={(e) => setSex(e.target.value)} placeholder="female" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="3 days"
                />
              </div>
            </div>

            <Button
              size="lg"
              className="w-full"
              disabled={symptoms.trim().length < 3 || mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  symptoms: symptoms.trim(),
                  age: age.trim() || undefined,
                  sex: sex.trim() || undefined,
                  duration: duration.trim() || undefined,
                })
              }
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Analyzing symptoms…
                </>
              ) : (
                <>
                  <Activity className="mr-2 size-4" /> Analyze my symptoms
                </>
              )}
            </Button>

            {mutation.isError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(mutation.error as Error).message || "Something went wrong. Please try again."}
              </p>
            )}
          </CardContent>
        </Card>

        {result && (
          <section className="mt-8 space-y-6">
            <Card className="border-border/70 shadow-soft">
              <CardContent className="space-y-3 pt-6">
                <Badge variant="secondary" className="uppercase tracking-wide">
                  {URGENCY_COPY[result.urgency]}
                </Badge>
                <p className="font-display text-xl leading-snug">{result.summary}</p>
                <p className="text-sm text-muted-foreground">{result.urgencyReason}</p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h2 className="font-display text-2xl">Possible conditions</h2>
              {result.conditions.map((c) => {
                const cls = riskClasses(c.riskLevel);
                return (
                  <Card key={c.name} className="border-border/70 shadow-soft">
                    <CardContent className="space-y-4 pt-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-xl">{c.name}</h3>
                        <span className={`text-sm font-medium capitalize ${cls.text}`}>
                          {c.riskLevel} risk · {Math.round(c.likelihood)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${cls.bg}`}
                          style={{ width: `${Math.min(100, Math.max(0, c.likelihood))}%` }}
                        />
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90">{c.explanation}</p>
                      {c.matchingSymptoms.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {c.matchingSymptoms.map((s) => (
                            <Badge key={s} variant="outline">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                        <strong className="font-medium">Next step:</strong> {c.nextSteps}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {result.redFlags.length > 0 && (
              <Card className="border-destructive/30 bg-destructive/5 shadow-soft">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <AlertTriangle className="size-4" /> Seek immediate care if you notice
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                    {result.redFlags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/70">
              <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
                {result.generalAdvice}
              </CardContent>
            </Card>
          </section>
        )}

        <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
          SymptomScope is an AI assistant for general information only. It is not a diagnosis and
          does not replace a qualified clinician. In an emergency, contact local emergency services.
        </p>
      </div>
    </main>
  );
}
