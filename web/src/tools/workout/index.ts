// Placeholder for the workout log. The real tool (Excel-style grid with the
// dot/asterisk/colour notation) lands once the notation questions are settled.

import { h, replace, svg } from '../../core/dom.js';
import { registerTool } from '../../core/registry.js';
import { icons } from '../../ui/icons.js';

registerTool({
  id: 'workout',
  name: 'Workout log',
  description: 'Sets, reps and notes in a spreadsheet-style grid.',
  icon: icons.dumbbell,
  order: 20,
  mount(host) {
    replace(
      host,
      h(
        'div',
        { class: 'empty' },
        svg(icons.dumbbell, 'icon icon-xl'),
        h('p', null, 'Coming next.'),
        h('p', { class: 'muted' }, 'The grid, colour codes and dot-notes are being built after the notation is confirmed.'),
      ),
    );
    return { unmount: () => undefined };
  },
});
