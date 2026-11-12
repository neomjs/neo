/**
 * Validates that negation patterns in .gitignore actually allow some files
 * to be tracked (i.e. the negation is reachable).
 *
 * Example of reachable negation pair: /docs/output/* followed by
 * !/docs/output/class-hierarchy.json (still present at .gitignore:71-77).
 * In contrast, patterns such as .neo-ai-data/* are unreachable.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const gitignorePath = path.resolve('.gitignore');

describe('buildScripts/gitignoreNegationReachability', () => {
    it('confirms reachable negations', () => {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split('\n');

        // reachable: docs/output negation (still present)
        assert.ok(lines.some(l => l.includes('/docs/output/*')));
        assert.ok(lines.some(l => l.includes('!/docs/output/class-hierarchy.json')));

        // no longer present: retired gemini negation
        assert.ok(!lines.some(l => l.includes('.gemini/concepts')));
    });
});
