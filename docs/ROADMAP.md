# Roadmap (rolling)

This roadmap is intentionally short and operational.
It is updated to the current mainline architecture (Q1 2026).

## SwimForge 2.0 governance
- Definitive guide: [SWIMFORGE_2_0_GUIDE.md](/home/scima/projects/swimforge-oppidum-cloud/docs/SWIMFORGE_2_0_GUIDE.md)
- Canonical strategy report: [2026-03-02-unified-strategy.md](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-unified-strategy.md)
- Technical companion report: [2026-03-02-product-strategy-analysis.md](/home/scima/projects/swimforge-oppidum-cloud/docs/reports/2026-03-02-product-strategy-analysis.md)

All medium-term product decisions must align with the SwimForge 2.0 guide above.

## Next 2-4 weeks
- Stabilize production flows on mobile (post/story uploads, reactions, sharing)
- Complete DB migration rollout in production (`0028_add_schema_constraints_and_feed_indexes.sql`)
- Improve social moderation and retention jobs observability
- Expand integration tests for critical social/auth paths

## Next 1-2 months
- Voice coach experience (MVP) with explicit usage limits and fallback paths
- Further split and harden community domain modules where needed
- Performance pass on high-traffic feed/story queries using new indexes
- Improve deployment automation and release checklist

## Backlog
- FIT/TCX/GPX import pipeline
- Expanded analytics dashboards for clubs and seasons
- Additional anti-abuse controls for community features
