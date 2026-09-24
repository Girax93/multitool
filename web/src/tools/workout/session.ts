// Workout mode: today's week with today's row highlighted, and the rest /
// work countdowns that follow every set typed into the grid. The countdowns
// run through the Timers tool (found via the registry), so they ring on the
// phone even when the app is in the background and show up in the timer list.
//
// Flow (Ari, 2026-09-23 and 2026-09-24):
//   tap an empty cell     → a stopwatch runs for that set (in the cell and in
//                           the panel) until the reps are typed; a second tap
//                           opens the cell;
//   type "12." + Enter    → the set is stored, the rest countdown starts (the
//                           exercise's own rest, per set if set up, else the
//                           tool's default), and if the "." points at a note
//                           that has no text yet a prompt asks for it;
//   while it runs         → +30 s / −30 s as often as wanted, Off;
//   when it rings         → the panel counts the overrun (−0:07) until Off,
//                           Repeat (another full rest) or +30 s (rest on);
//   timed exercise        → tapping its empty cell (or the offer after the
//                           previous exercise, or the panel button) runs prep
//                           (10 s) → work → rest → prep → work … for the
//                           remaining sets; the cell opens during each rest.
// Rest, step, work and prep lengths live in the tool settings (session.*) and
// can be overridden per exercise (and per set for the rest).
//
// The panel's state is kept in `ui/session` (per device), so a reload — even
// mid-rest — comes back to the same countdown, stopwatch or sequence.
//
// The day's `session` (start, end, rest taken) is kept up to date from here:
// every set typed and every countdown that ends moves its end, so the stats
// page can show how long a workout took and how much of it was rest.

import { h, replace, svg, uid } from '../../core/dom.js';
import { useService, type ToolContext } from '../../core/registry.js';
import { navigate, toolPath } from '../../core/router.js';
import type { Unsubscribe } from '../../core/store.js';
import { icons } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import {
  SESSION_GAP_MS,
  SESSION_IDLE_MS,
  addDay,
  completeSession,
  dayComplete,
  exerciseDone,
  formatSeconds,
  getSet,
  nextTimedExercise,
  prepForExercise,
  restForSet,
  sessionDay,
  sessionMinutes,
  toIsoDate,
  touchSession,
  updateFootnote,
  weekForDate,
  weekdayOfDate,
  workForExercise,
  type DayEntry,
  type Exercise,
  type SessionSettings,
  type Week,
} from './model.js';
import type { SetTyped, WorkoutService } from './service.js';
import { editSetCell, renderGrid, setSessionTapHandler, type SetPos } from './view.js';

/** The slice of the Timers tool this mode needs (kept as a type so the tools stay decoupled). */
export interface TimerLike {
  id: string;
  name: string;
  durationMs: number;
  state: 'idle' | 'running' | 'paused' | 'finished';
  endsAt?: number;
}
export interface TimerApi {
  timers: { get(): TimerLike[]; subscribe(fn: (list: TimerLike[]) => void, immediate?: boolean): Unsubscribe };
  tick: { subscribe(fn: (n: number) => void, immediate?: boolean): Unsubscribe };
  add(input: { name: string; durationMs: number; saved: boolean; start: boolean }): TimerLike;
  extend(id: string, deltaMs: number): void;
  restartWith(id: string, durationMs: number): void;
  stop(id: string): void;
  dismiss(id: string): void;
}

type Phase = 'idle' | 'rest' | 'work' | 'prep' | 'offer' | 'watch' | 'finish';

interface Sequence {
  weekId: string;
  dayId: string;
  ex: Exercise;
  /** 1-based set being worked / rested after. */
  set: number;
  stage: 'prep' | 'work' | 'rest';
}

/** A set being done right now: the stopwatch runs from `startedAt` until the reps are typed. */
interface Watch {
  weekId: string;
  dayId: string;
  exId: string;
  index: number;
  startedAt: number;
}

interface State {
  phase: Phase;
  timerId?: string;
  label: string;
  /** Length the current countdown started with (what Repeat runs again). */
  baseSec: number;
  seq?: Sequence;
  /** The set typed last (what the rest belongs to). */
  last?: SetTyped;
  /** A timed exercise offered after Off. */
  offer?: { weekId: string; dayId: string; ex: Exercise };
  watch?: Watch;
}

/** What survives a reload (`ui/session`): the state with exercises by id. */
interface StoredState {
  phase: Phase;
  timerId?: string;
  label: string;
  baseSec: number;
  seq?: { weekId: string; dayId: string; exId: string; set: number; stage: Sequence['stage'] };
  last?: SetTyped;
  lastAt: number;
  offer?: { weekId: string; dayId: string; exId: string };
  watch?: Watch;
  startedAt?: number;
  /** "Still going" on the long-pause prompt: do not ask again before this. */
  snoozeUntil?: number;
}

const SESSION_UI_KEY = 'ui/session';

