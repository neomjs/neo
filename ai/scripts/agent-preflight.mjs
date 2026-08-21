import {execFileSync}             from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {Command}                  from 'commander';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';
import {collectStaleOverlayFindings}
                                   from './setup/initServerConfigs.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    /**
     * The gates this orchestrator SPAWNS (`check-ticket-archaeology`, `check-block-alignment`) are
     * engine-side source guards and stay under `buildScripts/util/`; only this orchestrator moved
     * Brain-side in the Class B relocation. So the default is resolved against that directory explicitly rather than
     * against `__dirname`.
     *
     * It was `__dirname` while this file sat beside them, which was correct then and would have been
     * silently wrong the moment the file moved: `path.join()` produces a path either way, and the
     * failure would surface as a missing-file spawn at pre-commit time rather than at import. The
     * unit specs already inject `scriptDir: '/repo/buildScripts/util'`, so they would have kept
     * passing over a broken default — the reason this is a named constant and not an inlined join.
     * @type {String}
     */
    GATE_DIR   = path.resolve(__dirname, '../../buildScripts/util');

// Source-to-mirror: keep these PR-body anchors in sync with
// `.github/workflows/agent-pr-body-lint.yml`. Do not reintroduce a shared
// `prReviewAnchors.mjs`; sync-by-convention is deliberate.
export const VISIBLE_PR_BODY_ANCHORS = [
    'Evidence:',
    '## Test Evidence',
    '## Post-Merge Validation'
];

export const INVISIBLE_PR_BODY_ANCHORS = [
    'Authored by ',
    '## Deltas'
];

