In this lab you'll set up an event handler for the table and map.

<details>
<summary>Add a listener to the table</summary>

Tables fire a select event, passing an object that contains a reference to the corresponding row.

Add this table config:

    listeners: {
        select: (data) => console.log(data.record)
    }

Save and refresh, then click on a table row. If you look at the debugger console you'll see the record being logged.

Just for fun, expand the logged value and look for the size property. If you recall, that's a value from the feed, and one of the things we configured in the store's fields:[].

In the console, click on the ellipses by size and enter a new value, like 2.5. (Don't enter a larger value, or you may destroy that part of Iceland.)

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/LogTableClick.png"></img>

After changing the value you should immediately see it reflected in the table row.

</details>

<details>
<summary>Add a listener to a map event
</summary>

Now add a `markerClick` listener to the Google Map.

    listeners: {
        markerClick: data => console.log(data.data.record)
    },

Save, refresh, and confirm that you see the value logged when you click on a map marker.

</details>
