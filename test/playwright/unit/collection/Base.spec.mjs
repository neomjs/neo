import {setup} from '../../setup.mjs';

const appName = 'CollectionBaseTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

/**
 * @summary Tests for Neo.collection.Base
 * This suite tests the fundamental CRUD (Create, Read, Update, Delete) operations,
 * as well as sorting, filtering, and cloning functionalities of the base Collection class.
 * Ensuring the stability of Neo.collection.Base is critical as it is the foundation
 * for all data stores and collections within the framework.
 */
test.describe.serial('Neo.collection.Base', () => {
    let collection, collection2, collection3;

    test('Create collection', () => {
        collection = Neo.create(Collection, {
            keyProperty: 'githubId',
            items: [
                {country: 'Germany',  firstname: 'Tobias', githubId: 'tobiu',         lastname: 'Uhlig'},
                {country: 'Germany',  firstname: 'Tobias', githubId: 'tobiu2',        lastname: 'Uhlig2'},
                {country: 'USA',      firstname: 'Rich',   githubId: 'rwaters',       lastname: 'Waters'},
                {country: 'Germany',  firstname: 'Nils',   githubId: 'mrsunshine',    lastname: 'Dehl'},
                {country: 'USA',      firstname: 'Gerard', githubId: 'camtnbikerrwc', lastname: 'Horan'},
                {country: 'Slovakia', firstname: 'Jozef',  githubId: 'jsakalos',      lastname: 'Sakalos'}
            ],
            sorters: [
                {direction: 'ASC',  property: 'firstname'},
                {direction: 'DESC', property: 'lastname'}
            ]
        });

        expect(collection.count).toBe(6);
        expect(collection.map.size).toBe(6);
    });

    test('Modify collection items', () => {
        collection.add({country: 'Germany', firstname: 'Bastian', githubId: 'bhaustein', lastname: 'Haustein'});

        expect(collection.count).toBe(7);
        expect(collection.map.size).toBe(7);

        collection.remove('bhaustein');

        expect(collection.count).toBe(6);
        expect(collection.map.size).toBe(6);

        collection.insert(1, [
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein', lastname: 'Haustein'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',   lastname: 'Fierro'}
        ]);

        expect(collection.count).toBe(8);
        expect(collection.map.size).toBe(8);

        collection.insert(1, {country: 'Croatia', firstname: 'Grgur', githubId: 'grgur', lastname: 'Grisogono'});

        expect(collection.count).toBe(9);
        expect(collection.map.size).toBe(9);

        expect(collection.getRange(1, 4)).toEqual([
            {country: 'USA',      firstname: 'Gerard', githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',  firstname: 'Grgur',  githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia', firstname: 'Jozef',  githubId: 'jsakalos',      lastname: 'Sakalos'}
        ]);

        expect(collection.indexOf('elmasse')).toBe(4);
    });

    test('Sort collection items', () => {
        collection.sorters = [
            {direction: 'DESC', property: 'lastname'},
            {direction: 'ASC',  property: 'firstname'}
        ];

        expect(collection.getRange()).toEqual([
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ]);

        collection.sorters[0].property = 'country';

        expect(collection.getRange()).toEqual([
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'}
        ]);
    });

    test('Clone collection', () => {
        collection2 = collection.clone();

        // todo: clone should use the current filters & sorters
        expect(collection2.getRange()).toEqual([
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ]);

        collection2.sorters = [
            {direction: 'ASC',  property: 'firstname'},
            {direction: 'DESC', property: 'lastname'}
        ];

        expect(collection2.getRange()).toEqual([
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ]);

        collection2.filters = [
            {property: 'firstname', value: 'Tobias'}
        ];

        expect(collection2.getRange()).toEqual([
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ]);

        collection2.add(
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'}
        );

        expect(collection2.getRange()).toEqual([
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ]);

        expect(collection2.isFiltered()).toBeTruthy();

        collection2.filters[0].disabled = true;

        expect(collection2.getRange()).toEqual([
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
        ]);

        expect(collection2.isFiltered()).toBeFalsy();

        collection2.filters[0].disabled = false;

        expect(collection2.isFiltered()).toBeTruthy();

        expect(collection2.getRange()).toEqual([
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ]);

        collection2.clearFilters();

        expect(collection2.getRange()).toEqual([
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
        ]);

        collection2.clearSorters(true);

        expect(collection2.getRange()).toEqual([
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ]);
    });

    test('Filter collection', () => {
        collection3 = collection.clone();

        expect(collection3.getRange()).toEqual([
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ]);

        collection3.remove('mrsunshine');
        collection3.remove('elmasse');

        expect(collection3.count).toBe(7);

        collection3.filters = [{
            includeEmptyValues: true,
            operator          : 'like',
            property          : 'firstname',
            value             : 'a'
        }];

        expect(collection3.count).toBe(4);
        expect(collection3.allItems.count).toBe(7);

        collection3.add([
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ]);

        expect(collection3.count).toBe(5);
        expect(collection3.allItems.count).toBe(9);
    });

    test('Add & remove at same time', () => {
        collection = Neo.create(Collection, {
            items: [
                {id: 'a'},
                {id: 'b'},
                {id: 'c'},
                {id: 'd'},
                {id: 'e'},
                {id: 'f'}
            ]
        });

        collection.splice(2, [{id: 'a'}, {id: 'd'}, {id: 'f'}], [{id: 'x'}, {id: 'y'}, {id: 'z'}]);

        expect(collection.getRange()).toEqual([
            {id: 'b'},
            {id: 'c'},
            {id: 'x'},
            {id: 'y'},
            {id: 'z'},
            {id: 'e'}
        ]);
    });

    test('Move collection items', () => {
        let moveCollection = Neo.create(Collection, {
            items: [
                {id: 'a'},
                {id: 'b'},
                {id: 'c'},
                {id: 'd'},
                {id: 'e'}
            ]
        });

        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}]);

        // Move item forward
        moveCollection.move(1, 2);
        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'c'}, {id: 'b'}, {id: 'd'}, {id: 'e'}]);

        // Swap adjacent items (backward)
        moveCollection.move(2, 1);
        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}]);

        // Move item backward
        moveCollection.move(3, 1);
        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'd'}, {id: 'b'}, {id: 'c'}, {id: 'e'}]);

        // Move item forward
        moveCollection.move(1, 3);
        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}]);

        // Swap adjacent items (forward)
        moveCollection.move(0, 1);
        expect(moveCollection.getRange()).toEqual([{id: 'b'}, {id: 'a'}, {id: 'c'}, {id: 'd'}, {id: 'e'}]);

        // Swap adjacent items (backward)
        moveCollection.move(1, 0);
        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}]);

        // Move to end
        moveCollection.move(0, 4);
        expect(moveCollection.getRange()).toEqual([{id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}, {id: 'a'}]);

        // Move to start
        moveCollection.move(4, 0);
        expect(moveCollection.getRange()).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}, {id: 'e'}]);
    });
});
