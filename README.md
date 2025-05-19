<p align="center">
  <img height="100"src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/logo/neo_logo_text_primary.svg">
</p>
</br>
<p align="center">
  <a href="https://npmcharts.com/compare/neo.mjs?minimal=true"><img src="https://img.shields.io/npm/dm/neo.mjs.svg?label=Downloads" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/v/neo.mjs.svg?logo=npm" alt="Version"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/l/neo.mjs.svg?label=License" alt="License"></a>
  <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA"><img src="https://img.shields.io/badge/Slack-Neo.mjs-brightgreen.svg?logo=slack" alt="Join the Slack channel"></a>
  <a href="https://discord.gg/6p8paPq"><img src="https://img.shields.io/discord/656620537514164249?label=Discord&logo=discord&logoColor=white" alt="Discord Chat"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-green.svg?logo=GitHub&logoColor=white" alt="PRs Welcome"></a>
</p>

# Build Ultra-Fast, Scalable, and Extensible Web Apps :zap:
:rocket: **Break Free from the Main Thread – Experience True Multi-Threading**

Neo.mjs enables the creation of highly dynamic web applications by running everything **inside an App Worker**.
From components and state providers to view controllers, everything operates within the worker,
allowing the main thread to focus only on **DOM updates** and **delegating UI events**.
This ensures **high performance, smooth reactivity**, and **extensibility** for both **multi-window** and **SPA applications**.

<p align="center">
  <a href="https://youtu.be/pYfM28Pz6_0"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo33s.png"></a>
  <a href="https://youtu.be/aEA5333WiWY"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo-movie.png"></a>
</p>

</br></br>
## 🔍 Why Neo.mjs?
Neo is a worker thread-driven frontend framework designed to create multithreaded GUIs using JavaScript.
By leveraging the **Off Main Thread (OMT) paradigm**, Neo ensures that your application’s UI remains responsive,
even during computationally intensive tasks.

Unlike traditional single-threaded frameworks, Neo distributes workloads across multiple threads, unlocking new levels of performance and scalability.
Whether you’re building a small app or a large-scale enterprise solution, Neo’s architecture grows with your needs.

Key Benefits of Neo.mjs
1. **Multithreading for Performance**:
   - Neo’s OMT paradigm moves tasks like data processing, state management, and rendering to worker threads, keeping the main thread free for rendering and user interactions.
   - This approach eliminates UI freezes and ensures a smooth user experience, even for complex applications.
2. **Declarative Class Configuration**:
   - Neo’s class config system allows you to define and manage classes in a clean, reusable way. This reduces boilerplate code and makes your codebase more maintainable.
   - With declarative configurations, you can focus on building features instead of wrestling with setup and initialization.
3. **Modular and Scalable Architecture**:
   - Neo’s modular design makes it easy to build scalable applications. Components are self-contained and reusable, promoting a clean separation of concerns.
   - Whether you’re building a small app or a large-scale enterprise solution, Neo’s architecture grows with your needs.
4. **Ease of Use**:
   - Neo’s intuitive API and comprehensive documentation make it easy to get started, even for developers new to multithreaded programming.
   - The framework’s design prioritizes developer productivity, allowing you to focus on solving real-world problems.
5. **Future-Proof Technology**:
   - Neo is built on modern web standards like JavaScript modules and worker threads, ensuring compatibility with the latest browser features.
   - By embracing the OMT paradigm, Neo is uniquely positioned to take advantage of future advancements in web development.

## Real-World Applications

Neo is ideal for:
- **Data-intensive applications**: Handle large datasets and complex calculations without compromising UI responsiveness.
- **Real-time dashboards**: Build dynamic, real-time dashboards that update seamlessly.
- **Enterprise solutions**: Scale your application to meet the demands of large organizations.

**Why Choose Neo Over Traditional Frameworks?**

Traditional single-threaded frameworks often struggle with performance bottlenecks, especially when handling complex UIs or large datasets.
Neo’s **multithreaded architecture** addresses these challenges head-on, delivering a responsive and scalable solution for modern web applications.

With Neo, you get:
- ✅ **Responsive UIs**: No more UI freezes or janky animations.
- 🚀 **Scalability**: Build applications that can handle increasing complexity without compromising performance.
- 💻 **Developer Productivity**: Spend less time optimizing and more time building features.
  </br></br>
