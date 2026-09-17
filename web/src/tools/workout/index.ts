// Workout log: Excel-style weekly grid with numbered footnotes, colour codes,
// marks and optional bodyweight. Pure logic in model.ts, persistence in
// service.ts, UI in view.ts / editors.ts / settings-view.ts.

import { registerTool, type ToolContext } from '../../core/registry.js';
import { signal } from '../../core/store.js';
import { icons } from '../../ui/icons.js';
import { WorkoutService } from './service.js';
import { mountWorkoutView } from './view.js';

let service: WorkoutService | null = null;
const status = signal<string | null>(null);

registerTool({
  id: 'workout',
  name: 'Workout log',
  description: 'Sets, reps and notes in a spreadsheet-style weekly grid.',
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
