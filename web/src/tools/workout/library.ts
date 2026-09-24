// Exercise library — the exercises Ari knows, what muscles they work and how
// much weight one rep moves. Pure (no DOM, no storage). The stats page uses
// it to turn the log into sets / load per muscle group; the week's exercise
// editor picks from it. Stored in the tool settings (`settings.library`, so
// it syncs), merged with the built-ins below by id.
//
// Load per rep:
//   external   — the weight written on the week's exercise ("26kg"), times
//                the number of dumbbells moved at once (two for a dumbbell
//                chest press, one for a one-arm row);
//   bodyweight — a share of the day's bodyweight (a push-up moves about 64 %
//                of it, a squat about 85 %, a pull-up all of it), plus any
//                weight written on the exercise ("2kg" on pistol squats);
//   none       — a hold or a drill without a load (handstand practice).
// The shares are rounded estimates from force-plate studies (Ebben et al.
// 2011 for push-up variants) and segment masses; each entry says so in its
// note, and every number can be edited in Settings → Exercises.

import type { Exercise } from './model.js';

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'core' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

export const MUSCLE_GROUPS: { id: MuscleGroup; label: string }[] = [
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'forearms', label: 'Forearms' },
  { id: 'core', label: 'Core' },
  { id: 'quads', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'calves', label: 'Calves' },
];

export function muscleLabel(id: string): string {
  return MUSCLE_GROUPS.find((m) => m.id === id)?.label ?? id;
}

export type MuscleRole = 'primary' | 'secondary';

export interface MuscleUse {
  group: MuscleGroup;
  role: MuscleRole;
}

export type LoadRule =
  | { kind: 'external'; dumbbells: 1 | 2 }
  | { kind: 'bodyweight'; factor: number }
  | { kind: 'none' };

export interface LibraryExercise {
  /** Stable id (a slug); the week's exercises link to it with `Exercise.lib`. */
  id: string;
  name: string;
  /** Other names this exercise had in the log (matched by slug). */
  aliases?: string[];
  muscles: MuscleUse[];
  load: LoadRule;
  /** Timed holds: seconds of work per set. */
  timedSec?: number;
  /** Default number of sets when added to a week. */
  sets?: number;
  /** The weight last used ("26kg"): written on the exercise when it is added to a week again. */
  weight?: string;
  /** Where the numbers come from, shown in the editor. */
  note?: string;
  /** Shipped with the app (can still be edited; "Restore built-in" brings it back). */
  builtin?: boolean;
}

const P = (group: MuscleGroup): MuscleUse => ({ group, role: 'primary' });
const S = (group: MuscleGroup): MuscleUse => ({ group, role: 'secondary' });
const bw = (factor: number): LoadRule => ({ kind: 'bodyweight', factor });
const ext = (dumbbells: 1 | 2 = 1): LoadRule => ({ kind: 'external', dumbbells });

/**
 * Built-in exercises: everything in Ari's log today plus the bodyweight
 * moves he asked for (2026-09-23). Bodyweight shares are per rep of the whole
 * body, not per limb: a squat and a pistol squat move the same mass, the
 * pistol just puts it on one leg.
 */
