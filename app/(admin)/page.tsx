import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import BarList from "@/components/charts/BarList";
import ChartFrame from "@/components/charts/ChartFrame";
import Columns from "@/components/charts/Columns";
import DivergingBar from "@/components/charts/DivergingBar";
import Dumbbell from "@/components/charts/Dumbbell";
import Meter from "@/components/charts/Meter";
import RangeStrip from "@/components/charts/RangeStrip";
import StackedBar from "@/components/charts/StackedBar";
import RatingPill from "@/components/RatingPill";
import StatTile from "@/components/StatTile";
import { card, errorBox, textLink } from "@/components/ui";
import { loadStatsDataset, type StatsDataset } from "@/lib/data/stats";
import { requireSuperadmin } from "@/lib/dal";
import { dayLabel, durationLabel, fmt1, nouns, nyDayKey, shareLabel } from "@/lib/format";
import { topicInfo } from "@/lib/roasts";
import {
  characterChecks,
  criticHarshness,
  criticLeaderboard,
  crowdVerdict,
  crowdVsCritic,
  decisionDelays,
  kpis,
  mean,
  median,
  panelInflation,
  pipelineHealth,
  postRateByRating,
  round1,
  topicBreakdown,
  uploadsPerWeek,
  voteLedger,
  type CriticHarshness,
  type CriticRow,
  type Kpis,
} from "@/lib/stats";

