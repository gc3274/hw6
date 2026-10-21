import "server-only";
import { IMAGE_BUCKET } from "@/lib/captions";
import { selectAll } from "@/lib/data/select-all";
import { ilikeAny, rangeFor, type UserQuery } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";
import {
  userActivity,
  type ActivityCaption,
  type ActivityImage,
  type ActivityVote,
  type UserActivity,
} from "@/lib/users";

// Read only: nothing here writes, and the pages have no controls that could.
// Every read throws on error, so a page never shows half-loaded numbers as real.

export const POSTS_LIMIT = 50;
export const VOTES_LIMIT = 20;

type ProfileListRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_superadmin: boolean;
  created_at: string;
};

export type UserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  // profiles.email: typed by the user and editable by them, so never trusted
  profileEmail: string | null;
  isSuperadmin: boolean;
  createdAt: string;
  activity: UserActivity;
};

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

export async function listUsers(q: UserQuery): Promise<{ rows: UserRow[]; total: number }> {
  const db = await adminDb();

  let query = db
    .from("profiles")
    .select("id, email, first_name, last_name, is_superadmin, created_at", { count: "exact" });
  // q went through searchTerm(), so it can't break out of the quoted or() values
  if (q.q) query = query.or(ilikeAny(["first_name", "last_name", "email"], q.q));
  if (q.role === "superadmin") query = query.eq("is_superadmin", true);
  // id last, so pages never overlap when names or join times tie
  query =
    q.sort === "name"
      ? query
          .order("first_name", { nullsFirst: false })
          .order("last_name", { nullsFirst: false })
          .order("id")
      : query.order("created_at", { ascending: false }).order("id");

  const [from, to] = rangeFor(q.page);
  const { data, error, count } = await query
    .range(from, to)
    .overrideTypes<ProfileListRow[], { merge: false }>();
  if (error) throw fail("Users list", error);

  const profiles = data ?? [];
  const total = count ?? 0;
  if (profiles.length === 0) return { rows: [], total };

  // profiles can't be embedded from images or captions (their user_id points at
  // auth.users), so the activity is three reads for just this page of users
  const ids = profiles.map((p) => p.id);
  const [images, captions, votes] = await Promise.all([
    selectAll<ActivityImage>(() => db.from("images").select("user_id, topic").in("user_id", ids), ["id"]),
    selectAll<ActivityCaption>(
      () => db.from("captions").select("user_id, is_public, critic_id").in("user_id", ids),
      ["id"],
    ),
    selectAll<ActivityVote>(() => db.from("caption_votes").select("user_id").in("user_id", ids), [
      "caption_id",
      "user_id",
    ]),
  ]);
  const activity = userActivity(ids, images.rows, captions.rows, votes.rows);

  return {
    rows: profiles.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      profileEmail: p.email,
      isSuperadmin: p.is_superadmin,
      createdAt: p.created_at,
      activity: activity[p.id],
    })),
    total,
  };
}

type ProfileDetailRow = ProfileListRow & { bio: string | null; updated_at: string };

type PostRow = {
  id: string;
  image_path: string;
  topic: string | null;
  created_at: string;
  captions: { id: string; critic_id: number | null; rating: number | null; is_public: boolean }[];
};

type VoteRow = {
  caption_id: string;
  value: -1 | 1;
  created_at: string;
  captions: {
    id: string;
    content: string;
    user_id: string;
    critics: { name: string; emoji: string } | null;
  } | null;
};

export type UserPost = {
  id: string;
  imageUrl: string;
  topic: string | null;
  createdAt: string;
  // One entry per critic's roast on the post, null where the critic gave no score
  roastRatings: (number | null)[];
  publicRoasts: number;
  legacyCaptions: number;
};

export type UserVote = {
  captionId: string;
  value: -1 | 1;
  createdAt: string;
  content: string | null;
  // null on a legacy caption
  critic: { name: string; emoji: string } | null;
  // The voter owns the post the roast is on
  ownPost: boolean;
};

export type UserDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  isSuperadmin: boolean;
  createdAt: string;
  updatedAt: string;
  // From Supabase Auth (Google), the email to trust; null if Auth couldn't be read
  signInEmail: string | null;
  // From the profile, user-supplied
  profileEmail: string | null;
  posts: UserPost[];
  postCount: number;
  votes: UserVote[];
  upvotes: number;
  downvotes: number;
};

// null when there is no profile with this id, so the page can 404
export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const db = await adminDb();

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, email, first_name, last_name, bio, is_superadmin, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<ProfileDetailRow>();
  if (error) throw fail("User profile", error);
  if (!profile) return null;

  const votesBy = (value: -1 | 1) =>
    db
      .from("caption_votes")
      .select("caption_id", { count: "exact", head: true })
      .eq("user_id", id)
      .eq("value", value);

  const [auth, posts, votes, up, down] = await Promise.all([
    db.auth.admin.getUserById(id),
    db
      .from("images")
      .select("id, image_path, topic, created_at, captions(id, critic_id, rating, is_public)", {
        count: "exact",
      })
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(POSTS_LIMIT)
      .overrideTypes<PostRow[], { merge: false }>(),
    db
      .from("caption_votes")
      .select("caption_id, value, created_at, captions(id, content, user_id, critics(name, emoji))")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .order("caption_id")
      .limit(VOTES_LIMIT)
      .overrideTypes<VoteRow[], { merge: false }>(),
    votesBy(1),
    votesBy(-1),
  ]);
  if (posts.error) throw fail("User posts", posts.error);
  if (votes.error) throw fail("User votes", votes.error);
  if (up.error) throw fail("User upvotes", up.error);
  if (down.error) throw fail("User downvotes", down.error);
  // The rest of the page is still worth showing without the sign-in email
  if (auth.error) console.error("Reading the auth user failed", auth.error);

  const bucket = db.storage.from(IMAGE_BUCKET);

  return {
    id: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    bio: profile.bio,
    isSuperadmin: profile.is_superadmin,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    signInEmail: auth.data.user?.email ?? null,
    profileEmail: profile.email,
    posts: (posts.data ?? []).map((p) => {
      const roasts = p.captions.filter((c) => c.critic_id !== null);
      return {
        id: p.id,
        imageUrl: bucket.getPublicUrl(p.image_path).data.publicUrl,
        topic: p.topic,
        createdAt: p.created_at,
        roastRatings: roasts.map((c) => c.rating),
        publicRoasts: roasts.filter((c) => c.is_public).length,
        legacyCaptions: p.captions.length - roasts.length,
      };
    }),
    postCount: posts.count ?? 0,
    votes: (votes.data ?? []).map((v) => ({
      captionId: v.caption_id,
      value: v.value,
      createdAt: v.created_at,
      content: v.captions?.content ?? null,
      critic: v.captions?.critics ?? null,
      ownPost: v.captions?.user_id === id,
    })),
    upvotes: up.count ?? 0,
    downvotes: down.count ?? 0,
  };
}
