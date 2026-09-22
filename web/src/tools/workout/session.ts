// Workout mode: today's week with today's row highlighted, and the rest /
// work countdowns that follow every set typed into the grid. The countdowns
// run through the Timers tool (found via the registry), so they ring on the
// phone even when the app is in the background and show up in the timer list.
//
// Flow (Ari, 2026-09-23):
//   type "12." + Enter  → the set is stored, a rest timer (1:30) starts, and if
//                          the "." points at a note that has no text yet a
//                          prompt asks for it;
//   while it runs        → +30 s / −30 s as often as wanted, Off;
//   when it rings        → Repeat (another full rest) or Off;
//   Off after the last set of the exercise before a timed one (handstands) →
//     "Start <timed exercise>?" → 3 × (work 1:30 → rest 1:30), the matching
//     cell opens for typing during each rest.
// Rest, step and work lengths live in the tool settings (session.*).

import { h, replace, svg, uid } from '../../core/dom.js';
import { useService, type ToolContext } from '../../core/registry.js';
import { navigate, toolPath } from '../../core/router.js';
import type { Unsubscribe } from '../../core/store.js';
import { icons } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import {
  addDay,
  exerciseDone,
  formatSeconds,
  nextTimedExercise,
  sessionDay,
  toIsoDate,
  updateFootnote,
  weekForDate,
  weekdayOfDate,
  type DayEntry,
  type Exercise,
  type Week,
} from './model.js';
import type { SetTyped, WorkoutService } from './service.js';
import { editSetCell, renderGrid } from './view.js';

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

type Phase = 'idle' | 'rest' | 'work' | 'offer';

interface Sequence {
  weekId: string;
  dayId: string;
  ex: Exercise;
  /** 1-based set being worked / rested after. */
  set: number;
  stage: 'work' | 'rest';
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
}

