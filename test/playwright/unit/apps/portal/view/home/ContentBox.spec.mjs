import {setup} from '../../../../../setup.mjs';

const appName = 'PortalHomeContentBoxTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../../../../src/vdom/Helper.mjs';
import ContentBox         from '../../../../../../../apps/portal/view/home/ContentBox.mjs';

const brainDocUrl = 'https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/MemoryCore.md';

test.describe('Portal.view.home.ContentBox', () => {
    test('an absolute URL opens in a new tab, and a hash route drops the target again', async () => {
        const box = Neo.create(ContentBox, {
            appName,
            header: 'Active Hybrid GraphRAG',
            route : brainDocUrl
        });

        const {vnode} = await box.initVnode();

        expect(vnode.attributes.href).toBe(brainDocUrl);
        expect(vnode.attributes.target).toBe('_blank');

        box.mounted = true;

        const {deltas} = await box.set({route: '#/learn/agentos/NeuralLink'});

        expect(deltas.find(delta => delta.id === box.id)?.attributes).toEqual({
            href  : '#/learn/agentos/NeuralLink',
            target: null
        });

        box.destroy()
    })
});
