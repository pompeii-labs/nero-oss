# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Nero, please report it responsibly:

**Email:** hello@pompeiilabs.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## What to Expect

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you to understand and resolve the issue
- We will credit you in the fix announcement (unless you prefer anonymity)

## Scope

This policy applies to:
- The Nero CLI and service code in this repository
- The web dashboard
- Official Docker images

Out of scope:
- Third-party dependencies (report to their maintainers)
- Social engineering attacks
- Denial of service attacks

## Security Best Practices

When running Nero:

1. **Use contained mode** for untrusted tasks
2. **Review permissions** before approving tool calls
3. **Keep your API keys secure** in `~/.nero/.env`
4. **Update regularly** with `nero update`
5. **Use branch protection** when giving Nero git access

## Supported Versions

We provide security updates for the latest minor version only.

| Version | Supported |
|---------|-----------|
| 1.x.x   | Yes       |
| < 1.0   | No        |
