/**
 * GuideBottomNav — fixed bottom nav for the mobile Guide View.
 *
 * 4 slots: Today / Students / Done / Help.
 *
 * Pure server-rendered component (no useState) — the active tab is decided
 * server-side from the route segment so we never ship JS for nav state.
 *
 * Touch targets: each tab is 56px tall (well above the 44px iOS minimum).
 *
 * Accessibility: rendered as a `<nav>` with `aria-label`, each tab is an
 * anchor with `aria-current="page"` when active.
 */
import Link from "next/link";

export type GuideNavTab = "today" | "students" | "done" | "help";

interface GuideBottomNavProps {
  active: GuideNavTab;
}

interface NavItem {
  tab: GuideNavTab;
  label: string;
  href: string;
  /** Inline SVG glyph — no external icon dep. */
  glyph: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    tab: "today",
    label: "Today",
    href: "/dashboard/guide",
    glyph: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    tab: "students",
    label: "Students",
    href: "/dashboard/guide?tab=students",
    glyph: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    tab: "done",
    label: "Done",
    href: "/dashboard/guide?tab=done",
    glyph: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
  },
  {
    tab: "help",
    label: "Help",
    href: "/dashboard/guide?tab=help",
    glyph: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

export function GuideBottomNav({ active }: GuideBottomNavProps) {
  return (
    <nav
      aria-label="Guide queue navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = item.tab === active;
          return (
            <li key={item.tab} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-14 min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  isActive
                    ? "text-indigo-600"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span aria-hidden="true">{item.glyph}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
