// Timer tool UI: a form to create timers and a live list of them.

import { h, replace, svg, clear } from '../../core/dom.js';
import type { ToolContext, ToolInstance } from '../../core/registry.js';
import { icons } from '../../ui/icons.js';
import {
  DAY,
  HOUR,
  MINUTE,
  SECOND,
  formatCountdown,
  formatDuration,
  msToParts,
  parseDurationText,
  partsToMs,
  progress,
  remainingMs,
  sortTimers,
  validateDuration,
  type Timer,
} from './model.js';
import type { TimerService } from './service.js';

const QUICK_ADD: { label: string; ms: number }[] = [
  { label: '+30s', ms: 30 * SECOND },
  { label: '+1m', ms: MINUTE },
  { label: '+5m', ms: 5 * MINUTE },
  { label: '+15m', ms: 15 * MINUTE },
  { label: '+1h', ms: HOUR },
  { label: '+1d', ms: DAY },
];

export function mountTimerView(host: HTMLElement, ctx: ToolContext, service: TimerService): ToolInstance {
  const unsubs: (() => void)[] = [];
  const form = renderForm(service, ctx);
  const list = h('div', { class: 'timer-list', dataset: { testid: 'timer-list' } });
  replace(host, form.el, list);

  // Rebuild the list when the set of timers changes; update countdowns on tick.
  const cards = new Map<string, TimerCard>();
  const rebuild = (timers: Timer[]): void => {
    const now = Date.now();
    const sorted = sortTimers(timers, now);
    const seen = new Set<string>();
    clear(list);
    if (sorted.length === 0) {
      list.appendChild(h('p', { class: 'muted center' }, 'No timers yet. Create one above.'));
    }
    for (const t of sorted) {
      seen.add(t.id);
      let card = cards.get(t.id);
      if (!card) {
        card = new TimerCard(t.id, service, form);
        cards.set(t.id, card);
      }
      card.update(t, now);
      list.appendChild(card.el);
    }
    for (const id of [...cards.keys()]) if (!seen.has(id)) cards.delete(id);
  };
  unsubs.push(service.timers.subscribe(rebuild));
  unsubs.push(
    service.tick.subscribe(() => {
      const now = Date.now();
      for (const t of service.timers.get()) cards.get(t.id)?.updateCountdown(t, now);
    }, false),
  );

  return {
    unmount: () => {
      for (const u of unsubs) u();
      cards.clear();
    },
  };
}

// ---- Create / edit form ------------------------------------------------------

interface TimerForm {
  el: HTMLElement;
  edit(t: Timer): void;
}

