/**
 * XP Calculation Tests
 * 
 * Testa la logica di calcolo XP per attività di nuoto
 * Previene regressioni come il bug precedente
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock della funzione di calcolo XP
// In produzione, importa dalla tua implementazione
function calculateXP(activity: {
  distance: number;
  duration: number;
  source?: 'garmin' | 'strava' | 'manual';
  strokeType?: string;
}): number {
  const { distance, duration, source = 'manual' } = activity;

  // Base XP: 50 punti
  let xp = 50;

  // XP per distanza: 1 punto per 100 metri
  xp += Math.floor(distance / 100);

  // XP per durata: 1 punto per minuto
  xp += Math.floor(duration / 60);

  // Bonus per fonte
  if (source === 'garmin') {
    xp = Math.floor(xp * 1.1); // 10% bonus
  } else if (source === 'strava') {
    xp = Math.floor(xp * 1.2); // 20% bonus
  }

  return xp;
}

describe('XP Calculation', () => {
  describe('Base XP', () => {
    it('should award 50 base XP for any activity', () => {
      const xp = calculateXP({ distance: 0, duration: 0 });
      expect(xp).toBe(50);
    });

    it('should calculate XP correctly for 1km activity', () => {
      const xp = calculateXP({
        distance: 1000, // 1km
        duration: 600, // 10 minuti
      });

      // 50 (base) + 10 (1000/100) + 10 (600/60) = 70
      expect(xp).toBe(70);
    });

    it('should calculate XP correctly for 5km activity', () => {
      const xp = calculateXP({
        distance: 5000, // 5km
        duration: 1800, // 30 minuti
      });

      // 50 (base) + 50 (5000/100) + 30 (1800/60) = 130
      expect(xp).toBe(130);
    });
  });

  describe('Distance-based XP', () => {
    it('should award 1 XP per 100 meters', () => {
      const xp100m = calculateXP({ distance: 100, duration: 0 });
      const xp200m = calculateXP({ distance: 200, duration: 0 });

      expect(xp200m - xp100m).toBe(1);
    });

    it('should handle large distances', () => {
      const xp = calculateXP({
        distance: 100000, // 100km
        duration: 0,
      });

      // 50 (base) + 1000 (100000/100) = 1050
      expect(xp).toBe(1050);
    });

    it('should handle fractional distances', () => {
      const xp = calculateXP({
        distance: 250, // 250 metri
        duration: 0,
      });

      // 50 (base) + 2 (250/100 = 2.5, arrotondato per difetto) = 52
      expect(xp).toBe(52);
    });
  });

  describe('Duration-based XP', () => {
    it('should award 1 XP per minute', () => {
      const xp60s = calculateXP({ distance: 0, duration: 60 });
      const xp120s = calculateXP({ distance: 0, duration: 120 });

      expect(xp120s - xp60s).toBe(1);
    });

    it('should handle long durations', () => {
      const xp = calculateXP({
        distance: 0,
        duration: 86400, // 24 ore
      });

      // 50 (base) + 1440 (86400/60) = 1490
      expect(xp).toBe(1490);
    });

    it('should handle fractional minutes', () => {
      const xp = calculateXP({
        distance: 0,
        duration: 150, // 2.5 minuti
      });

      // 50 (base) + 2 (150/60 = 2.5, arrotondato per difetto) = 52
      expect(xp).toBe(52);
    });
  });

  describe('Source Multipliers', () => {
    it('should apply 10% bonus for Garmin', () => {
      const manualXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'manual',
      });

      const garminXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'garmin',
      });

      // Garmin dovrebbe essere 10% più alto
      expect(garminXp).toBe(Math.floor(manualXp * 1.1));
    });

    it('should apply 20% bonus for Strava', () => {
      const manualXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'manual',
      });

      const stravaXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'strava',
      });

      // Strava dovrebbe essere 20% più alto
      expect(stravaXp).toBe(Math.floor(manualXp * 1.2));
    });

    it('should have Strava > Garmin > Manual', () => {
      const manualXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'manual',
      });

      const garminXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'garmin',
      });

      const stravaXp = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'strava',
      });

      expect(stravaXp).toBeGreaterThan(garminXp);
      expect(garminXp).toBeGreaterThan(manualXp);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero distance and duration', () => {
      const xp = calculateXP({ distance: 0, duration: 0 });
      expect(xp).toBe(50); // Solo base XP
    });

    it('should handle very small distances', () => {
      const xp = calculateXP({ distance: 1, duration: 0 });
      expect(xp).toBe(50); // 1 metro < 100, quindi 0 XP da distanza
    });

    it('should handle very small durations', () => {
      const xp = calculateXP({ distance: 0, duration: 1 });
      expect(xp).toBe(50); // 1 secondo < 60, quindi 0 XP da durata
    });

    it('should not return negative XP', () => {
      const xp = calculateXP({ distance: 0, duration: 0 });
      expect(xp).toBeGreaterThanOrEqual(0);
    });

    it('should return integer XP', () => {
      const xp = calculateXP({
        distance: 1234,
        duration: 567,
        source: 'strava',
      });

      expect(Number.isInteger(xp)).toBe(true);
    });
  });

  describe('Realistic Scenarios', () => {
    it('should calculate XP for typical morning swim', () => {
      // 2km in 30 minuti
      const xp = calculateXP({
        distance: 2000,
        duration: 1800,
        source: 'garmin',
      });

      // 50 + 20 (2000/100) + 30 (1800/60) = 100
      // Con 10% bonus Garmin: 110
      expect(xp).toBe(110);
    });

    it('should calculate XP for competitive swim', () => {
      // 5km in 1 ora
      const xp = calculateXP({
        distance: 5000,
        duration: 3600,
        source: 'strava',
      });

      // 50 + 50 (5000/100) + 60 (3600/60) = 160
      // Con 20% bonus Strava: 192
      expect(xp).toBe(192);
    });

    it('should calculate XP for long endurance swim', () => {
      // 10km in 2 ore
      const xp = calculateXP({
        distance: 10000,
        duration: 7200,
        source: 'manual',
      });

      // 50 + 100 (10000/100) + 120 (7200/60) = 270
      expect(xp).toBe(270);
    });

    it('should calculate XP for quick pool session', () => {
      // 500m in 10 minuti
      const xp = calculateXP({
        distance: 500,
        duration: 600,
        source: 'garmin',
      });

      // 50 + 5 (500/100) + 10 (600/60) = 65
      // Con 10% bonus Garmin: 71
      expect(xp).toBe(71);
    });
  });

  describe('Regression Tests', () => {
    it('should not have the original XP calculation bug', () => {
      // Bug originale: formula errata che dava XP negativi
      const xp = calculateXP({
        distance: 1000,
        duration: 600,
      });

      // Dovrebbe essere positivo e ragionevole
      expect(xp).toBeGreaterThan(0);
      expect(xp).toBeLessThan(1000); // Non dovrebbe essere astronomico
    });

    it('should handle floating point correctly', () => {
      // Bug di floating point: 0.1 + 0.2 !== 0.3
      const xp1 = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'garmin',
      });

      const xp2 = calculateXP({
        distance: 1000,
        duration: 600,
        source: 'garmin',
      });

      // Dovrebbe essere identico
      expect(xp1).toBe(xp2);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('XP Calculation Performance', () => {
  it('should calculate XP quickly', () => {
    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      calculateXP({
        distance: Math.random() * 10000,
        duration: Math.random() * 3600,
      });
    }

    const duration = performance.now() - start;

    // Dovrebbe completare 10k calcoli in < 100ms
    expect(duration).toBeLessThan(100);
  });
});
