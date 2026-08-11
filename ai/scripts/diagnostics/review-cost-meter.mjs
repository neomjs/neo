/**
 * @plane host
 */
import {execFileSync}  from 'child_process';
import {fileURLToPath} from 'url';

const GH_PR_FIELDS = [
    'author',
    'body',
    'closedAt',
    'comments',
    'createdAt',
    'files',
    'mergedAt',
    'reviews',
    'state',
    'title'
].join(',');

const reviewBudgetActivationIssueNumber = 15257;
const reviewBudgetActivationBaseRefName = 'dev';
let reviewBudgetActivationMergedAt;

const FINDING_CLASS_PATTERNS = [
    ['premise-authority', /premise|authority|roadmap|supersed|source[- ]of[- ]truth|wrong[- ]thing/i],
    ['contract-boundary', /contract|schema|api|config|boundary|rls|tenant|consumer/i],
    ['test-evidence', /test|coverage|receipt|falsifier|evidence|\bci\b/i],
    ['architecture-placement', /architect|placement|folder|layer|ownership|cohesion/i],
    ['metadata-hygiene', /metadata|docs?|jsdoc|template|lint|close[- ]target|wording/i]
];

const ENFORCEMENT_SURFACE_PATTERNS = [
    /^\.agents\//,
    /^\.github\/workflows\//,
    /^AGENTS(?:_ATLAS)?\.md$/,
    /^ai\/mcp\//,
    /^ai\/scripts\/(?:lifecycle|setup)\//,
    /^ai\/services\/(?:github-workflow|memory-core)\//,
    /^buildScripts\/util\/check-/,
    /(?:AiConfig|config(?:Base|\.template)?|auth|permission|security|tenant|validator|lint)/i
];

const IGNORED_SURFACE_PATTERNS = [
    /(?:^|\/)test(?:s)?\//,
    /^learn\//,
    /^resources\//,
    /(?:^|\/)__snapshots__\//,
    /\.md$/
];

const DROP_SUPERSEDE_DISPOSITIONS = new Set([
    'implementation-off',
    'ticket-prescription-off',
    'ticket-premise-dead'
]);

export const REVIEW_COST_METER_HELP = `Usage: node ai/scripts/diagnostics/review-cost-meter.mjs [--json] <PR_NUMBER...>

Emits the budgeted-review OQ5 metrics for one PR or a corpus:
ordinary/submitted RC counts, unique heads, carried-vs-new finding clusters,
falsifier classes + curve, upstream-preventable findings, discussion bytes,
RC2-to-terminal time, and the enforcement/security vs ordinary surface stratum.`;

function byteLength(value) {
    return Buffer.byteLength(value || '', 'utf8')
}

function submittedMs(item) {
    const value = Date.parse(item?.submittedAt || '');

    return Number.isFinite(value) ? value : 0
}

