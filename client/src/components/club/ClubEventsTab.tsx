/**
 * Club Events Tab - Calendario eventi e allenamenti
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, Clock, MapPin, Users as UsersIcon, Plus, 
  CheckCircle2, XCircle, Circle, ChevronRight, Edit, Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogTrigger, DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ClubEventsTabProps {
  clubId: number;
  isMember?: boolean;
  isStaff?: boolean;
}

type EventStatus = "going" | "maybe" | "not_going";

type ClubEventRow = {
  id: number;
  title: string;
  description?: string | null;
  eventType: string;
  location?: string | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  maxAttendees?: number | null;
};

type ClubEventsListItem = {
  event: ClubEventRow;
  creator: { id: number; username: string | null; profilePicture: string | null };
  attendeeCount: number;
};

export default function ClubEventsTab({ clubId, isMember, isStaff }: ClubEventsTabProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ClubEventsListItem | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    eventType: "training" as "training" | "race" | "social" | "meeting",
    location: "",
    startTime: "",
    endTime: "",
    maxAttendees: "",
  });

  const utils = trpc.useUtils();

  const eventsQuery = trpc.community.clubs.events.list.useQuery({
    clubId,
    status: "active",
    fromDate: new Date().toISOString(),
    limit: 50,
  });
  const events = (eventsQuery.data ?? []) as unknown as ClubEventsListItem[];

  const createMutation = trpc.community.clubs.events.create.useMutation({
    onSuccess: () => {
      toast.success("Evento creato!");
      setIsCreateOpen(false);
      setNewEvent({
        title: "",
        description: "",
        eventType: "training",
        location: "",
        startTime: "",
        endTime: "",
        maxAttendees: "",
      });
      utils.community.clubs.events.list.invalidate({ clubId });
    },
    onError: (error) => {
      toast.error(error.message || "Errore nella creazione dell'evento");
    },
  });

  const rsvpMutation = trpc.community.clubs.events.rsvp.useMutation({
    onSuccess: () => {
      toast.success("RSVP aggiornato!");
      utils.community.clubs.events.list.invalidate({ clubId });
      if (selectedEvent) {
        utils.community.clubs.events.attendees.invalidate({ eventId: selectedEvent.event.id });
      }
    },
  });

  const attendeesQuery = trpc.community.clubs.events.attendees.useQuery(
    { eventId: selectedEvent?.event.id || 0 },
    { enabled: !!selectedEvent }
  );

  const handleCreateEvent = () => {
    if (!newEvent.title || !newEvent.startTime) {
      toast.error("Titolo e data/ora sono obbligatori");
      return;
    }

    createMutation.mutate({
      clubId,
      title: newEvent.title,
      description: newEvent.description || undefined,
      eventType: newEvent.eventType,
      location: newEvent.location || undefined,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime || undefined,
      maxAttendees: newEvent.maxAttendees ? Number(newEvent.maxAttendees) : undefined,
    });
  };

  const handleRsvp = (eventId: number, status: EventStatus) => {
    rsvpMutation.mutate({ eventId, status });
  };

  const formatDate = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    return date.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    return date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "training":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "race":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "social":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "meeting":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case "training":
        return "Allenamento";
      case "race":
        return "Gara";
      case "social":
        return "Evento Sociale";
      case "meeting":
        return "Riunione";
      default:
        return type;
    }
  };

  if (!isMember) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-2">
            Unisciti al club per vedere gli eventi
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Eventi e Allenamenti</h2>
          <p className="text-muted-foreground">
            {eventsQuery.data?.length || 0} eventi in programma
          </p>
        </div>
        {isStaff && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Crea Evento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Crea Nuovo Evento</DialogTitle>
                <DialogDescription>
                  Organizza allenamenti, gare o eventi sociali per il club
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Titolo *</Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    placeholder="es. Allenamento tecnica crawl"
                  />
                </div>
                <div>
                  <Label htmlFor="eventType">Tipo Evento</Label>
                  <Select
                    value={newEvent.eventType}
                    onValueChange={(value: any) => setNewEvent({ ...newEvent, eventType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="training">Allenamento</SelectItem>
                      <SelectItem value="race">Gara</SelectItem>
                      <SelectItem value="social">Evento Sociale</SelectItem>
                      <SelectItem value="meeting">Riunione</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Descrizione</Label>
                  <Textarea
                    id="description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    placeholder="Dettagli sull'evento..."
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startTime">Data/Ora Inizio *</Label>
                    <Input
                      id="startTime"
                      type="datetime-local"
                      value={newEvent.startTime}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">Data/Ora Fine</Label>
                    <Input
                      id="endTime"
                      type="datetime-local"
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="location">Luogo</Label>
                  <Input
                    id="location"
                    value={newEvent.location}
                    onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                    placeholder="es. Piscina Comunale, Via Roma 1"
                  />
                </div>
                <div>
                  <Label htmlFor="maxAttendees">Numero Massimo Partecipanti</Label>
                  <Input
                    id="maxAttendees"
                    type="number"
                    min="1"
                    value={newEvent.maxAttendees}
                    onChange={(e) => setNewEvent({ ...newEvent, maxAttendees: e.target.value })}
                    placeholder="Lascia vuoto per illimitato"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleCreateEvent} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creazione..." : "Crea Evento"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Events List */}
      {eventsQuery.isLoading ? (
        <Card>
          <CardContent className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </CardContent>
        </Card>
      ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">Nessun evento in programma</p>
            {isStaff && (
              <p className="text-sm text-muted-foreground">
                Crea il primo evento per il club!
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((item, index: number) => {
            const event = item.event;
            const creator = item.creator;
            const attendeeCount = item.attendeeCount || 0;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-lg transition-all cursor-pointer group">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      {/* Date Badge */}
                      <div className="flex-shrink-0">
                        <div className="bg-primary/10 rounded-lg p-3 text-center min-w-[70px]">
                          <div className="text-2xl font-bold text-primary">
                            {new Date(event.startTime).getDate()}
                          </div>
                          <div className="text-xs text-muted-foreground uppercase">
                            {new Date(event.startTime).toLocaleDateString("it-IT", { month: "short" })}
                          </div>
                        </div>
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold mb-1 group-hover:text-primary transition-colors">
                              {event.title}
                            </h3>
                            <Badge className={getEventTypeColor(event.eventType)} variant="outline">
                              {getEventTypeLabel(event.eventType)}
                            </Badge>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>

                        {event.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                            {event.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{formatTime(event.startTime)}</span>
                            {event.endTime && (
                              <span> - {formatTime(event.endTime)}</span>
                            )}
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span className="line-clamp-1">{event.location}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <UsersIcon className="h-4 w-4" />
                            <span>
                              {attendeeCount} partecipant{attendeeCount !== 1 ? "i" : "e"}
                              {event.maxAttendees && ` / ${event.maxAttendees}`}
                            </span>
                          </div>
                        </div>

                        {/* RSVP Buttons */}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRsvp(event.id, "going");
                            }}
                            className="gap-1"
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Partecipo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRsvp(event.id, "maybe");
                            }}
                            className="gap-1"
                          >
                            <Circle className="h-4 w-4 text-yellow-500" />
                            Forse
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRsvp(event.id, "not_going");
                            }}
                            className="gap-1"
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
                            Non partecipo
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(item);
                            }}
                          >
                            Dettagli
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Event Details Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedEvent.event.title}</DialogTitle>
              <DialogDescription>
                {formatDate(selectedEvent.event.startTime)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedEvent.event.description && (
                <div>
                  <h4 className="font-semibold mb-2">Descrizione</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedEvent.event.description}
                  </p>
                </div>
              )}
              {selectedEvent.event.location && (
                <div>
                  <h4 className="font-semibold mb-2">Luogo</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.event.location}
                  </p>
                </div>
              )}
              <div>
                <h4 className="font-semibold mb-3">Partecipanti ({attendeesQuery.data?.filter((a: any) => a.status === "going").length || 0})</h4>
                {attendeesQuery.isLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {attendeesQuery.data
                      ?.filter((a: any) => a.status === "going")
                      .map((attendee: any) => (
                        <div key={attendee.id} className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={attendee.user.profilePicture || undefined} />
                            <AvatarFallback>
                              {attendee.user.username?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{attendee.user.username}</p>
                            {attendee.user.fullName && (
                              <p className="text-xs text-muted-foreground">
                                {attendee.user.fullName}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
