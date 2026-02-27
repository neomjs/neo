# DevIndex Methodology

This guide explains the specific calculations, scoring rules, and heuristics that power the DevIndex platform.

## Scoring

Scoring is based on an aggregate of GitHub's core public contribution metrics over the lifetime of the account:
1.  **Commits** (Primary metric)
2.  **Pull Requests** (Code, Review)
3.  **Issues** (Reporting, Discussion)
4.  **Code Reviews**

The ranking within the grid is directly determined by the sum of these metrics (Total Contributions).

## The Meritocracy Filter

Because a client-side web application cannot practically download the entire GitHub userbase, we enforce a strict **Meritocracy Filter** with a hard cap at the top 50,000 most active developers.

Here is how the algorithm works:
1. We maintain a `threshold.json` value that dictates the minimum required Total Contributions to enter the index.
2. The Spider and Updater continually discover and enrich new user profiles.
3. If a new user's Total Contributions exceed the current threshold, they are added to the index.
4. If this addition causes the index to exceed the 50,000 user cap, the array is sorted by Total Contributions, and the lowest performers are automatically pruned (removed) from the active database.
5. The `threshold.json` value is then dynamically updated to match the Total Contributions of the new "bottom" user. This means the barrier to entry naturally rises over time, ensuring only the most prolific contributors remain.

## Anomaly Detection & Pattern Recognition

To help identify unusual or extraordinary contribution patterns, we compute heuristic scores for each profile, generating visual "Impact Badges" in the UI. These are based on actual code metrics:
- **Velocity (v):** The maximum contributions per day during their peak year (e.g., >100/day receives ⚡, >1,000/day receives 🔥).
- **Acceleration (a):** The growth rate of their peak year compared to their median baseline of active years (e.g., >2x growth receives 📈, >10x receives 🚀).
- **Consistency (c):** The number of active years (years with >100 contributions) in the ecosystem (e.g., >5 active years receives 🛡️, >10 active years receives 🏛️).

These scores aren't judgments—they're signals. The GitHub ecosystem is incredibly diverse. DevIndex includes:
- **The Human Titans:** OS maintainers (like Arch Linux or FreeBSD port maintainers) who legitimately merge hundreds of package bumps a day for a decade.
- **The Enterprise Leads:** Framework founders with 15+ years of relentless, high-volume, organic daily commits.
- **The Automators & Archivists:** Government infrastructure accounts or data hoarders running massive automated syncs.
- **The "Code Golfers" & Experimenters:** Developers scripting commits for fun (e.g., creating a smartwatch app that pushes a commit for every physical step they take), leading to mathematically impossible spikes (like 2.1 million commits in a single year).

An incredibly active maintainer, a package automation system, or an AI agent will all generate unique footprints. The badges help researchers understand *what kind* of contributor they're looking at without making value judgments.

For transparency, even profiles with mathematically impossible human patterns remain in the index. We do not editorialize or delete data based on high volume because one user's "automation spam" is another researcher's valuable dataset on API abuse or automation trends. However, the UI provides built-in filters (such as `Hide Commit Ratio > 90%`) allowing users to dynamically filter out profiles that are highly likely to be automated systems rather than organic human contributors.

## The Philosophy of Raw Data & The Community Challenge

DevIndex v1 was an immense, month-long effort to build the foundational infrastructure (the Data Factory and the 50k-Row UI Grid). 

You will undoubtedly notice accounts in the top 20 with mathematically impossible human statistics (e.g., 6 million contributions in a few years). We actively blocklist accounts where the user profile (e.g., the bio) explicitly states they are an automation bot and we happen to notice it. But beyond that, **we deliberately choose not to censor the default view**. 

We believe in presenting the raw, unfiltered truth of the GitHub API. Attempting to manually review and judge the validity of 50,000 profiles is impossible. Furthermore, as outlined in our [Data Scientists Guide](./personas/DataScientists.md), one user's "automation spam" is a researcher's valuable dataset on automation trends. Even using AI to randomly sample commits is just a snapshot—an account might have 50,000 incredibly valuable, organic contributions buried within millions of automated commits.

Instead of deleting data, we provide primitive heuristics (like Impact Badges) and built-in UI filters. 

**This is a community project.** If you find the default view frustrating and have ideas for better statistical data annotations, advanced algorithms to separate organic from automated commits, or new UI filters, we welcome your expertise. Don't just complain about the data—open a ticket or submit a Pull Request to help us build a better lens for it.