const
    // A REAL level-two heading on its own line. `indexOf` would anchor on the first substring, so a
    // body that merely quotes the heading in prose or a fenced block would have its section read
    // from the wrong offset.
    POST_MERGE_VALIDATION_H2      = /^##[ \t]+Post-Merge Validation[ \t]*$/m,
    // An unchecked task box, or an explicit residual marker. Checked boxes owe nothing.
    LIVE_OBLIGATION_PATTERN       = /^\s*[-*]\s*\[ \]|NOT_YET_MEASURED|^\s*Residual:/m,
    // The Evidence Ladder's CANONICAL residual form is inline on the `Evidence:` line — outside the
    // Post-Merge Validation section entirely. Scanning only that section leaves the documented shape
    // undetected, which is the quiet failure: the guard reports success on the exact grammar the
    // template teaches. `Residual-Owner:` cannot match it — the colon must follow `Residual`.
    INLINE_RESIDUAL_PATTERN       = /\bResidual:[ \t]*(AC\s*\d+[^\n.]*)/i,
    // TWO legitimate declaration shapes, because the substrate teaches two — conflating them is what
    // produced a bypass in one direction and a broken canonical form in the other.
    //
    // 1. SECTION shape: the owner is the LINE's content, after optional blockquote / list markers. The
    //    ticket says line — *"an explicit `Residual-Owner: #N` line"*. Anchoring matters here because a
    //    section is prose: `We considered Residual-Owner: #200 but rejected that owner.` discharged work
    //    while SAYING it rejected the owner.
    RESIDUAL_OWNER_LINE_PATTERN   = /^[ \t]*(?:>[ \t]*)*(?:[-*+][ \t]+)?Residual-Owner:[ \t]+#(\d+)[ \t]*$/im,
    // 2. INLINE shape: `evidence-ladder.md` prescribes a **1-line** declaration whose owner is mid-line —
    //    `Evidence: L2 (…) → L4 required (AC5 …). Residual: AC5, Residual-Owner: #<an existing open ticket>.` Anchoring THIS
    //    would refuse the documented template, which is what my first attempt did; a spec arm written the
    //    round before caught it. The owner must follow the `Residual:` clause on that same line, so a
    //    bare mid-line mention still cannot qualify.
    RESIDUAL_OWNER_INLINE_PATTERN = /Residual:[^\n]*?,[ \t]*Residual-Owner:[ \t]+#(\d+)/i,
    RESOLVES_PATTERN              = /\bResolves:?\s+#\d+/i,
    NON_CLOSING_REFERENCE_PATTERN = /\b(Refs|Related):?\s+#\d+/i,
    FORBIDDEN_CLOSE_PATTERN       = /\b(Closes|Fixes):?\s+#\d+/i,
    DECLARED_TICKET_PATTERN       = /\b(?:Resolves|Refs|Related):?\s+#(\d+)/gi,
    COMMIT_TICKET_PATTERN         = /\(#(\d+)\)\s*$/,
    CONVENTIONAL_TYPE_PATTERN     = /^([a-z][a-z0-9-]*)(?:\([^()\r\n]+\))?!?:\s+\S/;

export {COMMIT_TICKET_PATTERN, DECLARED_TICKET_PATTERN};

export const CHANGE_CLASS_TO_TYPES = Object.freeze({
    capability : Object.freeze(['feat']),
    restoration: Object.freeze(['fix']),
    // The repo's conventional zero-delta type labels. The gate maps the AUTHOR-DECLARED
    // class to this allowed set — a prefix never proves the class; the author's truthful
    // declaration remains the semantic authority. Evidence (14-day dev history): test 20,
    // docs 22, chore 65, build 4; `ci` rides the same convention for CI-config deltas.
    // Arrays are frozen and `validateChangeClass` returns an isolated copy: the policy is
    // never mutable through the map or a returned observation.
    'zero-delta': Object.freeze(['chore', 'test', 'docs', 'ci', 'build'])
});

/**
 * @summary Builds the Commander program for the agent preflight helper.
 * @returns {Command}
 */
export function createProgram() {
    return new Command()
        .name('agent-preflight')
        .description('Runs the agent commit/PR preflight gates in one pass; default mode may repair block alignment.')
        .usage('[options] [files...]')
        .option('--change-class <class>', 'Declare capability, restoration, or zero-delta for subject validation.')
        .option('--commit-subject <subject>', 'Validate the intended commit subject against --change-class.')
        .option('--pr-title <title>', 'Validate the intended PR title against --change-class.')
        .option('--pr-body <file>', 'Run local PR-body template lint against the given markdown file.')
        .option('--pr-base <ref>', 'Compare stacked PR commit tickets against this intended base.', 'origin/dev')
        .option('--pr-draft', 'Validate --pr-body as a draft PR: Refs/Related may temporarily stand in for Resolves.')
        .option('--no-fix', 'Check-only mode: skip the check-block-alignment --fix repair pass.')
        .argument('[files...]', 'Optional file paths. When omitted, staged ACMR files are read from git.')
}

/**
 * @summary Parses the agent-preflight command line with the shared Commander dependency.
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv) {
    const program = createProgram();

    program.exitOverride();
    program.configureOutput({writeOut: () => {}, writeErr: () => {}});
    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        changeClass  : options.changeClass || null,
        commitSubject: options.commitSubject || null,
        files        : program.args,
        fix          : options.fix,
        help         : false,
        prBase       : options.prBase,
        prBody       : options.prBody || null,
        prDraft      : options.prDraft || false,
        prTitle      : options.prTitle || null
    }
}

function writeUsage(stream) {
    stream.write(createProgram().helpInformation())
}

/**
 * @summary Reads staged ACMR file paths from git when the caller does not provide an explicit file list.
 * @param {Object} deps
 * @param {String} deps.cwd
 * @param {Function} deps.execFileSyncImpl
 * @returns {String[]}
 */
export function getStagedFiles({cwd, execFileSyncImpl = execFileSync}) {
    const output = execFileSyncImpl(
        'git',
        ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
        {cwd, encoding: 'utf8'}
    );

    return String(output).trim().split('\n').map(file => file.trim()).filter(Boolean)
}

/**
 * @summary Keeps the source gates scoped to JavaScript module files.
 * @param {String[]} files
 * @returns {String[]}
 */
export function filterMjsFiles(files) {
    return files.filter(file => file.endsWith('.mjs'))
}

/**
 * @summary Validates the author's explicit semantic change class against intended Conventional Commit subjects.
 *
 * The author owns the semantic classification. This guard deliberately does not inspect issue labels, changed
 * files, or diff size; it only maps the declared class to its required type and checks the supplied surfaces.
 *
 * @param {Object} [options]
 * @param {String|null} [options.changeClass]
 * @param {String|null} [options.commitSubject]
 * @param {String|null} [options.prTitle]
 * @returns {{errors: String[], expectedTypes: String[]|null, skipped: Boolean, valid: Boolean}}
 */
export function validateChangeClass({
    changeClass = null,
    commitSubject = null,
    prTitle = null
} = {}) {
    const
        subjects = [
            {label: 'commit subject', value: commitSubject},
            {label: 'PR title',       value: prTitle}
        ].filter(({value}) => Boolean(value)),
        hasInput = Boolean(changeClass) || subjects.length > 0;

    if (!hasInput) {
        return {
            errors       : [],
            expectedTypes: null,
            skipped      : true,
            valid        : true
        }
    }

    const
        errors        = [],
        expectedTypes = Object.hasOwn(CHANGE_CLASS_TO_TYPES, changeClass)
            ? CHANGE_CLASS_TO_TYPES[changeClass]
            : null;

    if (!changeClass) {
        errors.push('`--change-class` is required when `--commit-subject` or `--pr-title` is provided.')
    } else if (!expectedTypes) {
        errors.push(
            `Unknown change class \`${changeClass}\`; expected capability, restoration, or zero-delta.`
        )
    }

    if (subjects.length === 0) {
        errors.push('`--change-class` requires at least one `--commit-subject` or `--pr-title` to validate.')
    }

    if (expectedTypes) {
        const requirement = expectedTypes.length === 1
            ? `requires \`${expectedTypes[0]}\``
            : `requires one of ${expectedTypes.map(type => `\`${type}\``).join(', ')}`;

        subjects.forEach(({label, value}) => {
            const match = value.match(CONVENTIONAL_TYPE_PATTERN);

            if (!match) {
                errors.push(
                    `${label} is missing a valid Conventional Commit prefix; change class ` +
                    `\`${changeClass}\` ${requirement}.`
                )
            } else if (!expectedTypes.includes(match[1])) {
                errors.push(
                    `${label} declares \`${match[1]}\`, but change class \`${changeClass}\` ` +
                    `${requirement}.`
                )
            }
        })
    }

    return {
        errors,
        // An observation, never a write capability: the copy isolates the caller from the
        // frozen policy arrays, so mutating a result cannot change later validations.
        expectedTypes: expectedTypes ? [...expectedTypes] : null,
        skipped      : false,
        valid        : errors.length === 0
    }
}

/**
 * @summary Blanks fenced code blocks, preserving line structure so offsets stay comparable.
 *
 * A heading inside a fence is an EXAMPLE, not a section this body owes work under. Replacing the
 * fence with spaces rather than deleting it keeps every later line at its original index, which is
 * what lets a caller map a match back onto the untouched body.
 * @param {String} body
 * @returns {String}
 * @private
 */
function withoutFencedBlocks(body = '') {
    // A heading inside a fence is an EXAMPLE, not this body's section. Bodies that document the
    // template — including this PR's own — carry `## Post-Merge Validation` inside fences, and
    // anchoring there reads a worked example as the real obligation.
    //
    // Line-scanned rather than regex-matched, because GFM fences are not one spelling: an opener is
    // three-or-more BACKTICKS **or** three-or-more TILDES, indentable up to three spaces, and a closer
    // must use the same character and be at least as long. A single ```-only pattern let `~~~~md` and
    // ````markdown` shadow the real section — two live bypasses at review. Blanked (not deleted) so
    // every later line keeps its index.
    let fenceChar = null,
        fenceLen  = 0;

    return body.split('\n').map(line => {
        const marker = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/),
              blank  = () => line.replace(/[^\n]/g, ' ');

        if (fenceChar === null) {
            if (!marker) {
                return line;
            }
            fenceChar = marker[1][0];
            fenceLen  = marker[1].length;

            return blank();
        }

        // A closer carries nothing but its own run; an info string means a new opener, never a close.
        const closer = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);

        if (closer && closer[1][0] === fenceChar && closer[1].length >= fenceLen) {
            fenceChar = null;
            fenceLen  = 0;
        }

        return blank();
    }).join('\n')
}