export const DEFAULT_LIBRARY: LibraryExercise[] = [
  // ---- what is on the plan now
  {
    id: 'pistol-squats',
    name: 'Pistol Squats',
    aliases: ['Pistol Squats', 'Bench + Swing Pistol Squats', 'Prisoner Pistol Squats'],
    muscles: [P('quads'), P('glutes'), S('hamstrings'), S('core')],
    load: bw(0.85),
    sets: 3,
    note: 'One leg lifts everything above the knee — about 85 % of bodyweight (the shank and foot on the ground are the rest) — plus any dumbbell held. A squat on two legs moves the same mass; the pistol simply loads one leg with all of it.',
    builtin: true,
  },
  {
    id: 'dumbbell-rows',
    name: 'Dumbbell Rows',
    aliases: ['Dumbbell Rows', 'BENCH: (1st set without) Dumbbell Rows', 'NO BENCH: Dumbbell Rows', 'BENCH: Dumbbell Rows'],
    muscles: [P('back'), S('biceps'), S('shoulders')],
    load: ext(1),
    sets: 3,
    note: 'One-arm row: the dumbbell weight per rep (one dumbbell at a time).',
    builtin: true,
  },
  {
    id: 'chest-press',
    name: 'Chest Press',
    aliases: ['Chest Press', '+1 step Chest Press'],
    muscles: [P('chest'), S('triceps'), S('shoulders')],
    load: ext(2),
    sets: 3,
    note: 'Dumbbell press with a dumbbell in each hand: twice the written weight per rep. Set "dumbbells" to 1 if the weight already means both.',
    builtin: true,
  },
  {
    id: 'handstand-practice',
    name: 'Handstand practice',
    aliases: ['1.5min Handstand practice!', '1min Handstand practice!', 'Handstand practice'],
    muscles: [P('shoulders'), S('core'), S('triceps'), S('forearms')],
    load: { kind: 'none' },
    timedSec: 90,
    sets: 3,
    note: 'A timed hold: counts as sets for the muscle groups, no load per rep.',
    builtin: true,
  },
  {
    id: 'bicep-curls',
    name: 'Bicep Curls',
    aliases: ['Bicep Curls', 'Bench Bicep Curls', 'Arn. Bicep Curls', 'Bicep Curl (alternating)'],
    muscles: [P('biceps'), S('forearms')],
    load: ext(1),
    sets: 3,
    note: 'The dumbbell weight per rep (each arm counts its own reps).',
    builtin: true,
  },
  {
    id: 'bent-over-triceps-push-ups',
    name: 'Bent-over triceps push-ups',
    aliases: ['Bent-over triceps push-ups'],
    muscles: [P('triceps'), S('chest'), S('shoulders')],
    load: bw(0.5),
    sets: 3,
    note: 'Hands on a wall, a bench or the floor (x / y / z in the log) — about 30 %, 50 % and 65 % of bodyweight; 50 % is the middle setting.',
    builtin: true,
  },
  // ---- earlier plan entries, so the history lines up
  {
    id: 'triceps-ext',
    name: 'Triceps Extension',
    aliases: ['Triceps Ext.'],
    muscles: [P('triceps')],
    load: ext(1),
    sets: 3,
    note: 'Overhead extension with one dumbbell held in both hands.',
    builtin: true,
  },
  {
    id: 'shoulder-press',
    name: 'Shoulder Press',
    aliases: ['Shoulder Press', 'Norm/Arnold S-Press', 'Arnold S-Press', 'ARNOLD Sh-Press', 'Normal S-Press', 'Norm S-Press'],
    muscles: [P('shoulders'), S('triceps')],
    load: ext(2),
    sets: 3,
    note: 'Dumbbell in each hand: twice the written weight per rep.',
    builtin: true,
  },
  {
    id: 'bulgarian-split-squats',
    name: 'Bulgarian Split Squats',
    aliases: ['Bulg. Split Squats'],
    muscles: [P('quads'), P('glutes'), S('hamstrings')],
    load: bw(0.85),
    sets: 3,
    note: 'Like the pistol: the body above the knee (~85 % of bodyweight) plus the dumbbells written on the exercise.',
    builtin: true,
  },
  {
    id: 'walking-lunges',
    name: 'Walking Lunges',
    aliases: ['Walking Lunges'],
    muscles: [P('quads'), P('glutes'), S('hamstrings')],
    load: bw(0.85),
    sets: 3,
    note: '~85 % of bodyweight per step plus the dumbbells written on the exercise.',
    builtin: true,
  },
  {
    id: 'pike-push-ups',
    name: 'Pike Push-ups',
    aliases: ['Pike Push-ups', 'Handstand/pike push-up.'],
    muscles: [P('shoulders'), P('triceps'), S('chest')],
    load: bw(0.6),
    sets: 3,
    note: 'Hips high, hands below the shoulders: roughly 60 % of bodyweight on the hands (feet elevated ~75 %). Mostly shoulders and triceps; the upper chest helps.',
    builtin: true,
  },
  // ---- bodyweight moves Ari asked for (2026-09-23)
  {
    id: 'squats',
    name: 'Squats',
    aliases: ['Squats', 'Air Squats', 'Bodyweight Squats'],
    muscles: [P('quads'), P('glutes'), S('hamstrings'), S('core')],
    load: bw(0.85),
    sets: 3,
    note: 'Both legs lift everything above the knees: about 85 % of bodyweight per rep (not half — two legs share the same mass). Add a dumbbell as the exercise weight.',
    builtin: true,
  },
  {
    id: 'pull-ups',
    name: 'Pull-ups',
    aliases: ['Pull-ups', 'Pullups'],
    muscles: [P('back'), P('biceps'), S('forearms'), S('shoulders')],
    load: bw(1),
    sets: 3,
    note: 'The whole bodyweight (the hands and forearms that stay put are a few percent, less than a day’s weight swing). Added weight goes on the exercise.',
    builtin: true,
  },
  {
    id: 'chin-ups',
    name: 'Chin-ups',
    aliases: ['Chin-ups', 'Chinups'],
    muscles: [P('biceps'), P('back'), S('forearms')],
    load: bw(1),
    sets: 3,
    note: 'Bodyweight, like the pull-up; the underhand grip puts more on the biceps.',
    builtin: true,
  },
  {
    id: 'dips',
    name: 'Dips',
    aliases: ['Dips', 'Parallel Bar Dips'],
    muscles: [P('chest'), P('triceps'), S('shoulders')],
    load: bw(0.95),
    sets: 3,
    note: 'Nearly the whole bodyweight (~95 %: the forearms on the bars do not travel).',
    builtin: true,
  },
  {
    id: 'push-ups',
    name: 'Push-ups',
    aliases: ['Push-ups', 'Pushups', 'Standard Push-ups'],
    muscles: [P('chest'), P('triceps'), S('shoulders'), S('core')],
    load: bw(0.64),
    sets: 3,
    note: 'Feet on the floor take a share: force plates measure about 64 % of bodyweight at the top and 75 % at the bottom of a standard push-up (Ebben et al. 2011); 64 % is the usual figure.',
    builtin: true,
  },
  {
    id: 'wide-grip-push-ups',
    name: 'Wide-grip Push-ups',
    aliases: ['Wide Push-ups', 'Wide-grip Push-ups'],
    muscles: [P('chest'), S('triceps'), S('shoulders')],
    load: bw(0.64),
    sets: 3,
    note: 'Same load as a standard push-up (~64 % of bodyweight); the wide hands shift work from the triceps to the chest.',
    builtin: true,
  },
  {
    id: 'close-grip-push-ups',
    name: 'Close-grip Push-ups',
    aliases: ['Diamond Push-ups', 'Close Push-ups', 'Close-grip Push-ups', 'Narrow Push-ups'],
    muscles: [P('triceps'), P('chest'), S('shoulders')],
    load: bw(0.64),
    sets: 3,
    note: 'Same ~64 % of bodyweight; hands together put the triceps first.',
    builtin: true,
  },
  {
    id: 'knee-push-ups',
    name: 'Knee Push-ups',
    aliases: ['Knee Push-ups', 'Kneeling Push-ups'],
    muscles: [P('chest'), S('triceps'), S('shoulders')],
    load: bw(0.49),
    sets: 3,
    note: 'About 49 % of bodyweight (Ebben et al. 2011).',
    builtin: true,
  },
  {
    id: 'incline-push-ups',
    name: 'Incline Push-ups',
    aliases: ['Incline Push-ups', 'Hands-elevated Push-ups', 'Bench Push-ups'],
    muscles: [P('chest'), S('triceps'), S('shoulders')],
    load: bw(0.5),
    sets: 3,
    note: 'Hands on a bench (~60 cm): about 50 % of bodyweight; on a wall it drops towards 30 %.',
    builtin: true,
  },
  {
    id: 'decline-push-ups',
    name: 'Elevated-feet Push-ups',
    aliases: ['Decline Push-ups', 'Elevated Legs Push-ups', 'Elevated-feet Push-ups', 'Feet-elevated Push-ups'],
    muscles: [P('chest'), P('shoulders'), S('triceps'), S('core')],
    load: bw(0.75),
    sets: 3,
    note: 'Feet on a bench (~60 cm): about 75 % of bodyweight (Ebben et al. 2011 measured 74 %); more upper chest and front shoulders than the flat version.',
    builtin: true,
  },
  {
    id: 'handstand-push-ups',
    name: 'Handstand Push-ups',
    aliases: ['Handstand Push-ups', 'HSPU', 'Wall Handstand Push-ups'],
    muscles: [P('shoulders'), P('triceps'), S('back'), S('core')],
    load: bw(0.95),
    sets: 3,
    note: 'Vertical, so nearly the whole bodyweight is pressed (~95 %; the feet resting on the wall carry a little). Shoulders and triceps do the work, the upper back and core hold the line.',
    builtin: true,
  },
];

