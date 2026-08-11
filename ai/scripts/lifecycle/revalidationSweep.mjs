#!/usr/bin/env node
/**
 * @summary Tier-2 revalidation sweep for families that reactivate after a bench window.
 *
 * Tier-2 substrate changes that graduate under a benched-family liveness gap
 * carry an `## Unresolved Liveness` entry plus a revalidation trigger. When
 * the benched family reactivates in `ai/graph/identityRoots.mjs`, this sweep
 * identifies affected artifacts and posts a notification inviting retroactive
 * signal review.
 *
 * The script notifies only. Reconciliation remains human/peer-judgment-driven
 * rather than auto-reopening artifacts.
 *
 * Usage:
 *   node ai/scripts/lifecycle/revalidationSweep.mjs --family <name> [--since ISO] [--until ISO] [--dry-run|--apply]
 *   npm run ai:revalidation-sweep -- --family gemini --dry-run
 *
 * `--since` defaults to `IDENTITIES[family].properties.since` when present.
 * `--until` defaults to "now". Default mode is dry-run; pass `--apply` to post.
 *
 * @see learn/agentos/tooling/Tier2RevalidationSweep.md           — operator runbook
 * @see ai/graph/identityRoots.mjs                        — participationStatus source-of-truth
 * @see .agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md §6.5 — invocation discipline
 * @see .agents/skills/ideation-sandbox/audits/consensus-mandate.md §quorum-rule — Tier-2 rule background
 * @plane host
 */

import { execFileSync }              from 'child_process';
import { Command }                   from 'commander';
import { IDENTITIES }                from '../../graph/identityRoots.mjs';
import { resolveResidentFamilyById } from '../../services/graph/agentFamilyResolution.mjs';

export const SWEEP_VERSION = '1.0.0';

/**
 * @summary Build the commander Program for this script. Exposed for tests so
 *   they can exercise parse / unknown-flag / required-option semantics without
 *   spawning a child process. Each call returns a fresh `Command` instance to
 *   avoid commander's shared-state surface in the default `program` export.
 */
export function createProgram() {
    const program = new Command();

    program
        .name('revalidationSweep')
        .description(
            'Tier-2 revalidation sweep — notifies a reactivated AgentIdentity family of ' +
            'Tier-2 graduated substrate landed during its bench window. Per Epic #11796 AC6 + ' +
            'sub #11803, Option (c) sweep-script-notifies-only. See ' +
            'learn/agentos/tooling/Tier2RevalidationSweep.md for the operator runbook.'
        )
        .version(SWEEP_VERSION)
        .requiredOption(
            '-f, --family <name>',
            'modelFamily of reactivated identity (e.g. gemini, claude, gpt)'
        )
        .option(
            '--since <ISO>',
            'Bench start. Defaults to IDENTITIES[family].properties.since.'
        )
        .option(
            '--until <ISO>',
            'Bench end. Defaults to now.'
        )
        .option(
            '-r, --repo <owner/repo>',
            'GitHub repository to sweep.',
            'neomjs/neo'
        )
        .option(
            '--apply',
            'Post notification comments to matched artifacts (default: dry-run mode).',
            false
        )
        .option(
            '--dry-run',
            'Explicit dry-run mode (default behavior — log candidates without posting).',
            false
        );

    return program;
}

/**
 * @summary Parse argv into the sweep options object. Wraps commander with
 *   `exitOverride()` so unknown flags / missing required options throw
 *   `CommanderError` instead of calling `process.exit()` — required for
 *   testability AND for `--help` to not terminate the test process. Empty/no-op
 *   `--dry-run` flag is accepted for documentation clarity; the canonical
 *   write-gate is `--apply` (default false).
 */
export function parseArgs(argv) {
    const program = createProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.parse(argv, { from: 'user' });

    const options = program.opts();
    return {
        family: options.family,
        since : options.since || null,
        until : options.until || null,
        repo  : options.repo,
        dryRun: !options.apply
    };
}

/**
 * @summary Resolve the AgentIdentity notification targets for a model family.
 *
 * Multiple same-family identities make model-family membership one-to-many.
 * Revalidation stays family-keyed, but notification fan-out targets every active
 * same-family identity so §6.4 aggregation can collect one family signal without
 * suppressing same-family DEFERRED / VETO pressure.
 */
export function resolveIdentitiesForFamily(family) {
    // Era-chain-first family match ({@link resolveResidentFamilyById}); the resolver's flat
    // fallback covers the retirement witness populations, keeping membership identical pre/post.
    const matches = IDENTITIES.filter(node =>
        node.type === 'AgentIdentity' &&
        resolveResidentFamilyById(node.id) === family
    );

    if (matches.length === 0) {
        throw new Error(`No AgentIdentity with modelFamily=${family} in identityRoots.mjs`);
    }

    const activeMatches = matches.filter(node => node.properties?.participationStatus === 'active');

    if (activeMatches.length > 0) {
        return activeMatches;
    }

    if (matches.length === 1) {
        return matches;
    }

    throw new Error(
        `Multiple inactive identities for family=${family}; cannot infer revalidation representative. ` +
        `Found: ${matches.map(m => m.id).join(', ')}. Pass --since after selecting the intended family transition.`
    );
}