class SessionController {
  private state: State = { phase: 'idle', label: '', baseSec: 0 };
  private readonly unsubs: Unsubscribe[] = [];
  private readonly timers: TimerApi | undefined;
  readonly panel: HTMLElement;
  /** True once the stored state has been looked at (so nothing is written over it before). */
  private restored = false;

  constructor(
    private readonly service: WorkoutService,
    private readonly ctx: ToolContext,
  ) {
    this.timers = useService<TimerApi>('timer');
    this.panel = h('div', { class: 'sess-panel', dataset: { testid: 'session-panel' } });
    this.unsubs.push(service.setTyped.on((e) => this.onTyped(e)));
    if (this.timers) {
      this.unsubs.push(this.timers.timers.subscribe((list) => this.onTimers(list), false));
      this.unsubs.push(this.timers.tick.subscribe(() => this.updateCountdown(), false));
    }
    setSessionTapHandler((weekId, pos) => this.onCellTap(weekId, pos));
    this.renderPanel();
    void this.restore();
  }

  dispose(): void {
    // Leaving the page keeps the countdown / stopwatch (it is persisted); only the clocks stop.
    setSessionTapHandler(null);
    this.stopClock();
    this.stopIdleCheck();
    for (const u of this.unsubs) u();
  }

  // ---- persistence ------------------------------------------------------------

  /** Pick the state up again after a reload: the timer must still exist, the exercises still be there. */
  private async restore(): Promise<void> {
    let stored: StoredState | null | undefined;
    try {
      stored = await this.ctx.kv.get<StoredState>(SESSION_UI_KEY);
    } catch {
      stored = undefined;
    }
    this.restored = true;
    if (!stored || stored.phase === 'idle') return;
    const findEx = (weekId: string, exId: string): Exercise | undefined => this.service.get(weekId)?.exercises.find((e) => e.id === exId);
    const next: State = { phase: 'idle', label: stored.label, baseSec: stored.baseSec, last: stored.last };
    this.lastAt = stored.lastAt ?? 0;
    this.snoozeUntil = stored.snoozeUntil ?? 0;
    if (stored.phase === 'finish') next.phase = 'finish';
    if (stored.seq) {
      const ex = findEx(stored.seq.weekId, stored.seq.exId);
      if (ex) next.seq = { weekId: stored.seq.weekId, dayId: stored.seq.dayId, ex, set: stored.seq.set, stage: stored.seq.stage };
    }
    if (stored.phase === 'watch' && stored.watch && findEx(stored.watch.weekId, stored.watch.exId)) {
      next.phase = 'watch';
      next.watch = stored.watch;
    } else if (stored.phase === 'offer' && stored.offer) {
      const ex = findEx(stored.offer.weekId, stored.offer.exId);
      if (ex) {
        next.phase = 'offer';
        next.offer = { weekId: stored.offer.weekId, dayId: stored.offer.dayId, ex };
      }
    } else if ((stored.phase === 'rest' || stored.phase === 'work' || stored.phase === 'prep') && stored.timerId && this.timers) {
      const t = this.timers.timers.get().find((x) => x.id === stored.timerId);
      if (t && (t.state === 'running' || t.state === 'finished')) {
        // (a sequence whose exercise is gone carries on as a plain countdown)
        next.phase = stored.phase;
        next.timerId = stored.timerId;
        this.startedAt = stored.startedAt;
      }
    }
    if (next.phase === 'idle') {
      void this.persist();
      return;
    }
    this.state = next;
    this.renderPanel();
    this.markWatchCell();
    // A countdown that rang while the page was away: carry the sequence on now.
    const t = this.currentTimer();
    if (t?.state === 'finished') this.onTimers(this.timers?.timers.get() ?? []);
  }

  private persist(): Promise<void> {
    if (!this.restored) return Promise.resolve();
    const s = this.state;
    const stored: StoredState = {
      phase: s.phase,
      timerId: s.timerId,
      label: s.label,
      baseSec: s.baseSec,
      seq: s.seq ? { weekId: s.seq.weekId, dayId: s.seq.dayId, exId: s.seq.ex.id, set: s.seq.set, stage: s.seq.stage } : undefined,
      last: s.last,
      lastAt: this.lastAt,
      offer: s.offer ? { weekId: s.offer.weekId, dayId: s.offer.dayId, exId: s.offer.ex.id } : undefined,
      watch: s.watch,
      startedAt: this.startedAt,
      snoozeUntil: this.snoozeUntil || undefined,
    };
    return this.ctx.kv.set(SESSION_UI_KEY, stored).catch(() => undefined);
  }

  private setState(next: State): void {
    this.state = next;
    void this.persist();
  }

  // ---- events ---------------------------------------------------------------

