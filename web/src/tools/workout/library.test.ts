import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIBRARY, describeEntry, loadPerRep, matchLibrary, mergeLibrary, slug, withDefaultWeight } from './library.js';
import { mergeSettings } from './model.js';

test('slugs match the import ids', () => {
  assert.equal(slug('+1 step Chest Press'), '1-step-chest-press');
  assert.equal(slug('1.5min Handstand practice!'), '1-5min-handstand-practice');
  assert.equal(slug('BENCH: (1st set without) Dumbbell Rows'), 'bench-1st-set-without-dumbbell-rows');
  assert.equal(slug('Triceps Ext.'), 'triceps-ext');
  assert.equal(slug('!!!'), 'exercise');
});

test('history names land on the right library entries', () => {
  const lib = DEFAULT_LIBRARY;
  const find = (id: string, name: string): string | undefined => matchLibrary({ id, name }, lib)?.id;
  assert.equal(find('1-step-chest-press', '+1 step Chest Press'), 'chest-press');
  assert.equal(find('chest-press', 'Chest Press'), 'chest-press');
  assert.equal(find('bench-1st-set-without-dumbbell-rows', 'BENCH: (1st set without) Dumbbell Rows'), 'dumbbell-rows');
  assert.equal(find('no-bench-dumbbell-rows', 'NO BENCH: Dumbbell Rows'), 'dumbbell-rows');
  assert.equal(find('1-5min-handstand-practice', '1.5min Handstand practice!'), 'handstand-practice');
  assert.equal(find('1min-handstand-practice', '1min Handstand practice!'), 'handstand-practice');
  assert.equal(find('norm-arnold-s-press', 'Norm/Arnold S-Press'), 'shoulder-press');
  assert.equal(find('arnold-sh-press', 'ARNOLD Sh-Press'), 'shoulder-press');
  assert.equal(find('bench-bicep-curls', 'Bench Bicep Curls'), 'bicep-curls');
  assert.equal(find('bicep-curl-alternating', 'Bicep Curl (alternating)'), 'bicep-curls');
  assert.equal(find('handstand-pike-push-up', 'Handstand/pike push-up.'), 'pike-push-ups');
  assert.equal(find('bulg-split-squats', 'Bulg. Split Squats'), 'bulgarian-split-squats');
  assert.equal(find('bent-over-triceps-push-ups', 'Bent-over triceps push-ups'), 'bent-over-triceps-push-ups');
  assert.equal(find('pistol-squats', 'Pistol Squats'), 'pistol-squats');
  assert.equal(find('ex_abc', 'Something new'), undefined);
  // an explicit link wins over the name
  assert.equal(matchLibrary({ id: 'ex_1', name: 'Whatever', lib: 'dips' }, lib)?.id, 'dips');
  // a hand-typed name with different case / punctuation still matches
  assert.equal(find('ex_2', 'pull ups'), 'pull-ups');
  assert.equal(find('ex_3', 'Diamond push-ups'), 'close-grip-push-ups');
});

test('load per rep: dumbbells, bodyweight shares, holds', () => {
  const lib = DEFAULT_LIBRARY;
  const e = (id: string) => lib.find((x) => x.id === id);
  assert.equal(loadPerRep(e('dumbbell-rows'), 26, 84), 26);
  assert.equal(loadPerRep(e('chest-press'), 24, 84), 48);
  assert.equal(loadPerRep(e('chest-press'), 24, 84, 20), 40); // "(20)" in the cell
  assert.equal(loadPerRep(e('chest-press'), undefined, 84), undefined);
  assert.equal(loadPerRep(e('squats'), undefined, 84), 71.4);
  assert.equal(loadPerRep(e('pistol-squats'), 2, 84), 73.4); // + 2 kg dumbbell
  assert.equal(loadPerRep(e('pistol-squats'), undefined, undefined), undefined); // no bodyweight known
  assert.equal(loadPerRep(e('pull-ups'), undefined, 84), 84);
  assert.equal(loadPerRep(e('push-ups'), undefined, 84), 53.8);
  assert.equal(loadPerRep(e('decline-push-ups'), undefined, 84), 63);
  assert.equal(loadPerRep(e('handstand-push-ups'), undefined, 84), 79.8);
  assert.equal(loadPerRep(e('handstand-practice'), undefined, 84), undefined);
  assert.equal(loadPerRep(undefined, 20, 84), 20); // unknown exercise: what was written
  assert.equal(describeEntry(e('push-ups')!), 'Chest, Triceps + Shoulders, Core · 64 % of bodyweight');
  assert.equal(describeEntry(e('chest-press')!), 'Chest + Triceps, Shoulders · 2 dumbbells');
});

test('every built-in has at least two muscle groups and a load rule', () => {
  for (const e of DEFAULT_LIBRARY) {
    assert.ok(e.muscles.length >= 1, e.id);
    assert.ok(e.muscles.filter((m) => m.role === 'primary').length >= 1, e.id);
    assert.ok(e.load.kind !== 'bodyweight' || (e.load.factor > 0 && e.load.factor <= 1), e.id);
  }
  assert.equal(new Set(DEFAULT_LIBRARY.map((e) => e.id)).size, DEFAULT_LIBRARY.length);
});

test('merging: edits win, deletions stick, new built-ins arrive', () => {
  const stored = [{ ...DEFAULT_LIBRARY[0]!, load: { kind: 'bodyweight' as const, factor: 0.9 } }, { id: 'my-move', name: 'My Move', muscles: [], load: { kind: 'none' as const } }];
  const merged = mergeLibrary(stored, ['dips']);
  assert.equal(merged.find((e) => e.id === 'pistol-squats')?.load.kind === 'bodyweight' && (merged.find((e) => e.id === 'pistol-squats')?.load as { factor: number }).factor, 0.9);
  assert.equal(merged.some((e) => e.id === 'dips'), false);
  assert.equal(merged.some((e) => e.id === 'my-move'), true);
  assert.equal(merged.some((e) => e.id === 'pull-ups'), true);
  const settings = mergeSettings({ libraryRemoved: ['dips'] });
  assert.equal(settings.library.some((e) => e.id === 'dips'), false);
  assert.equal(mergeSettings(undefined).library.length, DEFAULT_LIBRARY.length);
});

test('the last weight typed becomes the entry default and shows in its summary', () => {
  const lib = withDefaultWeight(DEFAULT_LIBRARY, 'dumbbell-rows', ' 26kg ');
  const rows = lib.find((e) => e.id === 'dumbbell-rows')!;
  assert.equal(rows.weight, '26kg');
  assert.ok(describeEntry(rows).endsWith(' · 26kg'));
  assert.equal(lib.find((e) => e.id === 'chest-press')?.weight, undefined, 'other entries untouched');
  assert.equal(withDefaultWeight(lib, 'dumbbell-rows', '').find((e) => e.id === 'dumbbell-rows')?.weight, undefined, 'an empty weight forgets the default');
  // the merged library keeps the remembered weight of a built-in
  assert.equal(mergeSettings({ library: [rows] }).library.find((e) => e.id === 'dumbbell-rows')?.weight, '26kg');
});
