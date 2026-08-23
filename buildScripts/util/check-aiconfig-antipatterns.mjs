import {execSync, spawnSync}      from 'node:child_process';
import {readFileSync}             from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';
import {codeMask, toRepoRelative} from './check-aiconfig-test-mutation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// Inline relief valve for a genuinely unavoidable defensive read (judgment-call escape, not a
// blanket bypass). A line carrying this marker is skipped.
export const ESCAPE_MARKER = 'aiconfig-antipattern-ok';

/*
 * Rule B3 — defensive optional-chaining on an AiConfig read. The SSOT is a reactive
 * `Neo.state.Provider` tree whose construction guarantees every declared leaf exists — a `?.`
 * anywhere in an access path rooted at a config singleton silently converts a broken tree into an
 * `undefined` that travels, instead of failing loud at the misread. The pattern anchors on the
 * config roots with word boundaries, so `myAiConfigStub?.x` (a test double) never trips it, while
 * the `?.` may appear at any depth: `aiConfig?.load`, `aiConfig.auth?.mode` and
 * `Memory_Config?.data?.host` all match.
 */
export const B3_DEFENSIVE_CHAIN = new RegExp(
    `\\b(?:aiConfig|AiConfig|Memory_Config)\\b` + // a config root token in code
    `[\\w.$[\\]'"\`-]*` +                         // any access-path characters
    `\\?\\.`                                      // the defensive hop
);

/*
 * Rule A5 — a `hasEnvValue(name)` helper re-implements the env-resolution that
 * `leaf(default, env, type)` already owns inside the ConfigProvider. Zero occurrences exist on
 * `dev` (V-B-A'd census); this pattern is a pure reintroduction ratchet.
 */
