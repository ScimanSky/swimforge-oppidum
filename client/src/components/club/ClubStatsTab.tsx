/**
 * Club Stats Tab - Statistiche aggregate del club
 */

import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { TrendingUp, Droplet, Clock, Award } from "lucide-react";

interface ClubStatsTabProps {
  clubId: number;
}

export default function ClubStatsTab({ clubId }: ClubStatsTabProps) {
  // TODO: Implementare API per statistiche aggregate
  
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-2">Statistiche Club</h2>
        <p className="text-muted-foreground">
          Performance collettiva del club
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Surface>
          <SurfaceHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <SurfaceTitle className="text-sm font-medium">Distanza Totale</SurfaceTitle>
            <Droplet className="h-4 w-4 text-muted-foreground" />
          </SurfaceHeader>
          <SurfaceContent>
            <div className="text-2xl font-bold">12,450 km</div>
            <p className="text-xs text-muted-foreground">
              +20% rispetto al mese scorso
            </p>
          </SurfaceContent>
        </Surface>

        <Surface>
          <SurfaceHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <SurfaceTitle className="text-sm font-medium">Tempo Totale</SurfaceTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </SurfaceHeader>
          <SurfaceContent>
            <div className="text-2xl font-bold">1,234 ore</div>
            <p className="text-xs text-muted-foreground">
              +15% rispetto al mese scorso
            </p>
          </SurfaceContent>
        </Surface>

        <Surface>
          <SurfaceHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <SurfaceTitle className="text-sm font-medium">Allenamenti</SurfaceTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </SurfaceHeader>
          <SurfaceContent>
            <div className="text-2xl font-bold">856</div>
            <p className="text-xs text-muted-foreground">
              Questo mese
            </p>
          </SurfaceContent>
        </Surface>

        <Surface>
          <SurfaceHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <SurfaceTitle className="text-sm font-medium">Badge Guadagnati</SurfaceTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </SurfaceHeader>
          <SurfaceContent>
            <div className="text-2xl font-bold">47</div>
            <p className="text-xs text-muted-foreground">
              Collettivamente
            </p>
          </SurfaceContent>
        </Surface>
      </div>

      <Surface>
        <SurfaceContent className="p-8 text-center">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Statistiche dettagliate in arrivo...
          </p>
        </SurfaceContent>
      </Surface>
    </div>
  );
}
