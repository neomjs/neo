import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AppContentCrossLinkTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import ContentComponent from '../../../../../src/app/content/Component.mjs';
import Markdown        from '../../../../../src/component/Markdown.mjs';

const appName = 'AppContentCrossLinkTest';

// Exercise the VM-free parent renderer directly so the app/content sidenav (state-provider) path is
// not required to assert cross-link behavior.
const renderTicketRefs = (instance, content) => Markdown.prototype.modifyMarkdown.call(instance, content);

/**
 * #12209 — cross-link URLs are a per-content-type config, not a framework-base assumption.
 *
 * Before: `Neo.app.content.Component` (a generic src/ content class) hard-coded
 * `issuesUrl: '#/news/tickets/'`, so every consuming portal view inherited the portal-app route.
 * After: the generic base carries no portal route — it inherits `Neo.component.Markdown`'s neutral
 * GitHub default — and each portal view declares its own cross-link target (the dev-merged views
 * learn / content / tickets / release / blog each set `'#/news/tickets/'` to preserve behavior; PR
 * and Discussion views set their own). The layering is now correct: the framework base stays
 * app-agnostic while the routing decision lives with the app-level view.
 */
test.describe('Neo.app.content.Component cross-link issuesUrl (#12209)', () => {
    test('generic content base no longer bakes in the portal route — inherits the Markdown GitHub default', () => {
        const instance = Neo.create(ContentComponent, {appName});

        // The tickets-specific override is gone; the generic base falls through to Markdown's default.
        expect(instance.issuesUrl).toBe('https://github.com/neomjs/neo/issues/');

        instance.destroy();
    });

    test('base default renders a #N reference as an external GitHub link (new tab)', () => {
        const instance = Neo.create(ContentComponent, {appName}),
              html     = renderTicketRefs(instance, 'see #123 for details');

        expect(html).toContain('href="https://github.com/neomjs/neo/issues/123"');
        expect(html).toContain('target="_blank"');

        instance.destroy();
    });

    test('a per-type internal issuesUrl flows into the rendered #N cross-link (no new tab)', () => {
        // Models exactly what each portal view now declares as its own config.
        const instance = Neo.create(ContentComponent, {appName, issuesUrl: '#/news/tickets/'}),
              html     = renderTicketRefs(instance, 'see #123 for details');

        expect(instance.issuesUrl).toBe('#/news/tickets/');
        expect(html).toContain('href="#/news/tickets/123"');
        // internal routes must NOT open a new tab
        expect(html).not.toContain('target="_blank"');

        instance.destroy();
    });
});
