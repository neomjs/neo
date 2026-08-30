import {test, expect} from '@playwright/test';
import {execFileSync} from 'child_process';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

import {classifyTarget, collectDeadLinks, extractLinkTargets, resolveTarget, stagedReader, trackedFiles}
    from '../../../../buildScripts/util/check-relative-links.mjs';

/**
 * The guard's classifier is where a link checker lives or dies. A first pass over this repository
 * produced 17 findings of which 7 were real — the rest were root-absolute links joined to the wrong
 * base and portal ids treated as filesystem paths. A muted guard is worse than no guard, so the
 * taxonomy is pinned here rather than re-derived by whoever next changes a regex.
 */
const tracked = new Set([
    'learn/guides/fundamentals/ApplicationBootstrap.md',
    'learn/guides/uibuildingblocks/WorkingWithVDom.md',
    'learn/benefits/body/ConfigSystem.md',
    'learn/comparisons/Overview.md',
    'examples/component/helix/index.html',
    'buildScripts/build/esmodules.mjs'
]);

/** Drives the collector over one in-memory document. */
const scan = (file, markdown) =>
    collectDeadLinks({files: [file], tracked, read: () => markdown});

test.describe('check-relative-links — extraction', () => {
    test('reads inline, reference-style and HTML links', () => {
        const targets = extractLinkTargets([
            '[inline](./a.md)',
            '[ref]: ./b.md',
            '<a href="./c.md">html</a>'
        ].join('\n'));

        expect(targets).toContain('./a.md');
        expect(targets).toContain('./b.md');
        expect(targets).toContain('./c.md')
    });

    test('an inline link with a title yields the target, not the title', () => {
        expect(extractLinkTargets('[x](./a.md "A title")')).toEqual(['./a.md'])
    });

    // The corpus already contains single-quoted raw-HTML anchors, so this is authoring that
    // happens, not a hypothetical. It is pinned on both sides because the guard and the runtime
    // rewriter (app/content/Component.mjs#rewriteLinks) must extract the same set: a link only one
    // of them can see is validated as healthy and then rendered unrewritten.
    test('a single-quoted HTML href is extracted exactly like a double-quoted one', () => {
        expect(extractLinkTargets("<a href='./c.md' target='_blank'>html</a>")).toEqual(['./c.md']);
        expect(extractLinkTargets('<a href = "./d.md">spaced</a>')).toEqual(['./d.md'])
    });

    test('CONTROL: prose shaped like a reference definition is NOT a link', () => {
        // `[Side Note]: If you add a new addon…` parsed as a definition pointing at `If`, and the
        // guard then reported a target that never existed. A definition owns its whole line.
        expect(extractLinkTargets('[Side Note]: If you add a new addon, the prefix is not needed.'))
            .toEqual([])
    });

    test('a real reference definition still parses, with or without a title', () => {
        expect(extractLinkTargets('[a]: ./b.md')).toEqual(['./b.md']);
        expect(extractLinkTargets('[a]: ./b.md "Title"')).toEqual(['./b.md'])
    })
});

test.describe('check-relative-links — classification', () => {
    test('external schemes and bare anchors are out of scope', () => {
        for (const target of ['https://x.dev/a', 'http://x.dev', 'mailto:a@b.c', '#section']) {
            expect(classifyTarget(target).kind).toBe('external')
        }
    });

    test('anything with a slash or a file suffix is a path', () => {
        for (const target of ['./a.md', '../b/c.md', '/learn/d.md', 'e.md', 'f.mjs']) {
            expect(classifyTarget(target).kind).toBe('path')
        }
    });

    test('a slash-less, extension-less target is a portal id', () => {
        expect(classifyTarget('guides.events.DomEvents').kind).toBe('portal');
        expect(classifyTarget('Overview').kind).toBe('portal')
    });

    test('the fragment and query are stripped before resolution', () => {
        expect(classifyTarget('./a.md#heading').value).toBe('./a.md');
        expect(classifyTarget('./a.md?v=2').value).toBe('./a.md')
    })
});

test.describe('check-relative-links — resolution', () => {
    const base = 'learn/guides/uibuildingblocks';

    test('a relative target resolves against the referring file', () => {
        expect(resolveTarget({kind: 'path', value: '../fundamentals/X.md'}, base))
            .toBe('learn/guides/fundamentals/X.md')
    });

    test('a root-absolute target has no repository resolution and is reported unresolvable', () => {
        // Joining these to the referrer's directory invented six false positives on the first pass,
        // and the correction over-swung: resolving them from the repo root reported them HEALTHY.
        // Neither reader works that way — a browser on GitHub sends `/learn/x.md` to
        // `https://github.com/learn/x.md`, and the portal sends it outside the app. There is no
        // repository path to check, so the only honest answer is "unresolvable".
        expect(resolveTarget({kind: 'path', value: '/learn/comparisons/Overview.md'}, base)).toBeNull();
        expect(resolveTarget({kind: 'path', value: '/.github/AI_QUICK_START.md'}, base)).toBeNull()
    });

    test('a trailing slash does not hide a directory that exists', () => {
        expect(resolveTarget({kind: 'path', value: './guides/'}, 'learn')).toBe('learn/guides')
    });

    test('a portal id resolves the way the portal resolves it', () => {
        // apps/portal/view/learn/Component.mjs#getContentPath: id.replaceAll('.', '/') + '.md'
        expect(resolveTarget({kind: 'portal', value: 'guides.userinteraction.events.DomEvents'}, base))
            .toBe('learn/guides/userinteraction/events/DomEvents.md')
    })
});

