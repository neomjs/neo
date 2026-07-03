import fs              from 'fs/promises';
import matter          from 'gray-matter';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * @summary Generates the release-window appendix report by scanning local GitHub content.
 *
 * Ticket lifecycle: ticket files live in `resources/content/issues/` while open or recently
 * closed, then get swept into `resources/content/archive/issues/vN.M.K/{flat|chunk-N}/` at release cut.
 * This means anything in `issues/` with `state === 'CLOSED'` and `closedAt >= <cutoff>` has
 * been resolved since the last release and not yet archived - the authoritative set for
 * roadmap-authoring purposes. Pull-request files use the matching `resources/content/pulls/`
 * active mirror, where `state === 'MERGED'` and `mergedAt >= <cutoff>` captures unreleased PRs.
 *
 * Usage:
 *   node buildScripts/release/analyzeClosedSinceRelease.mjs [cutoff-date-ISO]
 *   # defaults to cutoff 2026-03-27; pass an explicit previous-release cutoff for later releases
 *   node buildScripts/release/analyzeClosedSinceRelease.mjs 2026-03-27 --format markdown --include-items --output /tmp/release-appendix.md
 *
 * Output:
 *   - Merged PR and closed issue counts
 *   - Breakdown by PR author, PR title scope, issue labels, and parent epic
 *   - Epic-labeled ticket closures
 *   - Optional exhaustive PR and issue lists for release-note appendices
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRoot    = path.resolve(__dirname, '../..');
const issuesDir  = path.join(neoRoot, 'resources/content/issues');
const pullsDir   = path.join(neoRoot, 'resources/content/pulls');
const DEFAULT_LIMIT = 15;

/**
 * @param {String[]} args
 * @returns {Object}
 */
function parseArgs(args) {
    const options = {
        cutoff      : '2026-03-27',
        format      : 'text',
        includeItems: false,
        itemLimit   : null,
        limit       : DEFAULT_LIMIT,
        output      : null
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--format') {
            options.format = args[++i] || options.format
        } else if (arg.startsWith('--format=')) {
            options.format = arg.split('=')[1]
        } else if (arg === '--include-items') {
            options.includeItems = true
        } else if (arg === '--item-limit') {
            options.itemLimit = Number(args[++i])
        } else if (arg.startsWith('--item-limit=')) {
            options.itemLimit = Number(arg.split('=')[1])
        } else if (arg === '--limit') {
            options.limit = Number(args[++i]) || options.limit
        } else if (arg.startsWith('--limit=')) {
            options.limit = Number(arg.split('=')[1]) || options.limit
        } else if (arg === '--output') {
            options.output = args[++i] || null
        } else if (arg.startsWith('--output=')) {
            options.output = arg.slice('--output='.length)
        } else if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (!arg.startsWith('-')) {
            options.cutoff = arg
        }
    }

    if (!['text', 'markdown'].includes(options.format)) {
        throw new Error(`Unsupported --format "${options.format}". Use "text" or "markdown".`)
    }

    if (Number.isNaN(options.itemLimit)) {
        throw new Error('--item-limit must be a number when provided.')
    }

    return options
}

/**
 * @returns {String}
 */
function helpText() {
    return [
        'Usage:',
        '  node buildScripts/release/analyzeClosedSinceRelease.mjs [cutoff-date-ISO] [options]',
        '',
        'Options:',
        '  --format text|markdown    Output format. Defaults to text.',
        '  --include-items           Include exhaustive PR and issue lists.',
        '  --item-limit <n>          Limit exhaustive lists for preview runs.',
        '  --limit <n>               Limit summary tables. Defaults to 15.',
        '  --output <path>           Write output to a file instead of stdout.',
        '  -h, --help                Show this help.'
    ].join('\n')
}

/**
 * @param {String} rootDir
 * @returns {Promise<Object[]>}
 */
async function readFrontmatterFiles(rootDir) {
    const filesRaw = await fs.readdir(rootDir, {recursive: true});
    const records  = [];

    for (const f of filesRaw) {
        if (typeof f !== 'string' || !f.endsWith('.md')) {
            continue
        }

        const filePath = path.join(rootDir, f);

        try {
            const {data} = matter(await fs.readFile(filePath, 'utf-8'));
            records.push({data, filePath})
        } catch (e) {
            console.warn(`Failed to parse ${filePath}: ${e.message}`)
        }
    }

    return records
}

/**
 * @param {Object[]} records
 * @param {String} cutoff
 * @returns {Object[]}
 */
