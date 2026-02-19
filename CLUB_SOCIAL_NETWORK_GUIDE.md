# 🏊 SwimForge Club Social Network - Guida Completa

## 📋 Panoramica

Il sistema Club di SwimForge è stato trasformato in un **social network completo e strutturato** orientato al nuoto (piscina e acque libere). Questa guida descrive tutte le nuove funzionalità implementate.

---

## 🎯 Nuove Funzionalità Principali

### 1. **Eventi e Allenamenti Club** 📅

**Cosa puoi fare:**
- Creare eventi di diversi tipi: Allenamenti, Gare, Eventi Sociali, Riunioni
- Specificare luogo, data/ora, numero massimo partecipanti
- RSVP con tre stati: "Partecipo", "Forse", "Non partecipo"
- Vedere chi partecipa agli eventi
- Eventi ricorrenti (supporto backend pronto)

**Come usarlo:**
1. Vai nella pagina di un club
2. Clicca sul tab "Eventi"
3. (Se sei moderator/admin) Clicca "Crea Evento"
4. Compila i dettagli e pubblica
5. Gli utenti possono fare RSVP e vedere i partecipanti

**API Disponibili:**
```typescript
// Crea evento
trpc.community.clubs.events.create.useMutation()

// Lista eventi
trpc.community.clubs.events.list.useQuery({ clubId, status, fromDate, toDate })

// RSVP evento
trpc.community.clubs.events.rsvp.useMutation({ eventId, status })

// Vedi partecipanti
trpc.community.clubs.events.attendees.useQuery({ eventId })
```

---

### 2. **Galleria Multimediale** 🖼️

**Cosa puoi fare:**
- Caricare foto e video del club
- Aggiungere didascalie alle immagini
- Collegare media ad eventi specifici
- Navigare la galleria in una grid visuale

**Come usarlo:**
1. Tab "Galleria" nella pagina club
2. Clicca "Carica Media"
3. Inserisci URL del media e didascalia
4. Il media appare nella galleria condivisa

**API Disponibili:**
```typescript
// Upload media
trpc.community.clubs.media.upload.useMutation()

// Lista media
trpc.community.clubs.media.list.useQuery({ clubId, mediaType, eventId })

// Elimina media
trpc.community.clubs.media.delete.useMutation({ mediaId })
```

---

### 3. **Annunci Club** 📢

**Cosa puoi fare:**
- Pubblicare annunci importanti (solo staff)
- Fissare annunci in alto
- Impostare scadenza per annunci temporanei
- Notificare tutti i membri

**Come usarlo:**
1. Tab "Annunci" nella pagina club
2. (Se sei staff) Clicca "Nuovo Annuncio"
3. Scrivi titolo e contenuto
4. Scegli se fissare l'annuncio
5. Pubblica

**API Disponibili:**
```typescript
// Crea annuncio
trpc.community.clubs.announcements.create.useMutation()

// Lista annunci
trpc.community.clubs.announcements.list.useQuery({ clubId })

// Aggiorna/elimina
trpc.community.clubs.announcements.update.useMutation()
trpc.community.clubs.announcements.delete.useMutation()
```

---

### 4. **Messaggi Diretti** 💬

**Cosa puoi fare:**
- Chattare privatamente con altri membri
- Vedere conversazioni recenti
- Indicatore messaggi non letti
- Risposte in tempo reale

**Come usarlo:**
1. Clicca sull'icona messaggio nella navbar
2. Seleziona una conversazione o iniziane una nuova
3. Scrivi e invia messaggi
4. I messaggi vengono segnati come letti automaticamente

**API Disponibili:**
```typescript
// Invia messaggio
trpc.community.messages.send.useMutation({ receiverId, content })

// Conversazione con utente
trpc.community.messages.conversation.useQuery({ otherUserId })

// Conversazioni recenti
trpc.community.messages.recent.useQuery({ limit })

// Segna come letto
trpc.community.messages.markRead.useMutation({ senderId })
```

---

### 5. **Sistema Notifiche** 🔔

**Cosa puoi fare:**
- Ricevere notifiche per:
  - Splash/reazioni ai tuoi post
  - Commenti
  - Nuovi follower
  - Inviti eventi
  - Badge guadagnati
  - Messaggi diretti
- Vedere notifiche non lette con badge
- Segnare tutte come lette
- Navigare direttamente alla risorsa

**Come usarlo:**
1. Clicca sulla campanella nella navbar
2. Vedi tutte le notifiche recenti
3. Clicca su una notifica per aprire il link
4. "Segna tutte come lette" per pulire

**API Disponibili:**
```typescript
// Lista notifiche
trpc.community.notifications.list.useQuery({ limit, onlyUnread })

// Conta non lette
trpc.community.notifications.unreadCount.useQuery()

// Segna come lette
trpc.community.notifications.markRead.useMutation({ notificationIds })
```

---

### 6. **Reazioni Avanzate ai Post** 🎭

**Cosa puoi fare:**
- 5 tipi di reazioni emotive:
  - 💧 **Splash** - Il classico "like" per nuotatori
  - 🔥 **Fire** - Prestazione eccellente
  - 💪 **Strong** - Forza e determinazione
  - 👏 **Clap** - Applauso e incoraggiamento
  - 🌊 **Wave** - Onda di supporto
