import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { ADMIN_NAV_GROUPS } from "@/lib/nav";
import NavLink from "./NavLink";
import SubmitButton from "./SubmitButton";
import Wordmark from "./Wordmark";
import { focusRing } from "./ui";

type AdminShellProps = {
  email: string | null;
  children: ReactNode;
};

// Top bar plus the page frame: the wordmark and account on the first row, then
// the sections in labelled groups that sit side by side on wide screens and
// stack on phones.
export default function AdminShell({ email, children }: AdminShellProps) {
  return (
    <>
      <a
        href="#main"
        className={`sr-only rounded-full bg-surface px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 ${focusRing}`}
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center gap-x-6">
            <Link href="/" className={`min-w-0 flex-1 rounded-md ${focusRing}`}>
              <Wordmark />
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              {email && (
                <span className="hidden max-w-56 truncate text-sm text-muted sm:inline" title={email}>
                  {email}
                </span>
              )}
              <form action={signOut}>
                <SubmitButton variant="secondary" size="sm" pendingText="Signing out…">
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </div>
          <nav aria-label="Admin" className="mt-3">
            <div className="flex flex-col gap-y-2 lg:flex-row lg:flex-wrap lg:gap-x-6">
              {ADMIN_NAV_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-wrap items-center gap-x-1 gap-y-1">
                  {/* Not a heading: it would come before each page's h1 */}
                  <p
                    id={`nav-${group.label.toLowerCase()}`}
                    className="w-20 shrink-0 text-xs font-semibold tracking-wide text-muted uppercase lg:w-auto lg:pr-1"
                  >
                    {group.label}
                  </p>
                  <ul aria-labelledby={`nav-${group.label.toLowerCase()}`} className="flex flex-wrap gap-1">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <NavLink href={item.href}>{item.label}</NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
