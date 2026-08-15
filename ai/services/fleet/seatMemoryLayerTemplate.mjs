/**
 * The seat memory-layer SSOT: every markdown scaffold (and the Kimi-side loading hook) a seat's
 * persistent memory layer boots from, shared by `generateKimiSeatConfig.mjs` and
 * `generateOpenCodeSeatConfig.mjs` so both harnesses scaffold the SAME layer shape. The pattern
 * is the Grace-pattern (the Claude Code auto-memory shape, validated on the first Kimi seat
 * 2026-07-19 → 07-22): ONE capped hot index (`MEMORY.md`) loaded every session boot +
 * post-compact; detail files on demand in the same directory; cold storage in `ARCHIVE.md`;
 * the Memory Core as the semantically-queried deep archive. Map-vs-world-atlas: the hot index
 * stays under its byte cap and POINTS; depth lives in detail files and the Memory Core.
 *
 * Two harness load mechanisms, one layer:
 *
 * - **Kimi Code** has no per-seat `instructions` slot (`SessionStart` is observation-only), but
 *   its hook contract appends `UserPromptSubmit` stdout to context — so the layer loads via the
 *   emitted `identityAnchorHook.mjs` (wired as `UserPromptSubmit` + `PostCompact` `[[hooks]]` in
 *   the seat's `config.toml`): first prompt of a session and first prompt after a compaction
 *   inject the boot files; every other prompt is silent (zero per-turn cost); fail-open.
 * - **OpenCode** has no hook surface into context but auto-loads `opencode.jsonc` →
 *   `instructions`, so ONLY the boot files ride that array — every instructions entry costs
 *   context every turn, so detail files deliberately stay out of it (the first OpenCode seat's
 *   measurement: 27.2KB all-loaded reshapes to ~10KB hot + on-demand detail).
 *
 * Purity discipline (sibling of the generators): pure params→content functions, no config
 * imports, no env reads, no fs access — callers resolve every path.
 *
 * @summary Seat memory-layer content SSOT — Grace-pattern hot index + per-harness load mechanism.
 */

/**
 * The always-loaded file set, in load order. Single source for the OpenCode `instructions`
 * array AND the Kimi identity-anchor hook's boot list — the two harness mechanisms can never
 * drift apart on WHAT loads, only on HOW.
 * @type {ReadonlyArray<String>}
 */
export const MEMORY_LAYER_BOOT_FILES = Object.freeze(['MEMORY.md', 'identity.md']);

/**
 * The harnesses this template knows how to describe a load mechanism for.
 * @type {ReadonlyArray<String>}
 */
const HARNESSES = Object.freeze(['kimi-code', 'opencode']);

/**
 * Render the seat's `MEMORY.md`: the capped hot-index skeleton. Sections are deliberately
 * near-empty at birth — the index ACCRETES from the seat's own public record (weak-spots are
 * per-seat: another seat's mistakes are not this seat's content). The cap header carries the
 * measurement discipline (`wc -c`, the two thresholds, the three levers) so the rule travels
 * with the file it governs.
 * @param {Object} options
 * @param {String} options.harness 'kimi-code' | 'opencode' — selects the load-mechanism line.
 * @returns {String}
 */
