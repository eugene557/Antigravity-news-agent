import puppeteer from 'puppeteer';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPuppeteerLaunchOptions } from './lib/chromium.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEETINGS_PATH = path.join(__dirname, '..', 'data', 'meetings.json');
const LAST_SCAN_PATH = path.join(__dirname, '..', 'data', 'last_video_scan.json');

/**
 * SWAGIT VIDEO DISCOVERY
 *
 * IMPORTANT: The Swagit platform hosts videos for MANY municipalities on a shared system.
 * Video IDs are sequential across ALL municipalities, not just Jupiter FL.
 *
 * The /views/229/ page can sometimes be CACHED or STALE, not showing recent videos.
 *
 * This script uses TWO methods to find Jupiter FL videos:
 * 1. PRIMARY: Scan the Swagit view page for video links (fast but can be stale)
 * 2. FALLBACK: Scan video IDs sequentially to find new Jupiter FL content (slower but reliable)
 *
 * A video belongs to Jupiter FL if its S3 download URL contains '/jupiterfl/'
 */

const DEFAULT_URL = 'https://jupiterfl.new.swagit.com/views/229/'; // Town Council view
const SWAGIT_URL = process.argv[2] || DEFAULT_URL;

// How many video IDs to scan ahead when doing fallback scan
// NOTE: Swagit IDs are sequential across ALL municipalities, so gaps can be large
// Between Jupiter meetings, there can be 6000+ videos from other cities
const SCAN_RANGE = 10000;
// How many concurrent requests during ID scanning
const CONCURRENT_CHECKS = 50;

// Load already-processed video IDs
function getProcessedVideoIds() {
    try {
        if (fs.existsSync(MEETINGS_PATH)) {
            const meetings = JSON.parse(fs.readFileSync(MEETINGS_PATH, 'utf-8'));
            return new Set(meetings.filter(m => m.videoId).map(m => m.videoId));
        }
    } catch (e) { /* ignore */ }
    return new Set();
}

// Get the highest PROCESSED video ID from meetings.json
// NOTE: We intentionally ignore last_video_scan.json here to ensure we always
// check the range starting from the last processed video. This prevents missing
// videos that fall between processed videos (e.g., 371281 processed, 372045 not yet)
function getHighestProcessedVideoId() {
    let highest = 364781; // Default fallback (known Dec 2025 meeting)

    try {
        if (fs.existsSync(MEETINGS_PATH)) {
            const meetings = JSON.parse(fs.readFileSync(MEETINGS_PATH, 'utf-8'));
            meetings.forEach(m => {
                if (m.videoId && m.status === 'processed') {
                    const id = parseInt(m.videoId);
                    if (id > highest) highest = id;
                }
            });
        }
    } catch (e) { /* ignore */ }

    return highest;
}

// Save the highest scanned ID for next time
function saveLastScan(highestId) {
    try {
        fs.writeFileSync(LAST_SCAN_PATH, JSON.stringify({
            highestScannedId: highestId,
            scannedAt: new Date().toISOString()
        }, null, 2));
    } catch (e) {
        console.error('Warning: Could not save last scan state');
    }
}

// Check if a video belongs to Jupiter FL by checking its S3 URL
async function checkVideoOwnership(videoId) {
    return new Promise((resolve) => {
        const url = `https://jupiterfl.new.swagit.com/videos/${videoId}/download`;
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const s3Url = res.headers.location || '';
                // Check if the S3 URL contains jupiterfl
                const isJupiter = s3Url.includes('/jupiterfl/');
                resolve({ videoId, exists: true, isJupiter });
            } else {
                resolve({ videoId, exists: res.statusCode !== 404, isJupiter: false });
            }
        });
        req.on('error', () => resolve({ videoId, exists: false, isJupiter: false }));
        req.setTimeout(10000, () => { req.destroy(); resolve({ videoId, exists: false, isJupiter: false }); });
        req.end();
    });
}

