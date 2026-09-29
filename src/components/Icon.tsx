// Stroke icons on a 24px grid, drawn in currentColor.
const paths = {
  // Tabs
  overview: 'M4 19h16 M7 15v-4 M12 15V6 M17 15v-7',
  transactions: 'M7 4v16 M4 7l3-3 3 3 M17 20V4 M14 17l3 3 3-3',
  accounts:
    'M3 7.5A2.5 2.5 0 0 1 5.5 5H17a1 1 0 0 1 1 1v2 M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5Z M16 14h.01',
  installments: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z M4 10h16 M8 3v4 M16 3v4 M8 14h2 M14 14h2 M8 17h2',
  // UI
  globe: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M3 12h18 M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9Z',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  search: 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M20 20l-3.6-3.6',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M3 10h18 M7 15h3',
  trendUp: 'M4 16l5-5 4 4 7-7 M15 8h5v5',
  trendDown: 'M4 8l5 5 4-4 7 7 M15 16h5v-5',
  alert: 'M12 4L2.5 20h19Z M12 10v4 M12 17h.01',
  cloudOff: 'M3 3l18 18 M8.5 8.6A5 5 0 0 0 7 18h10.5 M11 6.2A6 6 0 0 1 18 11a4 4 0 0 1 2.4 6.6',
  refresh: 'M20 11a8 8 0 0 0-14.8-4 M4 4v4h4 M4 13a8 8 0 0 0 14.8 4 M20 20v-4h-4',
  signOut: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 17l5-5-5-5 M15 12H4',
  // Categories
  salary: 'M4 8h16v11H4Z M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M4 13h16',
  freelance: 'M5 6h14v9H5Z M3 18h18',
  investments: 'M4 19h16 M4 15l5-5 4 4 7-7 M15 7h5v5',
  income: 'M12 4v16 M6 14l6 6 6-6',
  home: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
  utilities: 'M13 3L5 14h6l-1 7 8-11h-6Z',
  groceries: 'M3 4h2l2.4 11h10.2L20 7H6.3 M9 20h.01 M17 20h.01',
  restaurants: 'M7 3v18 M4 3v5a3 3 0 0 0 6 0V3 M17 21V3c-2 1-3 3-3 6v4h3',
  transport: 'M6 17V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v10 M6 12h12 M5 17h14 M8 17v2 M16 17v2',
  subscriptions: 'M17 3l3 3-3 3 M4 11V9a3 3 0 0 1 3-3h13 M7 21l-3-3 3-3 M20 13v2a3 3 0 0 1-3 3H4',
  shopping: 'M5 8h14l-1 12H6Z M9 8V6a3 3 0 0 1 6 0v2',
  health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  leisure: 'M4 7h16v10H4Z M8 7v10 M16 7v10 M4 12h4 M16 12h4',
  travel: 'M3 11l18-8-8 18-2-8Z M11 13l10-10',
  education: 'M3 9l9-5 9 5-9 5Z M7 11v5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-5',
  taxes: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21Z M10 8h4 M10 12h4',
  other: 'M6 12h.01 M12 12h.01 M18 12h.01',
  transfer: 'M4 8h14 M14 4l4 4-4 4 M20 16H6 M10 12l-4 4 4 4',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, className = 'size-6', strokeWidth = 1.9 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={paths[name]} />
    </svg>
  )
}

const categoryIcons: Record<string, IconName> = {
  salary: 'salary',
  freelance: 'freelance',
  investments: 'investments',
  'other-income': 'income',
  housing: 'home',
  utilities: 'utilities',
  groceries: 'groceries',
  food: 'restaurants',
  transport: 'transport',
  subscriptions: 'subscriptions',
  shopping: 'shopping',
  health: 'health',
  leisure: 'leisure',
  travel: 'travel',
  education: 'education',
  taxes: 'taxes',
  'other-expense': 'other',
  transfer: 'transfer',
  'card-payment': 'card',
}

export function categoryIcon(categoryId: string | undefined): IconName {
  return (categoryId && categoryIcons[categoryId]) || 'other'
}
