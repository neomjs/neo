import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../..');

test.describe('Knowledge Base PullRequestSource (#10057)', () => {
    test('PullRequestSource.mjs exists and emits type="pull" chunks targeting resources/content/pulls', () => {
        const sourcePath = path.join(repoRoot, 'ai/mcp/server/knowledge-base/source/PullRequestSource.mjs');

        expect(fs.existsSync(sourcePath), `PullRequestSource.mjs not found at ${sourcePath}`).toBe(true);

        const content = fs.readFileSync(sourcePath, 'utf8');

        expect(content, 'className must match namespace').toMatch(/className:\s*'Neo\.ai\.mcp\.server\.knowledge-base\.source\.PullRequestSource'/);
        expect(content, 'must target resources/content/pulls').toMatch(/resources\/content\/pulls/);
        expect(content, "chunks must carry type: 'pull'").toMatch(/type\s*:\s*'pull'/);
        expect(content, "chunks must carry kind: 'pull'").toMatch(/kind\s*:\s*'pull'/);
        expect(content, 'must export via Neo.setupClass').toMatch(/export default Neo\.setupClass\(PullRequestSource\)/);
    });

    test('PullRequestSource is registered in DatabaseService sources array', () => {
        const dbServicePath = path.join(repoRoot, 'ai/mcp/server/knowledge-base/services/DatabaseService.mjs');

        expect(fs.existsSync(dbServicePath), `DatabaseService.mjs not found at ${dbServicePath}`).toBe(true);

        const content = fs.readFileSync(dbServicePath, 'utf8');

        expect(content, 'PullRequestSource must be imported').toMatch(/import\s+PullRequestSource\s+from\s+'\.\.\/source\/PullRequestSource\.mjs'/);

        const arrayMatch = content.match(/const\s+sources\s*=\s*\[([\s\S]*?)\]/m);
        expect(arrayMatch, 'sources array block not found in DatabaseService.mjs').not.toBeNull();
        expect(arrayMatch[1], 'PullRequestSource must appear in the sources array').toMatch(/\bPullRequestSource\b/);
    });

    test('resources/content/pulls exists and holds markdown files to embed', () => {
        const pullsDir = path.join(repoRoot, 'resources/content/pulls');

        expect(fs.existsSync(pullsDir), `pulls directory not found at ${pullsDir}`).toBe(true);

        const markdownFiles = fs.readdirSync(pullsDir).filter(f => f.endsWith('.md'));
        expect(markdownFiles.length, 'expected at least one PR markdown file to embed').toBeGreaterThan(0);
    });
});
