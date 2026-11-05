import {setup} from '../../../../../setup.mjs';

const appName = 'DocsHierarchyTreeListTest';

setup({
    neoConfig: {allowVdomUpdatesInTests: true, unitTestMode: true, useDomApiRenderer: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../../src/core/_export.mjs';
import CoreBase          from '../../../../../../../src/core/Base.mjs';
import InstanceManager   from '../../../../../../../src/manager/Instance.mjs';
import Collection        from '../../../../../../../src/collection/Base.mjs';
import Container         from '../../../../../../../src/container/Base.mjs';
import HierarchyTreeList from '../../../../../../../docs/app/view/classdetails/HierarchyTreeList.mjs';
import MembersList       from '../../../../../../../docs/app/view/classdetails/MembersList.mjs';

const base   = 'Neo.core.Base', target = 'Neo.data.Store', first = 'Neo.core.Observable',
      second = 'Neo.worker.mixin.RemoteMethodAccess';

/** @summary Creates source-shaped doclets without importing or registering fixture classes. */
function classDoc(neoClassName, augments = [], mixes = []) {
    return {id: `class-${neoClassName}`, $kind: 'class', kind: 'class', neoClassName,
        name: neoClassName.split('.').at(-1), ...(augments.length && {augments}), mixes,
        meta: {filename: 'Fixture.mjs', lineno: 1, path: '/neo/src', srcPath: 'src/Fixture.mjs'}}
}

/** @summary Keeps canonical source ownership separate from JSDoc's short memberof names. */
function method(id, neoClassName, name, options = {}) {
    return {id, neoClassName, name, memberof: 'ShortName', kind: 'function', $kind: 'method',
        scope: 'instance', meta: {filename: 'Fixture.mjs', lineno: 10, path: '/neo/src', srcPath: 'src/Fixture.mjs'}, ...options}
}

/** @summary Matches the global-scoped reactive configs emitted by the docs generator. */
function config(id, neoClassName, name) {
    return method(id, neoClassName, name, {
        kind: 'member', $kind: 'property', scope: 'global', tags: [{title: 'reactive'}]
    })
}

/** @summary Exercises the real hierarchy/member connection and disposes it even after an assertion fails. */
async function withDocs(items, selected, callback) {
    Neo.main ??= {};
    Neo.main.addon ??= {};
    Neo.main.addon.HighlightJS ??= {syntaxHighlightInit: () => {}};

    const mainStore = Neo.create(Collection, {keyProperty: 'id', items}),
          root      = Neo.create(Container, {
              appName, ntype: 'main-container', store: mainStore,
              items: [{module: Container, ntype: 'classdetails-maincontainer', items: [
                  {module: HierarchyTreeList, structureData: {className: selected}}, {module: MembersList}
              ]}]
          }),
          tree = root.down('classhierarchy-treelist'),
          members = root.down('classdetails-memberslist');

    try {
        await Promise.all([root.ready(), tree.ready(), members.ready()]);
        await callback({tree, members, mainStore})
    } finally {
        root.destroy();
        mainStore.destroy()
    }
}

/** @summary Covers provider selection and runtime member precedence without generated-output dependencies. */
test.describe('Docs.view.classdetails.HierarchyTreeList', () => {
    test('keeps ancestor classes unchecked until toggled', async () => {
        const middle = 'Neo.component.Base', selected = 'Neo.button.Base';
        await withDocs([
            classDoc(base), classDoc(middle, [base]), classDoc(selected, [middle]),
            config('base-id', base, 'id_'), config('middle-cls', middle, 'cls_'), config('selected-text', selected, 'text_')
        ], selected, ({tree, members}) => {
            for (const name of [base, middle, selected]) {
                const record = tree.store.get(`class-${name}`);
                expect(record.checked).toBe(name === selected);
                expect(record.sourceClassName).toBe(name);
                expect(record.name).toBe(name);
                expect(tree.getVdomChild(tree.getItemId(record.id)).cls.includes('unchecked')).toBe(name !== selected)
            }
            expect(members.store.items.map(item => item.id)).toEqual(['selected-text']);
            tree.onLeafItemClick(tree.store.get(`class-${middle}`));
            expect(members.store.items.map(item => item.id)).toEqual(['middle-cls', 'selected-text'])
        })
    });

    test('deduplicates providers, checks direct mixins, and toggles their original members', async () => {
        const middle   = 'Neo.collection.Base', ancestorMixin = 'Neo.main.mixin.TouchDomEvents',
              supplied = method('observable-on', first, 'on');
        await withDocs([
            classDoc(base), classDoc(middle, [base], [first, ancestorMixin]),
            classDoc(target, [middle], [first, second]), classDoc(first), classDoc(second), classDoc(ancestorMixin),
            method('own', target, 'load'), supplied, method('direct', second, 'remote'), method('ancestor', ancestorMixin, 'touch')
        ], target, ({tree, members}) => {
            const providers  = tree.store.items.filter(item => item.isMixin),
                  observable = providers.find(item => item.sourceClassName === first);
            expect(providers.map(item => item.sourceClassName).sort()).toEqual([first, second, ancestorMixin].sort());
            for (const provider of providers) {
                expect(provider.name).toBe(`${provider.sourceClassName} (mixin)`);
                expect(provider.checked).toBe(provider.sourceClassName !== ancestorMixin)
            }
            expect(tree.store.get(`class-${base}`).checked).toBe(false);
            expect(tree.store.get(`class-${middle}`).checked).toBe(false);
            expect(tree.store.items.at(-1).isMixin).toBe(true);
            expect(members.targetClassName).toBe(target);
            expect(members.store.items.map(item => item.id).sort()).toEqual(['direct', 'observable-on', 'own']);
            expect(members.store.get('observable-on')).toBe(supplied);
            tree.onLeafItemClick(observable);
            expect(members.store.items.map(item => item.id).sort()).toEqual(['direct', 'own']);
            tree.onLeafItemClick(observable);
            expect(members.store.get('observable-on')).toBe(supplied);
            for (const record of tree.store.items.filter(item => item.checked)) tree.onLeafItemClick(record);
            expect(members.store.count).toBe(0)
        })
    });

    test('preserves reactive source names across repeated rendering and filtering', async () => {
        const own = config('own-mode', target, 'mode_'), mixed = config('mixed-enabled', first, 'enabled_');
        await withDocs([classDoc(target, [], [first]), classDoc(first), own, mixed], target, ({members, mainStore}) => {
            for (const query of ['mode', '', 'enabled', '']) {
                members.filterMembersQuery = query;
                members.onRefreshClassMembers();
                expect(mainStore.get('own-mode').name).toBe('mode_');
                expect(mainStore.get('mixed-enabled').name).toBe('enabled_')
            }
        })
    });

    test('tolerates repeated, cyclic and missing provider metadata without duplicate tree rows', async () => {
        await withDocs([
            classDoc(target, [], [first, first, 'Neo.missing.Provider']),
            classDoc(first, [], [second]), classDoc(second, [], [first]),
            method('own', target, 'load'), method('mixed', first, 'on')
        ], target, ({tree, members}) => {
            const providers = tree.store.items.filter(item => item.isMixin);
            expect(new Set(providers.map(item => item.sourceClassName)).size).toBe(3);
            expect(providers.length).toBe(3);
            expect(members.store.items.map(item => item.id).sort()).toEqual(['mixed', 'own'])
        })
    });

    test('later mixin methods win at their class level without hiding static class methods', async () => {
        await withDocs([
            classDoc(target, [], [first, second]), classDoc(first), classDoc(second),
            method('own', target, 'run'), method('static-own', target, 'run', {scope: 'static'}),
            method('first', first, 'run'), method('second', second, 'run')
        ], target, ({tree, members}) => {
            const ids      = () => members.store.items.map(item => item.id).sort(),
                  provider = name => tree.store.items.find(item => item.isMixin && item.sourceClassName === name);
            expect(ids()).toEqual(['second', 'static-own']);
            tree.onLeafItemClick(provider(second));
            expect(ids()).toEqual(['first', 'static-own']);
            tree.onLeafItemClick(provider(first));
            expect(ids()).toEqual(['own', 'static-own'])
        })
    });

    test('retains private, protected and static visibility controls for selected sources', async () => {
        await withDocs([
            classDoc(target, [], [first]), classDoc(first),
            method('public', first, 'on'), method('private', first, 'internal', {access: 'private'}),
            method('protected', first, 'hook', {access: 'protected'}),
            method('static', target, 'factory', {scope: 'static'})
        ], target, ({members}) => {
            const ids = () => members.store.items.map(item => item.id).sort();
            expect(ids()).toEqual(['private', 'protected', 'public', 'static']);
            members.showPrivateMembers = false;
            members.showProtectedMembers = false;
            members.showStaticMembers = false;
            expect(ids()).toEqual(['public'])
        })
    });

    test('existing reactive class setters win while the first mixin introduces a new setter', async () => {
        await withDocs([
            classDoc(base), classDoc(target, [base], [first, second]), classDoc(first), classDoc(second),
            config('own-mode', target, 'mode_'), config('base-limit', base, 'limit_'),
            config('first-mode', first, 'mode_'), config('second-mode', second, 'mode_'),
            config('first-limit', first, 'limit_'), config('first-new', first, 'enabled_'),
            config('second-new', second, 'enabled_')
        ], target, ({tree, members}) => {
            expect(members.store.items.filter(item => item.name === 'mode_').map(item => item.id)).toEqual(['own-mode']);
            expect(members.store.items.filter(item => item.name === 'enabled_').map(item => item.id)).toEqual(['first-new']);
            tree.onLeafItemClick(tree.store.get(`class-${base}`));
            expect(members.store.items.filter(item => item.name === 'limit_').map(item => item.id)).toEqual(['base-limit'])
        })
    });

    test('plain class config precedence follows the constructed instance rather than its mixed prototype', async () => {
        /** @summary Supplies a plain prototype value through mixin application. */
        class PlainMixin extends CoreBase {
            static config = {className: 'Test.Unit.DocsMixins.PlainMixin', mode: 'mixin'}
        }
        PlainMixin = Neo.setupClass(PlainMixin);
        /** @summary Retains its own config value for instance construction after prototype mixing. */
        class PlainConsumer extends CoreBase {
            static config = {className: 'Test.Unit.DocsMixins.PlainConsumer', mixins: [PlainMixin], mode: 'class'}
        }
        PlainConsumer = Neo.setupClass(PlainConsumer);
        const instance     = Neo.create(PlainConsumer),
              consumerName = PlainConsumer.prototype.className,
              mixinName    = PlainMixin.prototype.className;
        await instance.ready();
        try {
            expect(PlainConsumer.prototype.mode).toBe('mixin');
            expect(instance.mode).toBe('class');
            await withDocs([
                classDoc(consumerName, [], [mixinName]), classDoc(mixinName),
                method('own', consumerName, 'mode', {kind: 'member', $kind: 'property', scope: 'global'}),
                method('mixed', mixinName, 'mode', {kind: 'member', $kind: 'property', scope: 'global'})
            ], consumerName, ({members}) => {
                expect(members.store.items.map(item => item.id)).toEqual(['own'])
            })
        } finally {
            instance.destroy()
        }
    });

    test('omits static mixin helpers and runtime-excluded metadata from supplied members', async () => {
        const ignored = ['_name', 'classConfigApplied', 'className', 'constructor', 'id', 'isClass', 'mixin', 'ntype',
            'observable', 'toJSON'];
        await withDocs([
            classDoc(target, [], [first]), classDoc(first), method('mixed-on', first, 'on'),
            method('mixed-static', first, 'helper', {scope: 'static'}),
            method('own-static', target, 'helper', {scope: 'static'}),
            ...ignored.map(name => method(`ignored-${name}`, first, name))
        ], target, ({members}) => {
            expect(members.store.items.map(item => item.id).sort()).toEqual(['mixed-on', 'own-static'])
        })
    });
});