function reviewField(body, label) {
    const pattern = new RegExp(`^[-*]?\\s*(?:\\*\\*)?${label}\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*(.+)$`, 'im');

    return body.match(pattern)?.[1]?.replace(/[`*]/g, '').trim() || ''
}

function hasDropSupersedeIntent(body = '') {
    const lines = body.split('\n').map(line => line.trim());

    return lines.includes('**Status:** Drop+Supersede') ||
        lines.includes('- **Decision**: Drop+Supersede') ||
        lines.some(line => /\[DROP(?:_|\+)AND_SUPERSEDE\]/i.test(line))
}

function classifyDropSupersede(review, postCutover) {
    const body                 = review?.body || '';
    const lines                = body.split('\n').map(line => line.trim());
    const modernStatusIntent   = lines.includes('**Status:** Drop+Supersede');
    const modernDecisionIntent = lines.includes('- **Decision**: Drop+Supersede');
    const modernIntent         = modernStatusIntent || modernDecisionIntent;
    const modernCompleteIntent = modernStatusIntent && modernDecisionIntent;
    const legacyIntent = lines.some(line => /\[DROP(?:_|\+)AND_SUPERSEDE\]/i.test(line));
    const disposition  = reviewField(body, 'Disposition');
    const requiredFields = [
        'Source-coordinate falsifiers',
        'Salvage map',
        'Successor landing pad',
        'Successor map citation'
    ];
    const missingFields = requiredFields.filter(label => !reviewField(body, label));

    if (modernIntent && !modernCompleteIntent) missingFields.unshift('Status + Decision');

    const contractComplete = modernCompleteIntent && DROP_SUPERSEDE_DISPOSITIONS.has(disposition) && missingFields.length === 0;
    const managed = body.includes('[review-budget-managed]') &&
        /outcome\s*:\s*terminal-drop-supersede/i.test(body);
    const bypass = /^\[review-budget-bypass\]\s+reason:\s*\S.*$/im.test(body);
    const eligibleTerminal = isSubmittedRequestChangesReview(review) && (
        postCutover ? contractComplete && (managed || bypass) : legacyIntent || contractComplete
    );

    return {
        intent: modernCompleteIntent ? 'modern' : modernIntent ? 'modern-incomplete' : legacyIntent ? 'legacy' : null,
        contractComplete,
        eligibleTerminal,
        missingFields,
        basis: eligibleTerminal
            ? postCutover ? managed ? 'managed-validator' : 'disclosed-bypass' : legacyIntent ? 'legacy-intent' : 'grandfathered-modern-contract'
            : modernIntent || legacyIntent ? 'invalid-terminal-intent' : 'none'
    }
}

function isSubmittedRequestChangesReview(review) {
    if (review?.state === 'CHANGES_REQUESTED') return true;
    if (review?.state !== 'DISMISSED') return false;

    const body  = review?.body || '';
    const lines = body.split('\n').map(line => line.trim());

    return body.includes('[review-budget-managed]') ||
        body.includes('[review-budget-override]') ||
        /^\[review-budget-bypass\]\s+reason:\s*\S.*$/im.test(body) ||
        lines.includes('**Status:** Request Changes') ||
        lines.includes('- **Decision**: Request Changes') ||
        hasDropSupersedeIntent(body)
}

function normalizeFinding(line) {
    return line
        .replace(/^\s*[-*]\s*/, '')
        .replace(/^\[[ xX]\]\s*/, '')
        .replace(/^\*{0,2}(?:RA[- ]?\d+|Required Action(?:s)?(?: \d+)?)[*:.-]*\*{0,2}\s*/i, '')
        .replace(/[`*_#]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function extractFindings(body = '') {
    const findings            = [];
    let   inRequiredActions   = false;
    let   inMechanicalHygiene = false;

    body.split('\n').forEach(line => {
        if (/^\s*#{1,6}\s+/.test(line)) {
            inRequiredActions = /Required Actions/i.test(line);
            inMechanicalHygiene = /Remaining Mechanical-Hygiene/i.test(line);
            return
        }

        if (/^\s*[-*]\s+\[[xX]\]/.test(line)) return;

        const checkboxFinding = /^\s*[-*]\s+\[ \]/.test(line);
        const microDeltaIssue = inMechanicalHygiene &&
            /^\s*[-*]\s+(?:\*{0,2})?Issue\s+\d+[*:.-]/i.test(line);

        if ((inRequiredActions && checkboxFinding) || microDeltaIssue) {
            const finding = normalizeFinding(line);

            if (finding) findings.push(finding)
        }
    });

    return findings
}

function classifyFinding(finding, ordinal) {
    const matches = FINDING_CLASS_PATTERNS
        .filter(([, pattern]) => pattern.test(finding))
        .map(([name]) => name);

    return matches.length ? matches : [`correctness-shape:${ordinal + 1}`]
}

function parseCarriedNewCensus(body = '') {
    const match = body.match(/Carried-vs-new census[^\n]*carried=\[([^\]]*)\]\s*;\s*new=\[([^\]]*)\]/i);
    const parse = value => value.split(',').map(item => item.trim()).filter(Boolean);

    return match ? {
        carried   : parse(match[1]),
        new       : parse(match[2]),
        confidence: 'explicit'
    } : {
        carried   : [],
        new       : [],
        confidence: 'unknown'
    }
}

