import {test, expect}  from '@playwright/test';
import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../../../../../../ai/mcp/server');

/*
 * Contract: every MCP server config participates in the Tier-1 realm hierarchy by loading the root
 * config module, so getParent() resolves inherited Tier-1 leaves (auth.*, engines.*) through the
 * provider chain. A server config that skips this import has no resolvable parent — the moment any
 * consumer reads an inherited leaf on it (AuthService / TransportService under sse transport, or the
 * boot freshness guard) it throws "Cannot read properties of undefined (reading 'mode')", the live
 * NL-bridge boot crash. This test fails red for any standalone server config, so a new server cannot
 * ship without participating. It accepts both the side-effect import form and the named-import form.
 */
const ROOT_IMPORT = /^import\s+(?:[^'"\n]*\bfrom\s+)?['"]\.\.\/\.\.\/\.\.\/config\.template\.mjs['"]/m;

test.describe('MCP server config Tier-1 hierarchy participation', () => {
    test('every ai/mcp/server/*/config.template.mjs loads the Tier-1 realm root', async () => {
        const entries   = await fs.readdir(serverRoot, {withFileTypes: true});
        const templates = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const templatePath = path.join(serverRoot, entry.name, 'config.template.mjs');

            try {
                templates.push({name: entry.name, src: await fs.readFile(templatePath, 'utf8')});
            } catch {
                // a server dir without a config.template.mjs (e.g. shared/) is not a server config
            }
        }

        expect(templates.length, 'expected at least one server config.template.mjs').toBeGreaterThan(0);

        const standalone = templates.filter(entry => !ROOT_IMPORT.test(entry.src)).map(entry => entry.name).sort();

        expect(standalone, 'server configs missing the Tier-1 realm-root import — they will crash on any inherited-leaf read').toEqual([]);
    });
});
