/**
 * @summary Diagnostic sweep for IssueSyncer timelineItems truncation.
 *
 * IssueSyncer renders GitHub comment bodies through the unified `timelineItems`
 * GraphQL channel, which is page-capped at `maxTimelineItemsPerIssue` (50). Once an
 * issue's timeline grows past that cap, newly-authored comments (and other tail
 * events) are silently dropped from the local markdown while frontmatter metadata
 * (`commentsCount`, `updatedAt`) remains correct — a classic divergence between the
 * metadata-tracking path and the content-rendering path.
 *
 * This tool walks `resources/content/issues/*.md` only (archives are immutable and
 * excluded by design) and reports two signals:
 *
 *   - **Primary (confirmed truncation):** frontmatter `commentsCount` is greater
 *     than the number of `### @login - <timestamp>` comment blocks actually rendered
 *     into the body. Comment bodies were lost.
 *   - **Secondary (cap-at-edge suspect):** the rendered timeline has exactly
 *     `TIMELINE_CAP` entries. Non-comment events past the cap may also be missing
 *     and would require a GraphQL probe to confirm.
 *
 * The JSON output of this script is the input to the recovery step, which calls
 * `GH_SyncService.refetchIssuesByNumber(numbers[])` once the pagination fix lands.
 *
 * Usage:
 *   node ai/scripts/diagnostics/detectTruncatedTimelines.mjs           # human report
 *   node ai/scripts/diagnostics/detectTruncatedTimelines.mjs --json    # machine-readable
 *
 * @see ai/services/github-workflow/sync/IssueSyncer.mjs
 * @see ai/services/github-workflow/queries/issueQueries.mjs
 * @plane in-plane
 */
import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import matter          from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../..');
const issuesDir   = path.resolve(projectRoot, 'resources/content/issues');

// Mirrors IssueSyncer's `maxTimelineItemsPerIssue` default. If that config changes,
// this constant must move with it — both encode the same GitHub-imposed page size.
const TIMELINE_CAP = 50;

// A comment block in the rendered timeline starts with `### @login - <ISO-8601 Z>`.
// Emitted by IssueSyncer.#formatTimelineEvent for `IssueComment` events.
const COMMENT_HEADER_RE = /^### @\S+ - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/gm;

// A structural (non-comment) event line: `- <ISO-8601 Z> @login <details>`.
// Emitted by the same formatter for all other timelineItems event types.
const EVENT_LINE_RE = /^- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z @\S+ /gm;

// The `## Timeline` heading as a standalone line — NOT as a substring inside some
// comment body's quoted markdown (e.g., `### Timeline & Next Steps` would otherwise
// slice the section into multiple segments under a naive string split).
const TIMELINE_HEADING_RE = /^## Timeline$/m;

async function scanDir(dir) {
    const files = [];
    const walk = async (d) => {
        const entries = await fs.readdir(d, {withFileTypes: true});
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) {
                await walk(full);
            } else if (e.isFile() && e.name.endsWith('.md')) {
                files.push(full);
            }
        }
    };
    await walk(dir);
    return files;
}

function analyzeFile(filePath, raw) {
    const parsed        = matter(raw);
    const commentsCount = parsed.data.commentsCount ?? 0;
    const issueNumber   = parsed.data.id ?? null;
    const state         = parsed.data.state ?? 'UNKNOWN';

    // Everything after the `## Timeline` heading is the rendered timeline section.
    // We locate the heading with a line-anchored regex — not a substring split —
    // because comment bodies can contain text like `### Timeline & Next Steps`
    // that would otherwise slice the section and undercount events.
    const headingMatch = TIMELINE_HEADING_RE.exec(parsed.content);
    const timelineBody = headingMatch
        ? parsed.content.slice(headingMatch.index + headingMatch[0].length)
        : '';

    const commentBlocks = (timelineBody.match(COMMENT_HEADER_RE) || []).length;
    const eventLines    = (timelineBody.match(EVENT_LINE_RE) || []).length;
    const totalRendered = commentBlocks + eventLines;

    const missingComments = Math.max(0, commentsCount - commentBlocks);
    const primaryHit      = missingComments > 0;
    const atCap           = totalRendered === TIMELINE_CAP;

    return {
        issueNumber,
        state,
        filePath: path.relative(projectRoot, filePath),
        commentsCount,
        commentBlocks,
        eventLines,
        totalRendered,
        missingComments,
        primaryHit,
        atCap,
        affected: primaryHit || atCap
    };
}

async function main() {
    const jsonMode = process.argv.includes('--json');

    const files   = await scanDir(issuesDir);
    const reports = [];

    for (const f of files) {
        const raw = await fs.readFile(f, 'utf-8');
        try {
            reports.push(analyzeFile(f, raw));
        } catch (e) {
            reports.push({filePath: path.relative(projectRoot, f), error: e.message});
        }
    }

    const affected = reports.filter(r => r.affected);
    const primary  = affected.filter(r => r.primaryHit);
    const capOnly  = affected.filter(r => !r.primaryHit && r.atCap);

    if (jsonMode) {
        console.log(JSON.stringify({
            scanned        : files.length,
            affected       : affected.length,
            primaryHits    : primary.map(r => r.issueNumber),
            capOnlySuspects: capOnly.map(r => r.issueNumber),
            details        : affected
        }, null, 2));
        return;
    }

    console.log(`Scanned ${files.length} active issues under ${path.relative(projectRoot, issuesDir)}/\n`);

    console.log(`Confirmed truncation (commentsCount > rendered comment blocks): ${primary.length}`);
    for (const r of primary) {
        console.log(`  #${r.issueNumber} [${r.state}] — rendered ${r.commentBlocks}/${r.commentsCount} comments (missing ${r.missingComments}), ${r.totalRendered} total timeline entries`);
    }

    console.log(`\nSecondary suspects (timeline at cap=${TIMELINE_CAP}, no comment body loss yet): ${capOnly.length}`);
    for (const r of capOnly) {
        console.log(`  #${r.issueNumber} [${r.state}] — ${r.totalRendered} entries rendered`);
    }

    if (affected.length === 0) {
        console.log('\nNo truncation detected.');
    } else {
        console.log(`\nRun with --json to capture the affected-set for downstream recovery via refetchIssuesByNumber().`);
    }
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