function authorityOwner(finding) {
    return finding.match(/\[authority-owner:\s*(@[\w-]+)\]/i)?.[1]?.toLowerCase() || null
}

function reviewerLogin(review, index) {
    return review?.author?.login || review?.author?.name || `unknown-reviewer-${index + 1}`
}

function isCommentedClosure(review) {
    return review?.state === 'COMMENTED' && /\*\*COMMENTED CLOSURE\*\*/.test(review?.body || '')
}

function classifyCurve(values) {
    if (values.length < 2) return 'insufficient-data';

    const deltas = values.slice(1).map((value, index) => value - values[index]);

    if (deltas.every(delta => delta < 0)) return 'narrowing';
    if (deltas.every(delta => delta > 0)) return 'expanding';
    if (deltas.every(delta => delta === 0)) return 'stable';
    if (deltas.every(delta => delta <= 0)) return 'non-expanding';
    if (deltas.every(delta => delta >= 0)) return 'non-narrowing';

    return 'mixed'
}

/**
 * @summary Content-classifies one adjacent same-head verdict pair for OQ5 telemetry.
 * @param {Object} previous Earlier review.
 * @param {Object} current Later review on the same exact head.
 * @returns {String} Machinery corrective, honest retraction, or semantic repeat.
 */
function classifySameHeadPair(previous, current) {
    const body = current?.body || '';

    if (isSubmittedRequestChangesReview(current) && /template[- ]complete|template\/lint corrective|machinery corrective/i.test(body)) {
        return 'machinery-corrective'
    }

    if (previous?.state === 'APPROVED' && isSubmittedRequestChangesReview(current) &&
        /retract(?:ing|ion)?|reviewer correction|new exact-head falsifier/i.test(body)) {
        return 'honest-retraction'
    }

    return 'semantic-repeat'
}

/**
 * @summary Names the OQ5 curve discriminator while retaining generic fallback shapes.
 * @param {Number[]} values Falsifier-class counts per ordinary cycle.
 * @param {Object[]} cycles Per-cycle carried/new classification.
 * @returns {String} Content-aware curve shape.
 */
function classifyFalsifierCurve(values, cycles) {
    const deltas = values.slice(1).map((value, index) => value - values[index]);

    if (deltas.length && deltas.every(delta => delta > 0) &&
        cycles.slice(1).every(cycle => cycle.carriedClusters.length > 0)) {
        return 'rising-on-one-property'
    }

    if (deltas.some(delta => delta < 0) && deltas.some(delta => delta > 0) &&
        cycles.slice(2).some(cycle => cycle.newClusters.length > 0)) {
        return 'spiky-across-surfaces'
    }

    return classifyCurve(values)
}

function classifySurface(files = []) {
    const paths       = files.map(file => file?.path || file?.name || '').filter(Boolean);
    let   enforcement = 0;
    let   product     = 0;

    paths.forEach(file => {
        if (ENFORCEMENT_SURFACE_PATTERNS.some(pattern => pattern.test(file))) {
            enforcement++;
        } else if (!IGNORED_SURFACE_PATTERNS.some(pattern => pattern.test(file))) {
            product++
        }
    });

    return enforcement > 0 && enforcement >= product
        ? 'enforcement-security-adjacent'
        : 'ordinary-product-metadata'
}