export const A5_ENV_HELPER = /\bhasEnvValue\s*\(/;

/*
 * Rule A1's FILE gate — module-level env re-derivation is an antipattern ONLY where the config
 * SSOT is already in scope. A file importing the config singleton (import-statement token or the
 * runtime `Neo.ai.Config` root) that re-derives values from `process.env` should read the resolved
 * leaf instead. The gate is what keeps the C1-sanctioned shape green: a genuine non-entrypoint
 * pure-defaults module carries env literals WITHOUT any config import — by design — and must
 * never flag.
 */
export const A1_IMPORT_GATE = /^\s*import\s+[^;]*\b(?:AiConfig|Memory_Config)\b[^;]*\bfrom\b|\bNeo\.ai\.Config\b/m;

/*
 * Rule A1's LINE rule — a module-level `const|let|var` declaration whose initializer reads
 * `process.env.` on the declaration line. Column-0 anchoring is the module-level signal in this
 * codebase's indent style: function-local reads are indented and never match. A multi-line
 * initializer whose env read sits on a continuation line is outside this static heuristic —
 * the escape marker covers judgment-call residue.
 */
export const A1_ENV_REDERIVATION = /^(?:const|let|var)\s[^;]*=\s*[^;]*\bprocess\.env\./;

/*
 * Rule PLANE-ROOT — a plane path re-derived from the module's OWN location. `path.resolve(__dirname, …)`
 * landing inside `.neo-ai-data` gives every checkout a private data root: the copies agree, so
 * nothing goes red, and the fork is invisible until two of them disagree. Nine worktrees already
 * accumulated their own `.neo-ai-data/concepts` from exactly this shape.
 *
 * **The regex anchors on `path.resolve(__dirname` and NOT on the target text, and that is the whole
 * design.** `codeMask` masks string and template contents, so a pattern anchored on `.neo-ai-data`
 * would have its match index land inside a quoted literal and be suppressed as "not code" — the
 * rule would be structurally unable to fire on the very sites it exists to catch. Anchoring on the
 * call token puts the match index on executable code and lets the target test scan the rest of the
 * line, which is also what makes TEMPLATE-LITERAL targets reachable:
 * `path.resolve(__dirname, \`../../.neo-ai-data/wake-daemon/inflight-${mode}.txt\`)` is the one shape
 * a string-literal predicate misses, and it is a live site (`ai/scripts/lifecycle/inflightLock.mjs`).
 *
 * **Why a descriptive id and not the next A-number.** ADR-0019 §3 Group A already spends A1-A9, // ticket-ref-ok: the ADR IS the naming authority this choice defers to
 * so `A6` — the first free-looking slot — is `leaf+formula duplication` and would have given the
 * shared catalog vocabulary two meanings. This class is genuinely absent from that catalog (it
 * re-derives a ROOT, reading no config at all, which is why A1's two-signal rule structurally
 * cannot see it), so naming it would be a catalog amendment — a gate this rule does not own.
 * A descriptive id collides with nothing and survives whatever number the catalog later assigns.
 *
 * Ceiling, stated rather than discovered later: the target must appear on the SAME line as the
 * call. A root assembled through an intermediate variable is out of reach for a line rule, and
 * closing that needs AST work, not a longer regex.
 */
export const PLANE_ROOT_REDERIVATION = /\bpath\.(?:join|resolve)\s*\(\s*__dirname\b.*?\.neo-ai-data/;

/*
 * Rule-scoped grandfathering: each rule carries its OWN set of repo-relative POSIX paths, so one
 * rule's existing-surface exemption can never widen another's — A5 keeps its zero-baseline ratchet
 * even inside files grandfathered for B3. A whole-file skip would silently exempt every rule at
 * once; filtering happens per HIT instead ({@link filterAllowlistedHits}). Sets shrink as the
 * cleanup subs land. B3 census: 2026-07-16 against `dev`; A1 census: same day via THIS checker's
 * own gate (a line-grep census missed the dev fleet server's multi-line import — the masked
 * multi-line gate is the census authority); A5 is empty by construction (zero live occurrences —
 * any entry appearing here is a regression, not a grandfather).
 */
export const ALLOWLIST = Object.freeze({
    A1: new Set([
        'ai/daemons/wake/daemon.mjs',
        'ai/services/fleet/devFleetServer.mjs'
    ]),
    A5: new Set(),
    // PLANE-ROOT census 2026-08-23: eight live sites, every one a known private-plane-root fork.
    // This set is a MIGRATION LEDGER, not a grandfather list — each entry is a site scheduled for
    // repair, and the set empties as they land. An entry here with no scheduled repair is a regression. `resources/content/**` targets are deliberately absent: they fork a corpus, not
    // the plane, so the predicate correctly never sees them.
    // PLANE-ROOT census 2026-08-23: eight live sites, every one a known private-plane-root fork.
    // This set is a MIGRATION LEDGER, not a grandfather list — each entry is a site scheduled for
    // repair, and the set empties as they land. An entry here with no scheduled repair is a regression.
    // `resources/content/**` targets are deliberately absent: they fork a corpus, not the plane, so
    // the predicate correctly never sees them.
    //
    // Entries are `path::<exact source text>`, NOT bare paths. A bare path would exempt the whole
    // file, so a NINTH site appearing inside one of these eight — the files most likely to grow one,
    // since they already do plane-root math — would be dropped in silence and the ledger would still
    // read as eight scheduled repairs. Site identity makes the exemption name what is exempt, so
    // anything new stays red.
    'PLANE-ROOT': new Set([
        "ai/examples/inspectGraph.mjs::const dbPath = path.resolve(__dirname, '../../.neo-ai-data/neo-sqlite/knowledge-graph.sqlite');",
        "ai/scripts/lifecycle/harnessLifecycle.mjs::const STATE_DIR = path.resolve(__dirname, '../../../.neo-ai-data/harness-state');",
        "ai/scripts/lifecycle/inflightLock.mjs::return path.resolve(__dirname, `../../../.neo-ai-data/wake-daemon/inflight-${mode}-${cleanIdentity}.txt`);",
        "ai/scripts/lifecycle/resumeHarness.mjs::const cooldownDir  = path.resolve(__dirname, '../../../.neo-ai-data/wake-daemon');",
        "ai/scripts/lifecycle/wakeSafetyGate.mjs::return process.env.WAKE_GATE_FILE_PATH || path.resolve(__dirname, '../../../.neo-ai-data/wake-daemon/wake-safety-gate.json');",
        "ai/services/ConceptService.mjs::return path.resolve(__dirname, '../../.neo-ai-data/concepts');",
        "ai/services/fleet/FleetManager.mjs::return this.managedRoot || process.env.NEO_FLEET_MANAGED_ROOT || path.resolve(__dirname, '../../../.neo-ai-data/fleet/repos');",
        "ai/services/ingestion/ConceptDiscoveryService.mjs::conceptsDir = ConceptService.defaultConceptsDir || path.resolve(__dirname, '../../../.neo-ai-data/concepts'),"
    ]),
    B3: new Set([
        'ai/mcp/server/BaseServer.mjs',
        'ai/mcp/server/shared/logger.mjs'
    ])
});

const RULES = [
    {id: 'B3', pattern: new RegExp(B3_DEFENSIVE_CHAIN.source, 'g')},
    {id: 'A5', pattern: new RegExp(A5_ENV_HELPER.source, 'g')},
    {id: 'PLANE-ROOT', pattern: new RegExp(PLANE_ROOT_REDERIVATION.source, 'g')}
];

/**
 * @summary Scans file content for the A1 / A5 / B3 / PLANE-ROOT antipatterns whose root token sits in code.
 *
 * Reuses the sibling guard's `codeMask` so an occurrence inside a string literal (a log message, a
 * spec title quoting the pattern) or a comment never flags — only executable defensive reads do.
 * A1 is two-signal: its line rule participates only when the FILE passes the import gate
 * ({@link A1_IMPORT_GATE}), so the C1-sanctioned pure-defaults shape (env literals, no config
 * import) stays green by construction.
 * @param {String} content
 * @returns {Object[]} `[{line, rule, text}]` — one entry per offending line/rule (1-based line numbers).
 */
export function findAntipatterns(content) {
    const lines         = content.split('\n'),
          state         = {source: content},
          hits          = [],
          a1Candidates  = [],
          codeOnlyLines = [],
          a1Global      = new RegExp(A1_ENV_REDERIVATION.source, 'g');

    lines.forEach((line, index) => {
        // Mask + projection compute UNCONDITIONALLY — before the escape check. The mask no longer
        // depends on it (`codeMask` parses the whole file, so a skipped line cannot corrupt comment
        // continuity — that hazard is why this comment used to warn about skipping), but the gate
        // PROJECTION still does: an escape marker on the IMPORT line would otherwise silently exempt
        // the whole file's A1 hits (the escape valve is line-scoped for HITS, never for composition).
        const mask = codeMask(line, state, index),
              // The gate must see CODE only — a JSDoc/comment mention of the config root (a config
              // template documenting its realm, a migration note) must never open A1 for the file.
              // Masked-out characters become spaces, preserving positions, so multi-line import
              // statements still span lines intact.
              //
              // Indexed by CODE UNIT, not code point. `Array.from(line, (ch, i) => mask[i])` walks
              // code POINTS — an astral char (emoji, rare CJK) is one element there but TWO units in
              // `line.length`, which is what acorn's offsets and this mask both count. One astral
              // char anywhere on the line shifted every later lookup by one and silently desynced the
              // projection from the mask — flagging code as string, or worse, string as code.
              codeOnly = (() => {
                  let projected = '';

                  for (let i = 0; i < line.length; i++) {
                      projected += mask[i] ? line[i] : ' '
                  }

                  return projected
              })();

        codeOnlyLines.push(codeOnly);

        if (line.includes(ESCAPE_MARKER)) {
            return
        }

        for (const {id, pattern} of RULES) {
            for (const match of line.matchAll(pattern)) {
                // The match starts at the config root / helper name; flag it only when that token is
                // real code, not a string that merely quotes an antipattern-looking sequence.
                if (mask[match.index]) {
                    hits.push({line: index + 1, rule: id, text: line.trim()});
                    break
                }
            }
        }

        // A1 classifies against the code-only PROJECTION, not the raw line: the declaration
        // keyword sits at index 0 whether or not `process.env.` is real code, so a raw-line
        // match + a mask check at the match start would false-positive on a genuine declaration
        // whose env token lives inside a string or comment. On the projection, masked env tokens
        // are spaces — the regex simply cannot match them.
        for (const match of codeOnly.matchAll(a1Global)) {
            a1Candidates.push({line: index + 1, rule: 'A1', text: line.trim()});
            break
        }
    });

    // A1 is two-signal: candidates emit only when the file's CODE opens the import gate.
    if (a1Candidates.length && A1_IMPORT_GATE.test(codeOnlyLines.join('\n'))) {
        hits.push(...a1Candidates)
    }

    return hits
}

/**
 * @summary Drops hits whose rule grandfathers the given file — the rule/allowlist composition seam.
 *
 * Filtering happens per HIT, never per FILE: a file grandfathered for one rule still fails the
 * build on any other rule's occurrence (the exact composition a whole-file skip silently breaks).
 * @param {Object[]} hits `findAntipatterns` results for one file.
 * @param {String} file Repo-relative POSIX path.
 * @param {Object} [allowlist=ALLOWLIST] Rule-id → Set of grandfathered paths.
 * @returns {Object[]}
 */
export function filterAllowlistedHits(hits, file, allowlist = ALLOWLIST) {
    return hits.filter(({rule, text}) => {
        const entries = allowlist[rule];

        if (!entries) return true;

        // Two entry shapes, and the difference is muting a FILE versus muting a SITE. A bare path
        // exempts every hit of that rule anywhere in the file — tolerable for a rule with two
        // grandfathered entries, wrong for a migration ledger: a NINTH hit appearing inside one of
        // the listed files would be dropped in silence, and those files are the ones already doing
        // this kind of math, so they are the likeliest place for a ninth to appear.
        //
        // `path::<exact source text>` exempts one site and nothing else. Text rather than a line
        // number deliberately: a line number decays on every edit above it, while the text changes
        // exactly when the site changes — which is when a migration ledger SHOULD demand a re-look.
        return !entries.has(file) && !entries.has(`${file}::${text}`)
    })
}

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
    } catch (e) {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1);
    }

    // Minimal argv parse, hand-rolled because it is five lines and a CLI dependency would cost more
    // than it saves — NOT because this workflow avoids `npm install`. It no longer does: the shared
    // `codeMask` is parser-grade, so the workflow installs, like `jsdoc-type-lint`,
    // `ticket-archaeology-lint`, `tree-json-lint` and `config-template-ssot-lint` already did.
    // (The claim previously stated here — that the other lint workflows are dependency-free — was
    // false when written; those four run `npm ci` today.)
    // lint-staged passes staged paths as positional args; `--quiet` suppresses the per-violation listing.
    const rawArgv = process.argv.slice(2);

    // Spec-only composition seam: `--extra-b3-allowlist <path>` grandfathers ONE extra path for B3
    // in this invocation, so the spawned CLI regression can prove an A5 occurrence in a
    // B3-grandfathered file still fails the build. Never used by the workflow or lint-staged; the
    // flag pair is spliced out before positional-file resolution so its value is not scanned twice.
    const extraFlagIndex = rawArgv.indexOf('--extra-b3-allowlist'),
          extraB3Raw     = extraFlagIndex !== -1 ? rawArgv[extraFlagIndex + 1] : null;

    if (extraFlagIndex !== -1) {
        rawArgv.splice(extraFlagIndex, 2)
    }

    const quiet     = rawArgv.includes('-q') || rawArgv.includes('--quiet'),
          argvFiles = rawArgv.filter(arg => !arg.startsWith('-'));

    const allowlist = extraB3Raw
        ? {...ALLOWLIST, B3: new Set([...ALLOWLIST.B3, toRepoRelative(extraB3Raw, gitRoot)])}
        : ALLOWLIST;

    function collectDefaultFiles() {
        const result = spawnSync('find', ['ai', '-type', 'f', '-name', '*.mjs'], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    const rawFiles = argvFiles.length > 0 ? argvFiles : collectDefaultFiles();
    const files    = rawFiles
        .filter(f => f.endsWith('.mjs'))
        .map(f => toRepoRelative(f, gitRoot))
        .filter(f => f.startsWith('ai/'));

    if (files.length === 0) {
        console.log('check-aiconfig-antipatterns: 0 ai/ .mjs files in scope, nothing to check.');
        process.exit(0);
    }

    const violations = [];
    for (const file of files) {
        let content;
        try {
            content = readFileSync(path.resolve(gitRoot, file), 'utf-8');
        } catch (e) {
            console.error(`check-aiconfig-antipatterns: could not read ${file}: ${e.message}`);
            continue
        }

        filterAllowlistedHits(findAntipatterns(content), file, allowlist)
            .forEach(({line, rule, text}) => violations.push(`${file}:${line}: [${rule}] ${text}`));
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-aiconfig-antipatterns: ${violations.length} ADR-0019 antipattern(s) in ai/:\x1b[0m`);
        if (!quiet) {
            violations.forEach(v => console.error('  ' + v));
            console.error('\nB3: never `?.` on an AiConfig read — the SSOT guarantees the tree; read the leaf and let it');
            console.error('fail loud (ADR-0019 §3/§5.1). A5: never a `hasEnvValue` helper — `leaf(default, env, type)`');
            console.error('owns the env-check (§5.2). A1: with AiConfig imported, never re-derive from process.env at');
            console.error('module level — read the resolved leaf at the use site (§5.5; pure-defaults modules WITHOUT');
            console.error('PLANE-ROOT: never anchor a `.neo-ai-data` path on the module\'s own `__dirname` — every');
            console.error('checkout then gets its OWN data root, the copies agree so nothing goes red, and the fork is');
            console.error('invisible until two of them disagree (worktrees already carry a private');
            console.error('`.neo-ai-data/concepts`). The remedy is NOT to call the canonical default helper: it');
            console.error('returns the pre-binding default and ignores `NEO_PLANE_DATA_ROOT`, so a runtime consumer');
            console.error('would write to the default path while the plane lives wherever configuration put it —');
            console.error('a SILENT divergence replacing a visible one. The composing ENTRYPOINT reads and injects');
            console.error('the resolved owning leaf (`AiConfig.plane.dataRoot`, `AiConfig.fleet.dataDir`, or');
            console.error('`memoryCoreConfig.wakeDaemon.dataDir`); helpers take the root as a parameter and never');
            console.error('import AiConfig.');
            console.error(`Genuinely unavoidable: "${ESCAPE_MARKER}: <reason>".`);
        }
        process.exit(1);
    }

    console.log(`check-aiconfig-antipatterns: ${files.length} ai/ file(s) scanned, 0 new violations.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