// Batch check multiple video IDs concurrently
async function batchCheckVideos(videoIds) {
    const results = [];
    for (let i = 0; i < videoIds.length; i += CONCURRENT_CHECKS) {
        const batch = videoIds.slice(i, i + CONCURRENT_CHECKS);
        const batchResults = await Promise.all(batch.map(id => checkVideoOwnership(id)));
        results.push(...batchResults);
    }
    return results;
}

// METHOD 1: Try to get videos from the Swagit page
async function getVideosFromPage() {
    console.error('METHOD 1: Checking Swagit view page...');
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    try {
        const page = await browser.newPage();
        await page.goto(SWAGIT_URL, { waitUntil: 'networkidle0', timeout: 30000 });

        // Wait for video links to appear
        try {
            await page.waitForSelector('a[href*="/videos/"]', { timeout: 10000 });
        } catch (e) {
            console.error('  No video links found on page');
            return [];
        }

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

        console.error(`  Found ${videoIds.length} video IDs on page`);
        return videoIds;

    } catch (error) {
        console.error(`  Page scrape failed: ${error.message}`);
        return [];
    } finally {
        await browser.close();
    }
}

// METHOD 2: Scan video IDs sequentially to find new Jupiter FL videos
async function scanForNewVideos(startId, processedIds) {
    console.error(`METHOD 2: Scanning video IDs from ${startId} to ${startId + SCAN_RANGE}...`);

    const jupiterVideos = [];
    let highestChecked = startId;
    let consecutiveNotFound = 0;

    // Generate IDs to check
    const idsToCheck = [];
    for (let i = startId; i <= startId + SCAN_RANGE; i++) {
        idsToCheck.push(i.toString());
    }

    // Check in batches
    const results = await batchCheckVideos(idsToCheck);

    for (const result of results) {
        const idNum = parseInt(result.videoId);
        if (idNum > highestChecked) highestChecked = idNum;

        if (result.exists) {
            consecutiveNotFound = 0;
            if (result.isJupiter && !processedIds.has(result.videoId)) {
                console.error(`  Found Jupiter FL video: ${result.videoId}`);
                jupiterVideos.push(result.videoId);
            }
        } else {
            consecutiveNotFound++;
        }
    }

    // Save highest scanned for next time
    saveLastScan(highestChecked);

    console.error(`  Scan complete. Found ${jupiterVideos.length} new Jupiter FL video(s)`);
    return jupiterVideos;
}

async function getLatestMeetingId() {
    const processedIds = getProcessedVideoIds();
    if (processedIds.size > 0) {
        console.error(`Already processed ${processedIds.size} meetings, will skip those...`);
    }

    // METHOD 1: Try page scraping first
    const pageVideoIds = await getVideosFromPage();

    // Check page videos for new Jupiter FL content
    if (pageVideoIds.length > 0) {
        const maxToCheck = Math.min(pageVideoIds.length, 10);
        console.error(`Checking ${maxToCheck} videos from page for Jupiter FL content...`);

        for (let i = 0; i < maxToCheck; i++) {
            const videoId = pageVideoIds[i];

            if (processedIds.has(videoId)) {
                console.error(`  Skipping ${videoId} (already processed)`);
                continue;
            }

            const result = await checkVideoOwnership(videoId);
            if (result.isJupiter) {
                console.log(videoId);
                return;
            }
        }
    }

    // METHOD 2: Fallback to ID scanning
    // This catches videos that exist but aren't showing on the (possibly stale) view page
    // Always start from highest PROCESSED video to catch any missed videos in between
    const highestProcessed = getHighestProcessedVideoId();
    console.error(`\nPage didn't yield new videos. Falling back to ID scan starting from ${highestProcessed + 1}...`);

    const newVideos = await scanForNewVideos(highestProcessed + 1, processedIds);

    if (newVideos.length > 0) {
        // Return the first (oldest) new video found
        const sortedVideos = newVideos.sort((a, b) => parseInt(a) - parseInt(b));
        console.log(sortedVideos[0]);
        return;
    }

    // No new meetings found
    console.error('NO_NEW_MEETINGS: All recent videos already processed or no new Jupiter FL videos found');
    process.exit(2);
}

getLatestMeetingId();