function replayFormalTerminal(reviews, ordinaryIndexes, dropClassifications, rc2Ms) {
    if (!rc2Ms) return null;

    const blockers   = new Set();
    let   candidate  = null;
    let   confidence = 'exact-formal-history';

    reviews.forEach((review, index) => {
        const time = submittedMs(review);

        if (review?.state === 'DISMISSED') confidence = 'degraded-dismissal-time-unavailable';

        if (dropClassifications[index].eligibleTerminal) {
            if (time >= rc2Ms) {
                candidate = {
                    milliseconds : time - rc2Ms,
                    terminalState: 'DROP_SUPERSEDE',
                    terminalAt   : review?.submittedAt || null,
                    source       : 'formal-review-replay',
                    confidence,
                    basis        : dropClassifications[index].basis
                }
            }
            return
        }

        if (ordinaryIndexes.has(index)) {
            blockers.add(reviewerLogin(review, index));
            if (time >= rc2Ms) candidate = null;
            return
        }

        if (review?.state === 'APPROVED') {
            blockers.delete(reviewerLogin(review, index));

            if (time >= rc2Ms && blockers.size === 0) {
                candidate = {
                    milliseconds : time - rc2Ms,
                    terminalState: 'APPROVED',
                    terminalAt   : review?.submittedAt || null,
                    source       : 'formal-review-replay',
                    confidence,
                    basis        : 'all-reviewer-blockers-cleared'
                }
            }
        }
    });

    return candidate
}

/**
 * @summary Derives budgeted-review telemetry from a `gh pr view --json` payload.
 *
 * Finding clusters are deliberately heuristic and confined to this metrics layer. RC
 * accounting also recognizes managed/bypass provenance and exact template intent because
 * GitHub rewrites a dismissed review's current state to `DISMISSED`.
 *
 * @param {Object} pr GitHub CLI PR payload.
 * @param {Number|String} [prNumber] Optional PR number for the report envelope.
 * @returns {Object} OQ5 metric report plus raw counts.
 */