function renderForm(service: TimerService, ctx: ToolContext): TimerForm {
  let editingId: string | null = null;

  const nameInput = h('input', { type: 'text', class: 'input', placeholder: 'Name (optional)', maxLength: 60, dataset: { testid: 'timer-name' } });
  const num = (label: string, max: number, testid: string): HTMLInputElement =>
    h('input', {
      type: 'number',
      class: 'input input-num',
      inputMode: 'numeric',
      min: 0,
      max,
      placeholder: '0',
      'aria-label': label,
      dataset: { testid },
    });
  const days = num('Days', 7, 'timer-days');
  const hours = num('Hours', 23, 'timer-hours');
  const minutes = num('Minutes', 59, 'timer-minutes');
  const seconds = num('Seconds', 59, 'timer-seconds');
  const textInput = h('input', {
    type: 'text',
    class: 'input',
    placeholder: 'or type: 1h 30m, 90s, 10:00 …',
    dataset: { testid: 'timer-text' },
    onChange: () => {
      const ms = parseDurationText(textInput.value);
      if (ms !== null) {
        setParts(ms);
        textInput.value = '';
      }
    },
  });
  const savedInput = h('input', { type: 'checkbox', dataset: { testid: 'timer-saved' } });
  const error = h('p', { class: 'error', hidden: true, dataset: { testid: 'timer-error' } });

  const getMs = (): number =>
    partsToMs({
      days: parseInt(days.value, 10) || 0,
      hours: parseInt(hours.value, 10) || 0,
      minutes: parseInt(minutes.value, 10) || 0,
      seconds: parseInt(seconds.value, 10) || 0,
    });
  const setParts = (ms: number): void => {
    const p = msToParts(ms);
    days.value = p.days ? String(p.days) : '';
    hours.value = p.hours ? String(p.hours) : '';
    minutes.value = p.minutes ? String(p.minutes) : '';
    seconds.value = p.seconds ? String(p.seconds) : '';
  };
  const showError = (msg: string | null): void => {
    error.textContent = msg ?? '';
    error.hidden = !msg;
  };
  const resetForm = (): void => {
    editingId = null;
    nameInput.value = '';
    setParts(0);
    textInput.value = '';
    savedInput.checked = false;
    showError(null);
    startBtn.hidden = false;
    addBtn.textContent = 'Add';
    cancelBtn.hidden = true;
    heading.textContent = 'New timer';
  };

  const submit = (start: boolean): void => {
    const pending = parseDurationText(textInput.value);
    if (pending !== null) {
      setParts(pending);
      textInput.value = '';
    }
    const ms = getMs();
    const err = validateDuration(ms);
    if (err) {
      showError(err);
      return;
    }
    if (editingId) {
      service.update(editingId, { name: nameInput.value.trim() || formatDuration(ms), durationMs: ms, saved: savedInput.checked });
      ctx.toast('Timer updated');
    } else {
      service.add({ name: nameInput.value, durationMs: ms, saved: savedInput.checked, start });
    }
    resetForm();
  };

  const heading = h('h2', { class: 'card-title' }, 'New timer');
  // Start is the form's submit button (Enter key starts); the others must not submit.
  const startBtn = h('button', { type: 'submit', class: 'btn btn-primary', dataset: { testid: 'timer-start' } }, svg(icons.play), 'Start');
  const addBtn = h('button', { type: 'button', class: 'btn', dataset: { testid: 'timer-add' }, onClick: () => submit(false) }, 'Add');
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-text', hidden: true, onClick: resetForm }, 'Cancel');

  const el = h(
    'form',
    {
      class: 'card timer-form',
      onSubmit: (e: Event) => {
        e.preventDefault();
        submit(true);
      },
    },
    heading,
    nameInput,
    h(
      'div',
      { class: 'duration-grid' },
      h('label', { class: 'duration-cell' }, days, h('span', null, 'days')),
      h('label', { class: 'duration-cell' }, hours, h('span', null, 'hours')),
      h('label', { class: 'duration-cell' }, minutes, h('span', null, 'min')),
      h('label', { class: 'duration-cell' }, seconds, h('span', null, 'sec')),
    ),
    h(
      'div',
      { class: 'chips' },
      ...QUICK_ADD.map((q) =>
        h('button', { type: 'button', class: 'chip', onClick: () => setParts(Math.min(7 * DAY, getMs() + q.ms)) }, q.label),
      ),
      h('button', { type: 'button', class: 'chip chip-muted', onClick: () => setParts(0) }, 'clear'),
    ),
    textInput,
    error,
    h(
      'div',
      { class: 'row row-between' },
      h('label', { class: 'check' }, savedInput, h('span', null, 'Keep as saved timer')),
      h('div', { class: 'row' }, cancelBtn, addBtn, startBtn),
    ),
  );

  return {
    el,
    edit(t: Timer) {
      editingId = t.id;
      heading.textContent = `Edit “${t.name}”`;
      nameInput.value = t.name;
      setParts(t.durationMs);
      savedInput.checked = t.saved;
      startBtn.hidden = true;
      addBtn.textContent = 'Save';
      cancelBtn.hidden = false;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameInput.focus();
    },
  };
}

// ---- Timer card --------------------------------------------------------------

