#!/usr/bin/env node
/**
 * @summary Tier-2 revalidation sweep — notifies a reactivated family of Tier-2
 *   substrate graduations that landed during its bench window.
 *
 * Per Epic #11796 AC6 + sub #11803 (this script), Tier-2 substrate changes that
 * graduate under benched-family liveness gap carry an `## Unresolved Liveness`
 * entry + `revalidationTrigger` AC. When the benched family reactivates
 * (`participationStatus` flips `operator_benched` / `temporarily_unreachable`
 * → `active` in `ai/graph/identityRoots.mjs`), this sweep identifies the
 * affected artifacts and posts a notification inviting retroactive signal
 * review.
 *
 * **Option (c) sweep-script-notifies-only** per ticket #11803 — substrate
 * provides a discoverable notification surface; the reconciliation itself is
 * human/peer-judgment-driven (not auto-re-opened). Option (a) was rejected as
 * too weak (convention-only) and Option (b) as too strong (auto-reopen → churn).
 *
 * Usage:
 *   node ai/scripts/revalidationSweep.mjs --family <name> [--since ISO] [--until ISO] [--dry-run|--apply]
 *   npm run ai:revalidation-sweep -- --family gemini --dry-run
 *
 * `--since` defaults to `IDENTITIES[family].properties.since` when present.
 * `--until` defaults to "now". Default mode is dry-run; pass `--apply` to post.
 *
 * @see learn/agentos/Tier2RevalidationSweep.md           — operator runbook (AC5)
 * @see ai/graph/identityRoots.mjs                        — participationStatus source-of-truth
 * @see .agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md §6.5 — invocation discipline (AC7)
 * @see .agents/skills/ideation-sandbox/audits/consensus-mandate.md §quorum-rule — Tier-2 rule background
 */

import { execFileSync } from 'child_process';
import { IDENTITIES }   from '../graph/identityRoots.mjs';

export const SWEEP_VERSION = '1.0.0';

const HELP = `Tier-2 revalidation sweep v${SWEEP_VERSION}

Usage:
  node ai/scripts/revalidationSweep.mjs --family <name> [options]

Options:
  --family <name>     Required. modelFamily of reactivated identity (e.g. gemini).
  --since <ISO>       Bench start. Defaults to IDENTITIES[family].properties.since.
  --until <ISO>       Bench end. Defaults to now.
  --repo <owner/name> GitHub repo. Defaults to neomjs/neo.
  --dry-run           Default. Logs candidates without posting.
  --apply             Posts notification comments on matched artifacts.
  --help              Show this help.
`;

export function parseArgs(argv) {
    const args = { family: null, since: null, until: null, dryRun: true, repo: 'neomjs/neo', help: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--family':  args.family = argv[++i]; break;
            case '--since':   args.since  = argv[++i]; break;
            case '--until':   args.until  = argv[++i]; break;
            case '--repo':    args.repo   = argv[++i]; break;
            case '--dry-run': args.dryRun = true;      break;
            case '--apply':   args.dryRun = false;     break;
            case '--help':
            case '-h':        args.help   = true;      break;
        }
    }
    return args;
}

/**
 * @summary Resolve the AgentIdentity record for a model family. MVP requires
 *   exactly one identity per family; the multi-identity-per-family case (e.g.
 *   `@neo-opus-4-7` + `@neo-claude-opus` Discussion #11792 substrate) is
 *   explicitly deferred and will surface here as a thrown error pointing at
 *   the §6.4 same-family aggregation work that must precede sweep extension.
 */
export function resolveIdentityForFamily(family) {
    const matches = IDENTITIES.filter(node =>
        node.type === 'AgentIdentity' &&
        node.properties?.modelFamily === family
    );

    if (matches.length === 0) {
        throw new Error(`No AgentIdentity with modelFamily=${family} in identityRoots.mjs`);
    }

    if (matches.length > 1) {
        throw new Error(
            `Multiple identities for family=${family}; sweep MVP supports one-identity-per-family. ` +
            `Found: ${matches.map(m => m.id).join(', ')}. See Discussion #11792 OQ5 + §6.4 same-family aggregation.`
        );
    }

    return matches[0];
}

/**
 * @summary True when `body` contains a `## Unresolved Liveness` section whose
 *   text names the given model family in backticks (canonical signal-ledger form).
 *   Anchored to the section to avoid false positives where the family appears
 *   in `## Signal Ledger` as APPROVED.
 */
