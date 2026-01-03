const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../network_logs.json');

async function main() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Capture requests
    const capturedRequests = [];
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (['xhr', 'fetch'].includes(request.resourceType())) {
            const reqData = {
                url: request.url(),
                method: request.method(),
                headers: request.headers(),
                postData: request.postData(),
            };
            capturedRequests.push(reqData);
            if (request.url().includes('incidents') || request.url().includes('search')) {
                console.log('Detected potential API call:', request.url());
            }
        }
        request.continue();
    });

    try {
        console.log('Navigating to communitycrimemap.com...');
        await page.goto('https://communitycrimemap.com', { waitUntil: 'networkidle2' });

        // Wait for search box
        console.log('Waiting for search input...');
        // Note: I might need to update selectors based on actual site.
        // I'll try generic selectors or just wait for network idle if initial load fetches data.

        // Sometimes the site loads with a default view.
        // Let's try to search.
        const searchSelector = '#address-search-box-input'; // Hypothetical ID, will try to find generic
        // Actually, let's just dump the HTML if we fail to find selectors, or take a screenshot.
        // But for now, let's wait a bit and capture initial load requests.

        await new Promise(r => setTimeout(r, 5000));

        console.log('Capturing Initial Requests...');

        // Try to search if possible
        // Based on typical map apps, there is an input.
        // I'll assume I might not be able to interact easily without known selectors.
        // But valid requests might happen on load (for default location or config).

    } catch (e) {
        console.error('Error:', e);
    } finally {
        console.log(`Saving ${capturedRequests.length} requests to logs...`);
        fs.writeFileSync(LOG_FILE, JSON.stringify(capturedRequests, null, 2));
        await browser.close();
    }
}

main();
