import { provideService, registerTool, type ToolContext } from '../../core/registry.js';
import { signal } from '../../core/store.js';
import { icons } from '../../ui/icons.js';
import { TimerService } from './service.js';
import { mountTimerView } from './view.js';

let service: TimerService | null = null;
const status = signal<string | null>(null);

registerTool({
  id: 'timer',
  name: 'Timers',
  description: 'Named countdowns from 1 second to 7 days, one-off or saved.',
  icon: icons.timer,
  order: 10,
  status,
  async init(ctx: ToolContext) {
    service = new TimerService(ctx);
    service.status.subscribe((s) => status.set(s));
    await service.init();
    provideService('timer', service); // other tools (workout companion) run their countdowns through it
  },
  mount(host, ctx) {
    if (!service) throw new Error('Timer service not initialised');
    return mountTimerView(host, ctx, service);
  },
});
