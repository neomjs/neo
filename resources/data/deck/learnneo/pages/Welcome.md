Welcome to Neo.mjs! This set of topics contains information to help you use Neo.mjs. 


## Topics

### Why Neo?

Describes technical and business reasons for using Neo.mjs

### Getting Started

Install instructions, along with fundamental concepts that are good to understand before diving into Neo.mjs.

### Tutorials

Hands-on tutorials where you'll code a few simple Neo.mjs applications.

### Guides

These are in-depth discussions of various topics.

## Using these topics

### Layout 

As you can see, the topics table of contents is on the left. Topic sections and sub-sections are shown on the right.
And content is here in the middle. There are "next" and "previous" buttons at the bottom of each page, to make it
easier to read several topics in sequence. 

### Disclosure widgets

Topics sometimes contain "disclosure" widgets, which are just &lt;details> tags. These are used in cases 
where we want to present high-level points and reveal details when the disclosure is expanded.

<details>
<summary>This is a disclosure widget</summary>
<p style="background-color:lightgreen;padding:8px">This is a fascinating piece of information which is revealed when the widget is expanded.</p>
</details>

### Runnable examples

Topics also sometimes contain runnable examples. These are shown as tab panels with Source and Preview tabs.

You can also launch the preview in a window by going to the Preview tab, then clicking on the little window
icon on the right  <span class="far fa-xs fa-window-maximize"></span>. This web site is a Neo.mjs application,
and the ability to launch browser windows &mdash; all integrated within a single app &mdash; is a unique feature of Neo.mjs!

<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            text   : 'Button'
        }]
    }
}

MainView = Neo.setupClass(MainView);
</pre>