function collectClosedIssues(records, cutoff) {
    return records
        .filter(({data}) => data.state === 'CLOSED' && data.closedAt && data.closedAt >= cutoff)
        .map(({data, filePath}) => ({
            id         : String(data.id),
            title      : data.title,
            labels     : data.labels || [],
            closedAt   : data.closedAt,
            parentIssue: data.parentIssue ? String(data.parentIssue) : null,
            url        : data.url || `https://github.com/neomjs/neo/issues/${data.id}`,
            path       : path.relative(neoRoot, filePath)
        }))
        .sort((a, b) => b.closedAt.localeCompare(a.closedAt) || Number(b.id) - Number(a.id))
}

/**
 * @param {Object[]} records
 * @param {String} cutoff
 * @returns {Object[]}
 */
function collectMergedPulls(records, cutoff) {
    return records
        .filter(({data}) => data.state === 'MERGED' && data.mergedAt && data.mergedAt >= cutoff)
        .map(({data, filePath}) => ({
            id      : String(data.number),
            title   : data.title,
            author  : data.author || 'unknown',
            mergedAt: data.mergedAt,
            url     : data.url || `https://github.com/neomjs/neo/pull/${data.number}`,
            path    : path.relative(neoRoot, filePath),
            scope   : getPullScope(data.title)
        }))
        .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || Number(b.id) - Number(a.id))
}

/**
 * @param {String} title
 * @returns {String}
 */
function getPullScope(title) {
    const match = String(title || '').match(/^([a-z]+)(?:\(([^)]+)\))?:/);

    if (!match) {
        return 'unscoped'
    }

    return match[2] ? `${match[1]}(${match[2]})` : match[1]
}

/**
 * @param {Object[]} rows
 * @param {Function} getKeys
 * @returns {Object[]}
 */
function countBy(rows, getKeys) {
    const counts = new Map();

    for (const row of rows) {
        const keys = getKeys(row);

        for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (!key) {
                continue
            }

            counts.set(key, (counts.get(key) || 0) + 1)
        }
    }

    return Array.from(counts.entries())
        .map(([name, count]) => ({name, count}))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * @param {Object[]} rows
 * @param {Number|null} itemLimit
 * @returns {Object[]}
 */
function limitItems(rows, itemLimit) {
    return itemLimit === null ? rows : rows.slice(0, itemLimit)
}

/**
 * @param {String} value
 * @returns {String}
 */
function mdCell(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ')
}

/**
 * @param {Object[]} rows
 * @param {String} nameKey
 * @param {Number} limit
 * @returns {String}
 */
function textCounts(rows, nameKey, limit) {
    return rows
        .slice(0, limit)
        .map(row => `  ${String(row[nameKey]).padEnd(32)} ${row.count}`)
        .join('\n')
}

/**
 * @param {Object[]} rows
 * @param {Number} limit
 * @returns {String}
 */
function markdownCounts(rows, limit) {
    const lines = ['| Name | Count |', '|---|---:|'];

    rows.slice(0, limit).forEach(row => {
        lines.push(`| ${mdCell(row.name)} | ${row.count} |`)
    });

    return lines.join('\n')
}

/**
 * @param {Object} report
 * @param {Object} options
 * @returns {String}
 */
function renderText(report, options) {
    const {closedIssues, mergedPulls, labelCounts, parentCounts, epicIssues, authorCounts, scopeCounts} = report;
    const lines = [
        `Release appendix report since ${options.cutoff}`,
        '',
        `Merged PRs: ${mergedPulls.length}`,
        `Closed issues: ${closedIssues.length}`,
        '',
        `PRs by author (top ${options.limit}):`,
        textCounts(authorCounts, 'name', options.limit),
        '',
        `PRs by title scope (top ${options.limit}):`,
        textCounts(scopeCounts, 'name', options.limit),
        '',
        `Issues by label (top ${options.limit}):`,
        textCounts(labelCounts, 'name', options.limit),
        '',
        `Rollup by parent epic (top ${options.limit}):`,
        textCounts(parentCounts.map(row => ({...row, name: `#${row.name}`})), 'name', options.limit),
        '',
        `Epic-labeled tickets closed (${epicIssues.length}):`
    ];

    epicIssues
        .slice(0, options.limit)
        .forEach(issue => lines.push(`  #${issue.id.toString().padEnd(6)} ${issue.title}`));

    if (options.includeItems) {
        lines.push('', 'Merged PR appendix:');
        for (const pr of limitItems(mergedPulls, options.itemLimit)) {
            lines.push(`  #${pr.id} ${pr.mergedAt} ${pr.title} (${pr.author})`)
        }

        lines.push('', 'Closed issue appendix:');
        for (const issue of limitItems(closedIssues, options.itemLimit)) {
            lines.push(`  #${issue.id} ${issue.closedAt} ${issue.title}`)
        }
    }

    return lines.join('\n')
}

/**
 * @param {Object} report
 * @param {Object} options
 * @returns {String}
 */
