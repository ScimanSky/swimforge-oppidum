# Issues to Create

1) **Provider-agnostic import interface**
- Description: Define a unified interface for activity importers (Strava/Garmin/FIT).
- Acceptance: Interface documented + stub implementation.
- Labels: enhancement, architecture

2) **FIT/TCX/GPX import pipeline (MVP)**
- Description: Add importer to parse FIT/TCX/GPX into swimming_activities.
- Acceptance: At least 1 format supported, docs updated.
- Labels: enhancement, good first issue (if split)

3) **Metrics engine v1 tests**
- Description: Add unit tests for SEI/TCI/SER/ACS/RRS calculations.
- Acceptance: Tests pass in CI.
- Labels: testing, good first issue

4) **Community clubs: add club feed**
- Description: Add posts scoped to a club.
- Acceptance: New endpoints + UI tab per club.
- Labels: feature, community

5) **Session IQ: better prompt + caching**
- Description: Improve per-session analysis prompt and cache rules.
- Acceptance: Clearer outputs, no repeated data.
- Labels: AI, enhancement

6) **Docs: onboarding walkthrough**
- Description: Add end-to-end setup tutorial with screenshots.
- Acceptance: docs/ONBOARDING.md added.
- Labels: documentation
