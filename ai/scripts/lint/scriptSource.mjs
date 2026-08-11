/**
 * @module ai/scripts/lint/scriptSource
 * @summary Static facts read out of a script's source text: which comments it carries, which modules
 * it imports, and which execution plane its dependencies prove it needs.
 *
 * ## Why this module exists
 *
 * A script's execution plane decides whether it is usable at all. Per Local Runtime Parity a client
 * topology has **no host shell and no Docker socket**, so a script that shells out is dead weight
 * there — and `ai/scripts` encodes the VERB (`maintenance`, `diagnostics`) and never the plane.
 *
 * The fix is a comparator rather than a convention: every script DECLARES its plane in a `@plane`
 * tag, and this module derives, independently, what the script's real dependencies prove. A
 * contradiction between the two fails `lint-script-plane`.
 *
 * **The two artifacts cannot collapse into one, by construction:** the declaration is read from the
 * COMMENTS and the evidence is read from the CODE, and {@link stripComments} guarantees those two
 * texts are disjoint. Writing a more confident comment can never change the evidence.
 *
 * ## Conviction is deliberately asymmetric
 *
 * Only one direction is checkable, and building the symmetric version would convict correct files:
 *
 * | declared | evidence | verdict | why |
 * |---|---|---|---|
 * | `in-plane` | host | **contradiction** | it claims to run where it demonstrably cannot |
 * | `host` | plane imports | pass | an operator-run script may talk to services over the network |
 * | either | none | pass | detection is silent; the declaration is the only source |
 *
 * **Host evidence proves a requirement. Plane evidence never proves sufficiency.** Measured on the
 * 144-file corpus: 15 scripts both shell out to `docker` AND import a plane module — `backup.mjs`
 * and `uploadKnowledgeBase.mjs` import a config module only to learn WHICH container to act on.
 * Importing config is not running in the plane, so host evidence dominates and there is no third
 * `either` value to argue about.
 *
 * ## Silence is a legitimate answer
 *
 * 68 of 144 scripts carry no detectable evidence of either plane. That is not a gap to be closed by
 * a cleverer detector — a pure helper genuinely needs nothing. Those files are exactly why the tag
 * exists: `diagnostics/seatCostReport.mjs` reads `~/.kimi-code/sessions` through `os.homedir()` and
 * is unambiguously host-edge, and no import-based detector can see it. The declaration states what
 * detection cannot, and the lint re-checks it on every future commit — so the moment such a file
 * grows an `execSync`, the stale declaration reds.
 *
 * @see ai/scripts/lint/lint-script-plane.mjs — the enforcing lint
 * @see ai/scripts/diagnostics/structureMap.mjs — consumes this to emit a generated plane map
 * @plane in-plane
 */

import path from 'node:path';

/**
 * The only two legal `@plane` values.
 *
 * Deliberately two, never three. An `either` value becomes the default nobody argues with and the
 * comparator loses its teeth — a genuinely ambiguous script is a finding to resolve, not a category
 * to file it under.
 * @type {string[]}
 */
export const PLANE_VALUES = ['host', 'in-plane'];

/**
 * Removes comment text from one line, tracking multi-line block state across calls.
 *
 * Lifted verbatim from `structureMap.mjs`, which needed exactly this to count code LOC. Relocated
 * here rather than duplicated so the repo carries ONE comment model: the plane classifier and the
 * LOC counter now disagree about what a comment is only if both change together.
 *
 * Intentionally lexical, not language-semantic; good enough for cohesion budgets and dependency
 * evidence without pretending to be a parser for every file type under `ai/`.
 * @param {string} line
 * @param {{jsBlock: boolean, htmlBlock: boolean}} state
 * @param {string} ext
 * @returns {string}
 */