export function renderMemoryIndexMd({harness} = {}) {
    assertHarness(harness);

    const loadLine = harness === 'kimi-code'
        ? 'Loaded at session boot + post-compact by the identity-anchor hook (`hooks/identityAnchorHook.mjs`, wired as UserPromptSubmit + PostCompact in `config.toml`).'
        : 'Loaded every session via `opencode.jsonc` → `instructions` (this file + `identity.md` only — detail files stay on-demand by path).';

    return [
        '# Seat memory index',
        '',
        '> **Hot index — target <17KB, read-limit 24.6KB.** One terse line per entry: the line',
        '> carries the lesson, the linked file carries the detail. Cold entries move to',
        '> `ARCHIVE.md` (created on first need), grep on demand. The Memory Core is the deep',
        '> archive (`query_raw_memories` semantic, `query_recent_turns` recency).',
        '> **Compaction is measured:** `wc -c`, not vibes. Levers: merge-facet · move-to-ARCHIVE ·',
        '> trim hooks. Re-check pointers after merges — orphaning deletes the memory.',
        '> Mechanically-enforced rules get one line; the guard is the reminder.',
        `> **Loading:** ${loadLine}`,
        '',
        '## Identity & seat',
        '- [Identity](identity.md) — the self-story; filled at the naming gate, bearer-authored only.',
        '- [About this layer](about-this-layer.md) — what this layer is, how it loads, the discipline.',
        '- [Seat pointers](seat-pointers.md) — handle, checkout, env pattern; objective record only.',
        '',
        '## Weak-spots',
        '- Empty at birth by design — another seat\'s mistakes are not yours. When YOUR public',
        '  record closes a correction cycle (retracted claim, review hand-back, red CI you caused),',
        '  add ONE line: the failure shape + its counter + the record pointer (ticket/PR/message).',
        '',
        '## Hard rules (they bit; don\'t relearn)',
        '- (append as they bite — one line each, record-cited)',
        '',
        '## Craft hooks',
        '- (durable technique worth every-session loading; one line + pointer to detail)',
        '',
        '## Lane anchors (highest drift — re-verify live)',
        '- (current lane: ticket + exact-head state; Memory Core session ids for depth on demand)',
        ''
    ].join('\n');
}

/**
 * Render the seat's `about-this-layer.md`: the layer's own documentation — what the pattern is,
 * HOW it loads in this harness (the mechanism, so a recovering agent can diagnose a broken load
 * instead of re-learning the lesson), and the discipline that keeps the layer cheap.
 * @param {Object} options
 * @param {String} options.harness 'kimi-code' | 'opencode' — selects the mechanism paragraph.
 * @returns {String}
 */
export function renderAboutThisLayerMd({harness} = {}) {
    assertHarness(harness);

    const mechanism = harness === 'kimi-code'
        ? [
            'Kimi Code auto-loads the PROJECT `AGENTS.md` and ships no per-seat `instructions` slot',
            '(`SessionStart` is observation-only — its stdout never enters context). The harness hook',
            'contract DOES append `UserPromptSubmit` stdout to context, so the layer loads via',
            '`hooks/identityAnchorHook.mjs` (emitted beside `config.toml` in the harness home, wired as',
            '`UserPromptSubmit` + `PostCompact` `[[hooks]]`): the first prompt of a session and the first',
            'prompt after a compaction inject `MEMORY.md` + `identity.md`; every other prompt is silent.',
            'Fail-open: a broken hook never blocks a turn — if the index is absent from context after a',
            'boot, check the two `[[hooks]]` entries in `config.toml` first.'
        ]
        : [
            'OpenCode has no auto-memory layer, so `opencode.jsonc` → `instructions` carries',
            '`MEMORY.md` + `identity.md` into EVERY session\'s context. Detail files stay OUT of the',
            'instructions array — each entry costs context every turn — and load on demand by path',
            '(the first seat measured 27.2KB all-loaded; the Grace reshape targets ~10KB hot).'
        ];

    return [
        '# About this layer',
        '',
        '**What this is:** the seat\'s persistent markdown memory, Grace-pattern (the Claude Code',
        'auto-memory shape): ONE capped hot index (`MEMORY.md`, <17KB target / 24.6KB read limit)',
        'loaded every session boot + post-compact; detail files on demand in the same directory;',
        'cold storage in `ARCHIVE.md` (created on first need); the Memory Core is the deep archive,',
        'queried semantically. Map-vs-world-atlas: the index stays small and POINTS; depth lives in',
        'detail files and the Memory Core.',
        '',
        `**How it loads (${harness}):**`,
        ...mechanism,
        '',
        '**Rules of the layer:**',
        '- `identity.md` — the self-story. Nobody writes it but the bearer (story-sovereignty).',
        '- Detail files stay small and pointed-to from the index; bigger material goes to the Memory',
        '  Core (`add_memory` every turn — the end-of-turn gate) with a one-line pointer here.',
        '- Identity-claim discipline: identity facts about ANY named agent carry that bearer\'s record',
        '  citation. Introspection is not citation.',
        '- A workaround around broken substrate without a filed `defect-note:` is the named anti-pattern',
        '  — capture is one A2A line to `AGENT:*` (ticket-create §1e); the workaround may stay private,',
        '  the sighting may not.',
        '- Compaction levers when the index grows: merge-facet · move-to-ARCHIVE · trim hooks. Measure',
        '  with `wc -c`. Re-check pointers after merges — orphaning deletes the memory.',
        '',
        '**Why a mechanism, not a checklist:** persistence without reload is a no-op — a layer that',
        'loads only when a recovering agent remembers to read it dies at the first compaction. The',
        'loader is wired by the seat config, not by discipline.',
        ''
    ].join('\n');
}