  private onTyped(e: SetTyped): void {
    const w = this.service.get(e.weekId);
    const day = w?.days.find((d) => d.id === e.dayId);
    const ex = w?.exercises.find((x) => x.id === e.exId);
    if (!w || !day || !ex) return;
    this.state.last = e;
    this.lastAt = Date.now();
    // The set's stopwatch (if it ran) is over: the reps are in.
    if (this.state.watch) this.clearWatch();
    this.activity();
    this.promptMissingNotes(w, ex, e);
    // Typing the result of a timed set while its rest already runs: keep that rest.
    if (this.state.seq && this.state.seq.ex.id === ex.id && this.state.seq.dayId === day.id && this.state.phase !== 'idle') {
      void this.persist();
      return;
    }
    // The day's last set: no rest to take — ask to complete the workout instead (Ari, 2026-09-24).
    if (e.text.trim() && dayComplete(w, day)) {
      this.clearTimer();
      this.setState({ ...this.state, phase: 'finish', timerId: undefined, label: '', seq: undefined, offer: undefined });
      this.renderPanel();
      return;
    }
    this.startRest(`Rest · ${ex.name || 'set'} ${e.index + 1}/${ex.sets}`, restForSet(ex, e.index, this.session()));
  }

  // ---- completing the workout ---------------------------------------------------

  /** "Still going" on the long-pause prompt: ask again half an hour later. */
  private snoozeUntil = 0;

  /** The day the "Complete workout" button and the prompts are about: the set typed last (if recent), else today's row. */
  private sessionDayEntry(): { week: Week; day: DayEntry } | undefined {
    const target = this.sessionTarget();
    const week = target ? this.service.get(target.weekId) : undefined;
    const day = week?.days.find((d) => d.id === target?.dayId);
    return week && day ? { week, day } : undefined;
  }

  /** Complete the workout: `at` = now for the button, the last activity when caught later. */
  complete(at?: number): void {
    const target = this.sessionDayEntry();
    if (!target) return;
    this.clearTimer();
    if (this.state.watch) this.clearWatch();
    const week = this.service.update(target.week.id, (w) => completeSession(w, target.day.id, at));
    const day = week?.days.find((d) => d.id === target.day.id);
    const minutes = day ? sessionMinutes(day) : undefined;
    const rest = day?.session ? Math.round(day.session.restSec / 60) : 0;
    this.snoozeUntil = 0;
    this.setState({ ...this.state, phase: 'idle', label: '', seq: undefined, offer: undefined, watch: undefined });
    this.ctx.toast(minutes !== undefined ? `Workout complete — ${minutes} min${rest ? `, rest ${rest} min` : ''}` : 'Workout complete');
    this.renderPanel();
  }

  /** An open workout with nothing happening for half an hour (and not snoozed): the one to ask about. */
  private stale(): { week: Week; day: DayEntry; idleMs: number } | undefined {
    const t = this.sessionDayEntry();
    const s = t?.day.session;
    if (!t || !s || s.done) return undefined;
    const idleMs = Date.now() - s.end;
    if (idleMs < SESSION_IDLE_MS || Date.now() < this.snoozeUntil) return undefined;
    return { ...t, idleMs };
  }

  private onTimers(list: TimerLike[]): void {
    const id = this.state.timerId;
    if (!id) return;
    const t = list.find((x) => x.id === id);
    if (!t) {
      // Dismissed from the Timers tool or the notification.
      this.settle();
      this.setState({ ...this.state, phase: 'idle', timerId: undefined, seq: undefined });
      this.renderPanel();
      return;
    }
    if (t.state === 'finished') this.settle();
    if (t.state === 'finished' && this.state.seq) this.advanceSequence();
    else this.renderPanel();
  }

  /**
   * A tap on a set cell in workout mode (from the grid). An empty cell starts
   * the set: a stopwatch for a rep exercise, prep → work for a timed one. A
   * second tap on the cell whose stopwatch runs opens it to type. Returns
   * true when the tap was used, false to let the grid open the cell as usual.
   */
  private onCellTap(weekId: string, pos: SetPos): boolean {
    const w = this.service.get(weekId);
    const day = w?.days.find((d) => d.id === pos.dayId);
    const ex = w?.exercises.find((x) => x.id === pos.exId);
    if (!w || !day || !ex) return false;
    const cell = getSet(w, day.id, ex.id, pos.index);
    if (cell.v.trim() !== '') return false;
    const watch = this.state.watch;
    if (watch && watch.weekId === weekId && watch.dayId === pos.dayId && watch.exId === pos.exId && watch.index === pos.index) return false;
    if (ex.timedSec) {
      const seq = this.state.seq;
      if (seq && seq.ex.id === ex.id && seq.dayId === day.id && seq.set === pos.index + 1 && this.state.phase !== 'idle') return false;
      this.startTimed(weekId, day.id, ex, pos.index + 1);
      return true;
    }
    this.startWatch({ weekId, dayId: day.id, exId: ex.id, index: pos.index, startedAt: Date.now() });
    return true;
  }

  // ---- workout duration -------------------------------------------------------

  /** When the current countdown started (wall clock), until it is settled into the day's session. */
  private startedAt: number | undefined;

  /** When the last set was typed (the page can stay open for days; an old `last` must not collect today's rests). */
  private lastAt = 0;

