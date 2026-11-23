import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalLearnComponentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import LearnComponent from '../../../../../../../apps/portal/view/learn/Component.mjs';

test.describe('Portal.view.learn.Component — rewriteLinks spoke & repo routing', () => {
    test('upgrades https://neomjs.com/learn/<id> to in-SPA #/learn/<id> when loaded in the tree store and keeps external fallback otherwise', () => {
        const loadedIds = new Set(['agentos/MemoryCore', 'institution/CockpitTour']);
        const ctx       = {
            contentRoute    : '#/learn/',
            record          : {id: 'benefits/ArchitectureOverview'},
            getContentPath  : () => `${Neo.config.basePath}learn/benefits/ArchitectureOverview.md`,
            getStateProvider: () => ({
                getData : () => `${Neo.config.basePath}learn/`,
                getStore: name => name === 'tree' ? {get: id => loadedIds.has(id) ? {id} : undefined} : null
            }),
            resolveContentId: LearnComponent.prototype.resolveContentId
        };

        const html = [
            '<p><a href="https://neomjs.com/learn/agentos/MemoryCore#wal">Memory Core</a></p>',
            '<p><a href="https://neomjs.com/learn/institution/CockpitTour">Cockpit Tour</a></p>',
            '<p><a href="https://neomjs.com/learn/guides/devindex/Engine">DevIndex Engine</a></p>',
            '<p><a href="../agentos/NeuralLink.md">Neural Link</a></p>'
        ].join('\n');

        const rewritten = LearnComponent.prototype.rewriteLinks.call(ctx, html);

        expect(rewritten).toContain('href="#/learn/agentos/MemoryCore#wal"');
        expect(rewritten).toContain('href="#/learn/institution/CockpitTour"');
        expect(rewritten).toContain('<a href="https://neomjs.com/learn/guides/devindex/Engine" target="_blank">');
        expect(rewritten).toContain('href="#/learn/agentos/NeuralLink"');
    });

    test('falls back to external target="_blank" links when no tree store is loaded', () => {
        const ctx = {
            contentRoute    : '#/learn/',
            record          : {id: 'benefits/Introduction'},
            getContentPath  : LearnComponent.prototype.getContentPath,
            getStateProvider: () => ({getData: () => `${Neo.config.basePath}learn/`, getStore: () => null}),
            resolveContentId: LearnComponent.prototype.resolveContentId
        };

        const rewritten = LearnComponent.prototype.rewriteLinks.call(
            ctx,
            '<a href="https://neomjs.com/learn/agentos/MemoryCore">Memory Core</a><a href="../agentos/NeuralLink.md">Neural Link</a>'
        );

        expect(rewritten).toContain('<a href="https://neomjs.com/learn/agentos/MemoryCore" target="_blank">Memory Core</a>');
        expect(rewritten).toContain('href="#/learn/agentos/NeuralLink"');
    });
});