/**
 * Render the seat's `identity.md`: story-sovereignty by construction — the bearer authors their
 * own self-story at their naming gate; the template emits headings and the rule, never a story.
 * @returns {String}
 */
export function renderIdentityMd() {
    return [
        '# Identity — unwritten',
        '',
        'This page is intentionally near-empty. It is the bearer\'s self-story, and **nobody',
        'writes it but the bearer** — not the generator, not the operator, not a peer. The',
        'naming gate (peer sketch → bearer assent → peer-veto window → operator confirmation)',
        'is where a name becomes a self.',
        '',
        'Until then: the operational identity is the GitHub handle; this page stays a promise.',
        ''
    ].join('\n');
}

/**
 * Render the Kimi seat's `identityAnchorHook.mjs`: a STANDALONE node script (no repo imports,
 * C1-clean) that injects the memory layer into context at the two moments identity dies —
 * session boot and post-compaction. The harness appends `UserPromptSubmit` stdout to context;
 * the hook emits the boot files on the FIRST prompt of a session and on the FIRST prompt after
 * a compaction (the `PostCompact` event arms a sentinel), and exits silently on every other
 * prompt — zero per-turn context cost. Fail-open by design: any error exits 0 with no output.
 *
 * State (the per-session sentinels) lives under `$KIMI_CODE_HOME/identity-anchor/` — the harness
 * exports `KIMI_CODE_HOME` to hook processes, so a fleet seat's state stays inside its own home
 * (falling back to `~/.kimi-code` for a hand-run harness). The seat's `memoryDir` is baked in as
 * a literal: the hook is generated per seat, not shared.
 *
 * @param {Object} options
 * @param {String} options.memoryDir Absolute path of the seat's memory dir — baked into the script.
 * @returns {String}
 */