// ---- Matching ---------------------------------------------------------------------

/** "+1 step Chest Press" → "1-step-chest-press" (the import's exercise ids are made the same way). */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'exercise'
  );
}

/** Stored library merged with the built-ins: edits win, new built-ins are added, deletions stick. */
export function mergeLibrary(stored: LibraryExercise[] | undefined, removed: string[] = []): LibraryExercise[] {
  const out = new Map<string, LibraryExercise>();
  for (const e of DEFAULT_LIBRARY) if (!removed.includes(e.id)) out.set(e.id, e);
  for (const e of stored ?? []) out.set(e.id, { ...out.get(e.id), ...e });
  return [...out.values()];
}

/**
 * The library entry for a week's exercise: its explicit link, else a name
 * match (the exercise's name or id against the entry's id, name and aliases,
 * all as slugs), else none. Renamed exercises in the history ("NO BENCH:
 * Dumbbell Rows") land on the right entry through the aliases.
 */
export function matchLibrary(exercise: Pick<Exercise, 'id' | 'name' | 'lib'>, library: LibraryExercise[]): LibraryExercise | undefined {
  if (exercise.lib) {
    const linked = library.find((e) => e.id === exercise.lib);
    if (linked) return linked;
  }
  const keys = new Set([slug(exercise.name), exercise.id]);
  for (const e of library) {
    if (keys.has(e.id) || keys.has(slug(e.name))) return e;
    if ((e.aliases ?? []).some((a) => keys.has(slug(a)))) return e;
  }
  return undefined;
}

