# Report a security vulnerability

Do not post exploit details, credentials, or private infrastructure information in public issues or pull requests. This project does not publish a dedicated security email address or guarantee a response timeline.

## Use a private report

On the repository's **Security** tab, choose **Report a vulnerability** if GitHub private vulnerability reporting is available. Include the affected revision, reproduction steps, potential impact, and a minimal proof of concept. Redact credentials, personal information, and unrelated host details.

If that option is unavailable, open an issue asking the maintainer to enable private vulnerability reporting or provide a private channel. Do not include the vulnerability details in that request. Wait for a private channel before sharing them.

## Versions and deployment scope

There is no published long-term support policy or security-fix schedule for older revisions. Include your exact revision and dependency versions when reporting a problem. Operators should review upstream Node.js, Next.js, Playwright/Chromium, and dependency advisories and keep their deployments updated.

Self-hosted operators manage TLS, reverse-proxy controls, host security, and monitoring. The preview renderer's queue and cache limits do not replace edge rate limits. Do not test denial-of-service behavior against the public demo; use an isolated local deployment.
