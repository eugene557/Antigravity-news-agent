
import puppeteer from 'puppeteer';

const DEFAULT_URL = 'https://jupiterfl.new.swagit.com/views/229/'; // Town Council view
const SWAGIT_URL = process.argv[2] || DEFAULT_URL;

async function getLatestMeetingId() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Go to page
        await page.goto(SWAGIT_URL, { waitUntil: 'networkidle0' });

        // Wait for video links to appear
        await page.waitForSelector('a[href*="/videos/"]', { timeout: 10000 });

        // Extract the first video ID
        const latestId = await page.evaluate(() => {
            // Find all links containing /videos/
            const links = Array.from(document.querySelectorAll('a[href*="/videos/"]'));

            // Look for the first one that looks like a video ID (numeric)
            for (const link of links) {
                const href = link.getAttribute('href');
                const match = href.match(/\/videos\/(\d+)/);
                if (match) {
                    return match[1];
                }
            }
            return null;
        });

        if (!latestId) {
            throw new Error('No video ID found on page');
        }

        // Output ONLY the ID so it can be consumed by other scripts
        console.log(latestId);

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

getLatestMeetingId();
