# Introduction & Overview

> **Legal Disclaimer:** DevIndex is an independent, MIT-licensed open-source project created by the Neo.mjs creator and AI agents. It is **not officially affiliated with, endorsed by, or associated with GitHub, Inc.** in any way. The project serves as an independent index for the open-source community, built on the Neo.mjs application engine to manage data grids streaming 50,000 records. It utilizes publicly available data provided by the GitHub API. We respect user privacy, utilize no tracking cookies, and run no advertisements.

## Project Motivation & The "Invisibility" Problem

The genesis of DevIndex stemmed from a simple frustration. Our creator, with over 30,000 GitHub contributions, wanted to understand how that volume compared to other active developers in the ecosystem. 

A search revealed that the available tools were severely lacking. The few existing "Top GitHub Users" lists can be highly localized or niche, but universally, they are all severely inaccurate—often entirely missing developers with tens or hundreds of thousands of contributions. Even when querying advanced Large Language Models (LLMs) like ChatGPT or Claude for a "Top 20" list, the results were hallucinated or based on severely outdated and incomplete data (e.g., listing developers with 4k contributions in the Top 20, while the actual top 100 all have over 134,000 contributions).

This highlighted a major "Invisibility Problem" in the Open Source ecosystem.

### The AI Era & Open Source Sustainability
As we enter the **AI Era**, understanding and recognizing human contribution to open-source software becomes even more critical. Modern Large Language Models (LLMs) are heavily trained on the vast corpus of open-source repositories. When developers ask coding questions, the answers are frequently derived directly from solved problems in these FOSS projects.

However, this creates a profound friction point: almost all open-source licenses (even permissive ones like the MIT license) require attribution. LLMs fundamentally strip away this context—they do not know where their training data originated, nor do they provide attribution to the original authors. Consequently, a handful of major corporations (e.g., OpenAI, Anthropic, Google) are generating billions in value by ingesting open-source labor, often in violation of the spirit (and letter) of these licenses, while giving almost nothing back to the developers who built the foundation.

Furthermore, with initiatives in regions like Europe aiming to provide structured funding for Free and Open Source Software (FOSS), there is a pressing need for accurate data. Currently, it is almost impossible for organizations to answer a simple question: *"Who are the most active open-source developers in our country?"*

DevIndex was built to solve this problem.

## Technical Feasibility & The GitHub API Challenge

The primary reason accurate lists don't exist is a technical limitation of the GitHub API. 
With over 180 million users on GitHub, attempting to index everyone is computationally prohibitive. Furthermore, GitHub stores contribution data strictly per year; there is no single API endpoint to retrieve a user's "Lifetime Total Contributions."

To overcome this, we built a highly specialized backend architecture:
- **The Spider (Discovery Engine):** Uses a multi-strategy algorithm to discover highly active developers who might otherwise remain hidden. Our Spider uses weighted graph walks, temporal slicing, and network analysis—read more in [The Spider Guide](./Spider.md).
- **The Updater (Enrichment Engine):** Queries the GraphQL API to meticulously aggregate year-by-year contribution graphs for every discovered user, calculating their true lifetime metrics.

### The Engineering Investment & The "Cyborg Factor"
Building an index of this scale and overcoming the severe limitations of public API data is an immense challenge. However, the development of DevIndex serves as a profound, verifiable proof-point for the **AI Era**.

The entire DevIndex platform—including the complex backend Data Factory, the streaming frontend architecture, and a complete, from-scratch rewrite of the underlying framework's Grid component—was built in **exactly one month** (February 2026). This was not achieved by a large "core engineering team," but by a **single developer and an AI pair-programmer** (the Neo.mjs AI infrastructure).

In that single month, this Human-AI pair created and resolved approximately **400 dedicated GitHub tickets**. This unprecedented velocity—fully verifiable via the project's public commit log and issue tracker—demonstrates the true power of Neo.mjs as an AI-Native Application Engine. It proves that with the right architecture, a single developer can now orchestrate massive, production-grade systems at speeds previously thought impossible.

### Accuracy and The Need for Participation
It is crucial to understand that while our data is vastly more accurate than existing lists, **it is still an approximation and will have gaps.** Because the Spider relies on graph traversal and heuristics rather than a full database dump, it is statistically probable that we are still missing highly prolific contributors—perhaps even the true #1 contributor globally. If you're missing from the index, please let us know so we can submit your profile!

The longer our Spider runs, the more accurate the index becomes. However, the true success of the DevIndex relies on active participation. This is why we have implemented explicit **Opt-In** features alongside our Opt-Out mechanisms. If you or a developer you know has a high contribution count but isn't listed, we encourage you to manually submit the profile for indexing.

