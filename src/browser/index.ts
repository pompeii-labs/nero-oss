import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config.js';

import type { Browser, BrowserContext, Page } from 'playwright';

export interface BrowserSettings {
    headless: boolean;
    timeout: number;
    viewport: { width: number; height: number };
}

const DEFAULTS: BrowserSettings = {
    headless: true,
    timeout: 30000,
    viewport: { width: 1280, height: 720 },
};

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const COOKIE_SELECTORS = [
    '#onetrust-accept-btn-handler',
    '[id*="cookie"] button[id*="accept"]',
    '[id*="cookie"] button[id*="agree"]',
    '[class*="cookie"] button[class*="accept"]',
    '[class*="consent"] button[class*="accept"]',
    'button[class*="cookie-accept"]',
    '[data-testid="cookie-accept"]',
    '.cc-accept',
    '.cc-btn.cc-dismiss',
];

export class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private _available: boolean | null = null;
    private settings: BrowserSettings;

    constructor(settings?: Partial<BrowserSettings>) {
        this.settings = { ...DEFAULTS, ...settings };
    }

    isAvailable(): boolean {
        if (this._available !== null) return this._available;

        try {
            require.resolve('playwright');
        } catch {
            this._available = false;
            return false;
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { execSync } = require('child_process');
            const result = execSync('npx playwright install --dry-run chromium 2>&1', {
                timeout: 5000,
                stdio: ['pipe', 'pipe', 'pipe'],
            }).toString();
            this._available = !result.includes('not installed');
        } catch {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const playwrightModule = require('playwright');
                const browserPath =
                    playwrightModule.chromium?.executablePath?.() ||
                    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
                this._available = !!browserPath && existsSync(browserPath);
            } catch {
                this._available = false;
            }
        }

        return this._available;
    }

    async ensureBrowser(): Promise<Page> {
        if (this.page && !this.page.isClosed()) return this.page;

        if (!this.browser || !this.browser.isConnected()) {
            const { chromium } = await import('playwright');
            const launchArgs = ['--disable-blink-features=AutomationControlled'];
            const channels = ['chrome', 'msedge'];
            let launched = false;
            for (const channel of channels) {
                try {
                    this.browser = await chromium.launch({
                        channel,
                        headless: this.settings.headless,
                        args: launchArgs,
                    });
                    launched = true;
                    break;
                } catch {}
            }
            if (!launched) {
                this.browser = await chromium.launch({
                    headless: this.settings.headless,
                    args: launchArgs,
                });
            }
            this.context = await this.browser.newContext({
                viewport: this.settings.viewport,
                userAgent: USER_AGENT,
                bypassCSP: true,
            });
            await this.context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
        }

        this.page = await this.context!.newPage();
        this.page.setDefaultTimeout(this.settings.timeout);
        return this.page;
    }

    async execute(operation: string, args: Record<string, any>): Promise<string> {
        switch (operation) {
            case 'navigate':
                return this.navigate(args.url);
            case 'click':
                return this.click(args.selector, args.force);
            case 'type':
                return this.type(args.selector, args.text);
            case 'screenshot':
                return this.screenshot(args.fullPage);
            case 'extract':
                return this.extract(args.selector);
            case 'evaluate':
                return this.evaluate(args.script);
            case 'back':
                return this.goBack();
            case 'scroll':
                return this.scroll(args.direction, args.amount);
            case 'close':
                await this.closeBrowser();
                return 'Browser closed';
            default:
                return `Unknown operation: ${operation}`;
        }
    }

    private async navigate(url: string): Promise<string> {
        const page = await this.ensureBrowser();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        const status = response?.status() ?? 'unknown';
        await this.dismissCookieBanners(page);
        return `Navigated to ${page.url()} (status: ${status}). Title: "${await page.title()}"`;
    }

    private async dismissCookieBanners(page: Page): Promise<void> {
        for (const selector of COOKIE_SELECTORS) {
            try {
                const btn = page.locator(selector).first();
                if (await btn.isVisible({ timeout: 500 })) {
                    await btn.click({ timeout: 2000 });
                    await page.waitForTimeout(300);
                    return;
                }
            } catch {}
        }
    }

    private async click(selector: string, force?: boolean): Promise<string> {
        const page = await this.ensureBrowser();
        const locator = page.locator(selector).first();
        await locator.click({ force: force ?? false });
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        return `Clicked "${selector}". Current page: ${page.url()}`;
    }

    private async type(selector: string, text: string): Promise<string> {
        const page = await this.ensureBrowser();
        await page.fill(selector, text);
        return `Typed into "${selector}"`;
    }

    private async screenshot(fullPage?: boolean): Promise<string> {
        const page = await this.ensureBrowser();
        const dir = join(getConfigDir(), 'browser', 'screenshots');
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = join(dir, `${timestamp}.png`);

        await page.screenshot({ path: filePath, fullPage: fullPage ?? false });

        const title = await page.title();
        return `Screenshot saved to ${filePath}\nPage: "${title}" (${page.url()})`;
    }

    private async extract(selector?: string): Promise<string> {
        const page = await this.ensureBrowser();
        let text: string;
        if (selector) {
            const locator = page.locator(selector);
            const count = await locator.count();
            if (count === 0) {
                text = '';
            } else if (count === 1) {
                text = await locator.innerText();
            } else {
                const texts = await locator.allInnerTexts();
                text = texts.join('\n\n');
            }
        } else {
            text = await page.locator('body').innerText();
        }
        const truncated = text.length > 10000 ? text.slice(0, 10000) + '\n...(truncated)' : text;
        const title = await page.title();
        return `Page: "${title}" (${page.url()})\n\n${truncated}`;
    }

    private async evaluate(js: string): Promise<string> {
        const page = await this.ensureBrowser();
        const result = await page.evaluate(js);
        if (result === undefined || result === null) return 'undefined';
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    }

    private async goBack(): Promise<string> {
        const page = await this.ensureBrowser();
        await page.goBack({ waitUntil: 'domcontentloaded' });
        return `Navigated back to ${page.url()}. Title: "${await page.title()}"`;
    }

    private async scroll(direction: 'up' | 'down', amount?: number): Promise<string> {
        const page = await this.ensureBrowser();
        const pixels = amount ?? 500;
        const delta = direction === 'down' ? pixels : -pixels;
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(300);
        return `Scrolled ${direction} by ${pixels}px on ${page.url()}`;
    }

    private async closeBrowser(): Promise<void> {
        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }

    async shutdown(): Promise<void> {
        await this.closeBrowser();
    }
}