  /** The day the activity belongs to: the set typed last (if recent), else today's row. */
  private sessionTarget(): { weekId: string; dayId: string } | undefined {
    if (this.state.last && Date.now() - this.lastAt <= SESSION_GAP_MS) return { weekId: this.state.last.weekId, dayId: this.state.last.dayId };
    return this.context ? { weekId: this.context.week.id, dayId: this.context.day.id } : undefined;
  }

  /** Something happened (a set typed, a countdown over): extend the day's session. */
  private activity(restSec = 0, target = this.sessionTarget()): void {
    if (!target) return;
    this.service.update(target.weekId, (w) => touchSession(w, target.dayId, Date.now(), restSec));
  }

  /** The countdown that was running is over (rang, Off, replaced, dismissed): book its time. */
  private settle(): void {
    if (this.startedAt === undefined) return;
    const elapsed = Math.max(0, (Date.now() - this.startedAt) / 1000);
    this.startedAt = undefined;
    this.activity(this.state.phase === 'rest' ? elapsed : 0);
  }

  // ---- settings ---------------------------------------------------------------

  private session(): SessionSettings {
    return this.service.settings.get().session;
  }

  private restSec(): number {
    return Math.max(1, this.session().restSec);
  }

  private stepMs(): number {
    return Math.max(1, this.session().stepSec) * 1000;
  }

  // ---- actions --------------------------------------------------------------

  private startRest(label: string, sec = this.restSec(), seq?: Sequence): void {
    this.run('rest', label, sec, seq);
  }

  private run(phase: 'rest' | 'work' | 'prep', label: string, sec: number, seq?: Sequence): void {
    if (!this.timers) {
      this.setState({ ...this.state, phase: 'idle', label: '', seq: undefined });
      this.renderPanel();
      return;
    }
    this.clearTimer();
    if (this.state.watch) this.clearWatch();
    const t = this.timers.add({ name: label, durationMs: sec * 1000, saved: false, start: true });
    this.startedAt = Date.now();
    this.setState({ ...this.state, phase, timerId: t.id, label, baseSec: sec, seq, offer: undefined, watch: undefined });
    this.renderPanel();
  }

  private clearTimer(): void {
    const id = this.state.timerId;
    if (!id || !this.timers) return;
    this.settle();
    const t = this.timers.timers.get().find((x) => x.id === id);
    if (t) (t.state === 'finished' ? this.timers.dismiss(id) : this.timers.stop(id));
    this.state.timerId = undefined;
  }

  /** +step / −step while a countdown runs; after the ring, +step starts the rest again for that long. */
  adjust(dir: -1 | 1): void {
    const t = this.currentTimer();
    if (!t || !this.timers || !this.state.timerId) return;
    if (t.state === 'finished') {
      if (dir < 0) return;
      this.settle();
      this.timers.restartWith(this.state.timerId, this.stepMs());
      this.startedAt = Date.now();
      void this.persist();
      this.renderPanel();
      return;
    }
    this.timers.extend(this.state.timerId, dir * this.stepMs());
  }

  repeat(): void {
    if (this.state.timerId && this.timers) {
      this.settle();
      this.timers.restartWith(this.state.timerId, this.state.baseSec * 1000);
      this.startedAt = Date.now();
      void this.persist();
    }
    this.renderPanel();
  }

  /** Off: stop whatever runs; after a rest, offer the timed exercise that comes next. */
  off(): void {
    const wasRest = this.state.phase === 'rest' && !this.state.seq;
    const last = this.state.last;
    this.clearTimer();
    if (this.state.watch) this.clearWatch();
    let next: State = { ...this.state, phase: 'idle', label: '', seq: undefined, watch: undefined };
    if (wasRest && last && this.session().offerTimed) {
      const w = this.service.get(last.weekId);
      const day = w?.days.find((d) => d.id === last.dayId);
      const ex = w?.exercises.find((x) => x.id === last.exId);
      if (w && day && ex && (exerciseDone(day, ex) || last.index === ex.sets - 1)) {
        const timed = nextTimedExercise(w, day, ex.id);
        if (timed) next = { ...next, phase: 'offer', offer: { weekId: w.id, dayId: day.id, ex: timed } };
      }
    }
    this.setState(next);
    this.renderPanel();
  }

  /** Skip the rest of a prep / work phase (finished the hold early) or of a rest. */
  skip(): void {
    if (this.state.seq) this.advanceSequence();
    else this.off();
  }

  /** Start a timed exercise at set `set` (1-based): prep first, then the hold. */
  startTimed(weekId: string, dayId: string, ex: Exercise, set = 1): void {
    const seq: Sequence = { weekId, dayId, ex, set, stage: 'prep' };
    this.startPrepOrWork(seq);
  }