export function bodyMatches(body, family) {
    if (!body) return false;

    const livenessSectionMatch = body.match(/##\s+Unresolved\s+Liveness\s+([\s\S]*?)(?=\n##\s|$)/);
    if (!livenessSectionMatch) return false;

    const section = livenessSectionMatch[1];
    return new RegExp('`' + family + '`').test(section);
}

export function buildNotificationBody({ family, identityLogin, since, sweepAt }) {
    return `**Tier-2 revalidation sweep notification**

This Tier-2 graduated substrate is flagged for retroactive ${identityLogin} (\`${family}\` family) signal review because the family was \`operator_benched\` / \`temporarily_unreachable\` at graduation time (since ${since}).

Per the \`revalidationTrigger\` AC in this artifact + Epic #11796 AC6 + sub #11803 mechanism, the reactivated family is invited to post one of:

- \`[GRADUATION_APPROVED by ${identityLogin} @ <anchor>]\` — retroactive endorsement; this artifact's \`## Unresolved Liveness\` entry transitions to "resolved-by-retroactive-signal".
- \`[GRADUATION_DEFERRED by ${identityLogin} @ <anchor> — <reason>]\` — retroactive challenge; reconciliation cycle re-opens substantive concerns.
- \`[GRADUATION_ABSTAIN by ${identityLogin} @ <anchor>]\` — explicit pass; \`## Unresolved Liveness\` entry transitions to "resolved-by-abstain".

Reconciliation closes this artifact's \`revalidationTrigger\` AC. No-signal-on-this-comment is liveness-failure, not consent (per \`ideation-sandbox-workflow.md §6.2(b)\`).

Source: \`ai/scripts/revalidationSweep.mjs\` v${SWEEP_VERSION}, executed at ${sweepAt}. See [\`learn/agentos/Tier2RevalidationSweep.md\`](../../learn/agentos/Tier2RevalidationSweep.md) for runbook.`;
}

/**
 * @summary Default IO seam — `gh search issues` + `gh issue comment`. Replaced
 *   by tests with a fake `io` so the sweep is exercised without network calls.
 */
export const defaultIo = {
    searchIssues({ repo, since, until }) {
        const raw = execFileSync(
            'gh',
            ['search', 'issues',
             '--repo',    repo,
             '--created', `${since}..${until}`,
             '--limit',   '1000',
             '--json',    'number,title,body,labels,state,createdAt'],
            { encoding: 'utf8' }
        );
        return JSON.parse(raw);
    },
    postComment({ repo, number, body }) {
        execFileSync(
            'gh',
            ['issue', 'comment', String(number), '--repo', repo, '--body', body],
            { encoding: 'utf8' }
        );
    }
};

export async function revalidationSweep({
    family,
    since      = null,
    until      = null,
    dryRun     = true,
    repo       = 'neomjs/neo',
    sweepAt    = new Date().toISOString(),
    io         = defaultIo
} = {}) {
    if (!family) throw new Error('revalidationSweep requires --family');

    const identity      = resolveIdentityForFamily(family);
    const resolvedSince = since || identity.properties.since;
    const resolvedUntil = until || sweepAt;

    if (!resolvedSince) {
        throw new Error(
            `No --since provided and ${identity.id} has no participationStatus.since; ` +
            `family is currently active (no bench window to sweep).`
        );
    }

    const candidates = io.searchIssues({ repo, since: resolvedSince, until: resolvedUntil });
    const matches    = candidates.filter(c => bodyMatches(c.body, family));
    const results    = [];

    for (const match of matches) {
        const notification = buildNotificationBody({
            family,
            identityLogin: identity.id,
            since        : resolvedSince,
            sweepAt
        });

        if (dryRun) {
            results.push({
                number      : match.number,
                title       : match.title,
                action      : 'DRY_RUN_WOULD_NOTIFY',
                notification
            });
        } else {
            io.postComment({ repo, number: match.number, body: notification });
            results.push({
                number: match.number,
                title : match.title,
                action: 'NOTIFIED'
            });
        }
    }

    return {
        sweepVersion: SWEEP_VERSION,
        family,
        identityLogin: identity.id,
        since        : resolvedSince,
        until        : resolvedUntil,
        repo,
        dryRun,
        candidates   : candidates.length,
        matches      : matches.length,
        results
    };
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
               (process.argv[1] && import.meta.url.endsWith(process.argv[1]));

if (isMain) {
    const args = parseArgs(process.argv.slice(2));

    if (args.help || !args.family) {
        console.log(HELP);
        process.exit(args.help ? 0 : 1);
    }

    revalidationSweep(args)
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error('revalidationSweep failed:', err.message);
            process.exit(1);
        });
}
