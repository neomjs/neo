
***Welcome to these Neo.mjs guides and learning resources!*** Neo.mjs is a groundbreaking JavaScript framework designed
to help you build lightning-fast, highly scalable, and exceptionally maintainable web applications. This guide will help
you understand the structure of these topics and get the most out of our comprehensive content.

## Documentation Sections

This documentation is organized into the following main sections, each serving a distinct purpose:

* ***Benefits***: Describes the technical and business reasons for choosing Neo.mjs, highlighting its unique advantages.
* ***Getting Started***: Provides installation instructions, along with fundamental concepts that are good to understand
  before diving deeper into Neo.mjs.
* ***Tutorials***: Offers hands-on tutorials where you'll code a few simple Neo.mjs applications.
* ***Guides***: Contains in-depth discussions of various topics related to Neo.mjs concepts and features.

## Navigating These Topics

As you can see, the table of contents is on the left. Topic sections and sub-sections are shown on the right, and the
content is here in the middle. There are "next" and "previous" buttons at the bottom of each page to make it easier to
read several topics in sequence.

## Special Features

You'll find a few special features integrated into our content to enhance your learning experience:

### Disclosure widgets

Topics sometimes contain "disclosure" widgets, which are just `<details>` tags. These are used in cases 
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

```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module: Button,
            text  : 'Button'
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

---

Your journey into Neo.mjs starts here. The next page will guide you through its core benefits, or if you're ready to get
hands-on, jump directly to [Getting Started](#/learn/gettingstarted.Setup) to build your first application.