/** Index every exercise id / name in `weeks` to its library entry, once. */
export function libraryIndex(exercises: Pick<Exercise, 'id' | 'name' | 'lib'>[], library: LibraryExercise[]): Map<string, LibraryExercise | undefined> {
  const out = new Map<string, LibraryExercise | undefined>();
  for (const ex of exercises) if (!out.has(ex.id)) out.set(ex.id, matchLibrary(ex, library));
  return out;
}

// ---- Load ---------------------------------------------------------------------------

/**
 * Kilograms one rep moves: the plan weight (or the "(20)" in the cell) for a
 * dumbbell exercise, a share of bodyweight (+ the plan weight) for a
 * bodyweight one. Undefined when nothing is known (no bodyweight logged, no
 * weight written, or a hold).
 */
export function loadPerRep(entry: LibraryExercise | undefined, planWeight: number | undefined, bodyweight: number | undefined, cellWeight?: number): number | undefined {
  const written = cellWeight ?? planWeight;
  if (!entry) return written;
  switch (entry.load.kind) {
    case 'external':
      return written === undefined ? undefined : written * entry.load.dumbbells;
    case 'bodyweight':
      return bodyweight === undefined ? undefined : Math.round((bodyweight * entry.load.factor + (written ?? 0)) * 10) / 10;
    case 'none':
      return undefined;
  }
}

/** How much of a set counts for a muscle group: all of it for a prime mover, half for a helper. */
export function roleWeight(role: MuscleRole): number {
  return role === 'primary' ? 1 : 0.5;
}

/** Short summary for lists: "Chest · Triceps, Shoulders · 64 % BW". */
export function describeEntry(e: LibraryExercise): string {
  const prim = e.muscles.filter((m) => m.role === 'primary').map((m) => muscleLabel(m.group));
  const sec = e.muscles.filter((m) => m.role === 'secondary').map((m) => muscleLabel(m.group));
  const muscles = [prim.join(', '), sec.length ? `+ ${sec.join(', ')}` : ''].filter(Boolean).join(' ');
  const load = e.load.kind === 'external' ? (e.load.dumbbells === 2 ? '2 dumbbells' : 'dumbbell') : e.load.kind === 'bodyweight' ? `${Math.round(e.load.factor * 100)} % of bodyweight` : e.timedSec ? 'timed hold' : 'no load';
  return `${muscles} · ${load}${e.weight ? ` · ${e.weight}` : ''}`;
}

/** The library with `weight` remembered on one entry (the last weight used, for the next time it is added to a week). */
export function withDefaultWeight(library: LibraryExercise[], id: string, weight: string): LibraryExercise[] {
  const w = weight.trim();
  return library.map((e) => {
    if (e.id !== id) return e;
    const { weight: _old, ...rest } = e;
    return w ? { ...rest, weight: w } : rest;
  });
}
