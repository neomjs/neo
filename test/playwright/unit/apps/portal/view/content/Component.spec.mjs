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
import TimelineSections from '../../../../../../../apps/portal/store/TimelineSections.mjs';

/**
 * Unit coverage for the shared avatar helpers on the Portal news timeline base
 * `Portal.view.content.Component`. Every timeline view (tickets / pull requests / discussions) renders
 * actor avatars through these, so a 40px timeline avatar fetches GitHub's ~1KB `?size=40` image instead
 * of the full-resolution original, and bot/app actors (whose `<login>.png` 404s) fall back to a
 * no-network glyph. Both helpers are pure (they read only `this.repoUserUrl` / `this.getAvatarUrl`), so
 * they are exercised directly on the prototype with a stub context.
 */
const {getAvatarHtml, getAvatarRecordProps, getAvatarUrl, isBotActor} = Component.prototype;

test.describe('Portal.view.content.Component — shared avatar helpers', () => {
    test('getAvatarUrl bounds the avatar request to ?size=40', () => {
        expect(getAvatarUrl.call({repoUserUrl: 'https://github.com/'}, 'alice'))
            .toBe('https://github.com/alice.png?size=40')
    });

    test('getAvatarHtml: normal user → sized lazy <img>; bot/app actor → no-network glyph', () => {
        const ctx = {repoUserUrl: 'https://github.com/', getAvatarUrl, isBotActor};

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
    });

    test('isBotActor flags known bot/app actors, not normal users', () => {
        expect(isBotActor('dependabot')).toBe(true);
        expect(isBotActor('github-actions')).toBe(true);
        expect(isBotActor('some-app[bot]')).toBe(true);
        expect(isBotActor('alice')).toBe(false)
    });

    test('getAvatarRecordProps: normal user → {image:?size=40}; bot/app actor → {iconCls: github glyph}', () => {
        // Drives the summary-list (SectionsList) avatar shape: a normal user yields a bounded image URL,
        // a bot/app actor yields a glyph class so the summary renders the no-network glyph, not a 404 <img>.
        const ctx = {repoUserUrl: 'https://github.com/', getAvatarUrl, isBotActor};

        expect(getAvatarRecordProps.call(ctx, 'alice')).toEqual({image: 'https://github.com/alice.png?size=40'});
        expect(getAvatarRecordProps.call(ctx, 'dependabot')).toEqual({iconCls: 'fa-brands fa-github'})
    })
});

/**
 * The summary list (`Neo.app.content.SectionsList`) renders `record.iconCls` for bot/app actors. That
 * only works if `iconCls` is a declared field on the `Portal.model.TimelineSection` contract — an
 * undeclared field is dropped during record hydration, so the glyph would silently vanish from the
 * summary even though the parser emitted it. This pins the field on the model.
 */
test.describe('Portal.model.TimelineSection — iconCls hydration contract', () => {
    test('iconCls survives store hydration as a declared field, alongside image', () => {
        const store = Neo.create(TimelineSections, {
            id  : 'portal-timeline-iconcls-hydration-test',
            data: [
                {id: 'bot',   iconCls: 'fa-brands fa-github'},
                {id: 'human', image  : 'https://github.com/alice.png?size=40'}
            ]
        });

        try {
            // An undeclared field would be undefined here → the summary bot-glyph would silently break.
            expect(store.get('bot').iconCls).toBe('fa-brands fa-github');
            expect(store.get('human').image).toBe('https://github.com/alice.png?size=40')
        } finally {
            store.destroy()
        }
    })
});
