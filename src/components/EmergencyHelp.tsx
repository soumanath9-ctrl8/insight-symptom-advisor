import { useState } from "react";
import { Ambulance, MapPin, Navigation, Phone, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/lib/i18n";

type Facility = {
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceKm: number;
};

type Status = "idle" | "loading" | "done" | "denied" | "error";

const EMERGENCY_NUMBERS = [
  { label: "Ambulance (India)", number: "108" },
  { label: "National emergency (India)", number: "112" },
];

function distanceKm(a: [number, number], b: [number, number]) {
  const R = 6371;

  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;

  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatFacilityKind(kind: string) {
  switch (kind) {
    case "hospital":
      return "Hospital";
    case "clinic":
      return "Clinic";
    case "doctors":
      return "Doctor / medical facility";
    default:
      return "Healthcare facility";
  }
}

export function EmergencyHelp() {
  const { t } = useLang();

  const [status, setStatus] = useState<Status>("idle");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  async function findNearby() {
    if (!("geolocation" in navigator)) {
      setStatus("denied");
      return;
    }

    setFacilities([]);
    setStatus("loading");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const query = `[out:json][timeout:20];(
            node["amenity"~"hospital|clinic|doctors"](around:8000,${latitude},${longitude});
            way["amenity"~"hospital|clinic|doctors"](around:8000,${latitude},${longitude});
          );out center 30;`;

          const res = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
              method: "POST",
              body: "data=" + encodeURIComponent(query),
            },
          );

          if (!res.ok) {
            throw new Error("Nearby facility search failed");
          }

          const json = (await res.json()) as {
            elements: {
              lat?: number;
              lon?: number;
              center?: {
                lat: number;
                lon: number;
              };
              tags?: Record<string, string>;
            }[];
          };

          const list: Facility[] = json.elements
            .map((el) => {
              const lat = el.lat ?? el.center?.lat;
              const lon = el.lon ?? el.center?.lon;

              if (lat === undefined || lon === undefined) {
                return null;
              }

              return {
                name: el.tags?.["name"] ?? "Unnamed healthcare facility",
                kind: el.tags?.["amenity"] ?? "clinic",
                lat,
                lon,
                distanceKm: distanceKm(
                  [latitude, longitude],
                  [lat, lon],
                ),
              };
            })
            .filter(
              (x): x is Facility => x !== null,
            )
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 5);

          setFacilities(list);
          setStatus("done");
        } catch {
          setFacilities([]);
          setStatus("error");
        }
      },
      () => {
        setFacilities([]);
        setStatus("denied");
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5 shadow-soft">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <Ambulance className="size-4" />
          {t.emergencyTitle}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Primary emergency action */}
        <div className="rounded-xl border border-destructive/20 bg-background/70 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />

            <div className="space-y-1">
              <p className="text-sm font-medium">
                If this may be a medical emergency
              </p>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Call emergency services immediately. Nearby facility search
                is only additional information and should not delay emergency
                care.
              </p>
            </div>
          </div>
        </div>

        {/* Emergency numbers */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {t.ambulance}
          </p>

          <div className="flex flex-wrap gap-2">
            {EMERGENCY_NUMBERS.map((n) => (
              <a
                key={n.number}
                href={`tel:${n.number}`}
                aria-label={`Call ${n.label}, ${n.number}`}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-lg font-semibold text-destructive-foreground"
              >
                <Phone className="size-4" />
                {n.number}

                <span className="text-xs font-normal opacity-80">
                  {n.label}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Privacy / location explanation */}
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Nearby healthcare facilities
              </p>

              <p className="text-xs leading-relaxed text-muted-foreground">
                If you choose to search nearby, your browser will ask for
                location permission. Your location is used only to find
                nearby healthcare facilities and is not saved as part of
                this app's emergency search.
              </p>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Listed places may not all provide emergency services.
                Please confirm availability directly with the facility or
                use 108 / 112 for emergency assistance.
              </p>
            </div>
          </div>
        </div>

        {/* Explicit user-triggered location search */}
        {status !== "done" && (
          <Button
            variant="outline"
            onClick={findNearby}
            disabled={status === "loading"}
            aria-busy={status === "loading"}
          >
            <MapPin className="mr-2 size-4" />

            {status === "loading"
              ? t.locating
              : t.findNearby}
          </Button>
        )}

        {/* Location permission denied */}
        {status === "denied" && (
          <p
            className="text-sm text-destructive"
            role="alert"
          >
            {t.locationDenied}
          </p>
        )}

        {/* Search error */}
        {status === "error" && (
          <div
            className="space-y-2"
            role="alert"
          >
            <p className="text-sm text-destructive">
              We couldn't retrieve nearby healthcare facilities right now.
            </p>

            <p className="text-xs text-muted-foreground">
              Please try again, or use 108 / 112 if this is an emergency.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={findNearby}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Nearby results */}
        {status === "done" && (
          <div
            className="space-y-2"
            aria-live="polite"
          >
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {t.nearbyFacilities}
            </p>

            <p className="text-xs leading-relaxed text-muted-foreground">
              These are nearby healthcare facilities found from the map
              data. Their emergency-care availability is not guaranteed.
            </p>

            {facilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t.noneFound}
              </p>
            ) : (
              <ul className="space-y-2">
                {facilities.map((f) => (
                  <li
                    key={`${f.lat},${f.lon}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2"
                  >
                    <span className="text-sm">
                      <span className="font-medium">
                        {f.name}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        · {formatFacilityKind(f.kind)} ·{" "}
                        {f.distanceKm.toFixed(1)} km
                      </span>
                    </span>

                    <a
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Get directions to ${f.name}`}
                      href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}`}
                    >
                      <Navigation className="size-3.5" />
                      {t.getDirections}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}