// The admin top bar. "Roasts" is the AI-generated media, which lives at /media.
export type NavItem = { href: string; label: string };

export const ADMIN_NAV: readonly NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Users" },
  { href: "/media", label: "Roasts" },
  { href: "/votes", label: "Votes & ratings" },
];

// "/" matches only itself; a section also matches its detail pages (/media/<id>)
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
