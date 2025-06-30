## Multi-Window Applications: Unleashing Desktop-Class Experiences

Traditional web applications are often confined to a single browser window or tab, limiting user productivity and the
ability to manage complex workflows. Neo.mjs shatters this limitation by providing native, robust support for
multi-window applications, enabling truly desktop-class experiences directly within the browser.

Neo.mjs applications can seamlessly launch and operate across multiple browser windows, leveraging **shared web workers**.
This allows a single application instance to run concurrently in various windows, which can even be moved to different
monitors, all while sharing the same underlying data and application state.

### Key Advantages & Use Cases:

*   **Enhanced Productivity**: Users can arrange different parts of an application across multiple screens, optimizing
    their workspace for complex tasks. Imagine a financial trading platform with real-time charts on one monitor, order
    books on another, and a control panel on a third.

*   **Seamless Data & State Sharing**: All open windows remain synchronized, sharing the same data and application state
    in real-time. This eliminates the need for complex inter-window communication logic, as events and data flow effortlessly
    across all connected contexts.

*   **Rich User Experiences**: Beyond data analysis, this capability is transformative for applications like:
    *   **Creative Suites**: Designers working with multiple canvases or tool palettes.
    *   **Control Centers**: Operators monitoring various system dashboards simultaneously.
    *   **Educational Platforms**: Students viewing course material, interactive exercises, and communication tools side-by-side.
    *   **Customer Service Desks**: Agents managing multiple customer interactions or data sources concurrently.

*   **Consistent JavaScript Instances**: Components can even be moved across windows while retaining their original
    JavaScript instances, ensuring continuity and preventing unnecessary re-initialization.

**Benefit**: For businesses, this translates to a significantly more powerful and intuitive user experience, leading to
increased user satisfaction, reduced training times, and the ability to handle more complex tasks efficiently. For
developers, it simplifies the creation of sophisticated multi-screen layouts, as the framework handles the underlying
communication complexities.

<details>
<summary><h3>Example</h3></summary>
An easy way to show this is by looking at a code preview example. In the example below, click Preview, 
then click on the new window icon on the right side of the toolbar. This launches a new window 
running the code. Even though it's running in a new window, it's still part of the app. 
(In this case, the app is the web site you're looking at now.) That means both the code in both windows 
seamlessly share events, data, etc. &mdash; the code doesn't care that some code is running in a
separate window.
```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Benefits.multiwindow.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'Home'
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

</details>
