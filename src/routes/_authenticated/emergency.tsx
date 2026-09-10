import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/emergency")({
  component: EmergencyPage,
});

function EmergencyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/home">
          <Button variant="ghost">
            <ArrowLeft />
            Home
          </Button>
        </Link>

        <Card className="mt-6 border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <PhoneCall className="size-5" />
              Emergency Helpline Numbers
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">
              If someone is unconscious, has severe breathing difficulty,
              severe chest pain, signs of stroke, a seizure, severe bleeding,
              or another life-threatening emergency, seek emergency help
              immediately rather than waiting for an online assessment.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <a href="tel:112">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">
                      National Emergency Number
                    </p>
                    <p className="mt-1 text-3xl font-bold">
                      112
                    </p>
                    <p className="mt-1 text-sm">
                      Call emergency services
                    </p>
                  </CardContent>
                </Card>
              </a>

              <a href="tel:108">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">
                      Ambulance
                    </p>
                    <p className="mt-1 text-3xl font-bold">
                      108
                    </p>
                    <p className="mt-1 text-sm">
                      Call for ambulance assistance
                    </p>
                  </CardContent>
                </Card>
              </a>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <strong>Important:</strong> This page is for emergency contact
              information only. SymptomScope is not an emergency service and
              an online assessment should never delay emergency care.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}