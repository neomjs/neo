# DevIndex FAQ

Welcome to the Frequently Asked Questions for the DevIndex! Here you will find answers to common queries about data updates, inclusion criteria, and how to manage your presence in the index.

## General Questions

### Is DevIndex a commercial product? Do you track me?
**No, and... well, yes.** There is a profound irony here. DevIndex does **not** track you as a visitor browsing this website (we use zero tracking cookies, no analytics, and no advertisements). It is a 100% free and open-source (MIT-licensed) FOSS project. 

However, the application itself is, by its very nature, a massive public data tracker. It actively indexes, aggregates, and tracks the public GitHub contributions of the top 50,000 developers worldwide. Our primary goal is to solve the "Invisibility Problem" in open source by promoting active developers—which is why we explicitly include direct links to your GitHub Sponsor profiles and your "Hireable" status.

While the application serves as a high-performance, deep-tech showcase for the underlying [Neo.mjs application engine](#/learn/Introduction) (pushing browser limits by streaming 50,000 records), the Neo.mjs platform itself is also a fully MIT-licensed open-source project.

### Why is the top of the list full of bots and "cheaters"?
When you see accounts with 4 million or 6 million lifetime contributions, your first instinct is likely that they are cheating the system. In many cases, these are developers who have heavily automated commits to specific repositories (for backups, data hoarding, or even as code-golf experiments).

We explicitly blocklist accounts where the user's profile bio explicitly states they are an automation bot (and we happen to notice it). However, for everyone else, **we do not censor the data.** 

Why? Because an account with 3 million automated commits might also have 30,000 brilliant, organic contributions to critical open-source infrastructure. We refuse to manually police and delete profiles, as we risk destroying valid historical data. 

We provide the raw data, and we provide tools to view it differently. If you want to see a more "human" list, use the **`Hide Commit Ratio > 90%` filter** in the UI. If you are a data scientist or engineer with ideas for better programmatic filters or AI-driven curation models, DevIndex is an open-source community project. We invite you to open a ticket or submit a PR to help us build better curation tools!

### How can I update my data inside DevIndex?
DevIndex mirrors your public GitHub data. To update your information (like your location, company, or hireable status) in DevIndex, you simply need to **update your GitHub profile**. 

The DevIndex Data Factory runs hourly updater cycles (processing up to 800 users per cycle, including new candidates from the Spider). Once you update your GitHub profile, our systems will pick up the changes during your profile's next scheduled refresh and the grid will update automatically.

### Why am I not in the index?
There are a few common reasons why a developer with a high contribution count might not appear in the DevIndex:

1. **The Meritocracy Threshold:** To ensure the application remains fast and responsive, the index is strictly capped at the top 50,000 developers. The minimum "Total Contributions" required to enter this top 50k is dynamic and constantly rising. You may be highly active, but currently sitting just below this threshold.
2. **Private Contributions are Hidden:** By default, GitHub does not share your private contributions via their public API unless you explicitly enable this setting on your GitHub profile. If the bulk of your work is in private repositories and you haven't enabled public visibility for them, our Spider cannot count them toward your total.
3. **Not Yet Discovered:** The GitHub network is massive (180+ million users). While our Spider uses advanced heuristics to find active developers, it's possible it simply hasn't traversed your specific sub-graph yet.
4. **Previously Opted Out:** If you have previously requested an opt-out for your account, you are on our blocklist and will not be indexed. Note: You can only opt *yourself* out. We do not accept third-party opt-out requests to prevent abuse (e.g., removing developers you don't like). The only accounts we actively ban are those clearly marked as automation bots.

### How do I opt in or nominate someone else?
If you believe you (or another developer) meet the high contribution threshold but aren't listed, you can manually trigger our discovery process. 

Please read our [Opt-In & Nominations Guide](#/learn/OptIn) for detailed instructions on using our automated GitHub Star or Issue Template systems to get indexed.

### How do I opt out and remove my data?
We deeply respect your privacy. If you wish to be permanently removed from the DevIndex and added to our blocklist, we provide automated, zero-friction methods to do so.

Please read our [Privacy & Opt-Out Guide](#/learn/OptOut) for instructions on using our "Stealth" Star-based or Issue-based removal systems.

---

## Technical & Architecture Questions

### How does the grid render 50,000 rows without crashing?
This is the core technological showcase of DevIndex. It is built on the [Neo.mjs](https://neomjs.com) application engine, which uses a true multi-threaded architecture. The heavy lifting (data sorting, filtering, and VDOM generation) happens in an App Worker, while a dedicated Canvas Worker handles the complex visual effects. 

The Main Thread is kept almost entirely empty, solely responsible for applying surgical DOM updates.

👉 **Dive Deeper:** Want to know exactly how we achieved O(1) rendering performance? Read [The 50k-Row Grid: Architecture & Virtualization](#/learn/frontend/TheGrid).

### Where is the backend server?
There isn't one! DevIndex is a pure "Fat Client" application served via GitHub Pages. The entire "backend" is a highly optimized, static `users.jsonl` file that is streamed directly into the browser.

👉 **Dive Deeper:** Learn how we handle 50,000 records in-memory without a database in [The Backend Twist](#/learn/Backend).

---

## Get Involved!

The DevIndex and the underlying Neo.mjs engine are open-source and thrive on community involvement. If reading through these guides has sparked your interest in multi-threaded web development, we would love to have you on board!

*   **Explore the Code:** Dive into the Neo.mjs repository and the DevIndex source code on [GitHub](https://github.com/neomjs/neo).
*   **Join the Community:** Connect with us, ask questions, and share your ideas on our [Discord Server](https://discord.gg/6p8paPq).
*   **Report Issues:** Found a bug or have a feature request? Open an issue on our [Tracker](https://github.com/neomjs/neo/issues).
