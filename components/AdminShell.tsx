import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { ADMIN_NAV } from "@/lib/nav";
import NavLink from "./NavLink";
import SubmitButton from "./SubmitButton";
import Wordmark from "./Wordmark";
import { focusRing } from "./ui";

type AdminShellProps = {
  email: string | null;
  children: ReactNode;
};

// Top bar plus the page frame. One row on wide screens; on phones the nav drops
// to its own row under the wordmark and wraps.
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          {/* Takes the spare width on phones, so Sign out stays on the first row */}
          <Link href="/" className={`min-w-0 flex-1 rounded-md lg:flex-none ${focusRing}`}>
            <Wordmark />
          </Link>
          <nav aria-label="Admin" className="order-last w-full lg:order-none lg:w-auto">
            <ul className="-mx-3 flex flex-wrap gap-1 lg:mx-0">
              {ADMIN_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href}>{item.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
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
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
