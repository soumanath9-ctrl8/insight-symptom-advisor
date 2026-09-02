import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity, HeartPulse, ShieldCheck, Stethoscope } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SymptomScope — Calm AI Symptom Check & Risk Insight" },
      {
        name: "description",
        content:
          "Describe your symptoms, answer a few doctor-style follow-up questions, and get a calm, calibrated risk assessment with self-care guidance in English or Bengali.",
      },
      { property: "og:title", content: "SymptomScope — Calm AI Symptom Check & Risk Insight" },
      {
        property: "og:description",
        content:
          "Adaptive follow-up questions, calibrated risk levels, explainable results, symptom history and a doctor-ready report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Stethoscope,
    title: "Doctor-style questions",
    body: "A few adaptive follow-up questions before any assessment — no snap judgements.",
  },
  {
    icon: Activity,
    title: "Calibrated risk, explained",
    body: "Plain-language likelihoods with a clear 'why this risk level' for every condition.",
  },
  {
    icon: HeartPulse,
    title: "Track how you improve",
    body: "Each check is saved to your account so you can see risk rise or fall over time.",
  },
  {
    icon: ShieldCheck,
    title: "Private to you",
    body: "Your history is tied to your verified account and visible only to you.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/checker", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/checker", replace: true });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (

    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <header className="mb-10 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="size-5" />
          </span>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SymptomScope</p>
        </header>

        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          A calm, careful read on your symptoms
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Describe what you feel, answer a few follow-up questions, and get a calibrated risk
          insight with safe self-care guidance — in English or Bengali. Not a diagnosis.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Sign in to start a check</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/auth">Create an account</Link>
          </Button>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="border-border/70 shadow-soft">
              <CardContent className="space-y-2 p-5">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-display text-lg">{title}</h2>
                <p className="text-sm text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          SymptomScope offers general information only and is not a substitute for professional
          medical advice. In an emergency, call your local emergency number.
        </p>
      </div>
    </main>
  );
}
