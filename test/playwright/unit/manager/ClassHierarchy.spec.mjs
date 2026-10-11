import {setup} from '../../setup.mjs';

setup();

import {test, expect}        from '@playwright/test';

import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import ClassHierarchyManager from '../../../../src/manager/ClassHierarchy.mjs';
import Button                from '../../../../src/button/Base.mjs';

/**
 * @summary Tests the ClassHierarchyManager registry and its isA() ancestry lookup.
 *
 * isA() walks the registered parentClassName chain of a descendant until it either meets the
 * requested ancestor or reaches Neo.core.Base. The walk must not depend on the shape of the
 * chain between Neo.component.Base and Neo.core.Base, since intermediate classes can sit there.
 */
test.describe('ManagerClassHierarchy', () => {
    test('Module imports', () => {
        expect(Neo).toBeDefined();
        expect(ClassHierarchyManager).toBeDefined();
        expect(Button).toBeDefined();
    });

    test('Registered classes carry their parentClassName', () => {
        expect(ClassHierarchyManager.get('Neo.core.Base').parentClassName).toBeNull();
        expect(ClassHierarchyManager.get('Neo.component.Abstract').parentClassName).toBe('Neo.core.Base');
        expect(ClassHierarchyManager.get('Neo.component.Base').parentClassName).toBe('Neo.component.Abstract');
        expect(ClassHierarchyManager.get('Neo.button.Base').parentClassName).toBe('Neo.component.Base');
    });

    test('isA() resolves direct and transitive ancestors', () => {
        expect(ClassHierarchyManager.isA('Neo.button.Base', 'Neo.button.Base')).toBe(true);
        expect(ClassHierarchyManager.isA('Neo.button.Base', 'Neo.component.Base')).toBe(true);
        expect(ClassHierarchyManager.isA('Neo.button.Base', 'Neo.core.Base')).toBe(true);
        expect(ClassHierarchyManager.isA('Neo.component.Base', 'Neo.component.Abstract')).toBe(true);
        expect(ClassHierarchyManager.isA('Neo.component.Base', 'Neo.core.Base')).toBe(true);
    });

    test('isA() finds ancestors that sit between component.Base and core.Base', () => {
        expect(ClassHierarchyManager.isA('Neo.button.Base', 'Neo.component.Abstract')).toBe(true);
    });

    test('isA() rejects non-ancestors', () => {
        expect(ClassHierarchyManager.isA('Neo.component.Base', 'Neo.button.Base')).toBe(false);
        expect(ClassHierarchyManager.isA('Neo.core.Base', 'Neo.component.Base')).toBe(false);
        expect(ClassHierarchyManager.isA('Neo.button.Base', 'Neo.manager.ClassHierarchy')).toBe(false);
        expect(ClassHierarchyManager.isA('Neo.button.Base', 'Neo.does.not.Exist')).toBe(false);
    });

    test('isA() memoizes its results', () => {
        const {isAQueryMap} = ClassHierarchyManager;

        ClassHierarchyManager.isA('Neo.button.Base', 'Neo.component.Abstract');
        ClassHierarchyManager.isA('Neo.button.Base', 'Neo.does.not.Exist');
        ClassHierarchyManager.isA('Neo.button.Base', 'Neo.button.Base');

        expect(isAQueryMap.get('Neo.button.Base,Neo.component.Abstract')).toBe(true);
        expect(isAQueryMap.get('Neo.button.Base,Neo.does.not.Exist')).toBe(false);
        expect(isAQueryMap.has('Neo.button.Base,Neo.button.Base')).toBe(false);
    });
});
