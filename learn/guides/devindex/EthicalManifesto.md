# The Ethical Manifesto (Why We Built This)

Data is power. When building a platform like DevIndex that aggregates the professional footprints of 50,000+ developers, it is reasonable to ask: *"Are you just another data scraper?"* 

The answer is a definitive **no**. DevIndex was built to solve a systemic failure in the modern software industry. This manifesto outlines our ethical foundation, our mission, and the privacy-first architecture that enforces it.

## 1. The "Invisibility Problem"

The open-source ecosystem is facing an "Invisibility Problem." Millions of developers maintain the digital infrastructure of the modern world, often on nights and weekends, for free. Yet, their labor is largely invisible to the macroeconomic systems that benefit from it. 

When a critical vulnerability is found in a massive enterprise system, the world suddenly cares about the single unpaid maintainer of the underlying open-source library. But until that breaking point, that maintainer is invisible.

DevIndex was built to make this labor visible, undeniable, and quantifiable. By aggregating lifetime contributions and surfacing the "Cyborg Metrics" of consistency and velocity, we aim to transform invisible labor into proven, hireable impact.

## 2. The LLM Attribution Failure

The urgency of this Invisibility Problem has been massively accelerated by the AI Era.

Modern Large Language Models (LLMs) are trained on the vast corpus of open-source repositories. When developers ask an AI for code, the AI provides solutions derived directly from the unpaid labor of FOSS maintainers. 

However, almost all open-source licenses (like MIT or Apache) require attribution. LLMs fundamentally break this social contract. They strip away the context, the history, and the attribution. A few massive tech corporations are generating billions of dollars in valuation by ingesting open-source code, while giving absolutely nothing back to the developers who wrote it.

DevIndex is a counter-measure. It is a declarative index of *who* actually built the foundations these models are trained on, designed to ensure that human contribution is recognized, respected, and ideally, compensated.

## 3. Meritocracy over Popularity

To ensure the index remains meaningful and sustainable, we enforce a strict **Meritocracy Filter**. We cap the active database at the top 50,000 developers globally. 

This is not an elite club for its own sake; it is a vital mechanism for sustainability.
*   **Performance:** It allows us to stream the entire dataset to the browser without a backend server, keeping our infrastructure costs at zero and ensuring the project remains free forever.
*   **Signal over Noise:** By dynamically raising the threshold (removing the lowest performers as new, more prolific developers are discovered), we ensure that the index highlights actual, sustained engineering output, rather than just developers who created one highly-starred repository a decade ago. It measures *work*, not just popularity.

## 4. Privacy by Design: Cryptographic Proof

We believe that true ethics must be enforced by architecture, not just promises. DevIndex is a non-commercial, tracking-free, and ad-free project. We only index publicly available data from the GitHub API.

More importantly, we enforce a strict **Opt-Out-First** privacy policy, backed by cryptographic verification:

*   **No Email Verification:** We refuse to accept opt-in or opt-out requests via email, as this allows for malicious actors to manipulate data.
*   **The "Stealth Star" Architecture:** Our Opt-In and Opt-Out mechanisms are handled entirely via GitHub itself. To opt-out, a user simply "stars" a dedicated [opt-out repository](https://github.com/neomjs/devindex-opt-out). Our Data Factory detects the star during its next scheduled run, instantly purges the user from our database, adds them to a permanent blocklist, and encourages the user to un-star the repo immediately afterward. 
*   **Cryptographic Certainty:** Because you must be authenticated with GitHub to star a repository or open an issue, the platform mathematically guarantees that the person requesting removal is the actual owner of the data. 

We do not want to index anyone who does not wish to be visible. Our architecture guarantees that your right to be forgotten is absolute, immediate, and mathematically verifiable.