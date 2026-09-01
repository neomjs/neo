import { test, expect }  from '@playwright/test';
import { execSync }      from 'node:child_process';
import path              from 'node:path';
import fs                from 'node:fs';
import os                from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, '../../../../../buildScripts/util/check-chore-sync.mjs');

test.describe('check-chore-sync.mjs', () => {
    let tempDir;
    let testScriptPath;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-sync-test-'));
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit --allow-empty -m "Init"', { cwd: tempDir, stdio: 'ignore' });

        testScriptPath = path.join(tempDir, 'buildScripts/util/check-chore-sync.mjs');
        fs.mkdirSync(path.dirname(testScriptPath), {recursive: true});
        fs.copyFileSync(scriptPath, testScriptPath);

        // The guard imports its merge-inheritance rule from a shared helper (also consumed by
        // check-whitespace), so the fixture must carry it too — the script anchors to the repo that
        // owns it, and a bare copy would fail to resolve the import rather than test the guard.
        fs.copyFileSync(
            path.resolve(path.dirname(scriptPath), 'mergeInheritance.mjs'),
            path.join(tempDir, 'buildScripts/util/mergeInheritance.mjs')
        );

        // Ensure we're on a non-data branch like 'dev'
        execSync('git checkout -b dev', { cwd: tempDir, stdio: 'ignore' });
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runScript = (cwd, env = {}) => {
        try {
            const output = execSync(`node ${testScriptPath}`, {
                cwd,
                env     : { ...process.env, ...env },
                encoding: 'utf-8',
                stdio   : 'pipe'
            });
            return { status: 0, output };
        } catch (error) {
            return { status: error.status, output: error.stderr || error.stdout };
        }
    };

    const stageFile = (filePath) => {
        const fullPath = path.join(tempDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, 'test content');
        execSync(`git add ${filePath}`, { cwd: tempDir, stdio: 'ignore' });
    };

    test('normal reject: staging a data file on dev branch fails', () => {
        stageFile('resources/content/issues/1.md');
        const result = runScript(tempDir);
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: Sync-data leakage detected');
        expect(result.output).toContain("Branch 'dev' (in root");
        expect(result.output).toContain('resources/content/issues/1.md');
    });

    test('sanctioned bypass: staging a data file on chore/sync- branch passes', () => {
        execSync('git checkout -b chore/sync-123', { cwd: tempDir, stdio: 'ignore' });
        stageFile('resources/content/issues/1.md');
        const result = runScript(tempDir);
        expect(result.status).toBe(0);
    });

    test('sanctioned bypass: staging a data file on agent/sync- branch passes', () => {
        execSync('git checkout -b agent/sync-123', { cwd: tempDir, stdio: 'ignore' });
        stageFile('resources/content/issues/1.md');
        const result = runScript(tempDir);
        expect(result.status).toBe(0);
    });

    test('valid sync-only staging with NEO_SYNC_AUTOCOMMIT=1 passes for generated workflow content', () => {
        [
            'resources/content/issues/chunk-1/issue-1.md',
            'resources/content/discussions/chunk-1/discussion-1.md',
            'resources/content/pulls/chunk-1/pr-1.md',
            'resources/content/release-notes/chunk-1/v1.0.0.md',
            'resources/content/archive/issues/v1.0.0/chunk-1/issue-2.md',
            'resources/content/_index.json',
            'resources/content/.sync-metadata.json'
        ].forEach(stageFile);

        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });
        expect(result.status).toBe(0);
    });

    test('non-sync staged file rejection with env var: mixed files fails', () => {
        stageFile('resources/content/issues/1.md');
        stageFile('src/foo.js');
        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: NEO_SYNC_AUTOCOMMIT bypass rejected.');
        expect(result.output).toContain('Automated sync commits must ONLY contain data files.');
        expect(result.output).toContain('src/foo.js');
        // It shouldn't complain about the data file
        expect(result.output).not.toContain('resources/content/issues/1.md');
    });

    test('non-sync staged file rejection with env var: unowned resources content fails', () => {
        stageFile('resources/content/concepts/example.md');
        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });
        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: NEO_SYNC_AUTOCOMMIT bypass rejected.');
        expect(result.output).toContain('resources/content/concepts/example.md');
    });

    // ── the repository-qualified corpus shape: `resources/content/<repoSlug>/<family>/`
    //
    // These three arms exist because the guard's two consumers fail in OPPOSITE directions when a
    // path shape stops being recognised. The leakage arm goes EMPTY and passes silently — a guard
    // that quietly stops guarding, and it runs on every ordinary commit; the autocommit arm inverts
    // the same predicate and rejects a sync-only staging as non-sync. The first two arms below go
    // red against the pre-re-key path list; the third is a control and passes against both.

    test('repo-qualified: staging a corpus file under resources/content/<repoSlug>/ on dev fails — the leakage arm must not go quiet when the corpus moves', () => {
        // The silent half. Before the guard learned this shape it matched nothing here, the filter
        // produced an empty list, and the check PASSED — leakage detection stops without erroring.
        stageFile('resources/content/neo/issues/chunk-1/issue-1.md');

        const result = runScript(tempDir);

        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: Sync-data leakage detected');
        expect(result.output).toContain('resources/content/neo/issues/chunk-1/issue-1.md');
    });

    test('repo-qualified + NEO_SYNC_AUTOCOMMIT=1: every family under a repoSlug is accepted as sync-only content', () => {
        // The inverted half. It is DORMANT today — nothing in either repository sets the variable and
        // the pipeline commits with `--no-verify` — so this arm is pinned because a bypass that is
        // wrong while unused is wrong the day something uses it, not because it fires now.
        //
        // The staged set is the REAL post-cut topology, not a uniform one: `issues`, `discussions`
        // and `pulls` are the facets that gain a repository segment, while `release-notes`, the
        // `archive/` tree and the root index all keep their flat homes. Both shapes are legitimately
        // live at once, and this arm exists to pin exactly that — a spec that staged every family
        // under a slug would assert a migration that is not happening.
        [
            'resources/content/neo/issues/chunk-1/issue-1.md',
            'resources/content/neo/discussions/chunk-1/discussion-1.md',
            'resources/content/neo/pulls/chunk-1/pr-1.md',
            'resources/content/release-notes/chunk-1/v1.0.0.md',
            'resources/content/archive/issues/v1.0.0/chunk-1/issue-2.md',
            'resources/content/_index.json'
        ].forEach(stageFile);

        expect(runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' }).status).toBe(0);
    });

    test('repo-qualified: a NON-family segment under a repoSlug is still not corpus data', () => {
        // Non-vacuity control for the structural match. The family segment is what makes a path
        // generated content — matching on `resources/content/<anything>/` would swallow authored
        // material that merely shares the root, which is the sibling of the flat-layout control
        // above (`resources/content/concepts/example.md`) one directory deeper.
        stageFile('resources/content/neo/concepts/example.md');

        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });

        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: NEO_SYNC_AUTOCOMMIT bypass rejected.');
        expect(result.output).toContain('resources/content/neo/concepts/example.md');
    });

    // Stages a real merge that carries a sync-pipeline commit — the exact shape of `git merge
    // origin/dev` on a feature branch. `--no-commit` leaves MERGE_HEAD set with the merge staged,
    // which is precisely the state the pre-commit hook runs in.
    const startMergeCarryingSyncData = () => {
        execSync('git checkout -b sync-pipeline-source', { cwd: tempDir, stdio: 'ignore' });
        stageFile('resources/content/issues/1.md');
        execSync('git commit -m "chore(data): Hourly data sync pipeline update"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git checkout dev', { cwd: tempDir, stdio: 'ignore' });
        execSync('git merge --no-commit --no-ff sync-pipeline-source', { cwd: tempDir, stdio: 'ignore' });
    };

    test('merge: a dev-merge carrying the pipeline\'s sync files passes — a merge does not AUTHOR sync data', () => {
        startMergeCarryingSyncData();

        // The merge stages resources/content/issues/1.md, but the feature branch did not write it.
        expect(execSync('git diff --cached --name-only', { cwd: tempDir, encoding: 'utf-8' }))
            .toContain('resources/content/issues/1.md');

        expect(runScript(tempDir).status).toBe(0);
    });

    test('merge: a sync file HAND-EDITED during the merge is still rejected — authoring in a merge is still authoring', () => {
        // The allowance is "inherited from MERGE_HEAD", not "a merge is in progress". Editing a sync
        // file on top of the merge diverges the index from MERGE_HEAD, which is authoring wearing a
        // merge's clothes — the exact hole a blanket merge-exit would leave open.
        startMergeCarryingSyncData();

        // Must write DIFFERENT content than the merge brought in: re-staging identical bytes is not
        // an edit, and the discriminator would rightly still call it inherited.
        fs.writeFileSync(path.join(tempDir, 'resources/content/issues/1.md'), 'hand-edited on top of the merge');
        execSync('git add resources/content/issues/1.md', { cwd: tempDir, stdio: 'ignore' });

        const result = runScript(tempDir);

        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: Sync-data leakage detected');
        expect(result.output).toContain('resources/content/issues/1.md');
    });

    test('merge: an inherited sync file passes while a hand-edited sibling in the SAME merge is rejected', () => {
        // Proves the discriminator is per-file, not a whole-commit verdict: one merge, two sync
        // files, only the edited one is a violation.
        execSync('git checkout -b sync-two-files', { cwd: tempDir, stdio: 'ignore' });
        stageFile('resources/content/issues/inherited.md');
        stageFile('resources/content/issues/edited.md');
        execSync('git commit -m "chore(data): Hourly data sync pipeline update"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git checkout dev', { cwd: tempDir, stdio: 'ignore' });
        execSync('git merge --no-commit --no-ff sync-two-files', { cwd: tempDir, stdio: 'ignore' });

        fs.writeFileSync(path.join(tempDir, 'resources/content/issues/edited.md'), 'hand-edited during the merge');
        execSync('git add resources/content/issues/edited.md', { cwd: tempDir, stdio: 'ignore' });

        const result = runScript(tempDir);

        expect(result.status).toBe(1);
        expect(result.output).toContain('resources/content/issues/edited.md');
        expect(result.output).not.toContain('resources/content/issues/inherited.md');
    });

    test('merge + NEO_SYNC_AUTOCOMMIT=1: mixed content is still rejected — the env arm runs first and a merge does not soften it', () => {
        // Ordering guard: the autocommit arm protects the pipeline's own commits, which are never
        // merges. A merge in flight must not become a way to smuggle source into a sync commit.
        startMergeCarryingSyncData();
        stageFile('src/foo.js');

        const result = runScript(tempDir, { NEO_SYNC_AUTOCOMMIT: '1' });

        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: NEO_SYNC_AUTOCOMMIT bypass rejected.');
        expect(result.output).toContain('src/foo.js');
    });

    test('merge escape is scoped to the merge: the SAME branch and files still fail on an ordinary commit', () => {
        // Guards the protection itself. If the escape ever widens from "a merge is in progress" to
        // "this branch touched sync files", this arm goes red — the leakage check must survive.
        startMergeCarryingSyncData();
        execSync('git commit --no-edit', { cwd: tempDir, stdio: 'ignore' });

        // Merge finished → no MERGE_HEAD → authoring sync data here is leakage again.
        stageFile('resources/content/issues/2.md');
        const result = runScript(tempDir);

        expect(result.status).toBe(1);
        expect(result.output).toContain('Error: Sync-data leakage detected');
        expect(result.output).toContain('resources/content/issues/2.md');
    });

    test('script root anchoring: running from a non-repo cwd checks the owning repo', () => {
        const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-sync-foreign-'));

        try {
            stageFile('resources/content/issues/1.md');
            const result = runScript(otherDir);
            expect(result.status).toBe(1);
            expect(result.output).toContain('Error: Sync-data leakage detected');
            expect(result.output).toContain("Branch 'dev' (in root");
            expect(result.output).toContain(tempDir);
            expect(result.output).toContain('resources/content/issues/1.md');
        } finally {
            fs.rmSync(otherDir, {recursive: true, force: true});
        }
    });
});