test.describe('check-relative-links — findings', () => {
    test('a live document reports nothing', () => {
        const {findings, checked} = scan('learn/guides/uibuildingblocks/Custom.md',
            '[a](../fundamentals/ApplicationBootstrap.md) and [b](guides.uibuildingblocks.WorkingWithVDom)');

        expect(findings).toEqual([]);
        expect(checked).toBe(2)
    });

    test('a dead relative link is reported by name', () => {
        const {findings} = scan('learn/guides/uibuildingblocks/Custom.md', '[a](../fundamentals/Nope.md)');

        expect(findings.length).toBe(1);
        expect(findings[0].target).toBe('../fundamentals/Nope.md');
        expect(findings[0].resolved).toBe('learn/guides/fundamentals/Nope.md')
    });

    test('a dead PORTAL id is reported too — the exemption that hid three of these is gone', () => {
        // The first version waved every slash-less, extension-less target through as "a portal ref".
        // All three such targets in this repository were dead, and the exemption was the only reason
        // they read as clean. Fail-closed is the whole point of this arm.
        const {findings} = scan('learn/guides/uibuildingblocks/Custom.md', '[a](benefits.ConfigSystem)');

        expect(findings.length).toBe(1);
        expect(findings[0].kind).toBe('portal');
        expect(findings[0].resolved).toBe('learn/benefits/ConfigSystem.md')
    });

    test('the corrected portal id resolves, so the arm above is about the TARGET not the syntax', () => {
        const {findings, portal} = scan('learn/guides/uibuildingblocks/Custom.md', '[a](benefits.body.ConfigSystem)');

        expect(findings).toEqual([]);
        expect(portal).toBe(1)
    });

    test('external links are neither checked nor counted', () => {
        const {findings, checked} = scan('learn/x.md', '[a](https://example.com/nope) [b](#anchor)');

        expect(findings).toEqual([]);
        expect(checked).toBe(0)
    });

    test('a directory target resolves against directories, not just files', () => {
        const {findings} = scan('learn/README.md', '[a](./guides/)');

        expect(findings).toEqual([])
    })
});

/**
 * Everything above injects `tracked` and `read`, which proves the resolver and nothing about where
 * the CLI's inputs come from. The module header claims the index is the authority — staged edits
 * are scanned, untracked files on disk are invisible — and that claim is what makes the guard work
 * on a stale checkout. It needs a real git repository to be witnessed at all.
 */
test.describe('check-relative-links — the index is the authority, not the filesystem', () => {
    let root;

    test.beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'link-guard-index-'));

        const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'});

        git('init', '-q');
        git('config', 'user.email', 'guard@test.invalid');
        git('config', 'user.name', 'Guard Test');

        fs.writeFileSync(path.join(root, 'committed.md'), 'committed body\n');
        git('add', 'committed.md');
        git('commit', '-qm', 'seed');

        // Staged but never committed — the "a PR adds a guide and links to it in one commit" case.
        fs.writeFileSync(path.join(root, 'staged.md'), 'staged body\n');
        git('add', 'staged.md');

        // On disk, unknown to git — the stale-checkout blind spot the guard exists to close.
        fs.writeFileSync(path.join(root, 'untracked.md'), 'untracked body\n');

        // Staged content and worktree content now DIFFER, so a reader that opens the file gets a
        // different answer than one that reads `:path`. Without this divergence both readers agree
        // and the arm cannot tell them apart.
        fs.writeFileSync(path.join(root, 'staged.md'), 'WORKTREE EDIT, NOT STAGED\n');
    });

    test.afterAll(() => {
        fs.rmSync(root, {recursive: true, force: true})
    });

    test('membership includes staged-but-uncommitted files and excludes untracked ones', () => {
        const tracked = new Set(trackedFiles(root));

        expect(tracked.has('committed.md')).toBe(true);
        expect(tracked.has('staged.md')).toBe(true);
        expect(tracked.has('untracked.md')).toBe(false)
    });

    test('the reader returns staged content, not what is sitting in the working tree', () => {
        expect(stagedReader(root)('staged.md')).toBe('staged body\n');
        expect(fs.readFileSync(path.join(root, 'staged.md'), 'utf8')).toBe('WORKTREE EDIT, NOT STAGED\n')
    })
});
