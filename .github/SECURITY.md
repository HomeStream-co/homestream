# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x (latest) | Yes |
| < 1.0 | No |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please open a
[GitHub Security Advisory](https://github.com/HomeStream-co/homestream/security/advisories/new)
or email the maintainers directly.

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You can expect an acknowledgement within 48 hours and a resolution timeline
within 7 days for critical issues.

## Security Considerations

HomeStream is designed to run on a **private local network**. It is not
hardened for direct public internet exposure. If you expose it to the internet:

- Use a reverse proxy (nginx, Caddy) with TLS termination
- Enable the built-in HTTPS setup (Settings > HTTPS Setup)
- Use a strong admin password
- Keep the software up to date via the built-in auto-updater

## Known Scope

The following are **by design** and not considered vulnerabilities:

- Admin password stored as bcrypt hash in a local JSON file
- Session tokens stored in httpOnly cookies (not accessible to JavaScript)
- Rate limiting applied to login endpoint (5 attempts per 15 minutes)
- Content rating gate is fail-closed (unrated content blocked for restricted profiles)
