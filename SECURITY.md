# Security Policy

## Reporting a Vulnerability
Do not open public issues for security problems.

Use GitHub Security Advisories:
- https://github.com/ScimanSky/swimforge-oppidum/security/advisories

Optional email channel (if monitored by maintainer):
- security@swimforge-oppidum.dev

Please include:
- Impact and affected area
- Reproduction steps
- Proof of concept (minimal)
- Suggested remediation (optional)

## Response Targets
- Acknowledgment: within 72 hours
- Initial triage: within 7 days
- Critical fix target: within 14 days

## Supported Versions
This project currently supports security fixes on:
- `main` (latest)

Older branches/tags are not guaranteed to receive patches.

## Security Controls Implemented
- Input validation with Zod on API boundaries
- Auth/session cookie hardening
- CSRF protection on state-changing procedures
- Rate limiting middleware
- CORS allowlist and CSP restrictions
- Centralized error handling and logging
- Optional Rollbar/Sentry integration via environment configuration

## Secrets and Operations Rules
- Never commit secrets or `.env` files
- Run `pnpm secrets:scan` before push (CI blocks high-confidence secret patterns)
- Rotate critical secrets periodically (`JWT_SECRET`, provider keys, cron secret)
- Use least privilege for DB/API credentials
- Protect cron endpoints with bearer auth (`CRON_SECRET`)

## Disclosure Policy
Responsible disclosure is expected.
After a fix is released and users have reasonable patch time, public disclosure can follow.

## Security Notes
For legal/privacy commitments, see:
- `PRIVACY_POLICY.md`
- `COOKIE_POLICY.md`
- `TERMS_OF_SERVICE.md`