  private startPrepOrWork(seq: Sequence): void {
    const settings = this.session();
    const prep = prepForExercise(seq.ex, settings);
    if (seq.stage === 'prep' && prep > 0) {
      this.run('prep', `${seq.ex.name || 'Timed'} · set ${seq.set}/${seq.ex.sets} — get ready`, prep, seq);
      return;
    }
    const work = workForExercise(seq.ex, settings);
    this.run('work', `${seq.ex.name || 'Timed'} · set ${seq.set}/${seq.ex.sets}`, work, { ...seq, stage: 'work' });
  }

  /** Prep → work; work → rest (and open the set's cell); rest → next set's prep; last rest → done. */
  private advanceSequence(): void {
    const seq = this.state.seq;
    if (!seq) return;
    if (seq.stage === 'prep') {
      this.ctx.native.vibrate([80]);
      this.startPrepOrWork({ ...seq, stage: 'work' });
      return;
    }
    if (seq.stage === 'work') {
      const next: Sequence = { ...seq, stage: 'rest' };
      this.startRest(`Rest · ${seq.ex.name || 'set'} ${seq.set}/${seq.ex.sets}`, restForSet(seq.ex, seq.set - 1, this.session()), next);
      this.ctx.native.vibrate([120, 60, 120]);
      // Type how the hold went while resting.
      setTimeout(() => editSetCell(this.service, seq.weekId, { dayId: seq.dayId, exId: seq.ex.id, index: seq.set - 1 }), 50);
      return;
    }
    if (seq.set >= seq.ex.sets) {
      this.clearTimer();
      this.setState({ ...this.state, phase: 'idle', label: '', seq: undefined });
      this.ctx.toast(`${seq.ex.name || 'Timed exercise'} done — ${seq.ex.sets} sets`);
      this.renderPanel();
      return;
    }
    this.startPrepOrWork({ ...seq, set: seq.set + 1, stage: 'prep' });
  }

  // ---- the set stopwatch --------------------------------------------------------

  private startWatch(watch: Watch): void {
    this.clearTimer();
    this.unmarkWatchCell();
    this.activity(0, { weekId: watch.weekId, dayId: watch.dayId });
    this.setState({ ...this.state, phase: 'watch', timerId: undefined, label: '', seq: undefined, offer: undefined, watch });
    this.renderPanel();
    this.markWatchCell();
  }

  private clearWatch(): void {
    this.unmarkWatchCell();
    this.state.watch = undefined;
    if (this.state.phase === 'watch') this.state.phase = 'idle';
  }

  private watchSeconds(): number {
    const w = this.state.watch;
    return w ? Math.max(0, Math.floor((Date.now() - w.startedAt) / 1000)) : 0;
  }

  private watchCellEl(): HTMLElement | null {
    const w = this.state.watch;
    if (!w) return null;
    return document.querySelector<HTMLElement>(
      `[data-testid="session"] .wk-week[data-week="${CSS.escape(w.weekId)}"] td.wk-cell[data-day="${CSS.escape(w.dayId)}"][data-ex="${CSS.escape(w.exId)}"][data-set="${w.index}"]`,
    );
  }

  /** Show the running time in the set's cell (re-applied after every grid render). */
  markWatchCell(): void {
    const td = this.watchCellEl();
    if (!td) return;
    td.classList.add('wk-cell-live');
    let el = td.querySelector<HTMLElement>('.wk-live');
    if (!el) {
      el = h('span', { class: 'wk-live', dataset: { testid: 'set-live' } });
      td.querySelector('.wk-cbtn')?.appendChild(el);
    }
    el.textContent = formatSeconds(this.watchSeconds());
  }

  private unmarkWatchCell(): void {
    const td = this.watchCellEl();
    if (!td) return;
    td.classList.remove('wk-cell-live');
    td.querySelector('.wk-live')?.remove();
  }

  // ---- prompts --------------------------------------------------------------

  /** "12." with no note 1 yet: typeSet created it empty — ask for the text now. */
  private promptMissingNotes(w: Week, ex: Exercise, e: SetTyped): void {
    const cell = w.days.find((d) => d.id === e.dayId)?.cells[ex.id]?.sets[e.index];
    const refs = cell?.fn ?? [];
    const missing = (w.footnotes[ex.id] ?? []).filter((f) => refs.includes(f.n) && !f.text.trim());
    if (!missing.length) return;
    const sheet = openSheet({ title: `Note for ${ex.name || 'exercise'}` });
    const fields = missing.map((f) => {
      const input = h('input', { type: 'text', class: 'input', placeholder: `Note ${f.n}`, dataset: { testid: 'session-note-input' } });
      return { f, input, row: h('label', { class: 'field-col' }, h('span', { class: 'field-label' }, `Note ${f.n}`), input) };
    });
    const form = h(
      'form',
      {
        onSubmit: (ev: Event) => {
          ev.preventDefault();
          for (const { f, input } of fields) {
            const text = input.value.trim();
            if (text) this.service.update(w.id, (x) => updateFootnote(x, ex.id, f.n, text));
          }
          sheet.close();
        },
      },
      h('p', { class: 'muted' }, `You typed "${e.text}" — what does the note say?`),
      ...fields.map((x) => x.row),
      h('div', { class: 'row row-end sheet-actions' }, h('button', { class: 'btn btn-text', type: 'button', onClick: () => sheet.close() }, 'Later'), h('button', { class: 'btn btn-primary', type: 'submit', dataset: { testid: 'session-note-save' } }, 'Save')),
    );
    replace(sheet.body, form);
    setTimeout(() => fields[0]?.input.focus(), 30);
  }