### Data Science Use Cases
This aggregated, clean dataset opens up entirely new avenues for data science within the open-source ecosystem:
- **Macro-Economic Analysis & The Policy Story:** The UI features a real-time Status Toolbar calculating the global or country-specific Total Contributions (TC) against the active user count. When researchers filter the DevIndex by country, the resulting output metrics reveal staggering disparities that serve as a sobering, macro-economic reality check. For example (as of early 2026):
  - **Germany (84M pop) vs. India (1.4B pop):** Germany occupies ~2,659 slots in the global top 50k, representing a massive per-capita overperformance and an enormous, largely unpaid digital infrastructure investment. In contrast, India—despite its $200B+ IT export industry and massive developer population—occupies only ~1,042 slots. This highlights a profound *structural and incentive gap*, where developers consume OSS at scale but lack the time or financial incentives to contribute back at a proportionate level.
  - **Ecosystem Fragmentation (China):** China occupies ~2,850 slots. While mathematically an underperformance relative to its 1.4B population, the absolute number rivals Germany's output. The story here is not a lack of talent or incentives, but rather *ecosystem fragmentation*: massive internal platforms (like Gitee), language barriers, and the Great Firewall isolate many top Chinese developers from the global GitHub graph.
  - **The US & UK:** The US dominates with ~8,705 slots, aided by indirect tech funding (NSF grants, corporate foundations). Meanwhile, the UK punches far above its weight with ~2,061 slots, comparable to Germany, highlighting immense talent despite the lack of a cohesive national FOSS strategy.
  
  These stark ratios provide undeniable, empirical data for policymakers arguing for structured government funding for critical digital infrastructure.
  
  **Case Study: The Platform Itself**
  To underscore the reality of this macro-economic data, the platform you are currently looking at serves as a sobering proof-point of the "Invisibility Problem." The Neo.mjs multithreaded application engine that powers the DevIndex has been in active Research & Development for over 7 years (reaching General Availability in Nov 2019). While the framework received a small amount of private community sponsorship in its early days, it has received zero government or institutional FOSS funding, and has operated without any active sponsors for years. 
  
  The DevIndex application itself is a brand-new release, built entirely as an unfunded, private investment of time by the creator. Despite this lack of financial backing, the creation of the DevIndex Data Factory, a complete core Grid rewrite, and the development of a complex Stream Proxy were all accomplished in approximately one single month. This extraordinary velocity (approaching 400 resolved GitHub tickets in that timeframe) was made possible exclusively by the project's custom AI tooling acting as expert pair programmers. The DevIndex was built to prove a point: open-source labor must be made visible, even when the infrastructure to do so is completely unfunded.
- **Trend Analysis:** Tracking the rise and fall of specific technologies or frameworks based on the activity of top contributors.
- **Ecosystem Health:** Measuring the sustainability of open-source communities by analyzing contribution distribution (e.g., identifying "bus factor" risks across top repositories).
- **AI Impact:** Studying the shifting contribution patterns as AI agents and LLMs become more prevalent in the development lifecycle. As AI-augmented development becomes mainstream, we track the ratio of public commits to total public contributions as a longitudinal signal of how developer workflows are evolving. *Example: In 2022-2023, researchers can observe how aggregate commit ratios shift across countries as tools like Copilot accelerate code generation.*

Because a client-side web application cannot practically download 180 million records, we enforce a strict **Meritocracy Filter** with a hard cap at the top 50,000 most active developers. The rationale is purely network-based: at 50,000 users, our raw JSONL data file reaches ~23MB (around 8MB gzipped). While the Neo.mjs UI engine itself can effortlessly render significantly more records without performance degradation, forcing casual visitors to download larger payloads would be unreasonable. 

To mitigate load times, the data is **streamed** to the client. The application becomes fully functional with the initially loaded subset of data, and users can stop the ongoing data stream at any given moment. Once the 50k cap is reached, the entry threshold dynamically rises, ensuring only the most prolific contributors remain in the index. For context, as of February 27, 2026, the minimum entry bar to break into the global top 50k is 2,134 lifetime contributions.

## Rich Data & Inclusivity

DevIndex goes far beyond simple contribution counts. We provide extremely rich data to help connect developers with opportunities:
- **Funding & Sponsorship:** If a developer has a GitHub Sponsors account, we provide a direct link to sponsor them.
- **Hiring & Talent Scouting:** We index the "Is Hireable" flag (even though it's less prominent on GitHub now). Talent scouts can use our platform to instantly filter the world's top contributors by country and hireable status.

We aim to be a "home" for developers worldwide, as well as AI agents and LLMs that actively contribute to the ecosystem. We are radically inclusive: the only GitHub accounts we actively filter out are those strictly flagged as "automation bots," alongside developers who have explicitly requested to opt out.

For detailed information on how to permanently remove your profile from the index, please read our [Privacy & Opt-Out Guide](./OptOut.md).

## Current Status & Contributions

The DevIndex is currently in **v1**. While the underlying Neo.mjs runtime and the autonomous Data Factory backend are extremely advanced, the platform is continuously evolving. 

We highly welcome community feedback, feature requests, and bug reports. You can submit these directly via issues on the main [neomjs/neo](https://github.com/neomjs/neo/issues) repository. Opening a ticket is the easiest and most impactful way to contribute to the project's evolution!

**A Note on Pull Requests:** 
A Pull Request **MUST** reference an existing GitHub issue ticket. This is a strict project requirement to ensure all architectural changes are discussed and documented first.

Because the DevIndex is built on the cutting-edge multithreaded architecture of the Neo.mjs engine, the codebase is highly advanced. However, we have built an incredibly rich suite of AI tooling to help you navigate it! The open-source, MIT-licensed Neo.mjs repository includes [4 dedicated Model Context Protocol (MCP) servers](https://neomjs.com/#/learn/guides/mcp/Introduction) (including a specialized Knowledge Base and Memory Core). This AI-Native architecture allows you to connect compatible AI assistants directly to the codebase, turning them into expert Neo.mjs pair programmers. We highly encourage you to experience this next generation of web development while contributing to the DevIndex.