/**
 * @summary Blanks inline code spans, preserving length so offsets stay comparable.
 *
 * A backticked `Residual-Owner: #200` inside a Post-Merge Validation section DOCUMENTS the spelling; it
 * does not declare ownership. Reading it as a declaration let a section satisfy its own live obligation
 * by quoting the syntax that would have satisfied it — the same class as a fenced heading standing in
 * for a real one, one grain finer.
 * @param {String} text
 * @returns {String}
 * @private
 */
function withoutHtmlComments(text = '') {
    // An HTML comment is INVISIBLE in rendered Markdown, so a declaration inside one is not a
    // declaration — a reader of the PR sees unowned work while the gate reports success. Same class as
    // a fenced example: text that is present in the source and absent from the artifact. Blanked per
    // character so every later line keeps its index.
    //
    // `(?:-->|$)` — an UNTERMINATED comment runs to end-of-body and must blank too. Requiring the
    // closing delimiter made the gate's notion of "commented out" stricter than the renderer's:
    // GitHub swallows everything from `<!--` to EOF, so `## Post-Merge Validation / - [ ] do real
    // work / <!-- / Residual-Owner: #200` renders as an unowned obligation while the gate read the
    // owner and passed. Verified against the real renderer (`POST /markdown`): the response carries
    // the heading and the list item and NO owner. The rule is the same one every arm here restates —
    // judge what a READER SEES — and the closing delimiter was an assumption about how the evasion
    // would be spelled.
    return text.replace(/<!--[\s\S]*?(?:-->|$)/g, match => match.replace(/[^\n]/g, ' '))
}