  // ---- panel ----------------------------------------------------------------

  private countdownEl: HTMLElement | null = null;
  /** Own 1 s clock for the stopwatch and the overrun counter (the Timers tool only ticks while something runs). */
  private clock: number | undefined;

  private startClock(): void {
    if (this.clock !== undefined) return;
    this.clock = window.setInterval(() => this.updateCountdown(), 1000);
  }

  private stopClock(): void {
    if (this.clock === undefined) return;
    clearInterval(this.clock);
    this.clock = undefined;
  }

  /** While a workout is open and nothing runs: look every half minute whether it has gone quiet for too long. */
  private idleCheck: number | undefined;

  private startIdleCheck(): void {
    if (this.idleCheck !== undefined) return;
    this.idleCheck = window.setInterval(() => {
      const wasStale = this.panel.dataset['phase'] === 'stale';
      if (!!this.stale() !== wasStale) this.renderPanel();
    }, 30_000);
  }

  private stopIdleCheck(): void {
    if (this.idleCheck === undefined) return;
    clearInterval(this.idleCheck);
    this.idleCheck = undefined;
  }

  private currentTimer(): TimerLike | undefined {
    const id = this.state.timerId;
    return id && this.timers ? this.timers.timers.get().find((t) => t.id === id) : undefined;
  }

  private updateCountdown(): void {
    if (this.state.phase === 'watch') {
      if (this.countdownEl) this.countdownEl.textContent = formatSeconds(this.watchSeconds());
      this.markWatchCell();
      return;
    }
    const t = this.currentTimer();
    if (!this.countdownEl || !t) return;
    if (t.state === 'finished') {
      // How long the alarm has been ringing (Ari: "show -seconds until I click it off").
      const over = t.endsAt ? Math.max(0, Date.now() - t.endsAt) : 0;
      this.countdownEl.textContent = `−${formatSeconds(Math.floor(over / 1000))}`;
      return;
    }
    const left = t.state === 'running' && t.endsAt ? Math.max(0, t.endsAt - Date.now()) : 0;
    this.countdownEl.textContent = formatSeconds(Math.ceil(left / 1000));
  }

  /** Called on every render of the page: the week and day to offer timed exercises for. */
  setContext(week: Week | undefined, day: DayEntry | undefined): void {
    this.context = week && day ? { week, day } : undefined;
    this.renderPanel();
    this.markWatchCell();
  }
  private context: { week: Week; day: DayEntry } | undefined;

