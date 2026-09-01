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
  component: AuthPage;
});

function AuthPage() {
  return null;
}