function withoutInlineCode(text = '') {
    return text
        // Longest backtick runs FIRST: a ``double`` span is not two single spans, and a single-backtick
        // pattern applied first would consume the opening pair and leave the token exposed.
        .replace(/(`{2,})[\s\S]*?\1/g, match => match.replace(/[^\n]/g, ' '))
        .replace(/`[^`\n]*`/g, match => match.replace(/[^\n]/g, ' '))
        // GFM indented code: four spaces (or a tab) at line start is a code block, so a token there is
        // rendered example text, not a declaration. Blanked per line to keep offsets stable.
        .split('\n')
        .map(line => (/^(?: {4,}|\t)/.test(line) ? line.replace(/[^\n]/g, ' ') : line))
        .join('\n')
}

/**
 * @summary Returns the body of the `## Post-Merge Validation` section, or `''` when absent.
 *
 * The anchor check in `validatePrBody` proves the heading string appears SOMEWHERE; it says nothing
 * about what follows it. This reads the section itself — heading to the next `##` heading, or to
 * end-of-body when it is last — and reads it from a fenceless copy so a worked example in a fence
 * cannot shadow the real section.
 * @param {String} body
 * @returns {String}
 * @private
 */
function postMergeValidationSections(body = '') {
    // EVERY matching section, not the first. `body.match()` returns one hit, so a duplicate — even an
    // empty `## Post-Merge Validation / None deferred.` earlier in the document — shadowed a later
    // section that genuinely owed work. A body owes work if ANY of its sections does, so the caller
    // needs the whole set and picks the owing one.
    const
        fenceless = withoutHtmlComments(withoutFencedBlocks(body)),
        matcher   = new RegExp(POST_MERGE_VALIDATION_H2.source, 'gm'),
        sections  = [];

    let match;

    while ((match = matcher.exec(fenceless)) !== null) {
        const
            after = fenceless.slice(match.index + match[0].length),
            next  = after.search(/^##\s/m);

        sections.push(next === -1 ? after : after.slice(0, next))
    }

    return sections
}

/**
 * @summary Reports whether a Post-Merge Validation section still owes work.
 *
 * A live obligation is an unchecked task box, or an explicit residual marker. A section of checked
 * boxes, or one that says the work is done, owes nothing — which is why presence of the section is
 * never itself the trigger.
 * @param {String} section
 * @returns {String|null} The first live obligation, for the failure message, or `null`.
 * @private
 */
function firstLiveObligation(section = '') {
    const line = section.split('\n').find(entry => LIVE_OBLIGATION_PATTERN.test(entry));

    return line ? line.trim() : null
}

// The ONE signal separating "the cited ticket is not there" from "we could not look": `gh` exits 1
// for both, so the exit code decides nothing. This repo has been bitten from the other side —
// `gh pr checks` exits 1 for a failing check AND for an unreachable API, which read a 503 as a red
// board. Only a 404 is an answer about the TICKET; everything else is an answer about the
// TRANSPORT, and a gate must never convert one into the other.
const GH_NOT_FOUND_PATTERN = /\(HTTP 404\)/;

/**
 * @summary Hard deadline on the live read.
 *
 * The local preflight must not become network-DEPENDENT, and correct failure classification after an
 * unbounded call does not achieve that: an offline author with a hanging resolver blocks before the
 * graceful-degradation branch is ever reached. The bound is what makes `unknown` reachable in the
 * case that needs it most. Short on purpose — this is one cheap metadata read, not a fetch.
 * @type {Number}
 */
const GH_PROBE_TIMEOUT_MS = 5000;

/**
 * @summary Reads a cited issue's LIVE state and ENTITY KIND, or reports that it could not be read.
 *
 * Three readings and one honest non-reading: `open`, `closed` and `missing` (the 404 above) are
 * answers about the ticket; `unknown` is the absence of an answer. Callers must treat `unknown` as
 * NOT CHECKED — never as a pass, never as a failure. An offline author, an expired token, a rate
 * limit, a timeout and an outage all land there, and none of them is evidence about the ticket.
 *
 * **`isPullRequest` is carried rather than collapsed.** A pull request IS an issue to the REST API
 * and reports `state: open` exactly like a ticket; only the `pull_request` key separates them, and a
 * `--jq .state` projection throws that key away. Reducing two facts to one string here would hand
 * the caller a reading it cannot un-collapse — the precise failure this gate exists to remove.
 *
 * `gh` resolves `{owner}`/`{repo}` from the working directory's remote, which works from a linked
 * worktree as well as from the clone.
 * @param {Number|String} number Issue number, already extracted from the declaration.
 * @param {Object} [options]
 * @param {String} [options.cwd=process.cwd()]
 * @param {Function} [options.execFileSyncImpl=execFileSync]
 * @param {Number} [options.timeoutMs=GH_PROBE_TIMEOUT_MS]
 * @returns {{isPullRequest: Boolean, state: 'open'|'closed'|'missing'|'unknown'}}
 */
export function resolveIssueState(number, {
    cwd              = process.cwd(),
    execFileSyncImpl = execFileSync,
    timeoutMs        = GH_PROBE_TIMEOUT_MS
} = {}) {
    const unreadable = {isPullRequest: false, state: 'unknown'};

    try {
        const raw = String(execFileSyncImpl(
            'gh',
            ['api', `repos/{owner}/{repo}/issues/${number}`, '--jq', '{state, isPullRequest: has("pull_request")}'],
            {cwd, encoding: 'utf8', stdio: 'pipe', timeout: timeoutMs}
        )).trim();

        const parsed = JSON.parse(raw);

        // An unrecognised body is not a reading either: a changed API shape must not decide a gate.
        return parsed?.state === 'open' || parsed?.state === 'closed'
            ? {isPullRequest: parsed.isPullRequest === true, state: parsed.state}
            : unreadable
    } catch (error) {
        // A timeout kill and a 404 both surface here. Only the 404 says anything about the ticket.
        return GH_NOT_FOUND_PATTERN.test(String(error?.stderr ?? ''))
            ? {isPullRequest: false, state: 'missing'}
            : unreadable
    }
}

/**
 * @summary Every owner number a body DECLARES, across all owing units.
 *
 * The shape check upstream deliberately reports on ONE section — the first unowned one, so its
 * message names genuinely orphaned work. The state check must not inherit that selection: a body
 * whose first owing section is correctly owned and whose second names a closed ticket would
 * otherwise never have the second owner read.
 *
 * Inline code is blanked for the same reason it is upstream: a backticked `Residual-Owner: #200`
 * documents the spelling rather than declaring an owner.
 * @param {Object} options
 * @param {String} options.fenceless Body with fences and HTML comments removed.
 * @param {String[]} options.owingSections Post-Merge Validation sections that still owe work.
 * @returns {String[]} Declared owner numbers, in body order, duplicates included.
 * @private
 */
function collectDeclaredResidualOwners({fenceless, owingSections}) {
    const owners = [];

    owingSections.forEach(section => {
        const match = withoutInlineCode(section).match(RESIDUAL_OWNER_LINE_PATTERN);

        match && owners.push(match[1])
    });

    const inline = withoutInlineCode(fenceless).match(RESIDUAL_OWNER_INLINE_PATTERN);

    inline && owners.push(inline[1]);

    return owners
}

/**
 * @summary Mirrors the Agent PR Body Lint workflow's local body-shape checks.
 *
 * `resolveOwnerState` is INJECTED and absent by default, so the validator stays pure, synchronous
 * and offline — `npm run agent-preflight` is the author's own pre-flight and its value is that it
 * runs anywhere. Supplied, it turns the `Residual-Owner` check from a shape check into a state
 * check: a closed or missing owner fails, and an unreadable one produces a WARNING and no verdict.
 * @param {String} body
 * @param {Object} [options]
 * @param {Boolean} [options.draft=false]
 * @param {Function|null} [options.resolveOwnerState=null] `(number) => 'open'|'closed'|'missing'|'unknown'`.
 * @returns {{missingInvisible: String[], missingVisible: String[], valid: Boolean, warnings: String[]}}
 */
export function validatePrBody(body, {draft = false, resolveOwnerState = null} = {}) {
    const
        warnings               = [],
        missingVisible         = VISIBLE_PR_BODY_ANCHORS.filter(anchor => !body.includes(anchor)),
        missingInvisible       = INVISIBLE_PR_BODY_ANCHORS.filter(anchor => !body.includes(anchor)),
        forbiddenClose         = body.match(FORBIDDEN_CLOSE_PATTERN),
        hasResolves            = RESOLVES_PATTERN.test(body),
        hasNonClosingReference = NON_CLOSING_REFERENCE_PATTERN.test(body);

    if (forbiddenClose) {
        missingVisible.push(`\`${forbiddenClose[1]} #N\` is forbidden; use \`Resolves #N\``)
    }

    if (!hasResolves && !(draft && hasNonClosingReference)) {
        missingVisible.push(draft
            ? 'Draft PR bodies without `Resolves #N` require `Refs #N` or `Related: #N`'
            : '`Resolves #N` is required')
    }

    // Deferred work must name a home that SURVIVES the merge. Parking it on the close target is the
    // one destination guaranteed to be unreachable the moment it becomes actionable — measured across
    // four merged PRs whose close targets shut within a second of the merge, three of them keeping no
    // record at all. `Residual-Owner` names ownership that ALREADY exists; it is never a licence to
    // mint a ticket, which is why the message below prescribes finishing or dropping first.
    // The owner must live in the SAME unit that owes the work. A `Residual-Owner` anywhere in the
    // body — a prose mention, a quoted example, another section's deferral — would otherwise
    // discharge an obligation it has no relationship to.
    const
        fenceless         = withoutHtmlComments(withoutFencedBlocks(body)),
        // The OWING section, not the first one. A body owes work if any of its Post-Merge Validation
        // sections does, and the owner must appear in THAT section — so an earlier discharged duplicate
        // can no longer stand in for a later live one.
        pmvSections       = postMergeValidationSections(body),
        // EVERY owing section is checked, not the first. `find()` validated one and let a second owing
        // section ride on the first's owner — the same shadowing defect one level along, where the fix
        // for duplicate sections introduced its own blind spot. The first UNOWNED owing section is the
        // one reported, so the message names work that is genuinely orphaned.
        owingSections     = pmvSections.filter(section => firstLiveObligation(section)),
        pmvSection        = owingSections.find(section => !withoutInlineCode(section).match(RESIDUAL_OWNER_LINE_PATTERN))
            ?? owingSections[0] ?? pmvSections[0] ?? '',
        sectionObligation = firstLiveObligation(pmvSection),
        inlineResidual    = fenceless.match(INLINE_RESIDUAL_PATTERN),
        inlineLine        = inlineResidual
            ? fenceless.slice(0, inlineResidual.index).split('\n').length - 1
            : -1,
        // Inline code is blanked in the scope: a backticked `Residual-Owner: #200` documents the spelling
        // rather than declaring an owner, and reading it as a declaration let a section discharge its own
        // obligation by quoting the syntax that would have discharged it.
        ownerScope       = withoutInlineCode(sectionObligation
            ? pmvSection
            : (inlineLine >= 0 ? fenceless.split('\n')[inlineLine] : '')),
        obligation       = sectionObligation
            || (inlineResidual ? `Residual: ${inlineResidual[1].trim()}` : null);

    if (obligation) {
        const
            resolvesMatch = body.match(RESOLVES_PATTERN),
            // The shape is chosen by which obligation is being discharged: a section obligation needs a
            // declaration LINE, the Evidence Ladder's 1-line form needs its mid-line owner.
            ownerMatch    = sectionObligation
                ? ownerScope.match(RESIDUAL_OWNER_LINE_PATTERN)
                : ownerScope.match(RESIDUAL_OWNER_INLINE_PATTERN),
            closeTarget   = resolvesMatch ? resolvesMatch[0].match(/\d+/)[0] : null,
            owner         = ownerMatch ? ownerMatch[1] : null;

        if (!owner) {
            missingVisible.push(`This PR still owes work — "${obligation}" — with no \`Residual-Owner: #N\`. Finish it before merge, or name an EXISTING open ticket that owns it, or drop the obligation. Do not open a ticket to satisfy this.`)
        } else if (owner === closeTarget) {
            missingVisible.push(`\`Residual-Owner: #${owner}\` is this PR's own close target, so the owner disappears when the merge closes it. Name an EXISTING open ticket, or finish the work, or drop it.`)
        }

        // EVERY declared owner is state-checked, not the one section selected above for SHAPE
        // reporting. That selection is deliberately biased toward the first UNOWNED section so the
        // message names genuinely orphaned work — which means a body whose first owing section is
        // correctly owned and whose second names a closed ticket would never have reached the read.
        // The surrounding code already learned this once for the missing-owner case; the state check
        // reintroduced the single-representative shape one dimension along.
        if (resolveOwnerState) {
            const
                declared = collectDeclaredResidualOwners({fenceless, owingSections}),
                // Deduplicated so one repeated owner costs one network read, and sorted so the
                // failure order is the body's order rather than a Set's insertion accident.
                unique   = [...new Set(declared)].filter(number => number !== closeTarget);

            unique.forEach(number => {
                // The close-target rule above is already a SURVIVABILITY rule — a home that will not
                // outlive the merge is refused. A ticket that closed BEFORE the citation fails that
                // requirement more completely: the close target at least survives until merge. The
                // pattern `#(\d+)` cannot see the difference, and this is the read that separates them.
                const {isPullRequest, state} = resolveOwnerState(number) ?? {};

                if (state === 'closed') {
                    missingVisible.push(`\`Residual-Owner: #${number}\` is CLOSED. Deferred work must name a home that survives the merge. Finish it, drop the obligation, or name an OPEN ticket. Do not open a ticket to satisfy this.`)
                } else if (state === 'missing') {
                    missingVisible.push(`\`Residual-Owner: #${number}\` does not exist. Name an EXISTING open ticket that owns the work, finish it, or drop the obligation. Do not open a ticket to satisfy this.`)
                } else if (state === 'open' && isPullRequest) {
                    // A pull request IS an issue to the REST API and reports `state: open` exactly
                    // like a ticket. It is a WORSE owner than a closed one: it disappears by design,
                    // on merge, and takes the deferral with it. Collapsing the two to the string
                    // `open` is the same conflation this gate exists to remove.
                    missingVisible.push(`\`Residual-Owner: #${number}\` is a PULL REQUEST, not a ticket. It closes when it merges, so the deferral dies with it. Name an EXISTING open ISSUE that owns the work, finish it, or drop the obligation.`)
                } else if (state !== 'open') {
                    // Could-not-verify is not did-not-happen. An offline run, an expired token, a rate
                    // limit and an outage are all facts about the transport, and a gate that turns one
                    // into a verdict manufactures the diagnosis. Neither a pass nor a failure: the
                    // author is told which check did not run, so silence never reads as clearance.
                    warnings.push(`\`Residual-Owner: #${number}\` was NOT state-checked — GitHub could not be read. The owner's shape is valid; whether it is still an open ticket is unverified.`)
                }
            })
        }
    }

    return {
        missingInvisible,
        missingVisible,
        valid: missingVisible.length === 0 && missingInvisible.length === 0,
        warnings
    }
}

/**
 * @summary Parses NUL-delimited `git log` output into PR commit receipts.
 * @param {String} output
 * @returns {Array<{sha: String, subject: String}>}
 */
export function parsePrCommitLog(output = '') {
    const
        tokens  = String(output).split('\0'),
        commits = [];

    for (let index = 0; index + 1 < tokens.length; index += 2) {
        const sha = tokens[index];

        if (sha) {
            commits.push({sha, subject: tokens[index + 1] || ''})
        }
    }

    return commits
}

/**
 * @summary Reads the commits one PR branch carries relative to its intended base.
 * @param {Object} options
 * @param {String} options.base
 * @param {String} options.cwd
 * @param {Function} [options.execFileSyncImpl]
 * @returns {Array<{sha: String, subject: String}>}
 */
export function getPrBranchCommits({base, cwd, execFileSyncImpl = execFileSync}) {
    const output = execFileSyncImpl('git', [
        'log',
        '-z',
        '--format=%H%x00%s',
        '--reverse',
        `${base}..HEAD`
    ], {
        cwd,
        encoding: 'utf8',
        stdio   : 'pipe'
    });

    return parsePrCommitLog(output)
}

/**
 * @summary Mirrors hosted stacked-PR ticket declarations against local branch commits.
 * @param {String} body
 * @param {Array<{sha: String, subject: String}>} commits
 * @returns {{declaredTickets: String[], foreignCommits: Object[], valid: Boolean}}
 */
export function validateStackedPrTickets(body, commits = []) {
    const
        declaredTickets = new Set(
            [...body.matchAll(DECLARED_TICKET_PATTERN)].map(match => match[1])
        ),
        foreignCommits = [];

    if (declaredTickets.size > 0) {
        commits.forEach(({sha, subject}) => {
            const ticket = subject.match(COMMIT_TICKET_PATTERN);

            if (ticket && !declaredTickets.has(ticket[1])) {
                foreignCommits.push({
                    sha    : sha.slice(0, 10),
                    subject: subject.slice(0, 72),
                    ticket : ticket[1]
                })
            }
        })
    }

    return {
        declaredTickets: [...declaredTickets],
        foreignCommits,
        valid          : foreignCommits.length === 0
    }
}

const LEDGER_SIGNATURE_PATTERN = /([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/;

/**
 * @summary Extracts ledger-declared `symbol(params)` signatures from a Contract Ledger table in a PR body.
 *
 * Opt-in + high-precision: only markdown rows belonging to a table whose header carries BOTH a `Surface`
 * and a `Signature` column are considered, and within each row only the `Signature` *cell* is scanned for a
 * `name(args)` token (an incidental `name(args)` in a Surface/Notes column is ignored). A body with NO
 * Contract Ledger therefore yields `[]` and the drift check is inert — this is the author's *declared*
 * contract surface, the only thing the drift check verifies against the diff.
 *
 * @param {String} body The PR / ticket markdown body.
 * @returns {Array<{symbol: String, params: String}>} The ledger-declared signatures.
 */
export function extractLedgerSignatures(body = '') {
    const signatures    = [];
    let   inLedgerTable = false,
          signatureColumn = -1;

    for (const line of body.split('\n')) {
        if (!line.trim().startsWith('|')) { inLedgerTable = false; continue; }

        // A ledger table is identified by a header row carrying both `Surface` and `Signature`; the flag
        // then persists across the table's body rows until a non-table line resets it. We also record the
        // `Signature` column index so extraction scans ONLY that cell — an incidental `name(args)` in a
        // Surface/Notes column must never be mistaken for the declared signature.
        if (/\bsurface\b/i.test(line) && /\bsignature\b/i.test(line)) {
            inLedgerTable   = true;
            signatureColumn = line.split('|').findIndex(cell => /\bsignature\b/i.test(cell));
            continue;
        }
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // the |---|---| separator row

        if (!inLedgerTable || signatureColumn < 0) continue;

        const cell  = line.split('|')[signatureColumn],
              match = cell?.match(LEDGER_SIGNATURE_PATTERN);
        if (match) signatures.push({symbol: match[1], params: match[2]});
    }

    return signatures;
}

/**
 * @summary Finds a symbol's shipped parameter list from its DEFINITION in the ADDED (`+`) lines of a diff.
 *
 * Conservative + definition-only + SINGLE-LINE: matches `symbol(params)` only when the whole `name(params) {`
 * (or `name(params) =>`) sits on ONE added line. A bare CALL-site `symbol(args)` (followed by `;`, `,`, `)`,
 * `.`) is NOT matched, so a call appearing before the def can never be mistaken for the shipped signature.
 * A MULTI-LINE definition — params spanning several lines, as large destructured params often are — is a
 * silent MISS (returns `null`), never a false signal. This is the safe direction for a warn-only check: a
 * miss costs nothing, a false-warn costs a review cycle. Multi-line coverage via a brace-balanced
 * accumulator is a tracked follow-up; authors must not read a non-warn as proof of no drift.
 *
 * @param {String} diffText A unified diff (`git diff` output).
 * @param {String} symbol The symbol name to locate.
 * @returns {String|null} The shipped params string, or `null` if no definition is found on an added line.
 */
export function findShippedSignature(diffText = '', symbol = '') {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          // Require a definition shape — `)` followed by `{` (function/method body) or `=>` (arrow) — so a
          // bare call-site `symbol(args)` is never mistaken for the def (the call-before-def false-warn).
          definePattern = new RegExp(`^\\+(?!\\+).*\\b${escaped}\\s*\\(([^)]*)\\)\\s*(?:\\{|=>)`);

    for (const line of diffText.split('\n')) {
        const match = line.match(definePattern);
        if (match) return match[1];
    }

    return null;
}

/**
 * @summary Normalizes a parameter string to a comparable shape — positional arity vs destructured key-set —
 * so cosmetic differences (whitespace, destructured key ORDER, defaults) never read as drift.
 *
 * @param {String} params The raw parameter string (between the parens).
 * @returns {{shape: String, arity: Number, keys: String[]}}
 */
export function normalizeSignatureShape(params = '') {
    const trimmed = params.trim();
    if (trimmed === '') return {shape: 'positional', arity: 0, keys: []};

    if (trimmed.startsWith('{')) {
        const keys = trimmed.replace(/[{}]/g, '')
            .split(',')
            .map(key => key.split(/[:=]/)[0].trim())
            .filter(Boolean)
            .sort();
        return {shape: 'destructured', arity: keys.length, keys};
    }

    const arity = trimmed.split(',').map(part => part.trim()).filter(Boolean).length;
    return {shape: 'positional', arity, keys: []};
}

/**
 * @summary Detects Contract-Ledger-vs-shipped-diff signature drift — the author-side dual of the pr-review
 * Contract Completeness Audit. Catches the "ledger described the pre-evolution contract" class (a
 * destructured-vs-positional signature; an added field the ledger omits) BEFORE the PR opens, rather than
 * burning a scarce cross-family review cycle on a mechanical gap.
 *
 * **Opt-in** (no ledger → no check), **high-precision** (only ledger-declared symbols actually found in the
 * diff), and **warn-only** (the caller never gates on it): a miss is silent; only a clear shape / arity /
 * destructured-key mismatch warns. By construction it cannot false-positive on un-laddered code.
 *
 * @param {Object} options
 * @param {String} options.body The PR / ticket body carrying the Contract Ledger.
 * @param {String} [options.diffText] The staged unified diff to verify against. Falsy ⇒ no check.
 * @returns {String[]} Human-readable drift warnings (empty when no drift / no ledger / no diff).
 */
export function detectContractLedgerDrift({body = '', diffText = ''} = {}) {
    if (!diffText) return [];

    const warnings = [];

    for (const {symbol, params: ledgerParams} of extractLedgerSignatures(body)) {
        const shippedParams = findShippedSignature(diffText, symbol);
        if (shippedParams === null) continue;

        const ledgerShape  = normalizeSignatureShape(ledgerParams),
              shippedShape = normalizeSignatureShape(shippedParams),
              drifted      = ledgerShape.shape !== shippedShape.shape
                          || ledgerShape.arity !== shippedShape.arity
                          || ledgerShape.keys.join(',') !== shippedShape.keys.join(',');

        if (drifted) {
            warnings.push(
                `Contract Ledger drift: \`${symbol}\` — ledger declares (${ledgerParams.trim()}) but the diff ` +
                `ships (${shippedParams.trim()}). Update the ledger or the signature before opening the PR.`
            )
        }
    }

    return warnings;
}

function writeLine(stream, line = '') {
    stream.write(line + '\n')
}

function writeOutput(stream, output) {
    if (!output) {
        return
    }

    stream.write(output.endsWith('\n') ? output : output + '\n')
}

function runNodeGate({args, cwd, execFileSyncImpl, name}) {
    try {
        const output = execFileSyncImpl(process.execPath, args, {cwd, encoding: 'utf8', stdio: 'pipe'});
        return {name, ok: true, output: String(output || '')}
    } catch (error) {
        return {
            name,
            ok    : false,
            output: [error.stdout, error.stderr, error.message].filter(Boolean).join('\n'),
            status: error.status || 1
        }
    }
}

function runPrBodyGate({cwd, execFileSyncImpl, existsSyncImpl, prBody, prDraft, readFileSyncImpl}) {
    const filePath = path.resolve(cwd, prBody);

    if (!existsSyncImpl(filePath)) {
        return {
            missingInvisible: [],
            missingVisible  : [`PR body file not found: ${prBody}`],
            valid           : false,
            warnings        : []
        }
    }

    return validatePrBody(readFileSyncImpl(filePath, 'utf8'), {
        draft: prDraft,
        // Wired unconditionally rather than behind a flag: the read only happens when a body
        // actually declares a `Residual-Owner`, which is rare, and every failure of it degrades to
        // `unknown` rather than to a verdict. So the gate is never network-DEPENDENT — it is
        // network-INFORMED when it can be, and says so when it cannot.
        resolveOwnerState: owner => resolveIssueState(owner, {cwd, execFileSyncImpl})
    })
}

/**
 * @summary Runs the bundled agent preflight gates and returns a process-style status code.
 * @param {Object} deps
 * @returns {Number}
 */
export function runAgentPreflight({
    argv             = process.argv.slice(2),
    collectStaleOverlayFindingsImpl = collectStaleOverlayFindings,
    cwd              = process.cwd(),
    execFileSyncImpl = execFileSync,
    existsSyncImpl   = existsSync,
    readFileSyncImpl = readFileSync,
    scriptDir        = GATE_DIR,
    stderr           = process.stderr,
    stdout           = process.stdout
} = {}) {
    let options;

    try {
        options = parseArgs(argv)
    } catch (error) {
        if (error.code === 'commander.helpDisplayed') {
            writeUsage(stdout);
            return 0
        }

        writeLine(stderr, `agent-preflight: ${error.message}`);
        writeUsage(stderr);
        return 2
    }

    const failures = [];

    let files = options.files;
    if (files.length === 0) {
        try {
            files = getStagedFiles({cwd, execFileSyncImpl})
        } catch (error) {
            writeLine(stderr, `agent-preflight: could not read staged files: ${error.message}`);
            return 1
        }
    }

    const mjsFiles = filterMjsFiles(files);

    if (mjsFiles.length === 0) {
        writeLine(stdout, 'agent-preflight: 0 .mjs files in scope; skipped source gates.');
    } else {
        if (options.fix) {
            writeLine(stdout, 'agent-preflight: repair mode enabled; running check-block-alignment --fix before staged checks. Use --no-fix for check-only validation.');
        } else {
            writeLine(stdout, 'agent-preflight: check-only mode; skipped check-block-alignment --fix.');
        }

        const gateRuns = [
            runNodeGate({
                args: [path.join(scriptDir, 'check-ticket-archaeology.mjs'), ...mjsFiles],
                cwd,
                execFileSyncImpl,
                name: 'check-ticket-archaeology'
            })
        ];

        if (options.fix) {
            gateRuns.push(runNodeGate({
                args: [path.join(scriptDir, 'check-block-alignment.mjs'), '--fix', ...mjsFiles],
                cwd,
                execFileSyncImpl,
                name: 'check-block-alignment --fix'
            }))
        }

        gateRuns.push(runNodeGate({
            args: [path.join(scriptDir, 'check-block-alignment.mjs'), '--staged', ...mjsFiles],
            cwd,
            execFileSyncImpl,
            name: 'check-block-alignment --staged'
        }));

        for (const result of gateRuns) {
            writeOutput(result.ok ? stdout : stderr, result.output);
            if (!result.ok) {
                failures.push(result.name)
            }
        }
    }

    const changeClassResult = validateChangeClass(options);

    if (changeClassResult.skipped) {
        writeLine(stdout, 'agent-preflight: no semantic inputs provided; skipped change-class validation.');
    } else if (changeClassResult.valid) {
        const surfaceCount = [options.commitSubject, options.prTitle].filter(Boolean).length;

        writeLine(
            stdout,
            `agent-preflight: declared ${options.changeClass} maps to ${changeClassResult.expectedTypes.join(', ')}; ` +
            `${surfaceCount} intended subject${surfaceCount === 1 ? '' : 's'} matched.`
        )
    } else {
        failures.push('change-class');
        writeLine(stderr, 'agent-preflight: change-class validation failed.');
        changeClassResult.errors.forEach(error => writeLine(stderr, `  - ${error}`))
    }

    // Advisory-only local overlay drift check. Gitignored config.mjs overlays can go stale even when the
    // staged source gates are green; surfacing the exact STALE_OVERLAY rows here prevents false-green PR
    // churn without mutating operator-local files or failing unrelated preflight runs.
    try {
        const staleOverlayFindings = collectStaleOverlayFindingsImpl();

        if (staleOverlayFindings.length > 0) {
            writeLine(stdout, 'agent-preflight: STALE_OVERLAY warning(s) (non-blocking):');
            staleOverlayFindings.forEach(finding => {
                writeLine(stdout, `  - ${finding.label}`);
                finding.items.forEach(item => writeLine(stdout, `    + ${item}`))
            })
        }
    } catch (error) {
        writeLine(stdout, `agent-preflight: STALE_OVERLAY check skipped (${error.message}).`)
    }

    if (options.prBody) {
        const result = runPrBodyGate({
            cwd,
            execFileSyncImpl,
            existsSyncImpl,
            prBody : options.prBody,
            prDraft: options.prDraft,
            readFileSyncImpl
        });

        // Printed on BOTH paths and before the verdict: a check that did not run is news whether or
        // not the rest passed, and burying it under a green line is how "not checked" becomes
        // indistinguishable from "checked and fine".
        result.warnings?.forEach(warning => writeLine(stderr, `agent-preflight: WARNING — ${warning}`));

        if (result.valid) {
            writeLine(stdout, 'agent-preflight: PR body contains the required template anchors.');

            try {
                const
                    body    = readFileSyncImpl(path.resolve(cwd, options.prBody), 'utf8'),
                    commits = getPrBranchCommits({
                        base: options.prBase,
                        cwd,
                        execFileSyncImpl
                    }),
                    stackResult = validateStackedPrTickets(body, commits);

                if (stackResult.valid) {
                    writeLine(
                        stdout,
                        `agent-preflight: stacked PR tickets match ${stackResult.declaredTickets.length} ` +
                        `declared ticket(s) across ${commits.length} commit(s).`
                    )
                } else {
                    failures.push('pr-body-stack');
                    writeLine(
                        stderr,
                        `agent-preflight: stacked PR ticket declaration lint failed against ${options.prBase}.`
                    );
                    stackResult.foreignCommits.forEach(commit => writeLine(
                        stderr,
                        `  - \`${commit.sha}\` claims #${commit.ticket} — \`${commit.subject}\``
                    ))
                }
            } catch (error) {
                failures.push('pr-body-stack');
                writeLine(
                    stderr,
                    `agent-preflight: could not inspect PR commits relative to ${options.prBase}: ${error.message}`
                )
            }
        } else {
            failures.push('pr-body');
            writeLine(stderr, 'agent-preflight: PR body template lint failed.');
            if (result.missingVisible.length > 0) {
                writeLine(stderr, 'Visible/body-closing misses:');
                result.missingVisible.forEach(anchor => writeLine(stderr, `  - ${anchor}`));
            }
            if (result.missingInvisible.length > 0) {
                writeLine(stderr, 'Structural template anchors are missing; reread .agents/skills/pull-request/SKILL.md before editing the body.');
            }
        }

        // Author-side Contract-Ledger-vs-diff drift: opt-in (only fires when the body carries a Contract
        // Ledger), WARN-only (never added to `failures`), and best-effort (a check error never fails the
        // preflight). Verifies a declared signature against the staged diff before the PR opens.
        try {
            const bodyPath = path.resolve(cwd, options.prBody);

            if (existsSyncImpl(bodyPath)) {
                let diffText = '';
                try {
                    diffText = String(execFileSyncImpl('git', ['diff', '--cached'], {cwd, encoding: 'utf8', stdio: 'pipe'}) || '')
                } catch {
                    diffText = '' // no staged diff (or not a git tree) → the drift check is inert
                }

                const driftWarnings = detectContractLedgerDrift({
                    body: readFileSyncImpl(bodyPath, 'utf8'),
                    diffText
                });

                if (driftWarnings.length > 0) {
                    writeLine(stdout, 'agent-preflight: Contract Ledger drift warning(s) (non-blocking):');
                    driftWarnings.forEach(warning => writeLine(stdout, `  ⚠ ${warning}`))
                }
            }
        } catch (error) {
            writeLine(stdout, `agent-preflight: contract-drift check skipped (${error.message}).`)
        }
    } else {
        writeLine(stdout, 'agent-preflight: no --pr-body provided; skipped PR-body lint.');
    }

    if (failures.length > 0) {
        writeLine(stderr, `agent-preflight: ${failures.length} gate(s) failed: ${failures.join(', ')}`);
        return 1
    }

    writeLine(stdout, 'agent-preflight: all requested gates passed.');
    return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exitCode = runAgentPreflight()
}