function renderMarkdown(report, options) {
    const {closedIssues, mergedPulls, labelCounts, parentCounts, epicIssues, authorCounts, scopeCounts} = report;
    const lines = [
        '# Release Appendix Report',
        '',
        `Generated from local recursive content mirrors on ${new Date().toISOString()}.`,
        '',
        '## Source Boundary',
        '',
        `- Cutoff: \`${options.cutoff}\` (explicit previous-release boundary).`,
        '- PR source: `resources/content/pulls/**/*.md` with `state: MERGED` and `mergedAt >= cutoff`.',
        '- Issue source: `resources/content/issues/**/*.md` with `state: CLOSED` and `closedAt >= cutoff`.',
        '- Freshness: local mirror only. Run `sync_all` or live GitHub count checks immediately before release cut.',
        '',
        '## Summary',
        '',
        `- Merged PRs: **${mergedPulls.length}**`,
        `- Closed issues: **${closedIssues.length}**`,
        `- Epic-labeled issues closed: **${epicIssues.length}**`,
        '',
        '## PRs By Author',
        '',
        markdownCounts(authorCounts, options.limit),
        '',
        '## PRs By Title Scope',
        '',
        markdownCounts(scopeCounts, options.limit),
        '',
        '## Issues By Label',
        '',
        markdownCounts(labelCounts, options.limit),
        '',
        '## Issues By Parent Epic',
        '',
        markdownCounts(parentCounts.map(row => ({...row, name: `#${row.name}`})), options.limit),
        '',
        '## Closed Epic-Labeled Issues',
        '',
        '| Issue | Closed | Title |',
        '|---|---|---|'
    ];

    epicIssues
        .slice(0, options.limit)
        .forEach(issue => lines.push(`| [#${issue.id}](${issue.url}) | ${mdCell(issue.closedAt)} | ${mdCell(issue.title)} |`));

    if (options.includeItems) {
        lines.push(
            '',
            '## Exhaustive Merged PRs',
            '',
            '| PR | Merged | Author | Scope | Title |',
            '|---|---|---|---|---|'
        );

        for (const pr of limitItems(mergedPulls, options.itemLimit)) {
            lines.push(`| [#${pr.id}](${pr.url}) | ${mdCell(pr.mergedAt)} | ${mdCell(pr.author)} | ${mdCell(pr.scope)} | ${mdCell(pr.title)} |`)
        }

        lines.push(
            '',
            '## Exhaustive Closed Issues',
            '',
            '| Issue | Closed | Parent | Labels | Title |',
            '|---|---|---|---|---|'
        );

        for (const issue of limitItems(closedIssues, options.itemLimit)) {
            const parent = issue.parentIssue ? `#${issue.parentIssue}` : '';
            lines.push(`| [#${issue.id}](${issue.url}) | ${mdCell(issue.closedAt)} | ${mdCell(parent)} | ${mdCell(issue.labels.join(', '))} | ${mdCell(issue.title)} |`)
        }
    } else {
        lines.push(
            '',
            '## Exhaustive List Command',
            '',
            'Run this command immediately before release cut to produce the full PR and issue tables:',
            '',
            '```bash',
            `node buildScripts/release/analyzeClosedSinceRelease.mjs ${options.cutoff} --format markdown --include-items --output /tmp/release-appendix.md`,
            '```'
        )
    }

    return `${lines.join('\n')}\n`
}

/**
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function buildReport(options) {
    const [issueRecords, pullRecords] = await Promise.all([
        readFrontmatterFiles(issuesDir),
        readFrontmatterFiles(pullsDir)
    ]);

    const
        closedIssues = collectClosedIssues(issueRecords, options.cutoff),
        mergedPulls  = collectMergedPulls(pullRecords, options.cutoff),
        epicIssues   = closedIssues.filter(issue => issue.labels.includes('epic')),
        labelCounts  = countBy(closedIssues, issue => issue.labels),
        parentCounts = countBy(closedIssues, issue => issue.parentIssue),
        authorCounts = countBy(mergedPulls, pr => pr.author),
        scopeCounts  = countBy(mergedPulls, pr => pr.scope);

    return {closedIssues, mergedPulls, epicIssues, labelCounts, parentCounts, authorCounts, scopeCounts}
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        console.log(helpText());
        return
    }

    const report = await buildReport(options);
    const output = options.format === 'markdown'
        ? renderMarkdown(report, options)
        : renderText(report, options);

    if (options.output) {
        const target = path.resolve(neoRoot, options.output);
        await fs.mkdir(path.dirname(target), {recursive: true});
        await fs.writeFile(target, output, 'utf-8');
        console.log(`Release appendix report written to ${target}`);
        return
    }

    console.log(output)
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
