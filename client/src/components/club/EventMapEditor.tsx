import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Button } from "@/components/ui/button";
import type { RoutePoint } from "@/lib/club-event-map";

type Mode = "pin" | "route";

interface EventMapEditorProps {
  pin: RoutePoint | null;
  routePoints: RoutePoint[];
  onPinChange: (pin: RoutePoint | null) => void;
  onRouteChange: (points: RoutePoint[]) => void;
  readOnly?: boolean;
  className?: string;
}

const DEFAULT_CENTER: RoutePoint = { lat: 39.2238, lng: 9.1217 };

export default function EventMapEditor({
  pin,
  routePoints,
  onPinChange,
  onRouteChange,
  readOnly = false,
  className,
}: EventMapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>("pin");
  const onPinChangeRef = useRef(onPinChange);
  const onRouteChangeRef = useRef(onRouteChange);
  const readOnlyRef = useRef(readOnly);

  const modeRef = useRef<Mode>(mode);
  const routeRef = useRef<RoutePoint[]>(routePoints);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    routeRef.current = routePoints;
  }, [routePoints]);

  useEffect(() => {
    onPinChangeRef.current = onPinChange;
  }, [onPinChange]);

  useEffect(() => {
    onRouteChangeRef.current = onRouteChange;
  }, [onRouteChange]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  const mapHeightClass = useMemo(() => className ?? "h-64 w-full rounded-xl border border-border/70", [className]);

  useEffect(() => {
    let cancelled = false;

    const initMap = async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerIcon2x,
        iconUrl: markerIcon,
        shadowUrl: markerShadow,
      });

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      LRef.current = L;
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const initial = pin ?? routePoints[0] ?? DEFAULT_CENTER;
      map.setView([initial.lat, initial.lng], pin || routePoints.length > 0 ? 13 : 7);

      map.on("click", (event: any) => {
        if (readOnlyRef.current) return;
        const nextPoint = { lat: event.latlng.lat, lng: event.latlng.lng };
        if (modeRef.current === "pin") {
          onPinChangeRef.current(nextPoint);
          return;
        }
        onRouteChangeRef.current([...routeRef.current, nextPoint]);
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 80);
    };

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      polylineRef.current = null;
      LRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (pin) {
      markerRef.current = L.marker([pin.lat, pin.lng]).addTo(map);
    }

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (routePoints.length >= 2) {
      polylineRef.current = L.polyline(
        routePoints.map((point) => [point.lat, point.lng]),
        {
          color: "#00e5ff",
          weight: 4,
          opacity: 0.9,
        }
      ).addTo(map);
    }

    const boundsPoints: Array<[number, number]> = [];
    if (pin) boundsPoints.push([pin.lat, pin.lng]);
    for (const point of routePoints) boundsPoints.push([point.lat, point.lng]);

    if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 14);
      return;
    }
    if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [28, 28], maxZoom: 15 });
    }
  }, [pin, routePoints]);

  return (
    <div className="space-y-2">
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "pin" ? "neon" : "outline-neon"}
            onClick={() => setMode("pin")}
          >
            Modalita pin
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "route" ? "neon" : "outline-neon"}
            onClick={() => setMode("route")}
          >
            Disegna percorso
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline-neon"
            onClick={() => onRouteChange(routePoints.slice(0, -1))}
            disabled={routePoints.length === 0}
          >
            Annulla ultimo punto
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRouteChange([])}
            disabled={routePoints.length === 0}
          >
            Cancella percorso
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onPinChange(null)}
            disabled={!pin}
          >
            Rimuovi pin
          </Button>
        </div>
      ) : null}

      <div ref={containerRef} className={mapHeightClass} />
    </div>
  );
}
