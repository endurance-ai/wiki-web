# Project Interview

> Captured from the working session on 2026-05-22. Existing-project path.
> Answers derived from prior architecture analysis + user direction; correct any inaccuracy.

## Round 1: Ownership and Purpose
Question: Who maintains this project and what is the primary goal going forward?
Answer: Active product being developed further. "kikoweb" is the kiko.ai team's
fashion brand node wiki (org repo `endurance-ai/wiki-web`). It currently renders a
read-only force-directed graph of style clusters + brands. The forward goal is to turn
it into a **participatory wiki** where end users AND the team collectively build the
brand database (add/edit brands, comments, keywords, relations). Maintained by the
kiko.ai team (developer: bbbang105; original author: teammate "kang").

## Round 2: Constraints and Non-Goals
Question: What are the known constraints, technical debts, or things this project intentionally does NOT do?
Answer: Security + maintainability/scalability are the immediate priorities.
- Known debt/risks: all write/delete API routes are unauthenticated (open); `next-auth`
  is installed but NOT configured; `/api/proxy-image` is an open SSRF vector; no rate
  limiting; unused/legacy code and dependencies need cleanup.
- Data constraint: the app shares the **dev-app Postgres** cluster but is isolated in a
  dedicated `wiki` schema. It MUST NOT touch the `public`/`ai` schemas (kikoai's 118k-SKU
  production graph). Cross-schema integration with kikoai's brand graph is a future phase.
- Non-goals (now): no merging into kikoai's production tables yet; no payment/commerce.

## Round 3: Documentation Priority
Question: What is the most important aspect to capture accurately in the documentation?
Answer: Architecture & module boundaries + technology stack — to support an imminent
hardening/refactor pass (lock down open APIs, add auth, remove dead code/tech, choose
architecture & stack that raise maintainability and scalability).