export function analyzeReviewCost(pr, prNumber) {
    const comments                    = Array.isArray(pr?.comments) ? pr.comments : [];
    const reviews                     = Array.isArray(pr?.reviews) ? [...pr.reviews].sort((a, b) => submittedMs(a) - submittedMs(b)) : [];
    const activationMs                = Date.parse(pr?.reviewBudgetActivationMergedAt || '');
    const createdMs                   = Date.parse(pr?.createdAt || '');
    const postCutover                 = Number.isFinite(activationMs) && Number.isFinite(createdMs) && createdMs > activationMs;
    const dropClassifications         = reviews.map(review => classifyDropSupersede(review, postCutover));
    const sameHeadPairClassifications = reviews.slice(1).flatMap((review, index) => {
        const previous = reviews[index];

        if (!previous?.commit?.oid || review?.commit?.oid !== previous.commit.oid ||
            !isSubmittedRequestChangesReview(review) || dropClassifications[index + 1].eligibleTerminal) return [];

        return [{
            previousIndex : index,
            currentIndex  : index + 1,
            head          : review.commit.oid,
            classification: classifySameHeadPair(previous, review)
        }]
    });
    const machineryCorrectiveIndexes = new Set(sameHeadPairClassifications
        .filter(pair => pair.classification === 'machinery-corrective')
        .map(pair => pair.currentIndex));
    const submittedRequestChanges = reviews
        .map((review, index) => ({review, index}))
        .filter(({review}) => isSubmittedRequestChangesReview(review));
    const ordinaryRequestChanges = submittedRequestChanges.filter(({index}) =>
        !dropClassifications[index].eligibleTerminal && !machineryCorrectiveIndexes.has(index)
    );
    const ordinaryIndexes       = new Set(ordinaryRequestChanges.map(({index}) => index));
    const terminalDropSupersede = submittedRequestChanges
        .filter(({index}) => dropClassifications[index].eligibleTerminal);
    const cycles = reviews.flatMap((review, index) => {
        let contactType = null;

        if (ordinaryIndexes.has(index)) contactType = 'REQUEST_CHANGES';
        else if (review?.state === 'APPROVED') contactType = 'APPROVED';
        else if (isCommentedClosure(review)) contactType = 'COMMENTED_CLOSURE';

        if (!contactType) return [];

        const findings = contactType === 'APPROVED' ? [] : extractFindings(review.body);
        const classes  = [...new Set(findings.flatMap((finding, ordinal) => classifyFinding(finding, ordinal)))];
        const census   = parseCarriedNewCensus(review.body);

        return [{
            cycle            : index + 1,
            contactType,
            head             : review?.commit?.oid || null,
            submittedAt      : review?.submittedAt || null,
            findingCount     : findings.length,
            findingClusters  : findings,
            findings,
            falsifierClasses : classes,
            carriedClusters  : census.carried,
            newClusters      : census.new,
            clusterConfidence: census.confidence
        }]
    });

    const classCounts               = cycles.map(cycle => cycle.falsifierClasses.length);
    const uniqueHeads               = [...new Set(ordinaryRequestChanges.map(({review}) => review?.commit?.oid).filter(Boolean))];
    const sameHeadPairs             = sameHeadPairClassifications.length;
    const prAuthor                  = pr?.author?.login?.toLowerCase() || null;
    const authorityAssessedFindings = cycles.flatMap(cycle => cycle.findings.map((finding, ordinal) => ({
        finding,
        classes       : classifyFinding(finding, ordinal),
        authorityOwner: authorityOwner(finding),
        cycle         : cycle.cycle
    })));
    const upstreamFindings = authorityAssessedFindings.filter(item =>
        item.authorityOwner && prAuthor && item.authorityOwner !== `@${prAuthor}`
    );
    const unknownAuthorityFindings = authorityAssessedFindings.filter(item => !item.authorityOwner);

    const bytes = {
        title   : byteLength(pr?.title),
        body    : byteLength(pr?.body),
        comments: comments.reduce((sum, item) => sum + byteLength(item?.body), 0),
        reviews : reviews.reduce((sum, item) => sum + byteLength(item?.body), 0)
    };

    bytes.total = bytes.title + bytes.body + bytes.comments + bytes.reviews;

    const rc2Ms         = submittedMs(ordinaryRequestChanges[1]?.review);
    const rc2ToTerminal = replayFormalTerminal(reviews, ordinaryIndexes, dropClassifications, rc2Ms);

    return {
        prNumber: prNumber == null ? null : Number(prNumber),
        state   : pr?.state || null,
        stratum : classifySurface(pr?.files),
        raw     : {
            comments               : comments.length,
            formalReviews          : reviews.length,
            submittedRequestChanges: submittedRequestChanges.length
        },
        ordinaryRequestChanges      : ordinaryRequestChanges.length,
        terminalDropSupersede       : terminalDropSupersede.length,
        invalidDropSupersede        : dropClassifications.filter(item => item.intent && !item.eligibleTerminal).length,
        dropSupersedeClassifications: dropClassifications,
        uniqueHeads,
        sameHeadPairs,
        sameHeadPairClassifications,
        cycles,
        falsifierClassCurve         : {
            values: classCounts,
            shape : classifyFalsifierCurve(classCounts, cycles)
        },
        carriedClusters            : [...new Set(cycles.flatMap(cycle => cycle.carriedClusters))],
        newClusters                : [...new Set(cycles.flatMap(cycle => cycle.newClusters))],
        findingsPreventableUpstream: {
            heuristic   : false,
            basis       : 'explicit-authority-owner',
            count       : upstreamFindings.length,
            unknownCount: unknownAuthorityFindings.length,
            findings    : upstreamFindings
        },
        discussionBytes: bytes,
        rc2ToTerminal
    }
}

