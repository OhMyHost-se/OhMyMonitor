# OhMyMonitor 🔍

A GitHub Actions-based website monitoring tool that performs automated health checks, text verification, and screenshot capture.

## Features

- **Automated Monitoring**: Run monitoring checks via GitHub Actions
- **Text Verification**: Verify specific text content on web pages
- **Screenshot Capture**: Take screenshots for visual verification
- **Customizable**: Configurable viewport, user agent, and headers
- **Analytics Exclusion**: Built-in support for monitoring headers

## Usage

```yaml
name: Monitoring checks

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:

jobs:
  monitor:
    uses: OhMyHost-se/ohmymonitor/.github/workflows/monitoring-checks.yml@v1
    with:
      checks_json: |
        [
            {
                "url": "https://ohmyhost.se",
                "textToFind":
                [
                    "We develop and migrate",
                    "Our solution guarantees zero vendor lock-in"
                ],
                "makeScreenshot": true
            },
            {
                "url": "https://ohmyhost.se/sv",
                "textToFind":
                [
                    "Vi övervakar aktivt din webbplats"
                ],
                "makeScreenshot": false
            }
        ]
      user_agent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
      viewport_width: "1440"
      viewport_height: "900"
      exclude_analytics: "true"
      add_headers: "true"
      resource_ignore_patterns: '[{"pattern": "google-analytics\\.com", "reason": "GA"},{"pattern":"cloudflareinsights\\.com","reason":"CF Analytics"}]'
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

*Built with ❤️ by [OhMyHost.se](https://ohmyhost.se)*
