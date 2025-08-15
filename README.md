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
- uses: ./.github/workflows/monitoring-checks.yml
  with:
    checks_json: '[{"url": "https://example.com", "textToFind": ["Hello World"], "makeScreenshot": true}]'
    user_agent: 'Mozilla/5.0 (compatible; Googlebot/2.1)'
    viewport_width: '1920'
    viewport_height: '1080'
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

*Built with ❤️ by [OhMyHost.se](https://ohmyhost.se)*
