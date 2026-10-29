# Privacy Policy di SwimForge

**Ultimo aggiornamento:** 29 ottobre 2026

---

## In breve

- SwimForge è un servizio per nuotatori: il sito swimforge.it e l'app Android usano lo stesso server. Il titolare del trattamento è **Fabrizio**, persona fisica. Per qualsiasi domanda scrivi a **admin@swimforge.it**.
- Raccogliamo i dati del tuo account e del profilo, le nuotate che importi da Garmin Connect e quello che pubblichi: post, commenti, messaggi e contenuti dei club.
- Frequenza cardiaca, VO2max, recupero e dati simili sono **dati sulla salute**: li importiamo solo se dai il consenso «Trattamento dati salute». Puoi revocarlo quando vuoi.
- Per le analisi automatiche delle nuotate e per il Coach AI inviamo dati di allenamento a **Google Gemini**.
- Non vendiamo i tuoi dati, non mostriamo pubblicità e non usiamo cookie o strumenti di analisi di terze parti.
- Il database è nell'Unione europea, in Svezia, e il server in Italia. Alcuni fornitori, tra cui Google e i servizi che ospitano foto e video, possono trattare dati fuori dall'UE con le garanzie previste dal GDPR.
- Dall'app puoi scaricare i tuoi dati, cambiare i consensi ed eliminare l'account.

---

## 1. Chi è il titolare del trattamento

Il titolare del trattamento è **Fabrizio**, persona fisica, che gestisce SwimForge.

**Email per privacy e assistenza:** admin@swimforge.it

Non è stato nominato un Responsabile della protezione dei dati (DPO).

---

## 2. Quali dati raccogliamo

### 2.1 Account e accesso

- **Registrazione con email:** nome, cognome, email e password. La password è conservata presso Supabase solo in forma cifrata, come hash: nessuno può leggerla.
- **Accesso con Google:** se scegli «Accedi con Google», Google ci comunica il tuo nome, la tua email e un identificativo del tuo account Google.
- **Sessione:** quando accedi apriamo una sessione che dura fino a 30 giorni. Sul sito è il cookie `app_session_id`, nell'app Android un token salvato sul telefono.
- **Date e presenza:** la data di creazione dell'account, quella dell'ultimo accesso e il momento in cui sei stato attivo l'ultima volta. Quest'ultimo serve a mostrare agli altri se sei online.

### 2.2 Profilo

I dati che scegli di inserire: foto del profilo e di copertina, username, biografia, località (testo libero), data di nascita, categoria master, stile e lunghezza della vasca preferiti. Ci sono anche le preferenze (unità di misura, lingua, fuso orario) e le impostazioni di notifica e di privacy.

Dalle tue nuotate calcoliamo livello, XP, badge, record personali e statistiche settimanali. Conserviamo anche gli obiettivi che crei.

### 2.3 Nuotate e dati di allenamento

#### Garmin Connect

Le nuotate arrivano da Garmin Connect, se colleghi il tuo account Garmin. Per ogni nuotata importiamo:

- data, ora e nome dell'attività, distanza, durata, passo, lunghezza della vasca, stile, giri e vasche con i loro tempi, bracciate, SWOLF e frequenza di bracciata;
- frequenza cardiaca media e massima (anche per giro e per vasca), tempo trascorso nelle zone di frequenza cardiaca, frequenza cardiaca a riposo, calorie, VO2max, training effect aerobico e anaerobico, tempo di recupero e stress medio;
- i dati completi dell'attività così come li fornisce Garmin, per esempio suddivisioni, meteo e attrezzatura. Per le nuotate in acque libere possono contenere la **posizione GPS**: il punto di partenza e, se Garmin la fornisce, la traccia del percorso. Li conserviamo insieme all'attività, ma oggi SwimForge non li mostra su una mappa.

**Come funziona il collegamento.** Per collegare Garmin inserisci l'email e la password del tuo account Garmin Connect e, se Garmin lo chiede, il codice di verifica. Le usiamo una sola volta per accedere a Garmin per tuo conto e **non salviamo la password**. Conserviamo invece l'email Garmin e i token di accesso che Garmin rilascia: grazie ai token sincronizziamo le nuotate senza chiederti di nuovo la password. Nel database i token sono cifrati. Sul nostro server ne resta una copia in un'area riservata al solo servizio di sincronizzazione.

SwimForge non è un'app partner ufficiale di Garmin: il collegamento usa l'accesso al tuo account Garmin Connect. I dati del tuo account Garmin restano trattati da Garmin secondo la sua informativa: www.garmin.com/privacy