/**
 * @summary Resolve a stable family representative for legacy callers that need
 *   one identity record rather than the full same-family notification target
 *   set. For multi-active families this returns the first active identity in
 *   `identityRoots.mjs` order; use `resolveIdentitiesForFamily()` for routing.
 */
export function resolveIdentityForFamily(family) {
    return resolveIdentitiesForFamily(family)[0];
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
    // Literal-substring match (not regex). Avoids `js/regex-injection` CodeQL because
    // `family` is a CLI-supplied value; constructing `new RegExp(family)` from it would
    // be a regex-injection sink even though `resolveIdentityForFamily()` validates against
    // the IDENTITIES whitelist upstream. Defense-in-depth: keep the match literal.
    return section.includes('`' + family + '`');
}

export function buildNotificationBody({ family, identityLogin, identityLogins = null, since, sweepAt }) {
    const targetLogins = identityLogins?.length ? identityLogins : [identityLogin];
    const audience     = targetLogins.join(', ');
    const aggregation  = targetLogins.length > 1
        ? `\n\nSame-family aggregation note: ${audience} are all active \`${family}\` identities. ` +
          'Per §6.4, the family contributes APPROVED when at least one active same-family ' +
          'identity approves and no active same-family identity holds unresolved DEFERRED / VETO.'
        : '';

    return `**Tier-2 revalidation sweep notification**

This Tier-2 graduated substrate is flagged for retroactive ${audience} (\`${family}\` family) signal review because the family was \`operator_benched\` / \`temporarily_unreachable\` at graduation time (since ${since}).

Per the \`revalidationTrigger\` AC in this artifact + Epic #11796 AC6 + sub #11803 mechanism, the reactivated family is invited to post one of:

- \`[GRADUATION_APPROVED by @<notified-identity> @ <anchor>]\` — retroactive endorsement; this artifact's \`## Unresolved Liveness\` entry transitions to "resolved-by-retroactive-signal".
- \`[GRADUATION_DEFERRED by @<notified-identity> @ <anchor> — <reason>]\` — retroactive challenge; reconciliation cycle re-opens substantive concerns.
- \`[GRADUATION_ABSTAIN by @<notified-identity> @ <anchor>]\` — explicit pass; \`## Unresolved Liveness\` entry transitions to "resolved-by-abstain".

Reconciliation closes this artifact's \`revalidationTrigger\` AC. No-signal-on-this-comment is liveness-failure, not consent (per \`ideation-sandbox-workflow.md §6.2(b)\`).
${aggregation}

Source: \`ai/scripts/lifecycle/revalidationSweep.mjs\` v${SWEEP_VERSION}, executed at ${sweepAt}. See [\`learn/agentos/tooling/Tier2RevalidationSweep.md\`](../../learn/agentos/tooling/Tier2RevalidationSweep.md) for runbook.`;
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

    const identities     = resolveIdentitiesForFamily(family);
    const representative = identities[0];
    const identityLogins = identities.map(identity => identity.id);
    const resolvedSince  = since || representative.properties.since;
    const resolvedUntil  = until || sweepAt;

    if (!resolvedSince) {
        throw new Error(
            `No --since provided and ${representative.id} has no participationStatus.since; ` +
            `family is currently active (no bench window to sweep).`
        );
    }

    const candidates = io.searchIssues({ repo, since: resolvedSince, until: resolvedUntil });
    const matches    = candidates.filter(c => bodyMatches(c.body, family));
    const results    = [];

    for (const match of matches) {
        const notification = buildNotificationBody({
            family,
            identityLogin: representative.id,
            identityLogins,
            since        : resolvedSince,
            sweepAt
        });

        if (dryRun) {
            results.push({
                number: match.number,
                title : match.title,
                action: 'DRY_RUN_WOULD_NOTIFY',
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
        sweepVersion : SWEEP_VERSION,
        family,
        identityLogin: representative.id,
        identityLogins,
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
    // CLI mode: let commander handle --help / --version / unknown flags / missing
    // required options directly (it writes to stdout/stderr + calls process.exit
    // with the canonical exit code per the parsed shape). The test-facing
    // `parseArgs()` wraps the same program with `exitOverride()` for assertion
    // semantics; production CLI uses the default exit behavior.
    const program = createProgram();
    program.parse(process.argv);

    const options = program.opts();

    revalidationSweep({
        family: options.family,
        since : options.since || null,
        until : options.until || null,
        repo  : options.repo,
        dryRun: !options.apply
    })
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error('revalidationSweep failed:', err.message);
            process.exit(1);
        });
}
