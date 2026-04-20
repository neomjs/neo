import fs            from 'fs/promises';
import matter        from 'gray-matter';
import path          from 'path';
import {fileURLToPath} from 'url';

/**
 * @summary Analyze closed tickets since a given release cutoff date by scanning the local
 * `resources/content/issues/` directory.
 *
 * Ticket lifecycle: ticket files live in `resources/content/issues/` while open or recently
 * closed, then get swept into `resources/content/issue-archive/<release>/` at release cut.
 * This means anything in `issues/` with `state === 'CLOSED'` and `closedAt >= <cutoff>` has
 * been resolved since the last release and not yet archived — the authoritative set for
 * roadmap-authoring purposes.
 *
 * Usage:
 *   node ai/scripts/analyzeClosedSinceRelease.mjs [cutoff-date-ISO]
 *   # defaults to v12.1 release (2026-03-27)
 *
 * Output:
 *   - Total closure count
 *   - Breakdown by primary labels (top N)
 *   - Epic-labeled tickets (titles + IDs)
 *   - Top parent-epic distribution (where sub-issues rolled up)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRoot    = path.resolve(__dirname, '../..');
const issuesDir  = path.join(neoRoot, 'resources/content/issues');
const CUTOFF     = process.argv[2] || '2026-03-27';

async function main() {
    const files  = await fs.readdir(issuesDir);
    const closed = [];

    for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const content = await fs.readFile(path.join(issuesDir, f), 'utf-8');
        const {data}  = matter(content);
        if (data.state === 'CLOSED' && data.closedAt && data.closedAt >= CUTOFF) {
            closed.push({
                id         : data.id,
                title      : data.title,
                labels     : data.labels || [],
                closedAt   : data.closedAt,
                parentIssue: data.parentIssue
            });
        }
    }

    closed.sort((a, b) => a.closedAt.localeCompare(b.closedAt));

    console.log(`Tickets closed since ${CUTOFF}: ${closed.length}\n`);

    // Label frequency
    const labelCounts = {};
    for (const t of closed) {
        for (const l of t.labels) {
            labelCounts[l] = (labelCounts[l] || 0) + 1;
        }
    }

    console.log('By label (top 15):');
    Object.entries(labelCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([label, n]) => console.log(`  ${label.padEnd(32)} ${n}`));

    // Parent-epic rollup
    const parentCounts = {};
    for (const t of closed) {
        if (t.parentIssue) {
            parentCounts[t.parentIssue] = (parentCounts[t.parentIssue] || 0) + 1;
        }
    }

    console.log('\nRollup by parent epic (top 15):');
    Object.entries(parentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([pid, n]) => console.log(`  #${pid.toString().padEnd(8)} ${n} sub-issues closed`));

    // Epic-labeled closures
    const epics = closed.filter(t => t.labels.includes('epic'));
    console.log(`\nEpic-labeled tickets closed (${epics.length}):`);
    epics.forEach(t => console.log(`  #${t.id.toString().padEnd(6)} ${t.title}`));

    // Unparented non-epic closures (top-level work not under an epic)
    const orphans = closed.filter(t => !t.parentIssue && !t.labels.includes('epic'));
    console.log(`\nTop-level (unparented, non-epic) closures: ${orphans.length}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