export const metadata: Metadata = {
  title: "Overview",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

// Long lists show their top rows; the table twin always has every row
const LIST_LIMIT = 10;

const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${fmt1(Math.abs(x))}`;

// "avg 4.5 from 3": a mean only from two scores; one score is shown as itself
function scoreNote(scored: number, avg: number | null): string {
  if (scored === 0 || avg === null) return "no scores yet";
  if (scored === 1) return `one score: ${avg}`;
  return `avg ${fmt1(avg)} from ${scored}`;
}

export default async function OverviewPage() {
  await requireSuperadmin();

  const now = new Date();
  let data: StatsDataset | null = null;
  try {
    data = await loadStatsDataset();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the stats failed", error);
  }

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">How the panel is judging</h1>
      <p className="mt-2 max-w-prose text-muted">
        Every roast and vote, posted or not. Data as of {STAMP.format(now)}, New York time.
      </p>
      {data ? (
        <Overview data={data} now={now} />
      ) : (
        <p className={`${errorBox} mt-8`}>
          The stats couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Overview({ data, now }: { data: StatsDataset; now: Date }) {
  const { critics, captions, images, votes, attempts, profiles } = data;
  const k = kpis(images, captions, votes, profiles, attempts);

  return (
    <>
      <Hero k={k} />

      <Section
        id="critics"
        title="The critics"
        description="How each critic scores, whether they stay in character, and how the crowd takes them."
      >
        <HarshnessChart rows={criticHarshness(captions, critics)} roasts={k.roasts} />
        <CharacterChart data={data} roasts={k.roasts} />
        <LeaderboardChart data={data} roasts={k.roasts} />
      </Section>

      <Section
        id="owners"
        title="What owners dare to post"
        description="Owners see every roast first and choose which ones to make public."
      >
        <DaredChart data={data} roasts={k.roasts} />
        <InflationChart data={data} />
      </Section>

      <Section id="crowd" title="The crowd" description="Votes on posted roasts and legacy captions.">
        <CrowdChart data={data} />
        <LedgerChart data={data} />
      </Section>

      <Section
        id="pipeline"
        title="The pipeline"
        description="Uploads, topics, and what happens between a photo and its roasts."
      >
        <UploadsChart data={data} now={now} />
        <TopicsChart data={data} roastPhotos={k.roastPhotos} />
        <PipelineChart data={data} notes={k.notes} />
      </Section>

      <Method truncated={data.truncated} />
    </>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12">
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-12 lg:items-start">{children}</div>
    </section>
  );
}

function CriticName({ critic }: { critic: CriticRow }) {
  return (
    <span>
      <span aria-hidden="true">{critic.emoji}</span> {critic.name}
    </span>
  );
}

// The one number only the admin can know: the panel's average before owners pick
function Hero({ k }: { k: Kpis }) {
  const publicOnly = "Counting only posted roasts, as the public pages do:";
  let publicLine: string;
  if (k.scoredPublic === 0) publicLine = "Nothing scored is posted yet, so the public pages show no score.";
  else if (k.scoredPublic === 1) publicLine = `${publicOnly} ${k.panelMeanPublic}, from one roast.`;
  else publicLine = `${publicOnly} ${fmt1(k.panelMeanPublic)}, from ${k.scoredPublic}.`;

  return (
    <section aria-labelledby="hero-heading" className="mt-8 grid gap-4 lg:grid-cols-12">
      <div className={`${card} p-6 lg:col-span-5`}>
        <h2 id="hero-heading" className="text-sm text-muted">
          Panel average, every roast
        </h2>
        {k.scoredAll === 0 ? (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight">No scores yet</p>
            <p className="mt-3 max-w-sm text-sm text-muted">
              The average appears once a critic has scored a photo.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-[64px] leading-none font-semibold tracking-tight">
              {k.scoredAll === 1 ? k.panelMeanAll : fmt1(k.panelMeanAll)}
            </p>
            <p className="mt-3 max-w-sm text-sm">
              Out of 10, {k.scoredAll === 1 ? "from one scored roast" : `across ${k.scoredAll} scored roasts`},
              posted or not.
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted">{publicLine}</p>
          </>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-7">
        <StatTile label="Users" value={k.users.toLocaleString("en-US")} detail="with a profile" />
        <StatTile
          label="Posts roasted"
          value={k.roastPhotos.toLocaleString("en-US")}
          detail={k.legacyPhotos > 0 ? `plus ${nouns(k.legacyPhotos, "legacy post")}` : undefined}
        />
        <StatTile
          label="Roasts written"
          value={k.roasts.toLocaleString("en-US")}
          detail={`${k.roastsPosted.toLocaleString("en-US")} posted`}
        />
        <StatTile
          label="Votes"
          value={k.votes.toLocaleString("en-US")}
          detail={`${k.upvotes.toLocaleString("en-US")} up, ${k.downvotes.toLocaleString("en-US")} down`}
        />
        <StatTile
          label="Generations that saved"
          value={k.saved.toLocaleString("en-US")}
          detail={k.attempts > 0 ? `of ${nouns(k.attempts, "attempt")}` : "no attempts yet"}
        />
      </dl>
    </section>
  );
}

function harshNote(r: CriticHarshness): string {
  if (r.n === 0) return "no roasts yet";
  if (r.scored === 0) return `${nouns(r.n, "roast")}, none scored`;
  if (r.scored === 1) return `one score: ${r.min}`;
  return `mean ${fmt1(r.mean)}, ${r.scored} scored`;
}

function HarshnessChart({ rows, roasts }: { rows: CriticHarshness[]; roasts: number }) {
  return (
    <ChartFrame
      id="harshness"
      title="Harshness vs the brief"
      className="lg:col-span-7"
      description="Each critic’s lowest, average and highest score. The prompt says most things land between 2 and 7. Experts only judge their own topic, so they fill in slower."
      basis={nouns(roasts, "roast")}
      empty={roasts === 0 ? "No roasts yet. Each critic’s range appears once photos have been roasted." : null}
      table={{
        columns: [
          { label: "Critic" },
          { label: "Roasts", numeric: true },
          { label: "Scored", numeric: true },
          { label: "Mean", numeric: true },
          { label: "Lowest", numeric: true },
          { label: "Highest", numeric: true },
          { label: "Posted", numeric: true },
        ],
        rows: rows.map((r) => [
          r.critic.name,
          r.n,
          r.scored,
          r.scored >= 2 ? fmt1(r.mean) : "–",
          r.min ?? "–",
          r.max ?? "–",
          r.posted,
        ]),
      }}
    >
      <RangeStrip
        band={{ from: 2, to: 7, label: "expected range" }}
        rows={rows.map((r) => ({
          key: r.critic.id,
          label: <CriticName critic={r.critic} />,
          min: r.min,
          max: r.max,
          mean: r.mean,
          note: harshNote(r),
          title:
            r.scored >= 2
              ? `${r.critic.name}: mean ${fmt1(r.mean)}, lowest ${r.min}, highest ${r.max}`
              : `${r.critic.name}: ${harshNote(r)}`,
        }))}
      />
    </ChartFrame>
  );
}

function CharacterChart({ data, roasts }: { data: StatsDataset; roasts: number }) {
  const checks = characterChecks(data.captions, data.critics);
  return (
    <ChartFrame
      id="character"
      title="In character?"
      className="lg:col-span-5"
      description="Rules from the critics’ own prompts, checked against every roast, posted or not."
      basis={nouns(roasts, "roast")}
      empty={roasts === 0 ? "No roasts yet. The checks start as soon as a photo is roasted." : null}
      table={{
        columns: [
          { label: "Rule" },
          { label: "Critic" },
          { label: "Passed", numeric: true },
          { label: "Checked", numeric: true },
        ],
        rows: checks.map((c) => [c.rule, c.critic?.name ?? "Every critic", c.passed, c.total]),
      }}
    >
      <ul className="space-y-4">
        {checks.map((c) => (
          <li key={c.id}>
            <Meter
              label={c.critic ? <CriticName critic={c.critic} /> : "Every critic"}
              detail={`“${c.rule}”`}
              value={c.passed}
              total={c.total}
              valueLabel={c.total > 0 ? shareLabel(c.passed, c.total) : "no roasts yet"}
              title={`${c.rule}: ${c.passed} of ${c.total} passed`}
            />
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}

function LeaderboardChart({ data, roasts }: { data: StatsDataset; roasts: number }) {
  const rows = criticLeaderboard(data.captions, data.votes, data.critics);
  const crowdVotes = rows.reduce((sum, r) => sum + r.up + r.down, 0);
  const selfVotes = rows.reduce((sum, r) => sum + r.selfVotes, 0);
  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <ChartFrame
      id="leaderboard"
      title="Critic leaderboard"
      className="lg:col-span-12"
      description="Most roasts written first. Crowd approval leaves out owners voting on roasts of their own posts."
      basis={`${nouns(roasts, "roast")} and ${nouns(crowdVotes, "crowd vote")}${
        selfVotes ? `, with ${nouns(selfVotes, "self-vote")} left out` : ""
      }`}
      empty={roasts === 0 ? "No roasts yet. The leaderboard fills in as photos are roasted." : null}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Critic</th>
              <th scope="col" className={`${th} text-right`}>Roasts</th>
              <th scope="col" className={th}>Average score</th>
              <th scope="col" className={`${th} text-right`}>Posted</th>
              <th scope="col" className={`${th} text-right`}>Crowd approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.critic.id} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-normal whitespace-nowrap">
                  <CriticName critic={r.critic} />
                </th>
                <td className="py-2 pr-4 text-right tabular-nums">{r.roasts}</td>
                <td className="py-2 pr-4">
                  {r.avgRating === null ? (
                    <span className="text-muted">no scores yet</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RatingPill rating={r.avgRating} />
                      <span className="text-xs text-muted">
                        {r.scored === 1 ? "one score" : `${r.scored} scores`}
                      </span>
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {r.roasts ? shareLabel(r.posted, r.roasts) : "–"}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {r.approval === null ? (
                    <span className="text-muted">no votes yet</span>
                  ) : (
                    `${shareLabel(r.up, r.up + r.down)} up`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}

function DaredChart({ data, roasts }: { data: StatsDataset; roasts: number }) {
  const buckets = postRateByRating(data.captions);
  const delays = decisionDelays(data.captions);
  const typical = median(delays);

  let decisions: string;
  if (delays.length === 0 || typical === null) decisions = "No roast has been posted yet, so there are no decisions to time.";
  else if (delays.length === 1) decisions = `One decision so far: posted after ${durationLabel(typical)}.`;
  else decisions = `Owners decide in a median of ${durationLabel(typical)} (${delays.length} decisions).`;

  return (
    <ChartFrame
      id="dared"
      title="Dared to post"
      className="lg:col-span-7"
      description="Do owners post the flattering roasts or the brutal ones? Each bar is every roast in that score range."
      basis={nouns(roasts, "roast")}
      legend={[
        { label: "Posted", swatch: "bg-crowd" },
        { label: "Kept private", swatch: "bg-deemph" },
      ]}
      empty={roasts === 0 ? "No roasts yet. This fills in once photos are roasted and owners choose what to post." : null}
      footer={<p>{decisions}</p>}
      table={{
        columns: [
          { label: "Score" },
          { label: "Roasts", numeric: true },
          { label: "Posted", numeric: true },
          { label: "Kept private", numeric: true },
        ],
        rows: buckets.map((b) => [b.label, b.total, b.posted, b.total - b.posted]),
      }}
    >
      <StackedBar
        rows={buckets.map((b) => ({
          key: b.bucket,
          label: b.label,
          segments: [
            { value: b.posted, name: "Posted", className: "bg-crowd" },
            { value: b.total - b.posted, name: "Kept private", className: "bg-deemph" },
          ],
          valueLabel: `${shareLabel(b.posted, b.total)} posted`,
          emptyLabel: "none here yet",
        }))}
      />
    </ChartFrame>
  );
}

function InflationChart({ data }: { data: StatsDataset }) {
  const rows = panelInflation(data.images, data.captions);
  const label = (topic: string, createdAt: string) =>
    `${topicInfo(topic)?.label ?? topic}, ${dayLabel(nyDayKey(createdAt))}`;
  // The biggest changes either way, kept in boost-to-drop order
  const biggest = new Set([...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, LIST_LIMIT));
  const shown = rows.filter((r) => biggest.has(r));

  const avgShift = rows.length >= 5 ? mean(rows.map((r) => r.delta)) : null;
  const shift = avgShift === null ? null : round1(avgShift);
  let summary: string;
  if (shift === null) summary = "A summary appears once 5 posts can be compared.";
  else if (shift > 0) summary = `On average, posting makes the panel look ${fmt1(shift)} points kinder.`;
  else if (shift < 0) summary = `On average, posting makes the panel look ${fmt1(-shift)} points harsher.`;
  else summary = "On average, posting doesn’t change the panel’s score.";

  return (
    <ChartFrame
      id="inflation"
      title="The public score vs the full panel"
      className="lg:col-span-5"
      description="Public pages average only the posted roasts. Each row is one post: every roast’s average against the posted ones’."
      basis={`${nouns(rows.length, "post")} with a posted, scored roast`}
      legend={[
        { label: "Every roast", swatch: "bg-critic", shape: "dot" },
        { label: "Posted only", swatch: "bg-crowd", shape: "dot" },
      ]}
      empty={
        rows.length === 0
          ? "Nothing to compare yet. This needs a post with at least one posted roast that has a score."
          : null
      }
      footer={
        <>
          <p className={shift === null ? "text-muted" : ""}>{summary}</p>
          {rows.length > LIST_LIMIT && (
            <p className="text-muted">
              Showing the {LIST_LIMIT} biggest changes; the table lists all {rows.length}.
            </p>
          )}
        </>
      }
      table={{
        columns: [
          { label: "Post" },
          { label: "Every roast", numeric: true },
          { label: "Posted only", numeric: true },
          { label: "Change", numeric: true },
        ],
        rows: rows.map((r) => [
          label(r.topic, r.createdAt),
          fmt1(r.fullScore),
          fmt1(r.publicScore),
          signed(r.delta),
        ]),
      }}
    >
      <Dumbbell
        fromClass="bg-critic"
        toClass="bg-crowd"
        rows={shown.map((r) => {
          const [full, pub] = [fmt1(r.fullScore), fmt1(r.publicScore)];
          return {
            key: r.imageId,
            label: label(r.topic, r.createdAt),
            from: r.fullScore,
            to: r.publicScore,
            note: r.delta === 0 ? `${full}, same` : `${full} to ${pub}, ${signed(r.delta)}`,
            title: `${label(r.topic, r.createdAt)}: every roast ${full}, posted only ${pub}`,
          };
        })}
      />
    </ChartFrame>
  );
}

function CrowdChart({ data }: { data: StatsDataset }) {
  const rows = crowdVsCritic(data.captions, data.critics);
  const verdict = crowdVerdict(rows);
  const voted = rows.filter((r) => r.upvotes + r.downvotes > 0).length;

  let verdictLine: ReactNode;
  if (verdict) {
    verdictLine = (
      <p>
        Roasts scored 4 or lower average {signed(verdict.harshMeanNet)} net votes; roasts scored 7 or
        higher average {signed(verdict.kindMeanNet)} ({verdict.n} roasts with votes).
      </p>
    );
  } else if (voted < 5) {
    verdictLine = (
      <p className="text-muted">
        A harsh-vs-kind comparison appears once 5 posted roasts have votes ({voted} so far).
      </p>
    );
  } else {
    verdictLine = (
      <p className="text-muted">
        A harsh-vs-kind comparison needs voted roasts scored 4 or lower and 7 or higher.
      </p>
    );
  }

  return (
    <ChartFrame
      id="crowd-vs-critic"
      title="Crowd vs critic"
      className="lg:col-span-7"
      description="Each posted roast with its critic’s score and the crowd’s votes. Does a low score win the crowd over?"
      basis={nouns(rows.length, "posted roast")}
      legend={[
        { label: "Upvotes", swatch: "bg-critic" },
        { label: "Downvotes", swatch: "bg-negative" },
      ]}
      empty={
        rows.length === 0
          ? "No roast has been posted yet. Votes only land on posted roasts, so this fills in after the first post."
          : null
      }
      footer={
        <>
          {verdictLine}
          {rows.length > LIST_LIMIT && (
            <p className="text-muted">
              Showing the {LIST_LIMIT} with the best net votes; the table lists all {rows.length}.
            </p>
          )}
        </>
      }
      table={{
        columns: [
          { label: "Critic" },
          { label: "Score", numeric: true },
          { label: "Roast" },
          { label: "Up", numeric: true },
          { label: "Down", numeric: true },
          { label: "Net", numeric: true },
        ],
        rows: rows.map((r) => [r.critic.name, r.rating ?? "–", r.content, r.upvotes, r.downvotes, r.net]),
      }}
    >
      <DivergingBar
        rows={rows.slice(0, LIST_LIMIT).map((r) => ({
          key: r.captionId,
          label: (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <CriticName critic={r.critic} />
                <RatingPill rating={r.rating} />
              </div>
              <p className="mt-1 truncate text-sm text-muted" title={r.content}>
                {r.content}
              </p>
            </>
          ),
          up: r.upvotes,
          down: r.downvotes,
          title: `${r.critic.name}: ${r.upvotes} up, ${r.downvotes} down`,
        }))}
      />
    </ChartFrame>
  );
}

function LedgerChart({ data }: { data: StatsDataset }) {
  const ledger = voteLedger(data.captions, data.votes);
  const posted = ledger.eras.reduce((sum, e) => sum + e.posted, 0);

  return (
    <ChartFrame
      id="ledger"
      title="Vote ledger"
      className="lg:col-span-5"
      description="Votes on everything posted, in both eras, from each post’s vote counters."
      basis={`${nouns(ledger.votes, "vote")} and ${nouns(posted, "posted item")}`}
      legend={[
        { label: "Upvotes", swatch: "bg-critic" },
        { label: "Downvotes", swatch: "bg-negative" },
      ]}
      footer={
        <>
          {ledger.votes === 0 && <p className="text-muted">Nobody has voted yet.</p>}
          <dl className="grid grid-cols-3 gap-3 pt-2">
            <div>
              <dt className="text-xs text-muted">Votes</dt>
              <dd className="text-lg font-semibold">{ledger.votes.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Voters</dt>
              <dd className="text-lg font-semibold">{ledger.voters.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Self-votes</dt>
              <dd className="text-lg font-semibold">{shareLabel(ledger.selfVotes, ledger.votes)}</dd>
            </div>
          </dl>
        </>
      }
      table={{
        columns: [
          { label: "Era" },
          { label: "Posted", numeric: true },
          { label: "Up", numeric: true },
          { label: "Down", numeric: true },
          { label: "Never voted on", numeric: true },
        ],
        rows: ledger.eras.map((e) => [e.label, e.posted, e.up, e.down, e.silent]),
      }}
    >
      <DivergingBar
        rows={ledger.eras.map((e) => ({
          key: e.era,
          label: <span className="text-sm">{e.label}</span>,
          up: e.up,
          down: e.down,
          note: e.posted > 0 ? `Never voted on: ${shareLabel(e.silent, e.posted)}` : "Nothing posted",
          title: `${e.label}: ${e.up} up, ${e.down} down`,
        }))}
      />
    </ChartFrame>
  );
}

function UploadsChart({ data, now }: { data: StatsDataset; now: Date }) {
  const { weeks, launchedAt } = uploadsPerWeek(data.images, now);
  // The launch week is the first with a roast post, since launchedAt is the earliest one
  const launch = weeks.findIndex((w) => w.roast > 0);

  return (
    <ChartFrame
      id="uploads"
      title="Uploads per week"
      className="lg:col-span-8"
      description={`Posts per week, Monday to Sunday in New York time.${
        launchedAt ? ` Roast mode’s first post was on ${dayLabel(nyDayKey(launchedAt))}.` : ""
      }`}
      basis={nouns(data.images.length, "upload")}
      legend={[
        { label: "Roast posts", swatch: "bg-critic" },
        { label: "Legacy caption posts", swatch: "bg-deemph" },
      ]}
      empty={weeks.length === 0 ? "No uploads yet. Weeks appear once someone posts a photo in the app." : null}
      table={{
        columns: [
          { label: "Week of" },
          { label: "Roast posts", numeric: true },
          { label: "Legacy posts", numeric: true },
        ],
        rows: weeks.map((w) => [w.label, w.roast, w.legacy]),
      }}
    >
      <Columns
        ariaLabel={
          weeks.length
            ? `Uploads per week from the week of ${weeks[0].label} to the week of ${weeks[weeks.length - 1].label}`
            : "Uploads per week"
        }
        baseClass="fill-deemph"
        topClass="fill-critic"
        marker={launch >= 0 ? { index: launch, label: "Roast mode" } : null}
        data={weeks.map((w) => ({
          key: w.weekStart,
          label: w.label,
          base: w.legacy,
          top: w.roast,
          title: `Week of ${w.label}: ${nouns(w.roast, "roast post")}, ${nouns(w.legacy, "legacy post")}`,
        }))}
      />
    </ChartFrame>
  );
}

function TopicsChart({ data, roastPhotos }: { data: StatsDataset; roastPhotos: number }) {
  const all = topicBreakdown(data.images, data.captions);
  const topics = all.filter((t) => t.topic !== "legacy");
  const legacy = all.find((t) => t.topic === "legacy");

  return (
    <ChartFrame
      id="topics"
      title="Topics"
      className="lg:col-span-4"
      description="Roast posts by topic, with their roasts and average score."
      basis={nouns(roastPhotos, "roast post")}
      empty={roastPhotos === 0 ? "No roast posts yet. Topics fill in as people post in the app." : null}
      footer={
        legacy && legacy.posts > 0 ? (
          <p className="text-muted">
            Plus {nouns(legacy.posts, "legacy caption post")} from before roast mode, hidden in the app.
          </p>
        ) : null
      }
      table={{
        columns: [
          { label: "Topic" },
          { label: "Posts", numeric: true },
          { label: "Roasts", numeric: true },
          { label: "Posted", numeric: true },
          { label: "Average score", numeric: true },
        ],
        rows: all.map((t) => [
          t.label,
          t.posts,
          t.roasts,
          t.publicRoasts,
          t.scored >= 2 ? fmt1(t.avgRating) : "–",
        ]),
      }}
    >
      <BarList
        reserve="2.5rem"
        rows={topics.map((t) => ({
          key: t.topic,
          label: (
            <>
              <span aria-hidden="true">{t.emoji}</span> {t.label}
            </>
          ),
          detail: `${nouns(t.roasts, "roast")}, ${t.publicRoasts} posted, ${scoreNote(t.scored, t.avgRating)}`,
          value: t.posts,
          valueLabel: t.posts.toLocaleString("en-US"),
          title: `${t.label}: ${nouns(t.posts, "post")}`,
        }))}
      />
    </ChartFrame>
  );
}

function PipelineChart({ data, notes }: { data: StatsDataset; notes: number }) {
  const h = pipelineHealth(data.attempts, data.images, data.captions, data.critics);
  const checks: [string, string][] = [
    ["Roasts missing a tip", shareLabel(h.missingTip, h.roasts)],
    ["Roasts missing a score", shareLabel(h.missingRating, h.roasts)],
    ["Posts with a short panel", shareLabel(h.shortPanels, h.roastImages)],
    ["Users who hit the daily cap", h.cappedUsers.toLocaleString("en-US")],
    ["Posts that came with a note", shareLabel(notes, data.images.length)],
  ];

  return (
    <ChartFrame
      id="pipeline-health"
      title="Pipeline health"
      className="lg:col-span-12"
      description="What happens after someone taps Roast me: whether the photo saved, which model answered, and what the parser had to drop."
      basis={`${nouns(h.attempts, "attempt")} and ${nouns(h.roasts, "roast")}`}
      legend={[
        { label: "Saved", swatch: "bg-critic" },
        { label: "Didn’t make it", swatch: "bg-negative" },
      ]}
      empty={
        h.attempts === 0 && h.roasts === 0
          ? "No generation has been attempted yet. This fills in after the first upload."
          : null
      }
      footer={
        <p className="text-muted">
          An attempt with no saved photo was refused by the critics, blocked by safety, or failed. The{" "}
          <Link href="/requests" className={textLink}>
            request log
          </Link>{" "}
          says which for every run since logging began; legacy runs from before it don’t say.
        </p>
      }
      table={{
        columns: [{ label: "Measure" }, { label: "Count", numeric: true }],
        rows: [
          ["Attempts", h.attempts],
          ["Saved", h.saved],
          ["Didn’t make it", h.lost],
          ...h.models.map((m): [string, number] => [`Roasts by ${m.model}`, m.count]),
          ["Roasts missing a tip", h.missingTip],
          ["Roasts missing a score", h.missingRating],
          ["Posts with a short panel", h.shortPanels],
          ["Users who hit the daily cap", h.cappedUsers],
          ["Posts that came with a note", notes],
        ],
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <StackedBar
          reserve="10rem"
          rows={[
            {
              key: "attempts",
              label: "Attempts",
              segments: [
                { value: h.saved, name: "Saved", className: "bg-critic" },
                { value: h.lost, name: "Didn’t make it", className: "bg-negative" },
              ],
              valueLabel: `${shareLabel(h.saved, h.attempts)} saved`,
              emptyLabel: "no attempts yet",
            },
          ]}
        />
        <div>
          <h4 className="mb-2 text-sm font-medium">Which model wrote each roast</h4>
          {h.models.length === 0 ? (
            <p className="text-sm text-muted">No roasts yet.</p>
          ) : (
            <BarList
              reserve="2.5rem"
              rows={h.models.map((m) => ({
                key: m.model,
                label: <span title={m.model}>{m.model}</span>,
                value: m.count,
                valueLabel: m.count.toLocaleString("en-US"),
                title: `${m.model}: ${nouns(m.count, "roast")}`,
              }))}
            />
          )}
          {h.fallbackShare.total > 0 && (
            <p className="mt-2 text-sm text-muted">
              The fallback model wrote {shareLabel(h.fallbackShare.part, h.fallbackShare.total)}.
            </p>
          )}
        </div>
        <dl className="space-y-2 text-sm">
          {checks.map(([term, value]) => (
            <div key={term} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
              <dt className="text-muted">{term}</dt>
              <dd className="shrink-0 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </ChartFrame>
  );
}

function Method({ truncated }: { truncated: string[] }) {
  const items: [string, string][] = [
    [
      "Roasts and legacy captions",
      "A roast is written by one of the seven critics. Captions from before roast mode are legacy: they stay hidden in the app and are only counted where a chart says so.",
    ],
    [
      "Posted",
      "The owner made it public. This page also counts private roasts, which only their owner and admins can see.",
    ],
    [
      "Small numbers",
      "Counts always show. Percentages appear from 10 items, averages from 2 scores, and a verdict once 5 posted roasts have votes.",
    ],
    [
      "Votes",
      "Up and down totals come from each post’s vote counters. Crowd approval counts vote rows and leaves out owners voting on their own posts.",
    ],
    ["Time", "Weeks start on Monday and days end at midnight, New York time."],
    [
      "Attempts",
      "Every tap on Roast me is logged before the critics are called. One with no saved photo was refused, blocked by safety, or failed; the request log shows which, except for legacy runs.",
    ],
  ];
  if (truncated.length > 0) {
    items.push([
      "Row limit",
      `Reads stop at 20,000 rows per table. Cut short this time: ${truncated.join(", ")}.`,
    ]);
  }

  return (
    <section aria-labelledby="method-heading" className="mt-12 border-t border-line pt-6">
      <h2 id="method-heading" className="text-xl font-semibold tracking-tight">
        How these numbers are computed
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        {items.map(([term, text]) => (
          <div key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="mt-1 max-w-prose text-muted">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