## 🌟 Key Features
🎭 **Actor Model**:</br>
The App Worker acts as the central actor, handling application state and logic, independent of the main thread.
This drives the OMT (off the main thread) paradigm into perfection,
since it is keeping the main thread free for non-blocking DOM updates and UI interactions.

<img src="./resources/images/workers-focus.svg">

🔄 **Reactive State Management**:</br>
Built-in reactivity allows dynamic, efficient updates between components and state providers.

⚡ **Instant JavaScript module based Development Mode**:</br>
**Zero builds or transpilations** required. Run your app directly in the browser, modify reactive properties in real-time, and see instant updates.
This gives you an **unmatched debugging experience**, saving time and reducing development costs.
You can even build **entire apps inside the console** if you wish.

📊 **Hierarchical State Management**:</br>
Seamlessly manage state between parent and child components with nested state providers.
Each component binds to the state data from its **closest** provider,
even combining data from multiple providers inside one binding.

🧩 **Clean Architecture**:</br>
View controllers ensure a **separation of concerns**, isolating business logic from UI components for easier maintenance and testing.

🌐 **Multi-Window & SPAs**:</br>
Easily build and manage complex, highly interactive applications that require multiple windows or traditional SPAs.
No native shell required.

🌀 **Dynamic Component Management**:</br>
Unmount, move, and remount components across the UI or even in separate browser windows
— without losing the component’s state or logic. This **runtime flexibility** is a game-changer, **preserving JS instances** while still updating the UI dynamically.

:dependabot: **No npm dependency hell**:</br>
Neo.mjs apps do not need any dependencies at all, just some dev dependencies for tooling.
</br></br>
## :bulb: Perfect for Complex Use Cases
Need a **web-based IDE, banking dashboard**, or an **enterprise-grade multi-window app**? Neo.mjs is built for it.

</br></br>
## 📦 Declarative Class Configuration
Neo’s class config system allows you to define and manage classes in a declarative and reusable way.
This simplifies class creation, reduces boilerplate code, and improves maintainability.

```javascript
import Component from '../../src/component/Base.mjs';

class MyComponent extends Component {
    static config = {
        className    : 'MyComponent',
        someProperty_: 'defaultValue',
        domListeners : {
            click: 'onClick'
        }
    }

    afterSetSomeProperty(value, oldValue) {
       console.log('someProperty changed:', value, oldValue)
    }
    
    onClick(data) {
        console.log('Clicked!', data)
    }
}

export default Neo.setupClass(MyComponent);
```
With Neo.mjs’s class config system, you can:

* Define default properties and methods in a clean, structured way.
* Easily extend and reuse configurations across classes.
* Keep your codebase organized and scalable.

For more details, check out the <a href="https://neomjs.com/dist/production/apps/portal/index.html#/learn/gettingstarted.Config">Class Config System documentation</a>.

</br></br>
## 🚀 Get Started
Quick Start

Run the following command in your terminal, and your new Neo app will be created, the local web server will start, and your app will open in a new browser window:

```bash
npx neo-app@latest
```
This one-liner sets up everything you need to start building with Neo, including:
- A new app workspace.
- A pre-configured app shell.
- A local development server.
- Opening your app inside a new browser window

:book: More details? Check out our <a href="./.github/GETTING_STARTED.md">Getting Started Guide</a>

:student: Make sure to dive into the <a href="https://neomjs.com/dist/production/apps/portal/#/learn/gettingstarted.Setup">Learning Section</a>

:brain: The most advanced tutorial to help you with getting up to speed is this one:
<a href="https://neomjs.com/dist/production/apps/portal/#/learn/tutorials.Earthquakes">Earthquakes Tutorial</a>

Next steps:
* :star: **Explore exciting Examples here**: <a href="https://neomjs.com/dist/production/apps/portal/#/examples">Neo.mjs Examples</a>
* Many more are included inside the repos <a href="https://github.com/neomjs/neo/tree/dev/apps">apps</a>
  & <a href="https://github.com/neomjs/neo/tree/dev/examples">examples</a> folders.
* :blue_book: All Blog Posts are listed here: <a href="https://neomjs.com/dist/production/apps/portal/#/blog">Neo.mjs Blog</a>
  </br></br>
## :handshake: Join the Community

:speech_balloon: Have questions? Join our <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA">Slack channel</a> and connect with other developers.

:hammer_and_wrench: Want to contribute? Check out our <a href="https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md">Contributing Guide</a>.


</br></br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