function stripCommentText(line, state, ext) {
    let index  = 0,
        output = '';

    while (index < line.length) {
        if (state.jsBlock) {
            const end = line.indexOf('*/', index);

            if (end === -1) {
                return output;
            }

            state.jsBlock = false;
            index         = end + 2;
            continue;
        }

        if (state.htmlBlock) {
            const end = line.indexOf('-->', index);

            if (end === -1) {
                return output;
            }

            state.htmlBlock = false;
            index           = end + 3;
            continue;
        }

        const jsStart        = line.indexOf('/*', index),
              htmlStart      = line.indexOf('<!--', index),
              slash          = line.indexOf('//', index),
              hashIndex      = ['.yaml', '.yml', '.sh'].includes(ext) ? line.indexOf('#', index) : -1,
              hash           = hashIndex !== -1 && line.slice(hashIndex, hashIndex + 2) !== '#!' ? hashIndex : -1,
              commentIndexes = [jsStart, htmlStart, slash, hash]
                  .filter(value => value !== -1)
                  .sort((a, b) => a - b),
              nextComment    = commentIndexes[0];

        if (nextComment == null) {
            output += line.slice(index);
            break;
        }

        output += line.slice(index, nextComment);

        if (nextComment === jsStart) {
            state.jsBlock = true;
            index         = nextComment + 2;
            continue;
        }

        if (nextComment === htmlStart) {
            state.htmlBlock = true;
            index           = nextComment + 4;
            continue;
        }

        break;
    }

    return output;
}

/**
 * Returns the source with every comment removed, so prose can never be read as evidence.
 *
 * This is load-bearing rather than tidy. `maintenance/restore.mjs` mentions `compose` twice — both
 * times in a JSDoc paragraph explaining bind-mount paths — and a detector that skipped this step
 * would convict a file for what its documentation says.
 *
 * The stripper is line-oriented and not string-literal aware, so it also truncates a line at a `//`
 * that falls inside a string. That over-removal is conservative in the right direction: it can only
 * hide evidence, never manufacture it, and a false negative leaves the declaration standing while a
 * false positive would fail a correct file. Measured against a string-literal-aware stripper across
 * all 144 scripts: **zero classification disagreements**, so the simpler shared model is kept.
 * @param {string} content
 * @param {string} [filePath]
 * @returns {string}
 */
export function stripComments(content, filePath='') {
    const state = {jsBlock: false, htmlBlock: false},
          ext   = path.extname(filePath).toLowerCase();

    return content.split(/\r?\n/).map(line => stripCommentText(line, state, ext)).join('\n');
}

