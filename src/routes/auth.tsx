import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Stethoscope } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Patient Sign In — SymptomScope" },
      {
        name: "description",
        content:
          "Sign in or create your SymptomScope patient account to run symptom checks and keep a private history of your AI-assessed risk over time.",
      },
      { property: "og:title", content: "Patient Sign In — SymptomScope" },
      {
        property: "og:description",
        content:
          "Create a SymptomScope patient account with your name, age and sex to track symptom checks securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name: name.trim(), age: age.trim(), sex: sex.trim() },
          },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="size-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              SymptomScope
            </p>
            <h1 className="font-display text-2xl leading-tight">
              {mode === "signin" ? "Welcome back" : "Create your patient account"}
            </h1>
          </div>
        </div>

        <Card className="border-border/70 shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-xl font-normal">
              {mode === "signin" ? "Sign in" : "Sign up"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="age">Age</Label>
                      <Input
                        id="age"
                        required
                        inputMode="numeric"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sex">Sex</Label>
                      <Input
                        id="sex"
                        required
                        value={sex}
                        onChange={(e) => setSex(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                  {notice}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
              >
                {mode === "signin"
                  ? "New patient? Create an account"
                  : "Already have an account? Sign in"}
              </button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
