Neo.mjs applications can also launch as <i>shared web workers</i>, which allows you to have a single 
application run in multiple browser windows; those windows can be moved to multiple monitors.

For example, you can have a data analysis application with a control panel on one monitor, 
tabular data in another, and charts on another &mdash; all sharing the same data, handling events
across windows, running seamlessly as a single application. 


<details>
<summary><h3>Example</h3></summary>
An easy way to show this is by looking at a code preview example. In the example below, click Preview, 
then click on the new window icon on the right side of the toolbar. This launches a new window 
running the code. Even though it's running in a new window, it's still part of the app. 
(In this case, the app is the web site you're looking at now.) That means both the code in both windows 
seamlessly share events, data, etc. &mdash; the code doesn't care that some code is running in a
separate window.
<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'Home'
        }]
    }
}

Neo.setupClass(MainView);
</pre>

</details>
