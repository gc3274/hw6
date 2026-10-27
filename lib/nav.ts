// The admin top bar, in labelled groups. "Roasts" is the AI-generated media,
// which lives at /media. Every href is a top-level sibling, so exactly one
// item matches any admin page.
export type NavItem = { href: string; label: string };
export type NavGroup = { label: string; items: readonly NavItem[] };

export const ADMIN_NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Content",
    items: [
      { href: "/", label: "Overview" },
      { href: "/users", label: "Users" },
      { href: "/images", label: "Images" },
      { href: "/media", label: "Roasts" },
      { href: "/votes", label: "Votes & ratings" },
    ],
  },
  {
    label: "Prompts",
    items: [
      { href: "/prompt-chains", label: "Chains & steps" },
      { href: "/chain-mix", label: "Chain mix" },
      { href: "/terms", label: "Terms" },
      { href: "/examples", label: "Examples" },
    ],
  },
  {
    label: "LLM",
    items: [
      { href: "/llm-models", label: "Models" },
      { href: "/llm-providers", label: "Providers" },
      { href: "/requests", label: "Requests" },
      { href: "/llm-responses", label: "Responses" },
    ],
  },
  {
    label: "Access",
    items: [
      { href: "/signup-domains", label: "Sign-up domains" },
      { href: "/whitelist", label: "Email whitelist" },
    ],
  },
];

export const ADMIN_NAV: readonly NavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

// "/" matches only itself; a section also matches its detail pages (/media/<id>)
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