  renderPanel(): void {
    const s = this.state;
    const t = this.currentTimer();
    const step = Math.round(this.stepMs() / 1000);
    const btn = (label: string, onClick: () => void, cls = 'btn', testid?: string): HTMLElement =>
      h('button', { type: 'button', class: cls, dataset: testid ? { testid } : undefined, onClick }, label);

    if (!this.timers) {
      replace(this.panel, h('p', { class: 'muted sess-hint' }, 'Turn on the Timers tool (Settings) to get rest timers here.'));
      this.panel.dataset['phase'] = 'off';
      this.stopClock();
      return;
    }

    if (s.phase === 'watch' && s.watch) {
      const w = this.service.get(s.watch.weekId);
      const ex = w?.exercises.find((x) => x.id === s.watch?.exId);
      const watch = s.watch;
      this.countdownEl = h('div', { class: 'sess-count sess-count-watch', dataset: { testid: 'session-countdown' } }, formatSeconds(this.watchSeconds()));
      replace(
        this.panel,
        h('div', { class: 'sess-label' }, svg(icons.dumbbell, 'icon icon-sm'), `${ex?.name || 'Set'} · set ${watch.index + 1}/${ex?.sets ?? '?'}`),
        this.countdownEl,
        h('div', { class: 'sess-sub' }, 'Working — tap the cell again to type your reps'),
        h(
          'div',
          { class: 'sess-actions' },
          btn('Cancel', () => this.off(), 'btn btn-text', 'session-watch-cancel'),
          btn('Type reps', () => editSetCell(this.service, watch.weekId, { dayId: watch.dayId, exId: watch.exId, index: watch.index }), 'btn btn-primary', 'session-watch-type'),
        ),
      );
      this.panel.dataset['phase'] = 'watch';
      this.startClock();
      return;
    }

    if (s.phase === 'offer' && s.offer) {
      const { ex, weekId, dayId } = s.offer;
      const settings = this.session();
      const prep = prepForExercise(ex, settings);
      replace(
        this.panel,
        h('div', { class: 'sess-label' }, `${ex.name} next`),
        h('div', { class: 'sess-sub' }, `${ex.sets} × ${formatSeconds(workForExercise(ex, settings))} work + ${formatSeconds(restForSet(ex, 0, settings))} rest${prep ? `, ${formatSeconds(prep)} prep before each` : ''}`),
        h('div', { class: 'sess-actions' }, btn('Not now', () => { this.setState({ ...this.state, phase: 'idle', offer: undefined }); this.renderPanel(); }, 'btn btn-text'), btn('Start', () => this.startTimed(weekId, dayId, ex), 'btn btn-primary', 'session-timed-start')),
      );
      this.panel.dataset['phase'] = 'offer';
      this.stopClock();
      return;
    }

    if (s.phase === 'finish') {
      const entry = this.sessionDayEntry();
      const minutes = entry ? sessionMinutes(entry.day) : undefined;
      replace(
        this.panel,
        h('div', { class: 'sess-label' }, svg(icons.check, 'icon icon-sm'), 'That was the last set'),
        h('div', { class: 'sess-sub' }, minutes !== undefined ? `Every set of the day is in — ${minutes} min so far. Complete the workout? Notes can still be written afterwards.` : 'Every set of the day is in. Complete the workout?'),
        h(
          'div',
          { class: 'sess-actions' },
          btn('Not yet', () => { this.setState({ ...this.state, phase: 'idle' }); this.renderPanel(); }, 'btn btn-text', 'session-finish-later'),
          btn('Complete workout', () => this.complete(Date.now()), 'btn btn-primary', 'session-complete'),
        ),
      );
      this.panel.dataset['phase'] = 'finish';
      this.stopClock();
      return;
    }

    if (s.phase === 'idle' || !t) {
      const ctxWeek = this.context;
      const entry = this.sessionDayEntry();
      const stale = this.stale();
      if (stale) {
        // Nothing for half an hour: presumably done — catch a forgotten "Complete" (ends at the last set).
        const endedAt = new Date(stale.day.session?.end ?? Date.now());
        const idleMin = Math.round(stale.idleMs / 60_000);
        replace(
          this.panel,
          h('div', { class: 'sess-label' }, svg(icons.timer, 'icon icon-sm'), 'Still working out?'),
          h('div', { class: 'sess-sub' }, `Nothing logged for ${idleMin} min — last activity at ${clock(endedAt)}. Complete the workout as ended then?`),
          h(
            'div',
            { class: 'sess-actions' },
            btn('Still going', () => { this.snoozeUntil = Date.now() + SESSION_IDLE_MS; void this.persist(); this.renderPanel(); }, 'btn btn-text', 'session-still-going'),
            btn(`Complete (ended ${clock(endedAt)})`, () => this.complete(), 'btn btn-primary', 'session-complete-stale'),
          ),
        );
        this.panel.dataset['phase'] = 'stale';
        this.countdownEl = null;
        this.startIdleCheck();
        return;
      }
      const timed = ctxWeek ? ctxWeek.week.exercises.filter((ex) => ex.timedSec && !exerciseDone(ctxWeek.day, ex)) : [];
      const day = entry?.day ?? ctxWeek?.day;
      const minutes = day ? sessionMinutes(day) : undefined;
      const rest = day?.session ? Math.round(day.session.restSec / 60) : 0;
      const done = !!day?.session?.done;
      replace(
        this.panel,
        h(
          'div',
          { class: 'sess-idle' },
          h('span', { class: 'muted' }, done ? 'Workout complete — typing another set reopens it' : 'Tap a cell to start a set; type it and the rest starts'),
          done ? null : btn(`Rest ${formatSeconds(this.restSec())}`, () => this.startRest('Rest'), 'btn btn-sm', 'session-rest-start'),
        ),
        minutes !== undefined
          ? h(
              'div',
              { class: 'sess-sub sess-duration', dataset: { testid: 'session-duration' } },
              done ? `Workout complete: ${minutes} min${rest ? ` · rest ${rest} min` : ''}` : `Workout so far: ${minutes} min${rest ? ` · rest ${rest} min` : ''}`,
              !done && day?.session ? btn('Complete workout', () => this.complete(Date.now()), 'btn btn-sm btn-primary', 'session-complete') : null,
            )
          : null,
        timed.length && ctxWeek && !done
          ? h('div', { class: 'sess-timed' }, ...timed.map((ex) => btn(`${ex.name}: ${ex.sets} × ${formatSeconds(workForExercise(ex, this.session()))}`, () => this.startTimed(ctxWeek.week.id, ctxWeek.day.id, ex), 'btn btn-sm', 'session-timed')))
          : null,
      );
      this.panel.dataset['phase'] = done ? 'done' : 'idle';
      this.countdownEl = null;
      this.stopClock();
      if (day?.session && !done) this.startIdleCheck();
      else this.stopIdleCheck();
      return;
    }
    this.stopIdleCheck();

    const finished = t.state === 'finished';
    this.countdownEl = h('div', { class: `sess-count${finished ? ' sess-count-done' : ''}`, dataset: { testid: 'session-countdown' } }, '0:00');
    const actions = finished
      ? [
          s.phase === 'rest' ? btn(`+${step} s`, () => this.adjust(1), 'btn', 'session-plus') : null,
          btn(`Repeat ${formatSeconds(s.baseSec)}`, () => this.repeat(), 'btn', 'session-repeat'),
          s.seq ? btn(s.phase === 'rest' ? 'Next set' : 'Go', () => this.skip(), 'btn', 'session-skip') : null,
          btn('Off', () => this.off(), 'btn btn-primary', 'session-off'),
        ]
      : [
          btn(`−${step} s`, () => this.adjust(-1), 'btn', 'session-minus'),
          btn(`+${step} s`, () => this.adjust(1), 'btn', 'session-plus'),
          s.seq ? btn(s.phase === 'work' ? 'Done → rest' : s.phase === 'prep' ? 'Go now' : 'Next set', () => this.skip(), 'btn', 'session-skip') : null,
          btn('Off', () => this.off(), 'btn btn-primary', 'session-off'),
        ];
    const sub = finished
      ? s.phase === 'work' ? 'Time!' : s.phase === 'prep' ? 'Go!' : 'Rest over'
      : s.phase === 'work' ? 'Go!' : s.phase === 'prep' ? 'Get ready…' : 'Resting';
    replace(
      this.panel,
      h('div', { class: 'sess-label' }, s.phase === 'work' || s.phase === 'prep' ? svg(icons.dumbbell, 'icon icon-sm') : svg(icons.timer, 'icon icon-sm'), s.label),
      this.countdownEl,
      h('div', { class: 'sess-sub' }, sub),
      h('div', { class: 'sess-actions' }, ...actions),
    );
    this.panel.dataset['phase'] = finished ? 'finished' : s.phase;
    if (finished) this.startClock();
    else this.stopClock();
    this.updateCountdown();
  }
}

