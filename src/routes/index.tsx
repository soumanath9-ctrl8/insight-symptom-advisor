import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BrainCircuit,
  Languages,
  LineChart,
  MessageSquareQuote,
  ShieldCheck,
  Siren,
  Stethoscope,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import heroImage from "@/assets/hero-dark.jpg";

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
    icon: BrainCircuit,
    title: "AI-Powered Risk Analysis",
    body: "Calibrated, non-alarmist risk levels drawn from everything you describe — never from one symptom alone.",
  },
  {
    icon: MessageSquareQuote,
    title: "Doctor-Style Follow-Up Questions",
    body: "A few adaptive questions come first, so the assessment is based on context, not a snap judgement.",
  },
  {
    icon: LineChart,
    title: "Track Your Health Over Time",
    body: "Every check is saved to your account and plotted so you can see risk rise or settle.",
  },
  {
    icon: Languages,
    title: "Bilingual Support",
    body: "Describe symptoms and read your results in English or Bengali, switched any time.",
  },
  {
    icon: Siren,
    title: "Emergency Guidance When It Matters",
    body: "For high-risk results, nearest hospitals, clinics and the emergency helpline appear right away.",
  },
];

const STEPS = [
  {
    icon: Stethoscope,
    title: "Describe your symptoms",
    body: "In your own words, in English or Bengali.",
  },
  {
    icon: MessageSquareQuote,
    title: "Answer a few questions",
    body: "Short, doctor-style follow-ups to add context.",
  },
  {
    icon: Activity,
    title: "Get your calibrated read",
    body: "Ranked possibilities, why each risk level, and safe next steps.",
  },
];

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={shown ? "animate-fade-up" : "opacity-0"}
      style={shown ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

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
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImage}
          alt="Soft emerald pulse line on a dark calm background"
          width={1920}
          height={1088}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="hero-veil absolute inset-0" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 sm:py-32">
          <header className="mb-10 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Stethoscope className="size-5" />
            </span>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              SymptomScope
            </p>
          </header>

          <h1 className="font-display text-4xl leading-tight sm:text-6xl">
            Describe how you feel, get a calm, reasoned risk check
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            A few follow-up questions, then a calibrated risk insight with safe self-care guidance —
            in English or Bengali. General guidance, never a diagnosis.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Sign in to start a check</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">Create an account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <Reveal>
          <h2 className="font-display text-3xl sm:text-4xl">Built to keep you calm and informed</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Every part of SymptomScope is designed to explain itself, so you always know why you
            are seeing a result.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 70}>
              <Card className="glow-card h-full border shadow-soft">
                <CardContent className="space-y-3 p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-xl">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-border/60 bg-surface/40">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <Reveal>
            <h2 className="font-display text-3xl sm:text-4xl">How it works</h2>
          </Reveal>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 90}>
                <li className="h-full rounded-2xl border border-border/70 bg-card p-6 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full border border-primary/30 text-sm font-medium text-primary">
                      {i + 1}
                    </span>
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-xl">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* TRUST / DISCLAIMER */}
      <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
        <Reveal>
          <Card className="glow-card border shadow-soft">
            <CardContent className="space-y-4 p-8">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-display text-2xl sm:text-3xl">Not a diagnosis — guidance only</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                SymptomScope offers general health information to help you decide what to do next.
                It does not replace a consultation, examination or test, and it never recommends
                specific medicines or doses. Your checks stay private to your own account. In an
                emergency, call your local emergency number straight away.
              </p>
              <div className="pt-2">
                <Button asChild>
                  <Link to="/auth">Start your first check</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </section>
    </main>
  );
}
