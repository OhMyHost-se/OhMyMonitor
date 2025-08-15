const fs = require('fs');
const puppeteer = require('puppeteer');

function logWithTime(...args) {
  const now = new Date().toISOString(); // формат с миллисекундами
  console.log(`[${now}]`, ...args);
}

function errorWithTime(...args) {
  const now = new Date().toISOString();
  console.error(`[${now}]`, ...args);
}

// Resource ignore patterns - can be configured via environment variables
function getIgnorePatterns() {
  const defaultPatterns = [
    // Cloudflare Insights (analytics)
    { pattern: /cloudflareinsights\.com/, reason: 'Cloudflare Analytics' },
    // Cloudflare Turnstile challenges
    { pattern: /challenges\.cloudflare\.com/, reason: 'Cloudflare Turnstile' },
    // Google Analytics (if used)
    { pattern: /google-analytics\.com/, reason: 'Google Analytics' },
    // Facebook Pixel (if used)
    { pattern: /connect\.facebook\.net/, reason: 'Facebook Pixel' },
    // Common CDN errors
    { pattern: /cdn-cgi\/challenge-platform/, reason: 'Cloudflare Challenge' },
    // CDN resources (Font Awesome, Bootstrap, etc.)
    { pattern: /cdnjs\.cloudflare\.com/, reason: 'CDN Resource (Font Awesome, Bootstrap)' },
    { pattern: /cdn\.jsdelivr\.net/, reason: 'CDN Resource (jsDelivr)' },
    { pattern: /unpkg\.com/, reason: 'CDN Resource (unpkg)' },
    { pattern: /cdn\.bootstrapcdn\.com/, reason: 'CDN Resource (Bootstrap)' },
    { pattern: /fonts\.googleapis\.com/, reason: 'Google Fonts' },
    { pattern: /fonts\.gstatic\.com/, reason: 'Google Fonts Static' },
    { pattern: /ajax\.googleapis\.com/, reason: 'Google AJAX Libraries' },
    // Common external services
    { pattern: /api\.github\.com/, reason: 'GitHub API' },
    { pattern: /raw\.githubusercontent\.com/, reason: 'GitHub Raw Content' },
    { pattern: /gist\.github\.com/, reason: 'GitHub Gist' }
  ];

  // Allow custom patterns via environment variable
  const customPatterns = process.env.RESOURCE_IGNORE_PATTERNS;
  if (customPatterns) {
    try {
      const custom = JSON.parse(customPatterns);
      if (Array.isArray(custom)) {
        custom.forEach(item => {
          if (item.pattern && item.reason) {
            defaultPatterns.push({
              pattern: new RegExp(item.pattern),
              reason: item.reason
            });
          }
        });
      }
    } catch (err) {
      logWithTime("⚠️ Failed to parse RESOURCE_IGNORE_PATTERNS, using defaults");
    }
  }

  return defaultPatterns;
}