/** "18:42" in the user's locale. */
function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

let controller: SessionController | null = null;

export function disposeSession(): void {
  controller?.dispose();
  controller = null;
}

/** The workout-mode page: header, today's week (today's row highlighted), the timer panel. */
export function renderSession(service: WorkoutService, ctx: ToolContext): HTMLElement {
  controller ??= new SessionController(service, ctx);
  const today = toIsoDate(new Date());
  const weeks = service.weeks.get();
  const week = weekForDate(weeks, today);
  const latest = weeks[weeks.length - 1];
  const settings = service.settings.get();
  const back = h('button', { class: 'btn btn-text btn-sm', dataset: { testid: 'session-back' }, onClick: () => navigate(toolPath('workout')) }, svg(icons.back, 'icon icon-sm'), 'Log');

  if (!week) {
    controller.setContext(undefined, undefined);
    return h(
      'div',
      { class: 'wk sess', dataset: { testid: 'session' } },
      h('div', { class: 'sess-head' }, back, h('span', { class: 'sess-title' }, 'Workout')),
      h(
        'div',
        { class: 'wk-scroll' },
        h(
          'div',
          { class: 'empty' },
          svg(icons.dumbbell, 'icon icon-xl'),
          h('p', null, latest ? `${latest.label} ended; this week has no entry yet.` : 'No weeks yet.'),
          h('button', { class: 'btn btn-primary', dataset: { testid: 'session-start-week' }, onClick: () => service.createWeek() }, latest ? 'Start this week (exercises copied)' : 'Start this week'),
        ),
      ),
      controller.panel,
    );
  }

  const day = sessionDay(week, today);
  const todayName = weekdayOfDate(today);
  const noRowToday = !week.days.some((d) => d.date === today);
  if (service.currentWeekId.get() !== week.id) service.select(week.id);

  const head = h(
    'div',
    { class: 'sess-head' },
    back,
    h('span', { class: 'sess-title' }, week.label, h('span', { class: 'muted' }, ` · ${todayName} ${today.slice(5)}`)),
    noRowToday
      ? h('button', { class: 'btn btn-sm', dataset: { testid: 'session-add-today' }, onClick: () => service.update(week.id, (w) => addDay(w, uid('d'), todayName)) }, `Add ${todayName}`)
      : null,
  );
  const grid = renderGrid(service, ctx, week, settings, { highlightDayId: day?.id, session: true });
  const page = h(
    'div',
    { class: 'wk sess', dataset: { testid: 'session' } },
    head,
    h('div', { class: 'wk-scroll' }, h('div', { class: 'wk-weeks' }, h('section', { class: 'wk-week', dataset: { week: week.id } }, h('div', { class: 'wk-row' }, grid)))),
    controller.panel,
  );
  controller.setContext(week, day);
  // The grid is in the document only after the caller mounts it: mark the stopwatch cell then.
  const c = controller;
  setTimeout(() => c.markWatchCell(), 0);
  return page;
}
