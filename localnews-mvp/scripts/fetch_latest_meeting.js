import puppeteer from 'puppeteer';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPuppeteerLaunchOptions } from './lib/chromium.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEETINGS_PATH = path.join(__dirname, '..', 'data', 'meetings.json');
const LAST_SCAN_PATH = path.join(__dirname, '..', 'data', 'last_video_scan.json');
const SCAN_STATE_API_PATH = '/api/agents/town-meeting/scan-state';

/**
 * SWAGIT VIDEO DISCOVERY - RELIABILITY ENHANCED
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
 *
 * RELIABILITY FEATURES:
 * - Early termination when hitting consecutive timeouts (non-existent IDs)
 * - Smart caching of highest valid video ID to reduce scan range
 * - Retry logic for failed/timeout requests
 * - Immediate return when Jupiter video found (no need to scan entire range)
 */

const DEFAULT_URL = 'https://jupiterfl.new.swagit.com/views/229/'; // Town Council view
const SWAGIT_URL = process.argv[2] || DEFAULT_URL;

// Configuration - OPTIMIZED FOR SPEED
const SCAN_RANGE = 10000;           // Max IDs to scan ahead (increased - videos can be 7000+ apart)
const CONCURRENT_CHECKS = 100;      // Concurrent requests (aggressive parallelism)
const MAX_RETRIES = 1;              // Retries per request
const REQUEST_TIMEOUT = 3000;       // 3 second timeout (faster failure)
const CONSECUTIVE_TIMEOUT_LIMIT = 200; // Stop after many consecutive timeouts (non-existent range)
const BATCH_DELAY = 10;             // Minimal delay between batches

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
function getHighestProcessedVideoId() {
    let highest = 370000; // Default fallback (updated Jan 2026 baseline)

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

// Load the last scan state - tries API first (persistent), then local file (fallback)
async function getLastScanState() {
    // Try API first (survives Railway deployments)
    try {
        const port = process.env.PORT || 8080;
        const apiState = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: port,
                path: SCAN_STATE_API_PATH,
                method: 'GET',
                timeout: 5000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const state = JSON.parse(body);
                            if (state.highestScannedId > 0) {
                                console.error(`  ☁️ Loaded scan state from API: highestScannedId=${state.highestScannedId}`);
                                resolve(state);
                            } else {
                                resolve(null);
                            }
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.end();
        });

        if (apiState) return apiState;
    } catch (e) {
        console.error(`  Warning: Could not load scan state from API: ${e.message}`);
    }

    // Local file is ONLY used if API is completely unavailable
    // API is the source of truth (persists across deployments, can be reset)
    try {
        if (fs.existsSync(LAST_SCAN_PATH)) {
            const localState = JSON.parse(fs.readFileSync(LAST_SCAN_PATH, 'utf-8'));
            console.error(`  📂 Fallback to local file: highestScannedId=${localState.highestScannedId}`);
            return localState;
        }
    } catch (e) { /* ignore */ }
    return null;
}

// Save scan state - saves to both API (persistent) and local file (fast fallback)
async function saveScanState(highestValidId, highestScannedId) {
    const state = {
        highestValidId,      // Highest ID that actually exists
        highestScannedId,    // Highest ID we checked
        scannedAt: new Date().toISOString()
    };

    // Save to local file first (fast, always works)
    try {
        fs.writeFileSync(LAST_SCAN_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Warning: Could not save scan state to local file');
    }

    // Also save to API (persists across deployments)
    try {
        const port = process.env.PORT || 8080;
        const data = JSON.stringify({ highestValidId, highestScannedId });

        await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: port,
                path: SCAN_STATE_API_PATH,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: 5000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.error(`  ☁️ Scan state persisted to API: highestScannedId=${highestScannedId}`);
                    } else {
                        console.error(`  ⚠️ API returned ${res.statusCode}: ${body}`);
                    }
                    resolve();
                });
            });
            req.on('error', (e) => {
                console.error(`  ⚠️ Could not save scan state to API: ${e.message}`);
                resolve();
            });
            req.on('timeout', () => {
                req.destroy();
                console.error(`  ⚠️ Timeout saving scan state to API`);
                resolve();
            });
            req.write(data);
            req.end();
        });
    } catch (e) {
        console.error(`  ⚠️ Error saving scan state to API: ${e.message}`);
    }
}

