// Иконки интерфейса (линейные, 24×24) — из прототипа.

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  chevLeft: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  book: '<path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v12H8.5A3.5 3.5 0 0 1 5 16.5z"/><path d="M5 16.5A3.5 3.5 0 0 1 8.5 13H19"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  camera:
    '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  phone:
    '<path d="M5 4h3.2l1.8 4.6-2.4 1.6a11 11 0 0 0 6.2 6.2l1.6-2.4L20 15.8V19a1.8 1.8 0 0 1-2 1.8A16 16 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4z"/>',
  message: '<path d="M4 5.5h16v11H9.5L5 20v-3.5H4z"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.8 3.8 0 0 0 7 18.5z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-7M3 20h18"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.5-3.5-5.5-3.8-5.5-1.2S10.5 8 12 8zM12 8c1.5-3.5 5.5-3.8 5.5-1.2S13.5 8 12 8z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  repeat:
    '<path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  health: '<path d="M12 3.5l7 3v5.5c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8V6.5z"/><path d="M12 9v6M9 12h6"/>',
  doc: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z"/><path d="M14 3.5v4h4M9.5 13h5M9.5 16.5h3.5"/>',
  compare:
    '<rect x="3.5" y="5" width="7.5" height="14" rx="1.5"/><rect x="13" y="5" width="7.5" height="14" rx="1.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  shield: '<path d="M12 3.5l7 3v5.5c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8V6.5z"/><path d="M9 12l2 2 4-4"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`i ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      // Разметка — константы выше, пользовательских данных в ней нет
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