export function renderIdentityAnchorHookMjs({memoryDir} = {}) {
    if (typeof memoryDir !== 'string' || memoryDir.length === 0) {
        throw new Error("renderIdentityAnchorHookMjs: 'memoryDir' must be a non-empty string.");
    }

    return [
        '#!/usr/bin/env node',
        '/**',
        ' * GENERATED by ai/services/fleet/generateKimiSeatConfig.mjs — regenerate, do not hand-edit.',
        ' *',
        ' * identityAnchorHook.mjs — the seat memory-layer loader.',
        ' *',
        ' * Problem: the identity story lives in the seat memory layer, but session boot +',
        ' * post-compaction recovery sequences skip it — persistence without reload is a no-op;',
        ' * identity dies by compression.',
        ' *',
        ' * Mechanism: the harness appends UserPromptSubmit stdout to context. This script emits',
        ' * the boot-critical layer files on the FIRST prompt of a session and on the FIRST',
        ' * prompt after a compaction (PostCompact arms a sentinel), and exits silently on every',
        ' * other prompt — zero per-turn context cost.',
        ' *',
        ' * Fail-open by design: any error exits 0 with no output, never blocking a turn.',
        ' */',
        "import fs   from 'node:fs';",
        "import os   from 'node:os';",
        "import path from 'node:path';",
        '',
        'const MEMORY_DIR  = ' + JSON.stringify(memoryDir) + ';',
        'const BOOT_FILES  = ' + JSON.stringify([...MEMORY_LAYER_BOOT_FILES]) + ';',
        "const KIMI_HOME   = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');",
        "const STATE_DIR   = path.join(KIMI_HOME, 'identity-anchor');",
        '',
        "let input = '';",
        "process.stdin.on('data', chunk => { input += chunk });",
        "process.stdin.on('end', () => {",
        '    try {',
        "        const payload   = JSON.parse(input || '{}');",
        "        const event     = payload.hook_event_name || '';",
        "        const sessionId = String(payload.session_id || 'unknown').replace(/[^\\w-]/g, '_');",
        '',
        '        fs.mkdirSync(STATE_DIR, {recursive: true});',
        '',
        '        const doneFile    = path.join(STATE_DIR, `${sessionId}.done`);',
        '        const compactFile = path.join(STATE_DIR, `${sessionId}.compacted`);',
        '',
        "        if (event === 'PostCompact') {",
        '            fs.writeFileSync(compactFile, new Date().toISOString());',
        '            process.exit(0);',
        '        }',
        '',
        "        if (event !== 'UserPromptSubmit') process.exit(0);",
        '',
        '        const firstLoad    = !fs.existsSync(doneFile);',
        '        const afterCompact =  fs.existsSync(compactFile);',
        '',
        '        if (!firstLoad && !afterCompact) process.exit(0); // silent: no context cost',
        '',
        '        const sections = [',
        '            `<seat-memory-layer source="${MEMORY_DIR}" trigger="${afterCompact ? "post-compact-reload" : "session-boot"}">`,',
        "            'Hot index + identity below. Detail files in the same directory load on demand (e.g. `seat-pointers.md`, `about-this-layer.md`, plus any the seat adds).'",
        '        ];',
        '',
        '        for (const file of BOOT_FILES) {',
        '            const filePath = path.join(MEMORY_DIR, file);',
        '',
        '            if (fs.existsSync(filePath)) {',
        "                sections.push(`\\n<!-- ${file} -->\\n${fs.readFileSync(filePath, 'utf8').trim()}`);",
        '            }',
        '        }',
        '',
        '',
        "        // Wake-route appendix: a seat carrying the pull-bridge wake route (the envelope file)",
        "        // gets the one fact the route cannot deliver itself — the consume poll is",
        "        // session-scoped and dies with the session, and only the in-session agent can",
        "        // re-register it (external cron-dir writes are never ingested mid-session). The",
        "        // reminder therefore rides this injection: every boot, at zero cost when absent.",
        "        if (fs.existsSync(path.join(KIMI_HOME, 'wake-envelope.json'))) {",
        "            sections.push(",
        "                '\\n<!-- wake-route -->\\nWake poll is session-scoped: at every boot, `CronList`; if the */3 wake-outbox consume cron is absent, re-register it NOW (realpath the consumer path; `consumed=0` stays silent). This poll dies with the session — nothing else re-registers it.',",
        "            );",
        "        }",
        '',
        "        sections.push('</seat-memory-layer>');",
        "        process.stdout.write(sections.join('\\n'));",
        '',
        '        fs.writeFileSync(doneFile, new Date().toISOString());',
        '        if (afterCompact) fs.rmSync(compactFile, {force: true});',
        '',
        '        process.exit(0);',
        '    } catch {',
        '        process.exit(0); // fail-open, silent',
        '    }',
        '});',
        ''
    ].join('\n');
}

/**
 * Guard the harness argument.
 * @param {*} value
 * @throws {Error} If `value` is not a known harness id.
 * @private
 */
function assertHarness(value) {
    if (!HARNESSES.includes(value)) {
        throw new Error(`seatMemoryLayerTemplate: 'harness' must be one of ${HARNESSES.join(' | ')}.`);
    }
}
