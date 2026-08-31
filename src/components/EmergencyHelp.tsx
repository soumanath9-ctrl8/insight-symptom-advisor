import { useState } from "react";
import { Ambulance, MapPin, Navigation, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/lib/i18n";

type Facility = { name: string; kind: string; lat: number; lon: number; distanceKm: number };

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
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function EmergencyHelp() {
  const { t } = useLang();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  async function findNearby() {
    if (!("geolocation" in navigator)) {
      setStatus("denied");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const query = `[out:json][timeout:20];(
            node["amenity"~"hospital|clinic|doctors"](around:8000,${latitude},${longitude});
            way["amenity"~"hospital|clinic|doctors"](around:8000,${latitude},${longitude});
          );out center 30;`;
          const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: "data=" + encodeURIComponent(query),
          });
          const json = (await res.json()) as {
            elements: {
              lat?: number;
              lon?: number;
              center?: { lat: number; lon: number };
              tags?: Record<string, string>;
            }[];
          };
          const list: Facility[] = json.elements
            .map((el) => {
              const lat = el.lat ?? el.center?.lat;
              const lon = el.lon ?? el.center?.lon;
              if (lat === undefined || lon === undefined) return null;
              return {
                name: el.tags?.["name"] ?? "Unnamed facility",
                kind: el.tags?.["amenity"] ?? "clinic",
                lat,
                lon,
                distanceKm: distanceKm([latitude, longitude], [lat, lon]),
              };
            })
            .filter((x): x is Facility => x !== null)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 5);
          setFacilities(list);
          setStatus("done");
        } catch {
          setFacilities([]);
          setStatus("done");
        }
      },
      () => setStatus("denied"),
      { timeout: 12000 },
    );
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5 shadow-soft">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <Ambulance className="size-4" /> {t.emergencyTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{t.ambulance}</p>
          <div className="flex flex-wrap gap-2">
            {EMERGENCY_NUMBERS.map((n) => (
              <a
                key={n.number}
                href={`tel:${n.number}`}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-lg font-semibold text-destructive-foreground"
              >
                <Phone className="size-4" /> {n.number}
                <span className="text-xs font-normal opacity-80">{n.label}</span>
              </a>
            ))}
          </div>
        </div>

        {status !== "done" && (
          <Button variant="outline" onClick={findNearby} disabled={status === "loading"}>
            <MapPin className="mr-2 size-4" />
            {status === "loading" ? t.locating : t.findNearby}
          </Button>
        )}

        {status === "denied" && (
          <p className="text-sm text-destructive">{t.locationDenied}</p>
        )}

        {status === "done" && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {t.nearbyFacilities}
            </p>
            {facilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noneFound}</p>
            ) : (
              <ul className="space-y-2">
                {facilities.map((f) => (
                  <li
                    key={`${f.lat},${f.lon}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2"
                  >
                    <span className="text-sm">
                      <span className="font-medium">{f.name}</span>{" "}
                      <span className="text-muted-foreground">
                        · {f.kind} · {f.distanceKm.toFixed(1)} km
                      </span>
                    </span>
                    <a
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}`}
                    >
                      <Navigation className="size-3.5" /> {t.getDirections}
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
