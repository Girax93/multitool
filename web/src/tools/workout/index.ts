// Workout companion: Excel-style weekly grid with numbered footnotes, colour
// codes, marks and optional bodyweight, plus a workout mode that runs rest and
// hold timers through the Timers tool. Pure logic in model.ts, persistence in
// service.ts, UI in view.ts / session.ts / editors.ts / settings-view.ts.

import { registerTool, type ToolContext } from '../../core/registry.js';
import { signal } from '../../core/store.js';
import { icons } from '../../ui/icons.js';
import { WorkoutService } from './service.js';
import { mountWorkoutView } from './view.js';

let service: WorkoutService | null = null;
const status = signal<string | null>(null);

registerTool({
  id: 'workout',
  name: 'Workout Companion',
  description: 'Sets, reps and notes in a weekly grid; workout mode with rest timers.',
  icon: icons.dumbbell,
  order: 20,
  status,
  async init(ctx: ToolContext) {
    service = new WorkoutService(ctx);
    service.status.subscribe((s) => status.set(s));
    await service.init();
  },
  mount(host, ctx) {
    if (!service) throw new Error('Workout service not initialised');
    return mountWorkoutView(host, ctx, service);
  },
});