class TimerCard {
  readonly el: HTMLElement;
  private readonly countdown = h('div', { class: 'countdown', dataset: { testid: 'countdown' } });
  private readonly bar = h('div', { class: 'progress-bar' });
  private readonly nameEl = h('div', { class: 'timer-name' });
  private readonly meta = h('div', { class: 'timer-meta' });
  private readonly actions = h('div', { class: 'timer-actions' });
  private state: Timer['state'] | null = null;

  constructor(
    private readonly id: string,
    private readonly service: TimerService,
    private readonly form: TimerForm,
  ) {
    this.el = h(
      'article',
      { class: 'card timer-card', dataset: { timer: id } },
      h('div', { class: 'timer-head' }, this.nameEl, this.meta),
      this.countdown,
      h('div', { class: 'progress' }, this.bar),
      this.actions,
    );
  }

  /** "1m 30s · saved · on Android app" — the device tag only while the run belongs to another device. */
  private metaText(t: Timer): string {
    const elsewhere = t.state !== 'idle' && !this.service.mine(t) && t.deviceName ? ` · on ${t.deviceName}` : '';
    return `${formatDuration(t.durationMs)}${t.saved ? ' · saved' : ''}${elsewhere}`;
  }

  update(t: Timer, now: number): void {
    this.nameEl.textContent = t.name;
    this.meta.textContent = this.metaText(t);
    this.el.dataset.state = t.state;
    // a timer that finished on another device is "done" here, not ringing (it rings there)
    this.el.classList.toggle('ringing', t.state === 'finished' && this.service.mine(t));
    if (this.state !== t.state) {
      this.state = t.state;
      this.renderActions(t);
    }
    this.updateCountdown(t, now);
  }

  updateCountdown(t: Timer, now: number): void {
    const remaining = remainingMs(t, now);
    const text = t.state === 'finished' ? 'Done!' : formatCountdown(t.state === 'running' ? remaining + 999 : remaining);
    if (this.countdown.textContent !== text) this.countdown.textContent = text;
    this.bar.style.width = `${(progress(t, now) * 100).toFixed(2)}%`;
    if (t.state === 'running' && t.endsAt !== undefined) {
      const ends = new Date(t.endsAt);
      const sameDay = ends.toDateString() === new Date(now).toDateString();
      this.meta.textContent = `${this.metaText(t)} · ends ${
        sameDay ? ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ends.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      }`;
    }
  }

  private renderActions(t: Timer): void {
    const s = this.service;
    const id = this.id;
    const btn = (label: string, icon: string, onClick: () => void, cls = 'btn', testid = ''): HTMLElement =>
      h('button', { class: cls, onClick, dataset: testid ? { testid } : undefined, 'aria-label': label }, svg(icon), label);
    const iconBtn = (label: string, icon: string, onClick: () => void): HTMLElement =>
      h('button', { class: 'iconbtn iconbtn-sm', 'aria-label': label, title: label, onClick }, svg(icon));

    const pin = iconBtn(t.saved ? 'Unsave' : 'Save', icons.pin, () => s.toggleSaved(id));
    pin.classList.toggle('active', t.saved);

    let main: HTMLElement[];
    switch (t.state) {
      case 'running':
        main = [btn('Pause', icons.pause, () => s.pause(id)), btn('Stop', icons.stop, () => s.stop(id), 'btn', 'timer-stop')];
        break;
      case 'paused':
        main = [btn('Resume', icons.play, () => s.resume(id), 'btn btn-primary'), btn('Stop', icons.stop, () => s.stop(id))];
        break;
      case 'finished':
        main = [
          btn('Off', icons.check, () => s.dismiss(id), 'btn btn-primary', 'timer-off'),
          btn('Restart', icons.restart, () => s.restart(id), 'btn', 'timer-restart'),
        ];
        break;
      default:
        main = [
          btn('Start', icons.play, () => s.start(id), 'btn btn-primary', 'timer-start-card'),
          iconBtn('Edit', icons.edit, () => this.form.edit(t)),
          iconBtn('Delete', icons.trash, () => s.remove(id)),
        ];
    }
    replace(this.actions, ...main, h('span', { class: 'spacer' }), pin);
  }
}