function readPullRequest(prNumber) {
    const raw = execFileSync('gh', ['pr', 'view', String(prNumber), '--json', GH_PR_FIELDS], {
        encoding: 'utf8'
    });
    const pr = JSON.parse(raw);

    if (reviewBudgetActivationMergedAt === undefined) {
        const nameWithOwner = JSON.parse(execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], {
            encoding: 'utf8'
        })).nameWithOwner;
        const [owner, repo] = nameWithOwner.split('/');
        const query         = `
            query ReviewBudgetActivation($owner: String!, $repo: String!, $issueNumber: Int!) {
              repository(owner: $owner, name: $repo) {
                activationIssue: issue(number: $issueNumber) {
                  id
                  closedByPullRequestsReferences(first: 100, includeClosedPrs: true) {
                    totalCount
                    nodes {
                      number
                      state
                      mergedAt
                      baseRefName
                    }
                    pageInfo {
                      hasNextPage
                    }
                  }
                }
              }
            }
        `;
        const activationRaw = execFileSync('gh', [
            'api', 'graphql',
            '-f', `query=${query}`,
            '-F', `owner=${owner}`,
            '-F', `repo=${repo}`,
            '-F', `issueNumber=${reviewBudgetActivationIssueNumber}`
        ], {encoding: 'utf8'});
        const activationIssue = JSON.parse(activationRaw)?.data?.repository?.activationIssue;
        const references      = activationIssue?.closedByPullRequestsReferences;
        const nodes           = references?.nodes;

        if (!activationIssue?.id || !Array.isArray(nodes) || references?.pageInfo?.hasNextPage !== false ||
            !Number.isInteger(references?.totalCount) || references.totalCount !== nodes.length) {
            throw new Error(`Cannot prove the complete closing-PR history for review-budget activation issue #${reviewBudgetActivationIssueNumber}.`)
        }

        const malformedMerged = nodes.filter(reference =>
            reference?.state === 'MERGED' && reference?.baseRefName === reviewBudgetActivationBaseRefName &&
            !Number.isFinite(Date.parse(reference?.mergedAt || ''))
        );

        if (malformedMerged.length > 0) {
            throw new Error(`Review-budget activation issue #${reviewBudgetActivationIssueNumber} has a merged ${reviewBudgetActivationBaseRefName} closer without a valid mergedAt.`)
        }

        const activationPr = nodes
            .filter(reference => reference?.state === 'MERGED' && reference?.baseRefName === reviewBudgetActivationBaseRefName)
            .sort((left, right) => Date.parse(left.mergedAt) - Date.parse(right.mergedAt) || left.number - right.number)[0];

        reviewBudgetActivationMergedAt = activationPr?.mergedAt || null
    }

    pr.reviewBudgetActivationMergedAt = reviewBudgetActivationMergedAt;

    return pr
}

function printHuman(report) {
    console.log(`=== Review Cost Meter: PR #${report.prNumber} ===`);
    console.log(`Stratum: ${report.stratum}`);
    console.log(`Ordinary RC: ${report.ordinaryRequestChanges} | Submitted RC: ${report.raw.submittedRequestChanges} | Unique heads: ${report.uniqueHeads.length} | Same-head pairs: ${report.sameHeadPairs}`);
    console.log(`Falsifier-class curve: ${report.falsifierClassCurve.values.join(' -> ') || 'n/a'} (${report.falsifierClassCurve.shape})`);
    console.log(`Carried clusters: ${report.carriedClusters.join(', ') || 'none'} | New clusters: ${report.newClusters.join(', ') || 'none'}`);
    console.log(`Upstream-preventable findings (explicit named-peer authority): ${report.findingsPreventableUpstream.count} | Unknown authority: ${report.findingsPreventableUpstream.unknownCount}`);
    console.log(`Discussion bytes: ${report.discussionBytes.total}`);
    console.log(`RC2 -> terminal: ${report.rc2ToTerminal ? `${report.rc2ToTerminal.milliseconds} ms (${report.rc2ToTerminal.terminalState})` : 'not observed'}`)
}

export function runReviewCostMeter(argv = process.argv.slice(2)) {
    if (argv.includes('--help') || argv.includes('-h')) {
        console.log(REVIEW_COST_METER_HELP);
        return []
    }

    const json      = argv.includes('--json');
    const prNumbers = argv.filter(value => value !== '--json');

    if (!prNumbers.length || prNumbers.some(value => !/^\d+$/.test(value))) {
        throw new Error(REVIEW_COST_METER_HELP)
    }

    const reports = prNumbers.map(prNumber => analyzeReviewCost(readPullRequest(prNumber), prNumber));

    if (json) {
        console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2))
    } else {
        reports.forEach((report, index) => {
            if (index > 0) console.log('');
            printHuman(report)
        })
    }

    return reports
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
    try {
        runReviewCostMeter()
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1
    }
}