- Vedere chi ha reagito
- Cambiare la propria reazione
- Rimuovere reazione cliccando di nuovo

**Come usarlo:**
1. Sotto ogni post, clicca sull'icona reazione
2. Si apre il picker con 5 emoji
3. Seleziona la tua reazione
4. Cambia o rimuovi cliccando di nuovo

**API Disponibili:**
```typescript
// Toggle reazione
trpc.community.reactions.toggle.useMutation({ postId, reactionType })

// Lista reazioni post
trpc.community.reactions.list.useQuery({ postId })

// Reazione utente corrente
trpc.community.reactions.userReaction.useQuery({ postId })
```

---

## 🗂️ Struttura Database

### Nuove Tabelle

#### `club_events`
```sql
- id, club_id, creator_id
- title, description, event_type
- location, location_lat, location_lng
- start_time, end_time
- max_attendees, is_recurring, recurring_rule
- cover_image_url, status
- created_at, updated_at
```

#### `event_attendees`
```sql
- id, event_id, user_id
- status (going/maybe/not_going)
- rsvp_at
- UNIQUE(event_id, user_id)
```

#### `direct_messages`
```sql
- id, sender_id, receiver_id
- content
- is_read, read_at
- created_at
```

#### `user_notifications`
```sql
- id, user_id, type
- title, message, link
- reference_id
- is_read, read_at
- created_at
```

#### `club_announcements`
```sql
- id, club_id, author_id
- title, content
- is_pinned, expires_at
- created_at, updated_at
```

#### `club_media`
```sql
- id, club_id, uploader_id
- media_type (image/video)
- media_url, thumbnail_url
- caption, event_id
- created_at
```

#### `post_reactions`
```sql
- id, post_id, user_id
- reaction_type (splash/fire/strong/clap/wave)
- created_at
- UNIQUE(post_id, user_id)
```

---

## 🎨 Componenti UI Creati

### Pagine
- **`ClubDetailEnhanced.tsx`** - Pagina club con tab system

### Componenti Club
- **`ClubEventsTab.tsx`** - Gestione eventi (create, RSVP, lista)
- **`ClubFeedTab.tsx`** - Feed post del club
- **`ClubMembersTab.tsx`** - Lista membri con ruoli
- **`ClubGalleryTab.tsx`** - Galleria foto/video
- **`ClubAnnouncementsTab.tsx`** - Board annunci
- **`ClubStatsTab.tsx`** - Statistiche aggregate (da completare)

### Componenti Globali
- **`NotificationBell.tsx`** - Campanella notifiche con badge
- **`DirectMessages.tsx`** - Chat messaggi diretti
- **`PostReactions.tsx`** - Sistema reazioni avanzate

---

## 🚀 Come Iniziare

### 1. Esegui la Migrazione Database
```bash
# Esegui la migrazione SQL
psql $DATABASE_URL < drizzle/0019_add_social_network_features.sql

# Oppure usa Drizzle Kit
npm run db:migrate
```

### 2. Integra nella Navigazione
Il nuovo `ClubDetailEnhanced.tsx` può sostituire il `ClubDetail.tsx` esistente nel routing:

```typescript
// In App.tsx o routes
<Route path="/community/club/:id" component={ClubDetailEnhanced} />
```

### 3. Notifiche e Messaggi nella Navbar
Già integrati in `app-shell.tsx`:
- Desktop: Sidebar in basso
- Mobile: Header in alto a destra

---

## 🎯 Roadmap Futura

### Features da Completare
- [ ] **Club Stats API** - Statistiche aggregate reali
- [ ] **Training Buddy Matching** - Trova compagni di allenamento
- [ ] **Club Challenges** - Sfide dedicate al club
- [ ] **Virtual Pool Map** - Mappa interattiva piscine
- [ ] **Workout Templates** - Condivisione schede allenamento
- [ ] **Real-time Updates** - WebSocket per notifiche live
- [ ] **Push Notifications** - Web Push API
- [ ] **PWA Support** - Installazione mobile

### Ottimizzazioni
- [ ] Caching Redis per feed e notifiche
- [ ] Lazy loading immagini galleria
- [ ] Infinite scroll feed
- [ ] Ottimizzazione query N+1
- [ ] Rate limiting API

---

## 🔐 Permessi e Sicurezza

### Ruoli Club
- **Owner** - Controllo totale, può eliminare club
- **Admin** - Gestione eventi, annunci, membri
- **Moderator** - Moderazione contenuti, gestione eventi
- **Member** - Accesso base, può partecipare

### Best Practices
- Validazione input con Zod su tutti gli endpoint
- Autenticazione JWT richiesta per tutte le API
- Rate limiting su creazione contenuti
- Sanitizzazione contenuti user-generated
- Controllo permessi su azioni sensibili

---

## 🤝 Contribuire

Per aggiungere nuove features:
1. Aggiungi schema database in `drizzle/schema.ts`
2. Crea migration SQL in `drizzle/`
3. Implementa funzioni DB in `server/db_social_enhanced.ts`
4. Aggiungi routes tRPC in `server/routers.ts`
5. Crea componenti UI in `client/src/components/club/`
6. Testa e documenta

---

## 📞 Supporto

Per domande o problemi:
- Apri una issue su GitHub
- Consulta la documentazione API inline
- Controlla i log per errori specifici

---

**Buon nuoto e buon social networking! 🏊‍♂️🌊**
