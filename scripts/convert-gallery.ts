import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ASSETS_DIR = join(__dirname, '..', 'assets');

async function convertGallery() {
    console.log('Converting gallery images to PNG...\n');

    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });

    for (let i = 1; i <= 5; i++) {
        const htmlPath = join(ASSETS_DIR, `gallery-image-${i}.html`);
        const pngPath = join(ASSETS_DIR, `gallery-image-${i}.png`);

        console.log(`Processing gallery-image-${i}.html...`);

        try {
            const page = await context.newPage();
            await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
            await page.screenshot({
                path: pngPath,
                fullPage: false,
                type: 'png',
            });
            await page.close();
            console.log(`  → gallery-image-${i}.png created`);
        } catch (err) {
            console.error(`  ✗ Failed: ${err.message}`);
        }
    }

    await browser.close();

    console.log('\n✓ All gallery images converted!');
    console.log('\nNext steps:');
    console.log('1. Verify the PNGs look correct');
    console.log('2. Commit: git add assets/gallery-image-*.png');
    console.log('3. Push when GitHub auth is fixed');
}

convertGallery().catch(console.error);
