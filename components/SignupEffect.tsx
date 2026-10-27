import { errorBox, noticeBox } from "@/components/ui";
import { signupSummary, type SignupLists } from "@/lib/access";

// Who can create an account right now, from both lists as they stand. Shown on
// the sign-up domain and whitelist pages, so a change's effect is in view.
export default function SignupEffect({ lists }: { lists: SignupLists }) {
  const { closed, text } = signupSummary(lists);
  return (
    <section aria-label="Who can sign up" className={closed ? errorBox : noticeBox}>
      <p className="font-medium">{text}</p>
      <p className="mt-1 text-muted">
        Only new accounts are checked: existing accounts, the superadmin included, are never
        affected. The check is the Before User Created hook, which must be switched on in Supabase
        (Authentication → Hooks). Accounts added from the Supabase dashboard skip it.
      </p>
    </section>
  );
}
