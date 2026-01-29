import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import {
  Waves,
  Clock,
  ChevronLeft,
  Plus,
  Calendar,
  Zap,
  Heart,
  Activity,
  MapPin,
  FileText,
} from "lucide-react";
import { useLocation, Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";

export default function Activities() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [source, setSource] = useState<"all" | "garmin" | "strava" | "manual">("all");
  const [openWater, setOpenWater] = useState<"all" | "pool" | "open">("all");
  const [strokeTypeFilter, setStrokeTypeFilter] = useState<"all" | "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed">("all");
  const [distanceFilter, setDistanceFilter] = useState<"all" | "short" | "medium" | "long">("all");

  // Form state
  const [formData, setFormData] = useState({
    activityDate: new Date().toISOString().split("T")[0],
    distanceMeters: "",
    durationMinutes: "",
    strokeType: "mixed" as const,
    isOpenWater: false,
    location: "",
    notes: "",
    avgHeartRate: "",
  });

  const utils = trpc.useUtils();

  const { data: activities, isLoading } = trpc.activities.list.useQuery(
    {
      limit,
      offset,
      source,
      openWater: openWater === "all" ? undefined : openWater === "open",
      strokeType: strokeTypeFilter === "all" ? undefined : strokeTypeFilter,
      minDistanceMeters:
        distanceFilter === "short" ? 0 :
        distanceFilter === "medium" ? 1000 :
        distanceFilter === "long" ? 3000 : undefined,
      maxDistanceMeters:
        distanceFilter === "short" ? 1000 :
        distanceFilter === "medium" ? 3000 : undefined,
    },
    { enabled: isAuthenticated }
  );

  const createActivity = trpc.activities.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Attività registrata! +${data.xpEarned} XP`);
      utils.activities.list.invalidate();
      utils.profile.get.invalidate();
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Errore nel salvare l'attività");
    },
  });

  // Redirect if not authenticated - use Redirect component instead of setLocation during render
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  const resetForm = () => {
    setFormData({
      activityDate: new Date().toISOString().split("T")[0],
      distanceMeters: "",
      durationMinutes: "",
      strokeType: "mixed",
      isOpenWater: false,
      location: "",
      notes: "",
      avgHeartRate: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const distance = parseInt(formData.distanceMeters);
    const duration = parseInt(formData.durationMinutes) * 60;
    
    if (!distance || distance <= 0) {
      toast.error("Inserisci una distanza valida");
      return;
    }
    if (!duration || duration <= 0) {
      toast.error("Inserisci una durata valida");
      return;
    }

    createActivity.mutate({
      activityDate: formData.activityDate,
      distanceMeters: distance,
      durationSeconds: duration,
      strokeType: formData.strokeType,
      isOpenWater: formData.isOpenWater,
      location: formData.location || undefined,
      notes: formData.notes || undefined,
      avgHeartRate: formData.avgHeartRate ? parseInt(formData.avgHeartRate) : undefined,
    });
  };

  // Format helpers
  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatPace = (seconds: number, meters: number) => {
    if (!meters) return "-";
    const pacePer100m = (seconds / meters) * 100;
    const mins = Math.floor(pacePer100m / 60);
    const secs = Math.round(pacePer100m % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}/100m`;
  };

  const strokeLabels: Record<string, string> = {
    freestyle: "Stile Libero",
    backstroke: "Dorso",
    breaststroke: "Rana",
    butterfly: "Delfino",
    mixed: "Misto",
  };

  return (
    <AppLayout showBubbles={true} bubbleIntensity="low">
    <div className="pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--navy)] to-[var(--navy-light)] text-white">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-semibold text-lg">Attività</h1>
                <p className="text-sm text-white/70">Registro allenamenti</p>
              </div>
            </div>

            {/* Manual activity creation disabled to prevent cheating */}
          </div>
        </div>
      </header>

      {/* Main Content - FORM REMOVED */}
      {false && (
        <form onSubmit={handleSubmit} className="space-y-4 mt-4" style={{display: 'none'}}>
                  {/* Date */}
                  <div className="space-y-2">
                    <Label htmlFor="date">Data</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.activityDate}
                      onChange={(e) => setFormData({ ...formData, activityDate: e.target.value })}
                      required
                    />
                  </div>

                  {/* Distance */}
                  <div className="space-y-2">
                    <Label htmlFor="distance">Distanza (metri)</Label>
                    <Input
                      id="distance"
                      type="number"
                      placeholder="3500"
                      value={formData.distanceMeters}
                      onChange={(e) => setFormData({ ...formData, distanceMeters: e.target.value })}
                      required
                    />
                  </div>

                  {/* Duration */}
                  <div className="space-y-2">
                    <Label htmlFor="duration">Durata (minuti)</Label>
                    <Input
                      id="duration"
                      type="number"
                      placeholder="90"
                      value={formData.durationMinutes}
                      onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                      required
                    />
                  </div>

                  {/* Stroke Type */}
                  <div className="space-y-2">
                    <Label>Stile Principale</Label>
                    <Select
                      value={formData.strokeType}
                      onValueChange={(v: any) => setFormData({ ...formData, strokeType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="freestyle">Stile Libero</SelectItem>
                        <SelectItem value="backstroke">Dorso</SelectItem>
                        <SelectItem value="breaststroke">Rana</SelectItem>
                        <SelectItem value="butterfly">Delfino</SelectItem>
                        <SelectItem value="mixed">Misto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Open Water */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="openwater">Acque Libere</Label>
                    <Switch
                      id="openwater"
                      checked={formData.isOpenWater}
                      onCheckedChange={(v) => setFormData({ ...formData, isOpenWater: v })}
                    />
                  </div>

                  {/* Location (if open water) */}
                  {formData.isOpenWater && (
                    <div className="space-y-2">
                      <Label htmlFor="location">Luogo</Label>
                      <Input
                        id="location"
                        placeholder="Es: Spiaggia di..."
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Heart Rate */}
                  <div className="space-y-2">
                    <Label htmlFor="hr">Frequenza Cardiaca Media (opzionale)</Label>
                    <Input
                      id="hr"
                      type="number"
                      placeholder="135"
                      value={formData.avgHeartRate}
                      onChange={(e) => setFormData({ ...formData, avgHeartRate: e.target.value })}
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Note (opzionale)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Come è andato l'allenamento?"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                    disabled={createActivity.isPending}
                  >
                    {createActivity.isPending ? "Salvataggio..." : "Salva Attività"}
                  </Button>
                </form>
      )}

      <main className="container py-6 space-y-4">
        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Fonte</Label>
            <Select value={source} onValueChange={(v) => setSource(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="garmin">Garmin</SelectItem>
                <SelectItem value="strava">Strava</SelectItem>
                <SelectItem value="manual">Manuale</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={openWater} onValueChange={(v) => setOpenWater(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="pool">Piscina</SelectItem>
                <SelectItem value="open">Acque libere</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Stile</Label>
            <Select value={strokeTypeFilter} onValueChange={(v) => setStrokeTypeFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="freestyle">Stile libero</SelectItem>
                <SelectItem value="backstroke">Dorso</SelectItem>
                <SelectItem value="breaststroke">Rana</SelectItem>
                <SelectItem value="butterfly">Delfino</SelectItem>
                <SelectItem value="mixed">Misto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Distanza</Label>
            <Select value={distanceFilter} onValueChange={(v) => setDistanceFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="short">0 - 1 km</SelectItem>
                <SelectItem value="medium">1 - 3 km</SelectItem>
                <SelectItem value="long">&gt; 3 km</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : activities && activities.length > 0 ? (
          <>
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -30, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card className="overflow-hidden cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        activity.isOpenWater 
                          ? "bg-cyan-500/10" 
                          : "bg-[var(--azure)]/10"
                      }`}>
                        <Waves className={`h-6 w-6 ${
                          activity.isOpenWater ? "text-cyan-500" : "text-[var(--azure)]"
                        }`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-card-foreground">
                              {formatDistance(activity.distanceMeters)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(activity.activityDate)}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-[var(--gold)]">
                              +{activity.xpEarned} XP
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex flex-wrap gap-3 mt-3 text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {formatTime(activity.durationSeconds)}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Activity className="h-4 w-4" />
                            {formatPace(activity.durationSeconds, activity.distanceMeters)}
                          </div>
                          {activity.avgHeartRate && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Heart className="h-4 w-4" />
                              {activity.avgHeartRate} bpm
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                            {strokeLabels[activity.strokeType || "mixed"]}
                          </span>
                          {activity.isOpenWater && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/10 text-cyan-600">
                              Acque Libere
                            </span>
                          )}
                          {activity.location && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {activity.location}
                            </span>
                          )}
                        </div>

                        {/* Notes */}
                        {activity.notes && (
                          <div className="mt-2 p-2 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                            <FileText className="h-3 w-3 inline mr-1" />
                            {activity.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Load More */}
            {activities.length >= limit && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setOffset(offset + limit)}
              >
                Carica altre attività
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Waves className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">Nessuna attività registrata</p>
            <p className="text-sm mt-1">Collega Garmin Connect per sincronizzare le tue attività</p>
            <Link href="/profile">
              <Button className="mt-4 bg-[var(--gold)] hover:bg-[var(--gold-light)] text-[var(--navy)]">
                Vai al Profilo
              </Button>
            </Link>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
    </AppLayout>
  );
}
