## Study the Code

As you hopefully have noticed by now, this entire multi-window app is created based on Neo.mjs.

You can learn a lot by studying the code-base carefully:
<a target="_blank" href="https://github.com/neomjs/neo/tree/dev/apps/portal">Portal App Code</a>

Please give us a heads-up, in case there are specific topics which you would like to see
getting covered here.

## Easter Eggs

Every good app needs to have some meaningful Easter eggs.

### Examples: Resort TabHeaderButtons via Drag&Drop

Did you notice that you can resort the Tabs inside <a href="#/examples">Examples</a>?

After re-sorting, the routing and the tab.Strip animations will still work. Enjoy!

### Switch the main navigation layout to an animated Cube

Fair warning: this animated layout does require some advanced GPU processing power.
At the moment, it performs best using Firefox.

The setting will get stored inside the LocalStorage,
so you will need to click the following Button a 2nd time to deactivate it again.
Or you can clear the LocalStorage manually.</br></br>

<pre data-neo-component>
{
    "className": "Portal.view.learn.CubeLayoutButton",
    "style"    : {"margin": 0}
}
</pre>
