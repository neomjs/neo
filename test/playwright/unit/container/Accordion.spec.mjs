import {setup} from '../../setup.mjs';

const appName = 'ContainerAccordionUnitTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import VDomHelper     from '../../../../src/vdom/Helper.mjs';
import Accordion      from '../../../../src/container/Accordion.mjs';

/**
 * @summary `maxExpandedItems` caps the open items of a `Neo.container.Accordion`: opening one more closes the item
 * opened first, and lowering the cap closes the items opened first until the rest fit.
 */
test.describe('Neo.container.Accordion maxExpandedItems', () => {
    const createAccordion = async config => {
        const accordion = Neo.create({
            module: Accordion,
            appName,
            items : [1, 2, 3, 4].map(no => ({title: `Section ${no}`, items: [{ntype: 'component', html: `Content ${no}`}]})),
            ...config
        });

        await accordion.initVnode();
        accordion.mounted = true;

        return accordion
    };

    const open = accordion => accordion.items.filter(item => item.expanded).map(item => item.title);

    test('opening one more than the cap closes the item opened first', async () => {
        const accordion = await createAccordion({initialOpen: [0, 1], maxExpandedItems: 2});

        try {
            accordion.items[2].onExpandClick();
            expect(open(accordion)).toEqual(['Section 2', 'Section 3'])
        } finally {
            accordion.destroy()
        }
    });

    test('a lower cap closes the items opened first, and the next open keeps to it', async () => {
        const accordion = await createAccordion({initialOpen: [0, 1, 2], maxExpandedItems: 3});

        try {
            accordion.maxExpandedItems = 1;
            expect(open(accordion)).toEqual(['Section 3']);
            expect(accordion.expandedItems).toEqual([accordion.items[2].id]);

            accordion.items[3].onExpandClick();
            expect(open(accordion)).toEqual(['Section 4'])
        } finally {
            accordion.destroy()
        }
    });

    test('a fractional cap counts whole items, and the first open under 0.5 keeps that item open', async () => {
        const accordion = await createAccordion({maxExpandedItems: 0.5});

        try {
            expect(accordion.maxExpandedItems).toBe(1);

            accordion.items[0].onExpandClick();
            expect(open(accordion)).toEqual(['Section 1']);

            accordion.maxExpandedItems = 2.7;
            expect(accordion.maxExpandedItems).toBe(2);

            accordion.items[1].onExpandClick();
            accordion.items[2].onExpandClick();
            expect(open(accordion)).toEqual(['Section 2', 'Section 3'])
        } finally {
            accordion.destroy()
        }
    });

    test('a cap of 0 lets every item open', async () => {
        const accordion = await createAccordion({initialOpen: [0], maxExpandedItems: 1});

        try {
            accordion.maxExpandedItems = 0;
            accordion.items[1].onExpandClick();
            accordion.items[2].onExpandClick();
            expect(open(accordion)).toEqual(['Section 1', 'Section 2', 'Section 3'])
        } finally {
            accordion.destroy()
        }
    })
});
