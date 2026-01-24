import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { Trophy, Plus, Calendar, Target, Users, Award } from "lucide-react";
import { Link, useLocation } from "wouter";
import MobileNav from "@/components/MobileNav";
import { toast } from "sonner";

export default function Challenges() {
  const [, setLocation] = useLocation();

  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"pool" | "open_water" | "both">("both");
  const [objective, setObjective] = useState<"total_distance" | "total_sessions" | "consistency" | "avg_pace" | "total_time" | "longest_session">("total_distance");
  const [duration, setDuration] = useState<"3_days" | "1_week" | "2_weeks" | "1_month">("1_week");
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  const createChallengeMutation = trpc.challenges.create.useMutation({
    onSuccess: () => {
      toast({
        title: "Sfida Creata!",
        description: "La tua sfida è stata creata con successo.",
      });
      setShowCreateForm(false);
      // Reset form
      setName("");
      setDescription("");
      setType("both");
      setObjective("total_distance");
      setDuration("1_week");
      setStartDate(new Date().toISOString().split('T')[0]);
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateChallenge = () => {
    if (!name.trim()) {
      toast({
        title: "Errore",
        description: "Inserisci un nome per la sfida",
        variant: "destructive",
      });
      return;
    }

    createChallengeMutation.mutate({
      name,
      description,
      type,
      objective,
      duration,
      startDate: new Date(startDate).toISOString(),
      badgeName: `${name} Champion`,
      prizeDescription: "Badge epico personalizzato per il vincitore!",
    });
  };

  const objectiveLabels: Record<typeof objective, string> = {
    total_distance: "Distanza Totale (km)",
    total_sessions: "Numero Sessioni",
    consistency: "Giorni Consecutivi",
    avg_pace: "Pace Medio Migliore",
    total_time: "Tempo Totale (ore)",
    longest_session: "Sessione Più Lunga",
  };

  const durationLabels: Record<typeof duration, string> = {
    "3_days": "3 Giorni",
    "1_week": "1 Settimana",
    "2_weeks": "2 Settimane",
    "1_month": "1 Mese",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.15_0.03_250)] via-[oklch(0.12_0.035_250)] to-[oklch(0.10_0.04_250)] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[oklch(0.12_0.035_250_/_0.95)] backdrop-blur-lg border-b border-[oklch(0.30_0.04_250)]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-[oklch(0.82_0.18_85)]" />
            <h1 className="text-xl font-bold text-[oklch(0.95_0.01_220)]">Sfide</h1>
          </div>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Crea Sfida
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Create Challenge Form */}
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="neon-card p-6 space-y-6"
          >
            <h2 className="text-xl font-bold text-[oklch(0.95_0.01_220)] flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crea Nuova Sfida
            </h2>

            {/* Challenge Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[oklch(0.85_0.01_220)]">Nome Sfida</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es: Sfida dei 100km"
                className="bg-[oklch(0.18_0.03_250)] border-[oklch(0.30_0.04_250)] text-[oklch(0.95_0.01_220)]"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-[oklch(0.85_0.01_220)]">Descrizione (opzionale)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Aggiungi una descrizione per la sfida..."
                className="bg-[oklch(0.18_0.03_250)] border-[oklch(0.30_0.04_250)] text-[oklch(0.95_0.01_220)]"
                rows={3}
              />
            </div>

            {/* Challenge Type */}
            <div className="space-y-2">
              <Label className="text-[oklch(0.85_0.01_220)]">Tipo di Sfida</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as typeof type)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pool" id="pool" />
                  <Label htmlFor="pool" className="text-[oklch(0.75_0.01_220)] cursor-pointer">🏊 Solo Piscina</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="open_water" id="open_water" />
                  <Label htmlFor="open_water" className="text-[oklch(0.75_0.01_220)] cursor-pointer">🌊 Solo Acque Libere</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="both" id="both" />
                  <Label htmlFor="both" className="text-[oklch(0.75_0.01_220)] cursor-pointer">🏊🌊 Entrambi</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Objective */}
            <div className="space-y-2">
              <Label htmlFor="objective" className="text-[oklch(0.85_0.01_220)]">Obiettivo</Label>
              <Select value={objective} onValueChange={(v) => setObjective(v as typeof objective)}>
                <SelectTrigger className="bg-[oklch(0.18_0.03_250)] border-[oklch(0.30_0.04_250)] text-[oklch(0.95_0.01_220)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(objectiveLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label htmlFor="duration" className="text-[oklch(0.85_0.01_220)]">Durata</Label>
              <Select value={duration} onValueChange={(v) => setDuration(v as typeof duration)}>
                <SelectTrigger className="bg-[oklch(0.18_0.03_250)] border-[oklch(0.30_0.04_250)] text-[oklch(0.95_0.01_220)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(durationLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-[oklch(0.85_0.01_220)]">Data Inizio</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-[oklch(0.18_0.03_250)] border-[oklch(0.30_0.04_250)] text-[oklch(0.95_0.01_220)]"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleCreateChallenge}
                disabled={createChallengeMutation.isPending}
                className="flex-1 bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] hover:opacity-90"
              >
                {createChallengeMutation.isPending ? "Creazione..." : "Crea Sfida"}
              </Button>
              <Button
                onClick={() => setShowCreateForm(false)}
                variant="outline"
                className="border-[oklch(0.30_0.04_250)] text-[oklch(0.75_0.01_220)]"
              >
                Annulla
              </Button>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        <div className="neon-card p-12 text-center">
          <Trophy className="h-16 w-16 mx-auto mb-4 text-[oklch(0.70_0.18_220)]" />
          <h3 className="text-xl font-bold text-[oklch(0.95_0.01_220)] mb-2">Nessuna Sfida Attiva</h3>
          <p className="text-[oklch(0.60_0.03_220)] mb-6">
            Crea la tua prima sfida e invita altri nuotatori a competere!
          </p>
          {!showCreateForm && (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crea la Tua Prima Sfida
            </Button>
          )}
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
