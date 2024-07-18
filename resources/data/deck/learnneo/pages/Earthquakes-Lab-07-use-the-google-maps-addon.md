<details>
<summary>Get the code for the custom add-on</summary>
At the time this tutorial was written, the Neo.mjs Google Maps addon was about to be updated to 
accomodate Google's "AdvancedMarker" class. Until that's ready, we're going to use a modified version of the add-on. 

Download and unzip this file, and copy the two source files to the corresponding subdirectories in
your workspace's `src` directory. Note that `src` already contains some files, so don't replace the whole
directory, but instead, move the files to their individual locations.

<a href="https://s3.amazonaws.com/mjs.neo.learning.images/zip/src.zip">src.zip</a>

<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/CopyGoogleMapsFiles.png" width="30%%"></img>
</details>

<details>
<summary>Specify the main-thread add-on</summary>

Edit `apps/earthquakes/neo-config.json` and add entries for the Google Maps add-on and the map key.

<pre data-javascript>
{
    "appPath": "../../apps/earthquakes/app.mjs",
    "basePath": "../../",
    "environment": "development",
    "mainPath": "../node_modules/neo.mjs/src/Main.mjs",
    "mainThreadAddons": [
        "DragDrop",
        "WS/GoogleMaps",
        "Stylesheet"
    ],
    "googleMapsApiKey": "AIzaSyD4Y2xvl9mGT8HiVvQiZluT5gah3OIveCE",
    "themes"          : ["neo-theme-neo-light"],
    "workerBasePath": "../../node_modules/neo.mjs/src/worker/"
}
</pre>

It's unusual to need to edit `neo-config.json`. The app theme is specified there, and so are main thread add-ons.
In our case, we're adding `WS/GoogleMaps` which in turn requires that we specify the map key. The `WS/`
prefix tells Neo.mjs that the add-on is in our workspace, rather than an add-on provided by Neo.mjs.

Save and refresh, and you'll see a console log emanating from the plugin.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/GoogleMapsLoaded.png"></img>

</details>

<details>
<summary>Add the required fields to the records</summary>

The Google Maps component has a `markerStore` property, which is a reference to a store whose records have
the properties `title` and `location`, where `location` is of the form `{lat: 0, lng: 0}`. The `fields:[]`
lets us implement those via two properties:

- `mapping` &mdash; the path to a feed property holding the value
- `calculate` &mdash; a function that returns a value

Edit `apps/earthquakes/view/MainViewModel.mjs` and modify `fields` as follows.

<pre data-javascript>
fields: [{
    name: "humanReadableLocation",
}, {
    name: "size",
}, {
    name: "timestamp",
    type: "Date",
}, {
    name: 'title',
    mapping: "humanReadableLocation"
}, {
    name: "position",
    calculate: (data, field, item)=>({lat: item.latitude, lng: item.longitude})
}],
</pre>

As you can see, _title_ is mapped to the existing feed value _humanReadableLocation_, and _position_ is
calculated by returning an object with _lat_ and _lng_ set to the corresponding values from the feed.

Save and refresh _earthquakes_. You can use the debugger to inspect the store via _Shift-Ctrl-right-click_ and
putting the main view into a global variable. Then run

    temp1.getModel().stores.earthquakes.items

Look at one of the items and you should see that _title_ and _location_ are in each record.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/StoreHasTitleAndLocation.png"></img>

</details>

<details>
<summary>Use the Google Map Component</summary>

We're going to replace the top table with a Google Map. To do that we need to import the Google Maps component
and show it implace of the top table. The map should be centered on Iceland. To wit

<pre>
{
    module: GoogleMapsComponent,
    flex: 1,
    center: {
        lat: 64.8014187,
        lng: -18.3096357
    },
    zoom: 6
}
</pre>

If we replace the top table with the map, `view/MainView.mjs` ends up with this content.

<pre data-javascript>

import Container           from '../container/Base.mjs';
import Controller          from './MainViewController.mjs';
import EarthquakesTable    from './earthquakes/Table.mjs';
import GoogleMapsComponent from '../component/wrapper/GoogleMaps.mjs';
import ViewModel           from './MainViewModel.mjs';

class MainView extends Container {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',
        controller: {module: Controller},
        model: {
            module: ViewModel
        },

        layout: { ntype: 'vbox', align: 'stretch' },
        items: [{
            module: GoogleMapsComponent,
            flex: 1,
            center: {
                lat: 64.8014187,
                lng: -18.3096357
            },
            zoom: 6
        },{
            module: EarthquakesTable,
            bind: {
                store: 'stores.earthquakes'
            },
            style: {width: '100%'},
            wrapperStyle: {
                height: 'auto' // Because neo-table-wrapper sets height:'100%', which it probably shouldn't
            }
        }],
    }
}

Neo.setupClass(MainView);

export default MainView;
</pre>

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/CenteredMap.png"></img>


</details>

<details>
<summary>Show the markers</summary>

The markers are shown by setting up the marker store, which is a regular store whose records must contain
_location_ and _title_. We assign the store using a `bind`, just like we did with the tables.

Add this config to the map.

<pre data-javascript>
bind: {
    markerStore: 'stores.earthquakes'
},
</pre>
<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/InitialMapWithMarkers.png"></img>

</details>

