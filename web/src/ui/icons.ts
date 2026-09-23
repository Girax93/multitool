// Inline SVG icons (24x24, stroke-based, use currentColor).

const base = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  back: base('<path d="M15 18l-6-6 6-6"/>'),
  settings: base(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ),
  toolbox: base(
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/><path d="M10 12v2h4v-2"/>',
  ),
  timer: base('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/><path d="M12 2v3"/>'),
  dumbbell: base(
    '<path d="M6 8v8"/><path d="M18 8v8"/><path d="M3 10v4"/><path d="M21 10v4"/><path d="M6 12h12"/><rect x="5" y="7" width="2" height="10" rx="0.5"/><rect x="17" y="7" width="2" height="10" rx="0.5"/>',
  ),
  play: base('<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>'),
  pause: base('<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>'),
  stop: base('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>'),
  restart: base('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  trash: base('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  pin: base('<path d="M12 17v5"/><path d="M8 3h8l-1 7 3 3H6l3-3z"/>'),
  plus: base('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  check: base('<path d="M20 6L9 17l-5-5"/>'),
  bell: base('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  download: base('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>'),
  edit: base('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  close: base('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
  chevronLeft: base('<path d="M15 18l-6-6 6-6"/>'),
  chevronRight: base('<path d="M9 18l6-6-6-6"/>'),
  more: base('<circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/>'),
  star: base('<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor" stroke="none"/>'),
  arrowUp: base('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
  arrowDown: base('<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>'),
  upload: base('<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 21h16"/>'),
  cloud: base('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A7 7 0 0 0 4.3 12.5 3.5 3.5 0 0 0 6 19z"/>'),
  cloudOff: base('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A7 7 0 0 0 4.3 12.5 3.5 3.5 0 0 0 6 19z"/><path d="M3 3l18 18"/>'),
  cloudSync: base('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A7 7 0 0 0 4.3 12.5 3.5 3.5 0 0 0 6 19z"/><path d="M9.5 14.5h5"/><path d="M12.5 12.5l2 2-2 2"/>'),
  link: base('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>'),
  key: base('<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L21 2"/><path d="M15 8l3 3"/><path d="M18 5l3 3"/>'),
  refresh: base('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'),
  copy: base('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  phone: base('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
  monitor: base('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'),
  chart: base('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  scale: base('<path d="M12 3v18"/><path d="M5 7h14"/><path d="M3 15l2-8 2 8a2 2 0 0 1-4 0z"/><path d="M17 15l2-8 2 8a2 2 0 0 1-4 0z"/>'),
};