// Get monitoring configuration
function getMonitoringConfig() {
  // User-Agent options that analytics scripts automatically ignore:
  // 1. 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' - Google bot (most widely ignored)
  // 2. 'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)' - Bing bot
  // 3. 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)' - Yandex bot
  // 4. 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)' - Baidu bot
  // 5. 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)' - Ahrefs bot
  // 6. 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)' - Semrush bot
  // 7. 'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)' - MJ12 bot
  // 8. 'Mozilla/5.0 (compatible; DotBot/1.2; https://opensiteexplorer.org/dotbot)' - DotBot
  
  const config = {
    userAgent: process.env.MONITORING_USER_AGENT || 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    viewport: {
      width: parseInt(process.env.MONITORING_VIEWPORT_WIDTH) || 1920,
      height: parseInt(process.env.MONITORING_VIEWPORT_HEIGHT) || 1080
    },
    excludeFromAnalytics: process.env.MONITORING_EXCLUDE_ANALYTICS === 'true',
    addMonitoringHeaders: process.env.MONITORING_ADD_HEADERS !== 'false'
  };

  // Add monitoring-specific headers if enabled
  if (config.addMonitoringHeaders) {
    config.headers = {
      'User-Agent': config.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    // Add monitoring identifier headers
    if (config.excludeFromAnalytics) {
      config.headers['X-Monitoring'] = 'true';
      config.headers['X-Monitoring-Source'] = 'OhMyHost';
      config.headers['X-Monitoring-Purpose'] = 'availability-check';
    }
  }

  return config;
}

// Check if a resource should be ignored
function shouldIgnoreResource(url, resourceType) {
  const ignorePatterns = getIgnorePatterns();
  
  for (const ignore of ignorePatterns) {
    if (ignore.pattern.test(url)) {
      return { ignored: true, reason: ignore.reason };
    }
  }
  
  return { ignored: false, reason: null };
}

(async () => {
  const checksJson = process.env.MONITORING_CHECKS;
  if (!checksJson || !checksJson.trim()) {
    logWithTime("ℹ️ No MONITORING_CHECKS provided. Skipping.");
    process.exit(0);
  }

  let checks;
  try {
    checks = JSON.parse(checksJson);
    if (!Array.isArray(checks)) throw new Error("MONITORING_CHECKS must be an array");
  } catch (err) {
    errorWithTime("❌ Failed to parse MONITORING_CHECKS:", err);
    process.exit(1);
  }

  // Log monitoring configuration
  const monitoringConfig = getMonitoringConfig();
  logWithTime("🔧 Monitoring configuration:");
  logWithTime(`  - User-Agent: ${monitoringConfig.userAgent}`);
  logWithTime(`  - Viewport: ${monitoringConfig.viewport.width}x${monitoringConfig.viewport.height}`);
  logWithTime(`  - Exclude from analytics: ${monitoringConfig.excludeFromAnalytics}`);
  logWithTime(`  - Add monitoring headers: ${monitoringConfig.addMonitoringHeaders}`);

  // Initialize results array for Summary report
  const results = [];
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  let hasErrors = false;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const check of checks) {
    const { url, textToFind, makeScreenshot } = check;
    
    // Handle textToFind as array or single string
    const textsToFind = Array.isArray(textToFind) ? textToFind : [textToFind];
    
    logWithTime(`🔍 Checking ${url} for ${textsToFind.length} text(s): ${textsToFind.map(t => `"${t}"`).join(', ')}...`);

    try {
      const page = await browser.newPage();
      
      // Set headers to make monitoring look like a real browser but identifiable
      if (monitoringConfig.headers) {
        await page.setExtraHTTPHeaders(monitoringConfig.headers);
      }

      // Set viewport to common desktop resolution
      await page.setViewport(monitoringConfig.viewport);
      
      // Enable performance monitoring
      await page.setCacheEnabled(false);
      
      // Listen for performance metrics
      const performanceMetrics = [];
      page.on('metrics', data => {
        performanceMetrics.push(data);
      });

      // Listen for failed resource requests
      const failedResources = [];
      const ignoredResources = [];
      page.on('requestfailed', request => {
        const resourceType = request.resourceType();
        const url = request.url();
        const failure = request.failure();
        
        const ignoreCheck = shouldIgnoreResource(url, resourceType);
        if (ignoreCheck.ignored) {
          ignoredResources.push({
            url: url,
            type: resourceType,
            reason: ignoreCheck.reason
          });
        } else {
          failedResources.push({
            url: url,
            type: resourceType,
            error: failure?.errorText || 'Unknown error'
          });
        }
      });

      // Listen for response errors (4xx, 5xx status codes)
      page.on('response', response => {
        const status = response.status();
        if (status >= 400) {
          const resourceType = response.request().resourceType();
          const url = response.url();
          
          const ignoreCheck = shouldIgnoreResource(url, resourceType);
          if (ignoreCheck.ignored) {
            ignoredResources.push({
              url: url,
              type: resourceType,
              reason: ignoreCheck.reason
            });
          } else {
            failedResources.push({
              url: url,
              type: resourceType,
              error: `HTTP ${status}: ${response.statusText()}`
            });
          }
        }
      });

      // Measure HTML load time using performance API
      const startTime = Date.now();
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
      const htmlLoadTime = Date.now() - startTime;
      
      if (!response || !response.ok()) {
        throw new Error(`Page not reachable, status: ${response?.status()}`);
      }

      // Get accurate performance timing data from the page
      const performanceTiming = await page.evaluate(() => {
        const timing = performance.timing;
        const navigation = performance.getEntriesByType('navigation')[0];
        
        return {
          // Time from navigation start to first byte
          ttfb: timing.responseStart - timing.navigationStart,
          // Time from navigation start to DOM content loaded
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          // Time from navigation start to load complete
          loadComplete: timing.loadEventEnd - timing.navigationStart,
          // Time from navigation start to DOM interactive
          domInteractive: timing.domInteractive - timing.navigationStart,
          // First Contentful Paint (if available)
          fcp: performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime || 0
        };
      });

      // Wait for network to be idle to measure full page load
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait additional 2 seconds for any delayed resources
      const fullLoadTime = Date.now() - startTime;

      // Check for console errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push({
            message: msg.text(),
            location: msg.location()
          });
        }
      });

      const pageContent = await page.content();
      
      // Check if all required texts are found
      const missingTexts = [];
      const foundTexts = [];
      
      for (const text of textsToFind) {
        if (pageContent.includes(text)) {
          foundTexts.push(text);
        } else {
          missingTexts.push(text);
        }
      }
      
      if (missingTexts.length > 0) {
        throw new Error(`Missing texts: ${missingTexts.map(t => `"${t}"`).join(', ')}`);
      }

      // Check for resource errors
      let resourceStatus = '✅ All resources loaded successfully';
      if (failedResources.length > 0) {
        resourceStatus = `⚠️ ${failedResources.length} resource(s) failed to load`;
        logWithTime(`⚠️ Resource errors found: ${failedResources.length} failed resources`);
        failedResources.forEach(resource => {
          logWithTime(`  - ${resource.type}: ${resource.url} (${resource.error})`);
        });
      }

      // Log ignored resources for transparency
      if (ignoredResources.length > 0) {
        logWithTime(`ℹ️ Ignored ${ignoredResources.length} expected resource(s)`);
        ignoredResources.forEach(resource => {
          logWithTime(`  - ${resource.type}: ${resource.url} (${resource.reason})`);
        });
      }

      // Check for console errors
      let consoleStatus = '✅ No console errors';
      if (consoleErrors.length > 0) {
        consoleStatus = `⚠️ ${consoleErrors.length} console error(s)`;
        logWithTime(`⚠️ Console errors found: ${consoleErrors.length} errors`);
        consoleErrors.forEach(error => {
          logWithTime(`  - ${error.message}`);
        });
      }

      logWithTime(`✅ All ${foundTexts.length} texts found on ${url}`);
      logWithTime(`📊 Performance: TTFB=${performanceTiming.ttfb}ms, DOM=${performanceTiming.domContentLoaded}ms, Load=${performanceTiming.loadComplete}ms`);

      // Add successful result with performance metrics and resource status
      results.push({
        url,
        status: '✅ Success',
        notes: `All ${foundTexts.length} texts found: ${foundTexts.map(t => `"${t}"`).join(', ')}`,
        screenshot: makeScreenshot ? '📸 Yes' : 'No',
        htmlLoadTime: `${performanceTiming.ttfb}ms`,
        fullLoadTime: `${performanceTiming.loadComplete}ms`,
        domContentLoaded: `${performanceTiming.domContentLoaded}ms`,
        resources: resourceStatus,
        console: consoleStatus
      });

      if (makeScreenshot) {
        const fileName = url.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png';
        await page.screenshot({ path: fileName, fullPage: true });
        logWithTime(`📸 Screenshot saved: ${fileName}`);
      }

      await page.close();
    } catch (err) {
      errorWithTime(`❌ Error checking ${url}:`, err.message);
      hasErrors = true;
      
      // Add failed result
      results.push({
        url,
        status: '❌ Failed',
        notes: err.message,
        screenshot: 'N/A',
        htmlLoadTime: 'N/A',
        fullLoadTime: 'N/A',
        domContentLoaded: 'N/A',
        resources: 'N/A',
        console: 'N/A'
      });

      // Close the page if it was created
      try {
        if (page) await page.close();
      } catch (closeErr) {
        // Ignore close errors
      }
    }
  }

  await browser.close();

  // Create Summary report if GITHUB_STEP_SUMMARY is available
  if (summaryPath) {
    const summary = `
# 🛠 Monitoring Check Report

**Generated:** ${new Date().toLocaleString()}
**Total Checks:** ${results.length}
**Status:** ${hasErrors ? '❌ Some checks failed' : '✅ All checks passed'}

## 📊 Results Summary

| URL | Status | Notes | Screenshot | HTML Load | Full Load | DOM Ready | Performance | Resources | Console |
| --- | ------ | ----- | ---------- | --------- | --------- | --------- | ----------- | --------- | ------- |
${results.map(result => `| ${result.url} | ${result.status} | ${result.notes} | ${result.screenshot} | ${result.htmlLoadTime} | ${result.fullLoadTime} | ${result.domContentLoaded} | ${getPerformanceScore(result.htmlLoadTime, result.fullLoadTime)} | ${result.resources} | ${result.console} |`).join('\n')}

---
*Report generated automatically by [OhMyHost](https://ohmyhost.se) monitoring checks*
`;

    try {
      fs.writeFileSync(summaryPath, summary);
      logWithTime("📝 Summary report written to GITHUB_STEP_SUMMARY");
    } catch (err) {
      errorWithTime("⚠️ Failed to write Summary report:", err.message);
    }
  } else {
    logWithTime("ℹ️ GITHUB_STEP_SUMMARY not available, skipping Summary report");
  }

  if (hasErrors) {
    logWithTime("❌ Some monitoring checks failed. Check the Summary report above for details.");
    process.exit(1);
  } else {
    logWithTime("🎉 All monitoring checks completed successfully!");
  }
})();

// Helper function to calculate performance score
function getPerformanceScore(htmlLoad, fullLoad) {
  const htmlMs = parseInt(htmlLoad);
  const fullMs = parseInt(fullLoad);
  
  if (isNaN(htmlMs) || isNaN(fullMs)) return 'N/A';
  
  if (htmlMs < 500 && fullMs < 2000) return '🟢 Excellent';
  if (htmlMs < 1000 && fullMs < 3000) return '🟡 Good';
  if (htmlMs < 2000 && fullMs < 5000) return '🟠 Fair';
  return '🔴 Poor';
}