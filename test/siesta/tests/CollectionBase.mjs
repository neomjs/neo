import Neo                          from '../../../src/Neo.mjs';
import * as core                    from '../../../src/core/_export.mjs';
import {default as Collection}      from '../../../src/collection/Base.mjs';
import {default as InstanceManager} from '../../../src/manager/Instance.mjs';

let collection, collection2, collection3;

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,        'Neo is imported as a JS module');
        t.ok(Collection, 'Collection is imported as a JS module');
    });

    t.it('Create collection', t => {
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

        t.isStrict(collection.getCount(), 6, 'Collection has 6 items');
        t.isStrict(collection.map.size, 6, 'map has 6 items');
    });

    t.it('Modify collection items', t => {
        collection.add({country: 'Germany', firstname: 'Bastian', githubId: 'bhaustein', lastname: 'Haustein'});

        t.isStrict(collection.getCount(), 7, 'Collection has 7 items');
        t.isStrict(collection.map.size, 7, 'map has 7 items');


        collection.remove('bhaustein');

        t.isStrict(collection.getCount(), 6, 'Collection has 6 items');
        t.isStrict(collection.map.size, 6, 'map has 6 items');

        collection.insert(1, [
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein', lastname: 'Haustein'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',   lastname: 'Fierro'}
        ]);

        t.isStrict(collection.getCount(), 8, 'Collection has 8 items');
        t.isStrict(collection.map.size, 8, 'map has 8 items');

        collection.insert(1, {country: 'Croatia', firstname: 'Grgur', githubId: 'grgur', lastname: 'Grisogono'});

        t.isStrict(collection.getCount(), 9, 'Collection has 9 items');
        t.isStrict(collection.map.size, 9, 'map has 9 items');

        t.isDeeplyStrict(collection.getRange(1, 4), [
            {country: 'USA',      firstname: 'Gerard', githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',  firstname: 'Grgur',  githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia', firstname: 'Jozef',  githubId: 'jsakalos',      lastname: 'Sakalos'}
        ], 'collection.getRange(1, 4)');

        t.isStrict(collection.indexOf('elmasse'), 4, 'collection.indexOf("elmasse") === 4');
    });

    t.it('Sort collection items', t => {
        collection.sorters = [
            {direction: 'DESC', property: 'lastname'},
            {direction: 'ASC',  property: 'firstname'}
        ];

        t.isDeeplyStrict(collection.getRange(), [
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ], 'collection.getRange()');

        collection.sorters[0].property = 'country';

        t.isDeeplyStrict(collection.getRange(), [
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'}
        ], 'collection.getRange()');
    });

    t.it('Clone collection', t => {
        collection2 = collection.clone();

        // todo: clone should use the current filters & sorters
        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ], 'collection2.getRange()');

        collection2.sorters = [
            {direction: 'ASC',  property: 'firstname'},
            {direction: 'DESC', property: 'lastname'}
        ];

        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ], 'collection2.getRange()');

        collection2.filters = [
            {property: 'firstname', value: 'Tobias'}
        ];

        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ], 'collection2.getRange()');

        collection2.add(
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'}
        );

        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ], 'collection2.getRange()');

        t.ok(collection2.isFiltered(), 'collection2.isFiltered()');

        collection2.filters[0].disabled = true;

        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'}
        ], 'collection2.getRange()');

        t.notOk(collection2.isFiltered(), 'collection2.isFiltered()');

        collection2.filters[0].disabled = false;

        t.ok(collection2.isFiltered(), 'collection2.isFiltered()');

        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'}
        ], 'collection2.getRange()');

        collection2.clearFilters();

        t.isDeeplyStrict(collection2.getRange(), [
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'France',    firstname: 'Nigel',   githubId: 'NigeWhite',     lastname: 'White'}
        ], 'collection2.getRange()');

        collection2.clearSorters(true);

        t.isDeeplyStrict(collection2.getRange(), [
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
        ], 'collection2.getRange()');
    });

    t.it('Filter collection', t => {
        collection3 = collection.clone();

        t.isDeeplyStrict(collection3.getRange(), [
            {country: 'USA',       firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu2',        lastname: 'Uhlig2'},
            {country: 'Germany',   firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'Slovakia',  firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'USA',       firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Germany',   firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'Croatia',   firstname: 'Grgur',   githubId: 'grgur',         lastname: 'Grisogono'},
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ], 'collection3.getRange()');

        collection3.remove('mrsunshine');
        collection3.remove('elmasse');

        t.isStrict(collection3.getCount(), 7, 'collection3 count is 7');

        t.diag("filter by firstname, like, 'a'");

        collection3.filters = [{
            includeEmptyValues: true,
            operator          : 'like',
            property          : 'firstname',
            value             : 'a'
        }];

        t.isStrict(collection3.getCount(), 4, 'collection3 count is 4');
        t.isStrict(collection3.allItems.getCount(), 7, 'collection3 allItems count is 7');

        t.diag("Add Max & Nils back");

        collection3.add([
            {country: 'Argentina', firstname: 'Max',     githubId: 'elmasse',       lastname: 'Fierro'},
            {country: 'Germany',   firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'}
        ]);

        t.isStrict(collection3.getCount(), 5, 'collection3 count is 5');
        t.isStrict(collection3.allItems.getCount(), 9, 'collection3 allItems count is 9');
    });
});