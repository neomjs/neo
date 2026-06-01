import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalContentComponentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import Component       from '../../../../../../../apps/portal/view/content/Component.mjs';

/**
 * Unit coverage for the shared avatar helpers on the Portal news timeline base
 * `Portal.view.content.Component`. Every timeline view (tickets / pull requests / discussions) renders
 * actor avatars through these, so a 40px timeline avatar fetches GitHub's ~1KB `?size=40` image instead
 * of the full-resolution original, and bot/app actors (whose `<login>.png` 404s) fall back to a
 * no-network glyph. Both helpers are pure (they read only `this.repoUserUrl` / `this.getAvatarUrl`), so
 * they are exercised directly on the prototype with a stub context.
 */
const {getAvatarHtml, getAvatarUrl} = Component.prototype;

test.describe('Portal.view.content.Component — shared avatar helpers', () => {
    test('getAvatarUrl bounds the avatar request to ?size=40', () => {
        expect(getAvatarUrl.call({repoUserUrl: 'https://github.com/'}, 'alice'))
            .toBe('https://github.com/alice.png?size=40')
    });

    test('getAvatarHtml: normal user → sized lazy <img>; bot/app actor → no-network glyph', () => {
        const ctx = {repoUserUrl: 'https://github.com/', getAvatarUrl};

        // Normal user: bounded (?size=40) lazy <img>, never the full-resolution original.
        const normal = getAvatarHtml.call(ctx, 'alice');
        expect(normal).toContain('<img');
        expect(normal).toContain('https://github.com/alice.png?size=40');
        expect(normal).toContain('loading="lazy"');

        // Known bot actor: Font Awesome glyph, no `.png` network request.
        const bot = getAvatarHtml.call(ctx, 'dependabot');
        expect(bot).toContain('fa-github');
        expect(bot).not.toContain('.png');

        // `[bot]`-suffixed app actor: same no-network fallback.
        expect(getAvatarHtml.call(ctx, 'some-app[bot]')).toContain('fa-github')
    })
});
