import {test, expect} from '@playwright/test';
import fs             from 'fs';
import path           from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '../../../../../..');

const BACKUP_SCRIPT = path.join(REPO_ROOT, 'ai/scripts/maintenance/backup.mjs');
const DEFRAG_SCRIPT = path.join(REPO_ROOT, 'ai/scripts/maintenance/defragChromaDB.mjs');

/**
 * Regression guard for #10129 Phase 3: backup.mjs and defragChromaDB.mjs are peer scripts
 * with orthogonal responsibilities. Neither calls the other at import time.
 *
 * The rationale (captured in the #10129 ticket body) is that delegation between these two
 * scripts would re-create the exact discoverability failure this separation solves — backup
 * becomes a defrag side-effect, or defrag's fast physical-copy safety gets coupled to the
 * slower JSONL-export pipeline. This spec locks the invariant in CI so a future refactor
 * cannot silently reintroduce the coupling.
 */
test.describe('backup.mjs ↔ defragChromaDB.mjs peer architecture (#10129 Phase 3)', () => {
    test('backup.mjs does not import defragChromaDB.mjs', () => {
        const source = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
        expect(source).not.toMatch(/import\s+[^;]*\bfrom\s+['"][^'"]*defragChromaDB(\.mjs)?['"]/);
    });

    test('defragChromaDB.mjs does not import backup.mjs', () => {
        const source = fs.readFileSync(DEFRAG_SCRIPT, 'utf8');
        expect(source).not.toMatch(/import\s+[^;]*\bfrom\s+['"][^'"]*\/backup(\.mjs)?['"]/);
    });

    test('defragChromaDB.mjs does not import the ai/services.mjs SDK for backup routing', () => {
        // Defrag is a standalone CLI that talks to ChromaDB directly; it must not reach
        // through the SDK boundary for backup concerns (that is backup.mjs' job).
        const source = fs.readFileSync(DEFRAG_SCRIPT, 'utf8');
        expect(source).not.toMatch(/import\s+[^;]*\bfrom\s+['"][^'"]*\/services(\.mjs)?['"]/);
    });

    test('backup.mjs explicitly routes through the ai/services.mjs SDK boundary', () => {
        // Positive assertion: this is the load-bearing import that keeps backup.mjs on the
        // Zod-validated SDK boundary. If someone inlines direct ai/mcp/server imports to
        // "avoid the SDK overhead" the AC is violated.
        const source = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
        expect(source).toMatch(/from\s+['"][^'"]*\/services\.mjs['"]/);
    });

    test('backup.mjs does not import services/managers from ai/mcp/server/* (SDK bypass check)', () => {
        // Intent: no `import X from '.../ai/mcp/server/<name>/services/*'` or `/managers/*` —
        // service / manager singletons MUST be reached via the `ai/services.mjs` SDK boundary
        // so makeSafe() Zod validation fires. Importing read-only config overlay files
        // is permitted — those carry no method surface and
        // backup.mjs needs them to assemble the `bundle-meta.topology` descriptor (#10871 AC-A).
        const source = fs.readFileSync(BACKUP_SCRIPT, 'utf8');
        expect(source).not.toMatch(/from\s+['"][^'"]*ai\/mcp\/server\/[^'"]+\/(services|managers)\//);
    });
});
