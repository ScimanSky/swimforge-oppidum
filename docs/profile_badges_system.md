# Sistema Badge Profilo Basati su Livelli XP

## Livelli e Soglie XP

| Livello | Nome | XP Richiesto | Colore Badge | Descrizione |
|---------|------|--------------|--------------|-------------|
| 1 | Novizio | 0 - 499 | Grigio | Appena iniziato il viaggio |
| 2 | Principiante | 500 - 1499 | Verde | Sta prendendo confidenza |
| 3 | Intermedio | 1500 - 3499 | Blu | Nuotatore regolare |
| 4 | Avanzato | 3500 - 6999 | Viola | Nuotatore esperto |
| 5 | Esperto | 7000 - 11999 | Arancione | Nuotatore molto esperto |
| 6 | Maestro | 12000 - 19999 | Rosso | Nuotatore di alto livello |
| 7 | Leggenda | 20000+ | Oro | Nuotatore leggendario |

## Implementazione Tecnica

### 1. Tabella Database
```sql
CREATE TABLE profile_badges (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  min_xp INTEGER NOT NULL,
  max_xp INTEGER,
  badge_image_url TEXT NOT NULL,
  color VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Campo user_profile_badge_id
Aggiungere a `swimmer_profiles`:
```sql
ALTER TABLE swimmer_profiles 
ADD COLUMN profile_badge_id INTEGER REFERENCES profile_badges(id);
```

### 3. Funzione Calcolo Livello
```typescript
function calculateProfileBadgeLevel(totalXP: number): number {
  if (totalXP >= 20000) return 7; // Leggenda
  if (totalXP >= 12000) return 6; // Maestro
  if (totalXP >= 7000) return 5; // Esperto
  if (totalXP >= 3500) return 4; // Avanzato
  if (totalXP >= 1500) return 3; // Intermedio
  if (totalXP >= 500) return 2; // Principiante
  return 1; // Novizio
}
```

### 4. Auto-Update Badge Profilo
- Dopo ogni assegnazione badge achievement
- Dopo ogni sync Garmin
- Quando l'XP totale cambia

## Design Badge

Ogni badge profilo avrà:
- **Forma**: Scudo/Emblema circolare
- **Icona centrale**: Onda stilizzata con numero livello
- **Colore**: Gradiente basato sul livello
- **Dimensioni**: 128x128px (per avatar), 512x512px (alta risoluzione)

## UI Integration

### Dove Mostrare il Badge Profilo

1. **Leaderboard Sfide**: Al posto del segnaposto attuale
2. **Pagina Profilo**: Sotto il nome utente
3. **Dashboard**: Nella sezione profilo
4. **Classifica Globale**: Accanto al nome

### Formato Display

```
[Badge Profilo] Username
              Livello 3 - Intermedio
              3,250 XP
```