// Check if a video belongs to Jupiter FL with retry logic
async function checkVideoOwnership(videoId, retries = MAX_RETRIES) {
    return new Promise((resolve) => {
        const url = `https://jupiterfl.new.swagit.com/videos/${videoId}/download`;
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const s3Url = res.headers.location || '';
                const isJupiter = s3Url.includes('/jupiterfl/');
                if (isJupiter) {
                    console.error(`  [FOUND] Video ${videoId} belongs to Jupiter FL`);
                }
                resolve({ videoId, exists: true, isJupiter, timeout: false });
            } else if (res.statusCode === 404) {
                resolve({ videoId, exists: false, isJupiter: false, timeout: false });
            } else {
                resolve({ videoId, exists: true, isJupiter: false, timeout: false });
            }
        });

        req.on('error', async (err) => {
            if (retries > 0) {
                // Retry after a short delay
                await new Promise(r => setTimeout(r, 500));
                resolve(await checkVideoOwnership(videoId, retries - 1));
            } else {
                resolve({ videoId, exists: false, isJupiter: false, timeout: true });
            }
        });

        req.setTimeout(REQUEST_TIMEOUT, async () => {
            req.destroy();
            if (retries > 0) {
                // Retry after a short delay
                await new Promise(r => setTimeout(r, 500));
                resolve(await checkVideoOwnership(videoId, retries - 1));
            } else {
                resolve({ videoId, exists: false, isJupiter: false, timeout: true });
            }
        });

        req.end();
    });
}

