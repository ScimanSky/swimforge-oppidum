# SwimForge Oppidum - TODO

## Autenticazione e Profilo
- [x] Sistema di autenticazione utenti con Manus OAuth
- [x] Pagina profilo personale con avatar e statistiche
- [x] Gestione impostazioni utente

## Database Schema
- [x] Tabella profili utente estesa (livello, XP, statistiche)
- [x] Tabella attività nuoto
- [x] Tabella definizioni badge
- [x] Tabella badge utente (earned)
- [x] Tabella transazioni XP
- [x] Tabella record personali
- [x] Tabella soglie livelli

## Sistema XP e Livelli
- [x] Calcolo XP per attività (distanza, intensità, costanza)
- [x] Sistema progressione 20 livelli (Novizio → Poseidone)
- [x] Barra progresso XP animata
- [x] Notifiche level-up

## Sistema Badge (40+)
- [x] Badge distanza totale (1km, 10km, 42km, 100km, 250km, 500km, 1000km)
- [x] Badge singola sessione (3km, 4km, 5km, 6km)
- [x] Badge costanza (10, 25, 50, 100, 200, 365 sessioni)
- [ ] Badge settimana perfetta e mese perfetto
- [x] Badge acque libere (battesimo mare, navigatore, esploratore, lupo di mare)
- [x] Badge speciali Oppidum (membro, polpo d'oro)
- [x] Badge milestone temporali (10h, 50h, 100h in acqua)
- [x] Badge livello raggiunto (5, 10, 15, 20)
- [x] Animazioni unlock badge
- [x] Feedback sonoro badge

## Dashboard Mobile-First
- [x] Layout responsive ottimizzato mobile
- [x] Card livello corrente con barra XP
- [x] Griglia badge sbloccati recenti
- [x] Statistiche totali (km, ore, sessioni)
- [x] Quick stats ultima attività

## Bacheca Badge
- [x] Visualizzazione tutti i badge (ottenuti e da sbloccare)
- [x] Filtri per categoria
- [x] Dettaglio requisiti per ogni badge
- [x] Indicatore progresso verso badge
- [x] Animazioni hover/tap

## Classifica Interna
- [x] Leaderboard per livello
- [x] Leaderboard per XP totali
- [x] Leaderboard per numero badge
- [x] Posizione utente corrente evidenziata
- [ ] Filtri temporali (settimana, mese, sempre)

## Registro Attività
- [x] Lista storico attività con paginazione
- [x] Dettaglio singola attività (data, distanza, durata, stile, ritmo, HR)
- [x] Note personali per attività
- [ ] Filtri e ricerca

## Record Personali
- [x] Tracking automatico tempi migliori (100m, 200m, 400m per stile)
- [x] Record sessione più lunga
- [x] Record settimana con più distanza
- [ ] Visualizzazione storico record

## Integrazione Garmin Connect
- [x] OAuth flow per collegamento account Garmin
- [x] Sync automatico attività nuoto
- [x] Parsing dati (distanza, tempo, stile, vasche, SWOLF)
- [x] Gestione token refresh

## UI/UX
- [x] Tema colori Oppidum (blu navy, azzurro, oro)
- [x] Logo Oppidum integrato
- [x] Animazioni fluide (Framer Motion)
- [x] Micro-interazioni feedback
- [ ] Dark mode support

## Bug Fix
- [x] Verificare e correggere dialog login Garmin Connect
- [x] Implementare microservizio Python per Garmin Connect
- [x] Integrare microservizio con backend Node.js
- [x] Test sincronizzazione attività Garmin
- [x] Fix errore React setState durante rendering in Profile (e altri componenti)
- [x] Fix errore Garmin 'str' object has no attribute 'expired' (aggiornato microservizio e messaggi utente)
- [x] Fix errore "Impossibile connettersi a Garmin" (migliorata gestione OAuth1)
- [x] Implementare supporto MFA (codice via email) per Garmin Connect
- [x] Fix errore SQL leaderboard GROUP BY incompatibile con MySQL

## Restyling UI (Dark Gaming Theme)
- [x] Nuovo tema dark con sfondo scuro e colori Oppidum
- [x] Badge con bordi luminosi e effetti glow neon
- [x] Animazioni unlock elaborate con particelle
- [x] Feedback sonoro per badge e level-up
- [x] Card con effetti glassmorphism e bordi luminosi

## Bug Fix UI
- [x] Correggere forma badge da ovale a circolare
- [x] Correggere testo badge troncato/illeggibile

## Icone Badge Personalizzate
- [x] Creare icone SVG per badge Distanza (7 badge)
- [x] Creare icone SVG per badge Sessione (4 badge)
- [x] Creare icone SVG per badge Costanza (6 badge)
- [x] Creare icone SVG per badge Acque Libere (5 badge)
- [x] Creare icone SVG per badge Speciali (2 badge)
- [x] Creare icone SVG per badge Traguardi (7 badge)
- [x] Integrare le nuove icone nella pagina Badge

