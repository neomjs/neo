<details>
<summary>Copy the table into its own class</summary>

Create a new file named `apps/earthquakes/view/earthquakes/Table.mjs` with this content.

<pre data-javascript>
import Base from '../../../../node_modules/neo.mjs/src/table/Container.mjs';

class Table extends Base {
    static config = {
        className: 'Earthquakes.view.earthquakes.Table',
        ntype: 'earthquakes-table',
        layout: {ntype: 'vbox', align: 'stretch'},
        style: {width: '100%'},
        columns: [{
            dataField: "timestamp",
            text: "Date",
            renderer: (data) => data.value.toLocaleDateString(undefined, {weekday: "long", year: "numeric", month: "long", day: "numeric"}),
        }, {
            dataField: "humanReadableLocation",
            text: "Location",
        }, {
            dataField: "size",
            text: "Magnitude",
            align: "right",
            renderer: (data) => data.value.toLocaleString(),
        }],
    }
}

Neo.setupClass(Table);

export default Table;
</pre>

</details>

<details>
<summary>Review the code</summary>

- The class extends `Neo.table.Container`
- It has an `ntype`, which we can use when creating an instance, or when debugging
- Each column has `text` and `dataField` configs, and some have renderers

</details>

<details>
<summary>Use the new component</summary>

Edit `apps/earthquakes/view/MainView` and make these changes.

- Add `import EarthquakesTable from './earthquakes/Table.mjs';`
- Replace the `module: Table` with `module: EarthquakesTable`
- Remove the `columns:[]` config
- Leave the `store` config alone

Save and refresh the browser, and your app should run as before.

You can confim that the  new class _is being loaded_ by using DevTools to try to open `earthquakes/Table` &mdash; if it
was imported, it'll be listed.

You can confirm that an instance _was created_ by using the DevTools console and searching for it via

    Neo.first('earthquakes-table')

</details>

<details>
<summary>Here's the code</summary>

<pre data-javascript>
import Base             from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Controller       from './MainViewController.mjs';
import EarthquakesTable from './earthquakes/Table.mjs';
import Store            from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import ViewModel        from './MainViewModel.mjs';

class MainView extends Base {
static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {ntype: 'vbox', align: 'stretch'},
        items: [{
            module: EarthquakesTable,
            store: {
                module: Store,
                model: {
                    fields: [{
                        name: "humanReadableLocation",
                    }, {
                        name: "size",
                    }, {
                        name: "timestamp",
                        type: "Date",
                    }],
                },
                url: "https://apis.is/earthquake/is",
                responseRoot: "results",
                autoLoad: true,
            },
            style: {width: '100%'},
        }],
    }
}

Neo.setupClass(MainView);

export default MainView;
</pre>

</details>

<details>
<summary>Why are some things in `MainView` and not in `Table`?</summary>

When we refactored the table into its own class we didn't move all the configs. Both
the width styling and `store` were left in `MainView`. Why?

It's a matter of re-use and what you need in a given situation. By leaving the width specification
outside the table class we're free to specify a different value the various places we might be using the table.

Similarly, if the store were in the table class, it would be using that specific store and
each instance of the table would have its own instance of the store. If we want multiple
instance of the table with each using a different store &mdash; or if
we wanted to share the store with other components &mdash; then it makes sense for the
store to be outside the table class.

</details>

<details>
<summary>Make a second instance of the table</summary>

To further illustrate that the table is reusable, let's create a second instance.

Simply copy-and-paste the value in the `MainView` `items` with an identical second item.

Save and refresh and you should see two tables.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesTwoTables.png"></img>

</details>