class SessionController {
  private state: State = { phase: 'idle', label: '', baseSec: 0 };
  private readonly unsubs: Unsubscribe[] = [];
  private readonly timers: TimerApi | undefined;
  readonly panel: HTMLElement;

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
    this.renderPanel();
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }

  // ---- events ---------------------------------------------------------------

  private onTyped(e: SetTyped): void {
    const w = this.service.get(e.weekId);
    const day = w?.days.find((d) => d.id === e.dayId);
    const ex = w?.exercises.find((x) => x.id === e.exId);
    if (!w || !day || !ex) return;
    this.state.last = e;
    this.promptMissingNotes(w, ex, e);
    // Typing the result of a timed set while its rest already runs: keep that rest.
    if (this.state.seq && this.state.seq.ex.id === ex.id && this.state.seq.dayId === day.id && this.state.phase !== 'idle') return;
    this.startRest(`Rest · ${ex.name || 'set'} ${e.index + 1}/${ex.sets}`);
  }

  private onTimers(list: TimerLike[]): void {
    const id = this.state.timerId;
    if (!id) return;
    const t = list.find((x) => x.id === id);
    if (!t) {
      // Dismissed from the Timers tool or the notification.
      this.state = { ...this.state, phase: 'idle', timerId: undefined, seq: undefined };
      this.renderPanel();
      return;
    }
    if (t.state === 'finished' && this.state.seq) this.advanceSequence();
    else this.renderPanel();
  }

  // ---- actions --------------------------------------------------------------

  private restSec(): number {
    return Math.max(1, this.service.settings.get().session.restSec);
  }

  private stepMs(): number {
    return Math.max(1, this.service.settings.get().session.stepSec) * 1000;
  }

  private startRest(label: string, seq?: Sequence): void {
    const sec = this.restSec();
    this.run('rest', label, sec, seq);
  }

  private run(phase: 'rest' | 'work', label: string, sec: number, seq?: Sequence): void {
    if (!this.timers) {
      this.state = { ...this.state, phase: 'idle', label: '', seq: undefined };
      this.renderPanel();
      return;
    }
    this.clearTimer();
    const t = this.timers.add({ name: label, durationMs: sec * 1000, saved: false, start: true });
    this.state = { ...this.state, phase, timerId: t.id, label, baseSec: sec, seq, offer: undefined };
    this.renderPanel();
  }

  private clearTimer(): void {
    const id = this.state.timerId;
    if (!id || !this.timers) return;
    const t = this.timers.timers.get().find((x) => x.id === id);
    if (t) (t.state === 'finished' ? this.timers.dismiss(id) : this.timers.stop(id));
    this.state.timerId = undefined;
  }

  adjust(dir: -1 | 1): void {
    if (this.state.timerId && this.timers) this.timers.extend(this.state.timerId, dir * this.stepMs());
  }

  repeat(): void {
    if (this.state.timerId && this.timers) this.timers.restartWith(this.state.timerId, this.state.baseSec * 1000);
    this.renderPanel();
  }

  /** Off: stop whatever runs; after a rest, offer the timed exercise that comes next. */
  off(): void {
    const wasRest = this.state.phase === 'rest' && !this.state.seq;
    const last = this.state.last;
    this.clearTimer();
    this.state = { ...this.state, phase: 'idle', label: '', seq: undefined };
    if (wasRest && last && this.service.settings.get().session.offerTimed) {
      const w = this.service.get(last.weekId);
      const day = w?.days.find((d) => d.id === last.dayId);
      const ex = w?.exercises.find((x) => x.id === last.exId);
      if (w && day && ex && (exerciseDone(day, ex) || last.index === ex.sets - 1)) {
        const timed = nextTimedExercise(w, day, ex.id);
        if (timed) this.state = { ...this.state, phase: 'offer', offer: { weekId: w.id, dayId: day.id, ex: timed } };
      }
    }
    this.renderPanel();
  }

  /** Skip the rest of a work phase (finished the hold early) or of a rest. */
  skip(): void {
    if (this.state.seq) this.advanceSequence();
    else this.off();
  }

  startTimed(weekId: string, dayId: string, ex: Exercise): void {
    const work = ex.timedSec || this.service.settings.get().session.workSec;
    const seq: Sequence = { weekId, dayId, ex, set: 1, stage: 'work' };
    this.run('work', `${ex.name || 'Timed'} · set 1/${ex.sets}`, Math.max(1, work), seq);
  }

  /** Work → rest (and open the set's cell), rest → next set's work, last rest → done. */
  private advanceSequence(): void {
    const seq = this.state.seq;
    if (!seq) return;
    if (seq.stage === 'work') {
      const next: Sequence = { ...seq, stage: 'rest' };
      this.startRest(`Rest · ${seq.ex.name || 'set'} ${seq.set}/${seq.ex.sets}`, next);
      this.ctx.native.vibrate([120, 60, 120]);
      // Type how the hold went while resting.
      setTimeout(() => editSetCell(this.service, seq.weekId, { dayId: seq.dayId, exId: seq.ex.id, index: seq.set - 1 }), 50);
      return;
    }
    if (seq.set >= seq.ex.sets) {
      this.clearTimer();
      this.state = { ...this.state, phase: 'idle', label: '', seq: undefined };
      this.ctx.toast(`${seq.ex.name || 'Timed exercise'} done — ${seq.ex.sets} sets`);
      this.renderPanel();
      return;
    }
    const work = seq.ex.timedSec || this.service.settings.get().session.workSec;
    const next: Sequence = { ...seq, set: seq.set + 1, stage: 'work' };
    this.run('work', `${seq.ex.name || 'Timed'} · set ${next.set}/${seq.ex.sets}`, Math.max(1, work), next);
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

  private currentTimer(): TimerLike | undefined {
    const id = this.state.timerId;
    return id && this.timers ? this.timers.timers.get().find((t) => t.id === id) : undefined;
  }

  private updateCountdown(): void {
    const t = this.currentTimer();
    if (!this.countdownEl || !t) return;
    const left = t.state === 'running' && t.endsAt ? Math.max(0, t.endsAt - Date.now()) : 0;
    this.countdownEl.textContent = t.state === 'finished' ? '0:00' : formatSeconds(Math.ceil(left / 1000));
  }

  /** Called on every render of the page: the week and day to offer timed exercises for. */
  setContext(week: Week | undefined, day: DayEntry | undefined): void {
    this.context = week && day ? { week, day } : undefined;
    this.renderPanel();
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
      return;
    }

    if (s.phase === 'offer' && s.offer) {
      const { ex, weekId, dayId } = s.offer;
      const work = ex.timedSec || this.service.settings.get().session.workSec;
      replace(
        this.panel,
        h('div', { class: 'sess-label' }, `${ex.name} next`),
        h('div', { class: 'sess-sub' }, `${ex.sets} × ${formatSeconds(work)} work + ${formatSeconds(this.restSec())} rest`),
        h('div', { class: 'sess-actions' }, btn('Not now', () => { this.state = { ...this.state, phase: 'idle', offer: undefined }; this.renderPanel(); }, 'btn btn-text'), btn('Start', () => this.startTimed(weekId, dayId, ex), 'btn btn-primary', 'session-timed-start')),
      );
      this.panel.dataset['phase'] = 'offer';
      return;
    }

    if (s.phase === 'idle' || !t) {
      const ctxWeek = this.context;
      const timed = ctxWeek ? ctxWeek.week.exercises.filter((ex) => ex.timedSec && !exerciseDone(ctxWeek.day, ex)) : [];
      replace(
        this.panel,
        h('div', { class: 'sess-idle' }, h('span', { class: 'muted' }, `Type a set and the ${formatSeconds(this.restSec())} rest starts`), btn(`Rest ${formatSeconds(this.restSec())}`, () => this.startRest('Rest'), 'btn btn-sm', 'session-rest-start')),
        timed.length && ctxWeek
          ? h('div', { class: 'sess-timed' }, ...timed.map((ex) => btn(`${ex.name}: ${ex.sets} × ${formatSeconds(ex.timedSec || 0)}`, () => this.startTimed(ctxWeek.week.id, ctxWeek.day.id, ex), 'btn btn-sm', 'session-timed')))
          : null,
      );
      this.panel.dataset['phase'] = 'idle';
      this.countdownEl = null;
      return;
    }

    const finished = t.state === 'finished';
    this.countdownEl = h('div', { class: `sess-count${finished ? ' sess-count-done' : ''}`, dataset: { testid: 'session-countdown' } }, '0:00');
    const actions = finished
      ? [btn(`Repeat ${formatSeconds(s.baseSec)}`, () => this.repeat(), 'btn', 'session-repeat'), btn('Off', () => this.off(), 'btn btn-primary', 'session-off')]
      : [
          btn(`−${step} s`, () => this.adjust(-1), 'btn', 'session-minus'),
          btn(`+${step} s`, () => this.adjust(1), 'btn', 'session-plus'),
          s.seq ? btn(s.phase === 'work' ? 'Done → rest' : 'Next set', () => this.skip(), 'btn', 'session-skip') : null,
          btn('Off', () => this.off(), 'btn btn-primary', 'session-off'),
        ];
    replace(
      this.panel,
      h('div', { class: 'sess-label' }, s.phase === 'work' ? svg(icons.dumbbell, 'icon icon-sm') : svg(icons.timer, 'icon icon-sm'), s.label),
      this.countdownEl,
      h('div', { class: 'sess-sub' }, finished ? (s.phase === 'work' ? 'Time!' : 'Rest over') : s.phase === 'work' ? 'Go!' : 'Resting'),
      h('div', { class: 'sess-actions' }, ...actions),
    );
    this.panel.dataset['phase'] = finished ? 'finished' : s.phase;
    this.updateCountdown();
  }
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
  controller.setContext(week, day);
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
  const grid = renderGrid(service, ctx, week, settings, { highlightDayId: day?.id });
  return h(
    'div',
    { class: 'wk sess', dataset: { testid: 'session' } },
    head,
    h('div', { class: 'wk-scroll' }, h('div', { class: 'wk-weeks' }, h('section', { class: 'wk-week', dataset: { week: week.id } }, h('div', { class: 'wk-row' }, grid)))),
    controller.panel,
  );
}
