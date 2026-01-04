
import puppeteer from 'puppeteer';
import https from 'https';

const DEFAULT_URL = 'https://jupiterfl.new.swagit.com/views/229/'; // Town Council view
const SWAGIT_URL = process.argv[2] || DEFAULT_URL;

// Check if a video belongs to Jupiter FL by checking its S3 URL
async function isJupiterVideo(videoId) {
    return new Promise((resolve) => {
        const url = `https://jupiterfl.new.swagit.com/videos/${videoId}/download`;
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const s3Url = res.headers.location || '';
                // Check if the S3 URL contains jupiterfl
                const isJupiter = s3Url.includes('/jupiterfl/');
                resolve(isJupiter);
            } else {
                resolve(false);
            }
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}

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

        // Extract ALL video IDs from the page
        const videoIds = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/videos/"]'));
            const ids = [];
            const seen = new Set();

            for (const link of links) {
                const href = link.getAttribute('href');
                const match = href.match(/\/videos\/(\d+)/);
                if (match && !seen.has(match[1])) {
                    seen.add(match[1]);
                    ids.push(match[1]);
                }
            }
            return ids;
        });

        if (videoIds.length === 0) {
            throw new Error('No video IDs found on page');
        }

        // Find the first video that actually belongs to Jupiter FL
        // Only check first 5 videos to avoid long waits
        const maxToCheck = Math.min(videoIds.length, 5);
        console.error(`Checking ${maxToCheck} of ${videoIds.length} videos for Jupiter FL content...`);

        for (let i = 0; i < maxToCheck; i++) {
            const videoId = videoIds[i];
            console.error(`  Checking ${videoId}...`);
            const isJupiter = await isJupiterVideo(videoId);
            if (isJupiter) {
                console.log(videoId);
                return;
            }
        }

        // Exit with code 2 to indicate "no new meetings" (not an error, just nothing to process)
        console.error('NO_NEW_MEETINGS: All recent videos belong to other agencies');
        process.exit(2);

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

getLatestMeetingId();
