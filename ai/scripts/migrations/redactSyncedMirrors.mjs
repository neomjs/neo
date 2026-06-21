#!/usr/bin/env node
/**
 * @summary One-time migration: redact sensitive terms from the git-tracked content mirrors under
 * `resources/content/**`. Sensitive terms (commercial-partner names, external contributor handles)
 * must never appear in public artifacts (the core no-client-names gate). This script carries NO hardcoded
 * sensitive term — the deny-pairs are passed at invocation, so the tracked source stays name-clean. It reuses the
 * shared `redactSensitiveContent` so this migration (surface D) and the sync-writer guard (surface E)
 * redact identically.
 *
 * Usage: node ai/scripts/migrations/redactSyncedMirrors.mjs "from=to" ["from2=to2" ...]
 *   - pass deny-pairs in order: longest / handle terms BEFORE their substrings.
 */
import {readFileSync, writeFileSync} from 'fs';
import {execSync}                    from 'child_process';
import {redactSensitiveContent}      from '../../services/github-workflow/shared/redactSensitiveContent.mjs';

const root      = 'resources/content';
const denyPairs = process.argv.slice(2).map(arg => {
    const i = arg.indexOf('=');
    return i === -1 ? null : [arg.slice(0, i), arg.slice(i + 1)];
}).filter(Boolean);

if (!denyPairs.length) {
    console.error('Usage: node redactSyncedMirrors.mjs "from=to" ["from2=to2" ...]');
    process.exit(1);
}

// Collect the candidate files: any mirror containing any deny `from` (case-insensitive find).
const candidates = new Set();
for (const [from] of denyPairs) {
    try {
        execSync(`git grep -Iil --fixed-strings ${JSON.stringify(from)} -- ${root}`, {encoding: 'utf8'})
            .split('\n').filter(Boolean).forEach(file => candidates.add(file));
    } catch {
        // git grep exits 1 when there is no match — nothing to collect for this term.
    }
}

let changed = 0;
for (const file of candidates) {
    const before = readFileSync(file, 'utf8');
    const after  = redactSensitiveContent(before, denyPairs);
    if (after !== before) {
        writeFileSync(file, after);
        changed++;
    }
}

console.log(`redacted ${changed} file(s) of ${candidates.size} candidate(s) under ${root}/`);
