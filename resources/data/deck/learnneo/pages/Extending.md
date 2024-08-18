In theory, a Neo.mjs app could be defined in a single `.mjs` source file. But that would be very hard to 
maintain, and any reusable configs would have to be duplicated. Instead, each of your views and reusable 
widgets will be defined as its own class. The result is simpler views which are inherently reusable and easier 
to test.

Consider this code. It's a panel with a header and a table. The table has a store. 

<pre data-neo>
import Button from '../button/Base.mjs';
import Panel  from '../container/Panel.mjs';
import Table  from '../table/Container.mjs';

class MainView extends Panel {
    static config = {
        className: 'GS.extending1.MainView',
        headers  : [{
            dock : 'top',
            items: [{
                module : Button,
                text   : 'She loves me...',
                handler: () => Neo.Main.alert({message: 'Yeah, yeah yeah!'})
            }]
        }],
        items: [{
            module: Table,
            store : {
                autoLoad: true,
                url     : '../../resources/data/deck/learnneo/data/theBeatles.json',
                model   : {
                    fields: [{name: 'first'}, {name: 'last'}, {name: 'dob', type: 'date'}]
                }
            },
            columns: [{
                dataField: 'first',
                text     : 'First'
            }, {
                dataField: 'last',
                text     : 'Last'
            }]
        }]
    }
}

Neo.setupClass(MainView);
</pre>

If you wanted, any of the configs can be refactored into their own class. Here, the button, store, and table
have been refactored into their own classes, and the main view is using them. The main view is simpler and
more abstract, and each class can be reused, tested, and maintained independently. 

<pre data-neo>
import Button from '../button/Base.mjs';
import Panel  from '../container/Panel.mjs';
import Store  from '../data/Store.mjs';
import Table  from '../table/Container.mjs';

class BeatlesButton extends Button {
    static config = {
        className: 'Example.view.BeatlesButton',
        text     : 'She loves me...',
        handler  : () => Neo.Main.alert({message: 'Yeah, yeah yeah!'})
    }
}
Neo.setupClass(BeatlesButton);

class BeatlesStore extends Store {
    static config = {
        className: 'Example.view.BeatlesStore',
        autoLoad : true,
        url      : '../../resources/data/deck/learnneo/data/theBeatles.json',
        model    : {
            fields: [{name: 'first'}, {name: 'last'}, {name: 'dob', type: 'date'}]
        }
    }
}
Neo.setupClass(BeatlesStore);

class BeatlesTable extends Table {
    static config = {
        className: 'Example.view.BeatlesTable',
        columns  : [{
            dataField: 'first',
            text     : 'First'
        }, {
            dataField: 'last',
            text     : 'Last'
        }]
   }
}
Neo.setupClass(BeatlesTable);

class MainView extends Panel {
    static config = {
        className: 'GS.extending2.MainView',
        headers  : [{
            dock : 'top',
            items: [BeatlesButton]
        }],
        items : [{
            module: BeatlesTable,
            store : BeatlesStore
        }]
    }
}
Neo.setupClass(MainView);
</pre>

There are several use-cases for creating your own classes:

- For reuse
- To isolate complexity
- To add events or methods to the new class
- To test the component independently
