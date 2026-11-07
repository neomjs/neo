# Neo.mjs vs Next.js

Neo.mjs and Next.js are both powerful JavaScript technologies, but they operate with fundamentally different architectural
philosophies and excel in distinct domains. This document aims to clarify their core strengths and illustrate how they
can be used in complementary ways, rather than as direct competitors.

*   **Neo.mjs:** A comprehensive, multi-threaded frontend ecosystem designed for building highly performant, complex,
    and interactive Single-Page Applications (SPAs) where Main Thread responsiveness is paramount.
*   **Next.js:** A React framework specializing in Server-Side Rendering (SSR), Static Site Generation (SSG), and API
    routes, primarily focused on delivering content-rich, SEO-optimized web experiences.

## 1. Core Philosophy & Architecture

### Neo.mjs: Client-Side, Multi-Threaded for UI Responsiveness

Neo.mjs is architected from the ground up to leverage a multi-threaded environment within the browser. Its core philosophy
is to offload computationally intensive tasks from the Main UI Thread to ensure a consistently responsive user experience.

*   **App Worker:** Runs the application logic, state management, and component structure.
*   **Main Thread:** Dedicated to rendering the virtual DOM and handling user events, kept almost entirely free.
*   **Data Worker:** Manages data fetching and processing.
*   **VDom Worker:** Handles virtual DOM diffing and patching.

This architecture guarantees that the main thread remains unblocked, resulting in smooth animations, fast user interactions,
and a highly performant application, especially for complex and data-intensive UIs.

### Next.js: Server-Side First for Content & SEO

Next.js is a React framework that extends React's capabilities with powerful server-side rendering and static site generation
features. Its primary goal is to improve performance and SEO by pre-rendering pages on the server or at build time.

*   **Server-Side Rendering (SSR):** Pages are rendered on the server for each request, providing up-to-date content and
    improving initial load times.
*   **Static Site Generation (SSG):** Pages are generated at build time, resulting in extremely fast-loading static HTML
    files, ideal for content that doesn't change frequently.
*   **API Routes:** Built-in backend capabilities allow for creating serverless functions directly within the Next.js
    project, simplifying full-stack development.

Next.js excels at building content-heavy websites, blogs, and e-commerce applications where initial page load time and
SEO are critical.

## 2. Primary Use Cases

Given their distinct architectures, Neo.mjs and Next.js naturally fit different primary use cases, though they can also
complement each other.

### Neo.mjs: Interactive Applications of Every Size

Neo.mjs builds interactive web applications of every size, from everyday business apps to real-time dashboards, and
keeps the UI responsive even under heavy load.

*   **Business Applications:** From form-driven customer portals to large back-office systems, with the components, data layer and tooling in one install.
*   **Rich Data Dashboards:** Dashboards with numerous interactive components, charts, and real-time updates.
*   **Interactive Tools & Editors:** Applications where user input directly manipulates complex UI elements or data structures.
*   **Any application whose users expect it to stay fluid while it works.**

### Neo.mjs: Multi-Window / Multi-Screen Applications

Neo.mjs's multi-threaded architecture extends naturally to support complex multi-window and multi-screen application scenarios.
This is a capability rarely found anywhere else on the web.

*   **Shared Data & State:** Raw data and application state can be seamlessly shared and synchronized across multiple
    connected browser windows or even different screens (e.g., a main application window and a separate pop-out dashboard
    or control panel). This significantly reduces network traffic as data is fetched once and distributed locally.
*   **Synchronized UI:** Changes in one window can instantly reflect in others, ensuring all connected views are fully in sync.
*   **Component Tree Mobility:** Neo.mjs can move entire component trees (UI elements and their associated logic) between
    different browser windows while maintaining the same underlying JavaScript instances. This enables dynamic, flexible
    user interfaces where users can customize their workspace by arranging application parts across multiple displays.
*   **Reduced Traffic:** With data and logic shared and synchronized locally, the need to re-fetch or re-process information
    for each window is eliminated, leading to a more efficient and responsive user experience.

It serves any application whose users work across several views or screens at once, from back-office tools to trading
platforms, and Neo.mjs ships it as [Dock Layouts](../guides/uibuildingblocks/DockLayouts.md).

### Next.js: Content-Driven Websites & SEO-Critical Applications

Next.js is a leading choice for applications where content delivery, fast initial page loads, and search engine
optimization are paramount.

*   **Marketing Websites & Blogs:** Delivering static or server-rendered content quickly and efficiently.
*   **E-commerce Frontends:** Providing fast, SEO-friendly product pages and checkout flows.
*   **Portfolios & Documentation Sites:** Static content that benefits from pre-rendering.
*   **Applications requiring a robust backend for data fetching and API management.**

### Complementary Use Cases: The Best of Both Worlds

It's important to note that Neo.mjs and Next.js are not mutually exclusive. They can be used together to leverage their
respective strengths:

*   **Alongside an Existing Next.js Site:** If your public pages already run on Next.js, a Neo.mjs application can be
    embedded or loaded as a separate SPA for the interactive sections, such as a dashboard or a data visualization tool.
    Content pages can run on Neo.mjs too: the neomjs.com portal, its documentation and its blog are a Neo.mjs application.
*   **Next.js for API Backend:** Utilize Next.js's API Routes to build a robust backend for data fetching and business
    logic, while a Neo.mjs application consumes these APIs to power its rich client-side UI.

## 3. Architectural Trade-offs

| Feature                 | Neo.mjs                                 | Next.js                                 |
| ----------------------- | --------------------------------------- | --------------------------------------- |
| **Primary Focus**       | Client-Side UI Responsiveness           | Server-Side Content Delivery & SEO      |
| **Core Architecture**   | Multi-Threaded (Worker-Based)           | Single-Threaded (React + Node.js)       |
| **Rendering Strategy**  | Client-Side (Off-Main-Thread VDOM)      | SSR, SSG, CSR (Main Thread React VDOM)  |
| **Main Thread Impact**  | Minimal (Logic in Workers)              | Significant (All React/DOM work)        |
| **SEO**                 | Hydrates server-rendered markup (`useSSR`) | Built-in (SSR/SSG)                   |
| **Initial Load**        | Fast for Returning Users (Client-side caching) | Fast for First-Time Users (SSR/SSG)     |
| **Backend Integration** | Via standard APIs                       | Built-in API Routes                     |
| **Navigation Model**    | Single-Page Application (SPA)           | Page-Based (MPA with client-side routing) |

## Conclusion

If you are building an interactive application, from an everyday business app to a data-heavy dashboard, Neo.mjs is the
superior choice: it handles complex UIs and heavy data processing without blocking the Main Thread. Neo.mjs's architecture, leveraging
Service Workers for aggressive client-side caching of application code, results in near-instant load times for
returning users, significantly reducing network traffic as only raw data needs to be fetched from the backend.
Furthermore, its Single-Page Application (SPA) model ensures seamless navigation without full browser reloads, providing
a fluid and highly engaging user experience for interactive applications.

Content sites can run on Neo.mjs as well, as neomjs.com does. If your public pages already run on Next.js, the two
combine well: keep the existing site, and build the application behind it with Neo.mjs.

For many modern web projects, the most powerful approach might involve combining their strengths, using Next.js for
content delivery and API services, and embedding or integrating Neo.mjs for the most demanding
interactive client-side experiences.