// Smart batch scanning with early termination
async function scanForNewVideos(startId, processedIds) {
    const endId = startId + SCAN_RANGE;
    console.error(`METHOD 2: Smart scanning from ${startId} (max ${endId})...`);

    const jupiterVideos = [];
    let highestValidId = startId - 1;
    let highestScannedId = startId - 1;
    let consecutiveTimeouts = 0;
    let batchNum = 0;
    const totalBatches = Math.ceil(SCAN_RANGE / CONCURRENT_CHECKS);

    for (let i = startId; i <= endId; i += CONCURRENT_CHECKS) {
        batchNum++;
        const batch = [];
        for (let j = i; j < Math.min(i + CONCURRENT_CHECKS, endId + 1); j++) {
            batch.push(j.toString());
        }

        // Log progress every 20 batches
        if (batchNum % 20 === 0 || batchNum === 1) {
            console.error(`  Batch ${batchNum}/${totalBatches} (IDs ${batch[0]}-${batch[batch.length-1]}) | Found: ${jupiterVideos.length} Jupiter videos`);
        }

        // Check batch concurrently
        const results = await Promise.all(batch.map(id => checkVideoOwnership(id)));

        let batchHadValidVideo = false;
        let batchTimeouts = 0;

        for (const result of results) {
            const idNum = parseInt(result.videoId);
            highestScannedId = Math.max(highestScannedId, idNum);

            if (result.timeout) {
                batchTimeouts++;
            } else if (result.exists) {
                batchHadValidVideo = true;
                highestValidId = Math.max(highestValidId, idNum);
                consecutiveTimeouts = 0; // Reset timeout counter

                if (result.isJupiter && !processedIds.has(result.videoId)) {
                    jupiterVideos.push(result.videoId);
                    console.error(`  ✓ Found unprocessed Jupiter video: ${result.videoId}`);
                }
            }
        }

        // Track consecutive timeouts
        if (batchTimeouts === batch.length) {
            consecutiveTimeouts += batch.length;
        } else if (batchHadValidVideo) {
            consecutiveTimeouts = 0;
        }

        // EARLY TERMINATION: If we found Jupiter videos and hit many timeouts, stop
        if (jupiterVideos.length > 0 && consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_LIMIT) {
            console.error(`  ⚡ Early termination: Found ${jupiterVideos.length} Jupiter video(s) and hit ${consecutiveTimeouts} consecutive timeouts`);
            break;
        }

        // EARLY TERMINATION: If no videos exist in range, stop scanning
        if (consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_LIMIT * 2) {
            console.error(`  ⚡ Early termination: ${consecutiveTimeouts} consecutive timeouts - likely past valid ID range`);
            break;
        }

        // Small delay between batches
        if (i + CONCURRENT_CHECKS <= endId) {
            await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
    }

    // Save state for next scan (to API and local file)
    await saveScanState(highestValidId, highestScannedId);

    console.error(`  Scan complete: Found ${jupiterVideos.length} new Jupiter FL video(s)`);
    console.error(`  Highest valid ID: ${highestValidId}, Scanned up to: ${highestScannedId}`);

    return jupiterVideos;
}

// METHOD 1: Try to get videos from the Swagit page
async function getVideosFromPage() {
    console.error('METHOD 1: Checking Swagit view page...');
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    try {
        const page = await browser.newPage();
        await page.goto(SWAGIT_URL, { waitUntil: 'networkidle0', timeout: 30000 });

        try {
            await page.waitForSelector('a[href*="/videos/"]', { timeout: 10000 });
        } catch (e) {
            console.error('  No video links found on page');
            return [];
        }

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

async function getLatestMeetingId() {
    const processedIds = getProcessedVideoIds();
    if (processedIds.size > 0) {
        console.error(`Already processed ${processedIds.size} meetings, will skip those...`);
    }

    // Get the lowest processed ID to establish a baseline for "last month"
    // We only want to check videos NEWER than our oldest processed video minus ~5000 IDs
    // (roughly 1 month of videos across all Swagit municipalities)
    const highestProcessed = getHighestProcessedVideoId();
    const oneMonthBuffer = 5000; // ~1 month worth of video IDs across all municipalities
    const minimumVideoId = Math.max(highestProcessed - oneMonthBuffer, 360000); // Don't go below baseline

    console.error(`Looking for videos from last month (ID >= ${minimumVideoId})...`);

    // Collect unprocessed Jupiter videos from the Swagit view page
    let allUnprocessedVideos = [];

    const pageVideoIds = await getVideosFromPage();

    if (pageVideoIds.length > 0) {
        // Only check videos within the last month range
        const recentPageVideos = pageVideoIds.filter(id => parseInt(id) >= minimumVideoId);
        const maxToCheck = Math.min(recentPageVideos.length, 30);
        console.error(`Checking ${maxToCheck} recent videos from page...`);

        for (let i = 0; i < maxToCheck; i++) {
            const videoId = recentPageVideos[i];

            if (processedIds.has(videoId)) {
                continue; // Already processed, skip silently
            }

            const result = await checkVideoOwnership(videoId);
            if (result.isJupiter) {
                console.error(`  ✓ Found unprocessed Jupiter video: ${videoId}`);
                allUnprocessedVideos.push(videoId);
            }
        }
    }

    // If page didn't find anything, do a targeted scan from highest processed
    if (allUnprocessedVideos.length === 0) {
        const lastScan = await getLastScanState();
        let startId = highestProcessed + 1;

        if (lastScan && lastScan.highestScannedId) {
            const lastScanAge = Date.now() - new Date(lastScan.scannedAt).getTime();
            const hoursSinceLastScan = lastScanAge / (1000 * 60 * 60);

            if (hoursSinceLastScan < 168) { // 7 days
                const scanBasedStart = lastScan.highestScannedId - 500;
                if (scanBasedStart > startId) {
                    startId = scanBasedStart;
                    console.error(`  Using cached scan state: continuing from ~${startId}`);
                }
            }
        }

        console.error(`\nPage didn't yield new videos. Scanning from ${startId}...`);
        const newVideos = await scanForNewVideos(startId, processedIds);
        allUnprocessedVideos = allUnprocessedVideos.concat(newVideos);
    }

    if (allUnprocessedVideos.length > 0) {
        // Return the OLDEST (smallest ID) unprocessed video - process in order
        const sortedVideos = [...new Set(allUnprocessedVideos)].sort((a, b) => parseInt(a) - parseInt(b));
        console.error(`\nFound ${sortedVideos.length} unprocessed Jupiter video(s): ${sortedVideos.join(', ')}`);
        console.error(`Processing oldest first: ${sortedVideos[0]}`);
        console.log(sortedVideos[0]);
        return;
    }

    // No new meetings found
    console.error('NO_NEW_MEETINGS: All recent videos already processed or no new Jupiter FL videos found');
    process.exit(2);
}

getLatestMeetingId();