#### Dati che inserisci tu

- le note alle nuotate;
- il test CSS (tempi sui 400 e sui 200 m, con la data) e le zone di passo che imposti a mano;
- gli obiettivi.

Da questi dati e dalle nuotate calcoliamo metriche come passo soglia (CSS), zone di passo, carico, forma e fatica.

### 2.4 Contenuti social e club

- **Post:** testo, foto, video, hashtag, persone taggate e l'eventuale nuotata collegata. Inoltre commenti, reazioni («splash»), chi segui e chi ti segue, i post che nascondi e le segnalazioni che invii.
- **Messaggi diretti**, compresi i post che inoltri in privato.
- **Club:** iscrizione e ruolo, inviti, eventi (luogo, eventuali coordinate e percorso), partecipazioni, annunci, foto, video e PDF del club, allenamenti del club.
- **Gare e storico del club**, se il club usa queste funzioni: iscrizioni alle gare, tempi di iscrizione e risultati (nome dell'atleta, società, tempi, punteggi). I responsabili del club possono importarli anche da file o da siti pubblici di risultati.
- **Notifiche nell'app** che ricevi.

### 2.5 Coach AI

- **Chat con il coach:** la conversazione resta salvata **solo sul tuo dispositivo** (gli ultimi 20 messaggi, con l'obiettivo e i vincoli che indichi). A ogni messaggio la inviamo al server, che non la conserva e la passa a Google Gemini per ottenere la risposta (vedi la sezione 5).
- **Allenamenti generati, analisi delle singole nuotate e consigli della pagina Coach:** li salviamo nel tuo account.

### 2.6 Notifiche push (app Android)

Se attivi le notifiche salviamo un identificativo del dispositivo (il token di Firebase), la piattaforma e la versione dell'app. Il contenuto delle notifiche passa da Firebase Cloud Messaging di Google: per esempio il nome di chi ti scrive e l'inizio del messaggio.

### 2.7 Dati tecnici, sicurezza e statistiche d'uso

- **Log del server:** per ogni richiesta registriamo data e ora, indirizzo della pagina o funzione richiesta, esito, durata e indirizzo IP. Per gli errori registriamo anche dettagli tecnici.
- **Prova dei consensi:** quando dai o revochi un consenso registriamo la data, la versione del testo, l'indirizzo IP e il tipo di browser o dispositivo (user agent).
- **Protezione dagli abusi:** usiamo l'indirizzo IP per poco tempo, per bloccare i tentativi ripetuti, per esempio di accesso.
- **Accessi:** il servizio di autenticazione di Supabase registra per sicurezza gli eventi di accesso, come login e recupero della password.
- **Statistiche d'uso interne:** registriamo nel nostro database alcuni eventi legati al tuo account. Per esempio: post creato o visto, nuotata sincronizzata, record personale visto o condiviso, profilo di un altro utente aperto, allenamento del club aperto o completato. Ci servono a capire quali funzioni vengono usate. Non usiamo Google Analytics né altri servizi di analisi esterni.

---

## 3. Perché usiamo i dati e su quale base giuridica

- **Fornirti il servizio:** account e accesso, profilo, importazione delle nuotate, statistiche, badge, sfide, classifiche, feed, messaggi, club, notifiche. La base è l'**esecuzione del contratto**, cioè i Termini di Servizio che accetti alla registrazione (art. 6.1.b GDPR).
- **Dati sulla salute e analisi con l'IA che li usano:** il tuo **consenso esplicito** (art. 9.2.a e 6.1.a GDPR). Vedi le sezioni 4 e 5.
- **Comunicazioni promozionali:** il tuo **consenso** (art. 6.1.a GDPR). Oggi non ne inviamo; se lo faremo, le riceverà solo chi ha dato il consenso.
- **Sicurezza, protezione dagli abusi, log, prova dei consensi, gestione delle segnalazioni e statistiche d'uso interne:** il nostro **legittimo interesse** a proteggere il servizio e chi lo usa e a migliorarlo (art. 6.1.f GDPR). Puoi opporti (sezione 10).
- **Obblighi di legge**, per esempio le richieste di un'autorità (art. 6.1.c GDPR).

---

## 4. Dati sulla salute e consenso

In **Impostazioni > Privacy > Consensi GDPR** trovi due consensi: «Trattamento dati salute» e «Sincronizzazione Garmin». Senza entrambi SwimForge non collega il tuo account Garmin e non importa nuotate. Il consenso «Trattamento dati salute» copre anche le analisi automatiche descritte nella sezione 5, che usano questi dati.

**Revoca.** Puoi revocare i consensi in qualsiasi momento dallo stesso menu. Dalla revoca SwimForge smette di importare nuove nuotate da Garmin. La revoca non cancella le nuotate già importate e non le esclude dalle analisi. Se vuoi che non vengano più usate, elimina l'account o scrivici: le cancelliamo. La revoca non rende illecito quanto fatto prima.

**Dati sulla salute che scrivi tu.** Nelle note o nella chat con il coach potresti scrivere dati sulla tua salute, per esempio un dolore o un infortunio. Li usiamo solo per risponderti: inserisci solo quello che serve.

---

## 5. Intelligenza artificiale: cosa inviamo a Google Gemini

### 5.1 Analisi della singola nuotata (automatica)

Dopo l'importazione SwimForge invia a Gemini i dati della nuotata: distanza, tempi, passo, stile, frequenza cardiaca media e massima, SWOLF, bracciate, training effect, VO2max e dati per giro. Invia anche una parte dei dati grezzi ricevuti da Garmin, che possono contenere il nome del tuo profilo Garmin e, per le nuotate all'aperto, le coordinate di partenza. Il risultato (titolo, sintesi e consigli) resta salvato nel tuo account.

### 5.2 Chat con il coach

Quando scrivi al coach inviamo a Gemini:

- gli ultimi messaggi della conversazione, con l'obiettivo e i vincoli che hai indicato;
- livello e statistiche generali;
- le ultime nuotate (data, distanza, durata, passo, SWOLF);
- metriche come passo soglia, zone, carico, forma e fatica;
- le ultime analisi delle sessioni.

Non inviamo nome, email o data di nascita.

### 5.3 Allenamenti generati

Inviamo statistiche riassuntive delle tue nuotate, compresa la distribuzione del tempo nelle zone di frequenza cardiaca.

### 5.4 Consigli della pagina Coach

Inviamo le tue metriche di nuoto: volumi, passo soglia, zone, carico, forma e fatica. I consigli ottenuti restano salvati nel tuo account finché non vengono sostituiti da quelli nuovi.

### 5.5 Funzioni dei club

Gli allenamenti del club e i contenuti automatici (frasi e immagini motivazionali) partono dalle indicazioni dei responsabili del club, senza dati personali degli iscritti. Il proprietario di un club può far generare logo e copertina a OpenAI. In quel caso inviamo nome, motto, descrizione e colore del club e il testo che il proprietario scrive.

### 5.6 Cosa fa Google con questi dati

Google tratta questi dati come nostro fornitore, per generare la risposta, secondo i termini dell'API Gemini. Le risposte dell'IA sono indicazioni di allenamento e non sostituiscono un medico o un allenatore. Non prendiamo decisioni automatiche che abbiano effetti giuridici o effetti simili su di te.

---

## 6. Chi può vedere i tuoi dati

- **Altri utenti registrati:** il tuo profilo (nome, username, foto, copertina, biografia, località, livello, XP, numero di follower e di persone seguite). Puoi rendere il profilo non pubblico da **Impostazioni > Privacy**.
- **Feed:** i post che pubblichi. Se condividi una nuotata, gli altri ne vedono distanza, durata, data, stile, tipo (vasca o acque libere), calorie, frequenza cardiaca media e SWOLF. Vicino al tuo nome può comparire il tuo club e l'indicazione «online».
- **Classifiche:** nome, foto, livello e XP sono visibili a tutti gli utenti. Per essere escluso dalle classifiche scrivici.
- **Club:** iscritti e responsabili vedono i contenuti del club; i responsabili gestiscono iscrizioni ed eventi.
- **Messaggi diretti:** il destinatario. I messaggi non hanno la cifratura end-to-end.
- **Foto, video e PDF** caricati hanno un indirizzo web diretto: chi ha il link può aprirli anche senza account.
- **Il titolare**, come amministratore, può accedere ai dati per far funzionare il servizio, per l'assistenza e per gestire le segnalazioni.
- **Autorità:** solo se la legge lo richiede.

---

## 7. Fornitori e dove si trovano i dati

Questi fornitori trattano i dati per nostro conto e solo per le finalità indicate:

- **Oracle Cloud Infrastructure:** il server che esegue l'applicazione, il servizio di sincronizzazione con Garmin (con i token Garmin) e i log. Si trova in Italia, nell'area di Milano.
- **Supabase:** database, autenticazione (account, password cifrate, accesso con Google, email di conferma e di recupero della password) e archivio file di riserva. Si trova nell'Unione europea, a Stoccolma (Svezia).
- **Upstash:** cache (Redis) con copie temporanee di profili, statistiche, elenchi di attività e classifiche, che scadono da sole entro 24 ore.
- **ImageKit:** conserva e distribuisce le foto (post, profilo, club) e i PDF dei club.
- **Cloudinary:** conserva e distribuisce i video e, se ImageKit non risponde, anche le foto.
- **Google:** Gemini API (intelligenza artificiale, sezione 5), Firebase Cloud Messaging (notifiche push) e «Accedi con Google».
- **OpenAI:** solo per logo e copertina dei club generati con l'IA (sezione 5).
- **Resend:** invia l'email che conferma l'eliminazione dell'account.
- **Rollbar:** raccoglie gli errori tecnici del server, che possono contenere dettagli della richiesta.

Altri servizi esterni:

- **OpenStreetMap** (OpenStreetMap Foundation, Regno Unito): mappe e ricerca degli indirizzi negli eventi dei club. Il tuo dispositivo scarica le mappe direttamente da OpenStreetMap, che riceve il tuo indirizzo IP e l'indirizzo che cerchi.
- **Open-Meteo:** previsioni meteo per gli eventi dei club. Riceve solo le coordinate dell'evento.
- **Anteprime dei link:** quando un post contiene un link, il nostro server scarica titolo e immagine della pagina. Il sito esterno vede il nostro server, non te.
- **Garmin** non è un nostro fornitore ma la fonte dei dati che scegli di collegare. Tratta i dati del tuo account Garmin in autonomia.

---

## 8. Trasferimenti fuori dall'Unione europea

Il database (Supabase, Svezia) e il server (Oracle, Italia) sono nell'Unione europea. Google, OpenAI, Cloudinary, Upstash, Resend, Rollbar e Supabase sono società con sede negli Stati Uniti; ImageKit ha sede in India. Questi fornitori possono trattare dati anche fuori dallo Spazio economico europeo, per esempio per erogare il servizio o per l'assistenza tecnica.

In questi casi il trasferimento avviene, ove applicabile, sulla base della decisione di adeguatezza sul quadro UE-USA per la protezione dei dati (EU-US Data Privacy Framework), per le società certificate, oppure delle clausole contrattuali standard approvate dalla Commissione europea. Il Regno Unito, dove ha sede OpenStreetMap Foundation, è coperto da una decisione di adeguatezza.

---

## 9. Per quanto tempo conserviamo i dati

- **In generale:** finché il tuo account esiste. Profilo, nuotate, post, commenti e dati dei club non hanno una scadenza automatica.
- **Messaggi diretti:** cancellati automaticamente dopo 60 giorni.
- **Notifiche nell'app:** cancellate automaticamente dopo 90 giorni.
- **Post:** puoi eliminare un tuo post entro 24 ore dalla pubblicazione. Il post sparisce dall'app ma resta nascosto nel database fino all'eliminazione dell'account. Per i post più vecchi e per i commenti scrivici.
- **Cache:** copie temporanee che scadono da sole entro 24 ore.
- **Chat con il coach:** resta sul tuo dispositivo finché non la cancelli dall'app o non cancelli i dati del browser o dell'app.
- **Log del server:** restano sul server per un periodo limitato. Non hanno una scadenza fissa: vengono cancellati quando il servizio viene aggiornato a una nuova versione.
- **Registro dei consensi:** finché esiste l'account.
- **Garmin:** se scolleghi Garmin da **Impostazioni > Connessioni**, cancelliamo i token dal database e dal server. Le nuotate già importate restano nel tuo account.

### Eliminazione dell'account

Puoi eliminare l'account da **Impostazioni > Privacy > Dati e account > Elimina account**. Cancelliamo subito:

- account, profilo e accesso;
- nuotate, con giri e vasche;
- post, commenti, reazioni, chi segui e chi ti segue;
- messaggi diretti, sia inviati sia ricevuti, e notifiche;
- iscrizioni ai club, contenuti dei club che hai pubblicato e i club che hai creato;
- badge, XP, record, statistiche e obiettivi;
- analisi e allenamenti generati dall'IA;
- token Garmin nel database, consensi e token per le notifiche push.

Se il servizio email è attivo, ti mandiamo un'email di conferma.

Alcune cose oggi non vengono cancellate in automatico:

- foto, video e PDF che hai caricato restano sui server di ImageKit, Cloudinary o Supabase, anche se l'app non li mostra più. Scrivici e li cancelliamo;
- la copia dei token Garmin sul server del servizio di sincronizzazione. Prima di eliminare l'account scollega Garmin, oppure scrivici;
- gli eventi delle statistiche d'uso interne restano con il solo numero dell'account cancellato, senza nome né email;
- le copie di sicurezza (backup) del database gestite da Supabase, se presenti, che si sovrascrivono a rotazione.

---

## 10. I tuoi diritti e come esercitarli

Il GDPR ti riconosce questi diritti: accesso ai dati, rettifica, cancellazione, limitazione del trattamento, portabilità, opposizione al trattamento basato sul legittimo interesse e revoca del consenso in qualsiasi momento.

Nell'app puoi:

- **scaricare i tuoi dati:** **Impostazioni > Privacy > Dati e account > Esporta i dati**. Ottieni un file JSON con account, profilo, nuotate (compresi i dati ricevuti da Garmin), post, commenti, splash, follower, badge, XP, record, statistiche, obiettivi, notifiche, messaggi diretti, iscrizioni ai club, segnalazioni, post nascosti e consensi. Per una copia completa, per esempio con i dettagli dei giri, le analisi dell'IA e i dati dei club, scrivici;
- **correggere i dati del profilo:** **Impostazioni > Profilo**;
- **dare o revocare i consensi:** **Impostazioni > Privacy > Consensi GDPR**. Termini di Servizio e Privacy Policy sono necessari per usare SwimForge;
- **scegliere chi vede cosa:** **Impostazioni > Privacy** (profilo pubblico, inoltri privati);
- **gestire le notifiche:** **Impostazioni > Notifiche** e le impostazioni del telefono;
- **scollegare Garmin:** **Impostazioni > Connessioni**;
- **uscire da tutti i dispositivi** ed **eliminare l'account:** **Impostazioni > Privacy > Dati e account**.

Per tutto il resto scrivi a **admin@swimforge.it**. Rispondiamo entro un mese.

Se ritieni che il trattamento dei tuoi dati violi il GDPR, puoi presentare un reclamo al **Garante per la protezione dei dati personali**, Piazza Venezia 11, 00187 Roma, www.garanteprivacy.it, o all'autorità di controllo del Paese UE in cui vivi o lavori.

---

## 11. Sicurezza

- Le connessioni tra il tuo dispositivo e SwimForge sono cifrate (HTTPS).
- Le password sono conservate solo come hash. I token Garmin nel database sono cifrati (AES-256), e la copia sul server è accessibile solo al servizio di sincronizzazione.
- Il cookie di sessione non è leggibile dagli script della pagina. Le richieste sono protette contro gli attacchi CSRF e contro i tentativi ripetuti.
- Solo il titolare ha accesso amministrativo ai sistemi.

Nessun sistema è sicuro al 100%: usa una password robusta e diversa da quella degli altri servizi. In caso di violazione dei dati informeremo il Garante e, se previsto dalla legge, anche te.

---

## 12. Minori

SwimForge non è destinato a chi ha meno di **14 anni**, come previsto dai Termini di Servizio. L'app oggi non verifica l'età. Se scopri che un minore di 14 anni ci ha fornito dati, scrivici e li cancelliamo.

---

## 13. Cookie e memoria del dispositivo

SwimForge usa solo cookie tecnici (`app_session_id` per la sessione, `csrf_token` per la sicurezza) e la memoria locale del browser o dell'app: l'accesso di Supabase, il tema, le preferenze, la scelta sui cookie e la chat con il coach. Non usiamo cookie di profilazione né cookie di terze parti.

Quando l'app mostra mappe, foto o video, il tuo dispositivo li scarica dai server di OpenStreetMap, ImageKit, Cloudinary o Supabase, che ricevono il tuo indirizzo IP. I dettagli sono nella Cookie Policy, alla pagina /cookies.

---

## 14. Modifiche a questa informativa

Se cambiamo questa informativa aggiorniamo la data in alto e, per le modifiche importanti, ti avvisiamo nell'app. Se una modifica riguarda un trattamento basato sul consenso, ti chiediamo un nuovo consenso.

---

## 15. Contatti

**Titolare del trattamento:** Fabrizio

**Email:** admin@swimforge.it