const IMPORT_SPECIFIER = /(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Collects every module specifier the code imports, static and dynamic.
 * @param {string} code Comment-stripped source.
 * @returns {string[]}
 */
export function importSpecifiers(code) {
    const specifiers = [];
    let   match;

    IMPORT_SPECIFIER.lastIndex = 0;

    while ((match = IMPORT_SPECIFIER.exec(code))) {
        specifiers.push(match[1] ?? match[2] ?? match[3]);
    }

    return specifiers;
}

const CHILD_PROCESS = /^(node:)?child_process$/,
      DOCKER_TOKEN  = /['"`](docker|docker-compose|compose)['"`]|docker-compose[\w.-]*\.ya?ml/,
      HOME_DIR      = /\bos\.homedir\(\)|process\.env\.HOME\b/,
      PROCESS_KILL  = /\bprocess\.kill\s*\(/,
      PLANE_ROOTS   = ['ai/services/', 'ai/mcp/server/'],
      PLANE_LEAF    = /[/\\](AiConfig|StorageRouter)\.mjs$/;

/**
 * Derives what a script's real dependencies prove about the plane it needs.
 *
 * Returns `'host'`, `'in-plane'`, or `null` when the source proves nothing either way — `null` is a
 * normal outcome for 68 of the 144 scripts and never an error.
 * @param {Object} params
 * @param {string} params.file Repo-relative path, used to resolve relative import specifiers.
 * @param {string} params.code Comment-stripped source.
 * @param {string} [params.cwd]
 * @returns {{plane: (string|null), evidence: string[]}}
 */
export function classifyPlane({file, code, cwd=process.cwd()}) {
    const specifiers = importSpecifiers(code),
          hostHits   = [];

    specifiers.forEach(specifier => {
        if (CHILD_PROCESS.test(specifier)) {
            hostHits.push(`imports '${specifier}'`);
        }
    });

    const dockerMatch = code.match(DOCKER_TOKEN);

    if (dockerMatch) {
        hostHits.push(`references ${dockerMatch[0]}`);
    }

    if (HOME_DIR.test(code)) {
        hostHits.push('reads the operator home directory');
    }

    if (PROCESS_KILL.test(code)) {
        hostHits.push('signals host processes via process.kill');
    }

    // Host evidence dominates: needing a shell is a proof of requirement, and a plane import
    // alongside it is usually just a config read. See the module header's asymmetry table.
    if (hostHits.length > 0) {
        return {plane: 'host', evidence: hostHits};
    }

    const planeHits = [];

    specifiers.forEach(specifier => {
        if (!specifier.startsWith('.')) {
            return;
        }

        const resolved = path.relative(cwd, path.resolve(path.dirname(file), specifier)).split(path.sep).join('/');

        // Resolved, never substring-matched: `./mcpHealthcheck.mjs` is a sibling SCRIPT, and a
        // naive `mcp` test read it as a plane service.
        if (PLANE_ROOTS.some(root => resolved.startsWith(root)) || PLANE_LEAF.test(resolved)) {
            planeHits.push(`imports '${specifier}' → ${resolved}`);
        }
    });

    return planeHits.length > 0 ? {plane: 'in-plane', evidence: planeHits} : {plane: null, evidence: []};
}

/**
 * Returns the file's own header comment — the FIRST block comment, before any line of code.
 *
 * The `@plane` declaration describes the whole file, so it belongs in the file's own header block.
 * Bounding the search this tightly is what makes two different mistakes detectable:
 *
 * - **Scanning the whole file** makes any script that DOCUMENTS planes declare them.
 *   `lint-script-plane.mjs` prints both legal values in its help text and flagged itself as
 *   self-contradictory until the search was bounded.
 * - **Scanning every leading comment** accepts a tag parked on the first FUNCTION's JSDoc, because
 *   the run of comments before the first code line includes it. A declaration sitting on `median()`
 *   is wrong even though a looser reader would happily find it — and the looser reader cannot
 *   report what it is willing to accept.
 * @param {string} content
 * @param {string} [filePath]
 * @returns {string}
 */
export function headerRegion(content, filePath='') {
    const state  = {jsBlock: false, htmlBlock: false},
          ext    = path.extname(filePath).toLowerCase(),
          lines  = content.split(/\r?\n/),
          header = [];

    let entered = false;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        // A shebang is not code for this purpose; it precedes the JSDoc block in most CLI scripts.
        if (index === 0 && line.startsWith('#!')) {
            header.push(line);
            continue;
        }

        if (stripCommentText(line, state, ext).trim()) {
            break;
        }

        header.push(line);

        if (state.jsBlock) {
            entered = true;
        } else if (entered) {
            // The first block comment just closed on this line — the header ends with it.
            break;
        }
    }

    return header.join('\n');
}

const PLANE_TAG = /@plane\s+(\S+)/g;

/**
 * Reads the `@plane` declaration out of a script's header comment.
 *
 * Reads RAW text on purpose — the tag lives in a comment, which is exactly what
 * {@link stripComments} discards before evidence is derived. That disjointness is what makes the
 * declaration and the evidence two independent artifacts rather than one claim restated twice.
 * @param {string} content Raw source, comments included.
 * @param {string} [filePath]
 * @returns {{plane: (string|null), invalid: string[], conflicting: boolean}}
 */
export function readDeclaredPlane(content, filePath='') {
    const values = [];
    let   match;

    PLANE_TAG.lastIndex = 0;

    while ((match = PLANE_TAG.exec(headerRegion(content, filePath)))) {
        values.push(match[1]);
    }

    const invalid  = values.filter(value => !PLANE_VALUES.includes(value)),
          declared = [...new Set(values.filter(value => PLANE_VALUES.includes(value)))];

    return {
        plane      : declared.length === 1 ? declared[0] : null,
        invalid,
        conflicting: declared.length > 1
    };
}
