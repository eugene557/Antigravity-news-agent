#!/usr/bin/env node
/**
 * Bootstrap Past Meetings Script (OPTIMIZED)
 * 
 * Scrapes recent meetings from Swagit archives for all departments.
 * Uses direct transcript extraction (no video download needed).
 * 
 * OPTIMIZATIONS:
 * 1. Filters only December 2025+ meetings (configurable cutoff)
 * 2. Parallel department scraping
 * 3. Concurrent transcript extraction
 * 4. Skip already processed meetings early
 * 5. Reduced wait times and optimized selectors
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPuppeteerLaunchOptions } from './lib/chromium.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONCURRENCY = 3; // Number of parallel transcript extractions
const CUTOFF_DATE = new Date('2025-12-01'); // Only scrape from December 2025 onwards

// Department configurations with their Swagit view URLs
const DEPARTMENTS = [
    {
        id: 'town-council',
        name: 'Town Council',
        viewUrl: 'https://jupiterfl.new.swagit.com/views/418/town-council'
    },
    {
        id: 'cra',
        name: 'CRA (Community Redevelopment Agency)',
        viewUrl: 'https://jupiterfl.new.swagit.com/views/418/cra-meetings'
    },
    {
        id: 'planning-zoning',
        name: 'Planning & Zoning',
        viewUrl: 'https://jupiterfl.new.swagit.com/views/418/pz-meetings'
    }
];

const MEETINGS_FILE = path.join(__dirname, '..', 'data', 'meetings.json');
const DATA_DIR = path.join(__dirname, '..', 'data', 'swagit');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load existing meetings to skip already processed
function getProcessedVideoIds() {
    if (!fs.existsSync(MEETINGS_FILE)) return new Set();
    try {
        const meetings = JSON.parse(fs.readFileSync(MEETINGS_FILE, 'utf-8'));
        return new Set(meetings.map(m => m.videoId).filter(Boolean));
    } catch {
        return new Set();
    }
}

/**
 * Get meetings from December 2025 onwards for a department
 * OPTIMIZED: Faster selectors, reduced timeouts
 */
async function scrapeDepartmentMeetings(browser, dept) {
    console.log(`\n📂 Scraping ${dept.name}...`);

    const page = await browser.newPage();

    // Disable images and CSS for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const type = req.resourceType();
        if (type === 'image' || type === 'stylesheet' || type === 'font') {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        await page.goto(dept.viewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('a[href*="/videos/"]', { timeout: 8000 });

        // Get meeting links from the archive
        const meetings = await page.evaluate(() => {
            const results = [];

            // Find video links with dates
            document.querySelectorAll('a[href*="/videos/"]').forEach(link => {
                const href = link.getAttribute('href');
                const videoIdMatch = href.match(/\/videos\/(\d+)/);
                if (videoIdMatch) {
                    const videoId = videoIdMatch[1];
                    const row = link.closest('tr') || link.parentElement;
                    const rowText = row ? row.textContent : link.textContent;

                    // Extract date (format: "Dec 16, 2025" or similar)
                    const dateMatch = rowText.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/);

                    if (dateMatch && !results.find(r => r.videoId === videoId)) {
                        results.push({
                            videoId,
                            dateText: `${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`,
                            title: link.textContent.trim()
                        });
                    }
                }
            });

            return results;
        });

        // Filter to December 2025 and onwards only
        const cutoffTimestamp = CUTOFF_DATE.getTime();

        const recentMeetings = meetings.filter(m => {
            try {
                const meetingDate = new Date(m.dateText);
                return meetingDate.getTime() >= cutoffTimestamp;
            } catch {
                return false;
            }
        });

        console.log(`   Found ${recentMeetings.length} meetings from Dec 2025+`);

        return recentMeetings.map(m => ({
            ...m,
            departmentId: dept.id,
            departmentName: dept.name
        }));

    } catch (error) {
        console.error(`   ❌ Error scraping ${dept.name}: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
}

/**
 * Scrape transcript from a video page
 * OPTIMIZED: Faster page load, skip resources
 */
async function scrapeTranscript(browser, videoId) {
    const page = await browser.newPage();

    // Disable images and CSS for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const type = req.resourceType();
        if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
            req.abort();
        } else {
            req.continue();
        }
    });

    const url = `https://jupiterfl.new.swagit.com/videos/${videoId}`;

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait for transcript tab to load
        await page.waitForSelector('#transcript, .transcript', { timeout: 8000 });

        // Extract transcript text
        const transcript = await page.evaluate(() => {
            const transcriptTab = document.querySelector('#transcript');
            if (!transcriptTab) return null;

            // Get all transcript lines
            const lines = transcriptTab.querySelectorAll('a[aria-label]');
            const segments = [];

            lines.forEach(line => {
                const label = line.getAttribute('aria-label');
                if (label) {
                    const text = label.replace(' Select to skip to this part of the video', '').trim();
                    if (text) {
                        segments.push({ text });
                    }
                }
            });

            return {
                segments,
                fullText: segments.map(s => s.text).join(' ')
            };
        });

        if (transcript && transcript.segments.length > 0) {
            return transcript;
        } else {
            return null;
        }

    } catch (error) {
        console.error(`   ❌ Error getting transcript for ${videoId}: ${error.message}`);
        return null;
    } finally {
        await page.close();
    }
}

/**
 * Process meetings in parallel batches
 */
async function processMeetingBatch(browser, meetings, processedIds, existingMeetings) {
    const results = [];

    for (let i = 0; i < meetings.length; i += CONCURRENCY) {
        const batch = meetings.slice(i, i + CONCURRENCY);
        const batchPromises = batch.map(async (meeting) => {
            // Skip if already processed
            if (processedIds.has(meeting.videoId)) {
                console.log(`⏭️  Skipping ${meeting.videoId} (already processed)`);
                return null;
            }

            console.log(`🔄 [${meeting.departmentName}] Processing: ${meeting.title || meeting.videoId}`);
            console.log(`   Date: ${meeting.dateText}`);

            const transcript = await scrapeTranscript(browser, meeting.videoId);

            if (transcript) {
                // Save transcript
                const transcriptPath = path.join(DATA_DIR, `${meeting.videoId}_transcript.json`);
                fs.writeFileSync(transcriptPath, JSON.stringify({
                    videoId: meeting.videoId,
                    segments: transcript.segments,
                    fullText: transcript.fullText,
                    metadata: {
                        department: meeting.departmentId,
                        date: meeting.dateText,
                        scrapedAt: new Date().toISOString()
                    }
                }, null, 2));

                // Parse date to ISO format
                let isoDate = null;
                try {
                    const d = new Date(meeting.dateText);
                    isoDate = d.toISOString().split('T')[0];
                } catch { }

                const newMeeting = {
                    id: meeting.videoId,
                    videoId: meeting.videoId,
                    departmentId: meeting.departmentId,
                    type: meeting.departmentName,
                    date: isoDate,
                    status: 'transcribed',
                    description: meeting.title,
                    processedAt: new Date().toISOString()
                };

                console.log(`   ✅ Saved (${transcript.segments.length} segments)`);
                return newMeeting;
            }
            return null;
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean));
    }

    return results;
}

/**
 * Main execution - OPTIMIZED with parallel processing
 */
async function main() {
    const startTime = Date.now();
    console.log('🚀 Past Meetings Bootstrap Script (OPTIMIZED)');
    console.log('='.repeat(50));
    console.log(`📅 Cutoff date: ${CUTOFF_DATE.toDateString()}`);
    console.log(`⚡ Concurrency: ${CONCURRENCY} parallel extractions\n`);

    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    try {
        // Load existing meetings
        let meetings = [];
        if (fs.existsSync(MEETINGS_FILE)) {
            meetings = JSON.parse(fs.readFileSync(MEETINGS_FILE, 'utf-8'));
        }
        const processedIds = getProcessedVideoIds();
        console.log(`📋 Already processed: ${processedIds.size} meetings`);

        // OPTIMIZATION: Scrape all departments in parallel
        console.log('\n📡 Scraping all departments in parallel...');
        const deptResults = await Promise.all(
            DEPARTMENTS.map(dept => scrapeDepartmentMeetings(browser, dept))
        );

        const allMeetingsToProcess = deptResults.flat();
        console.log(`\n📊 Total meetings found: ${allMeetingsToProcess.length}`);

        // Filter out already processed
        const newMeetings = allMeetingsToProcess.filter(m => !processedIds.has(m.videoId));
        console.log(`📥 New meetings to process: ${newMeetings.length}`);

        if (newMeetings.length === 0) {
            console.log('✅ All meetings already processed. Nothing to do.');
            return;
        }

        // OPTIMIZATION: Process transcripts in parallel batches
        console.log(`\n⚡ Processing transcripts (${CONCURRENCY} at a time)...`);
        const processedMeetings = await processMeetingBatch(browser, newMeetings, processedIds, meetings);

        // Add new meetings to registry
        meetings.push(...processedMeetings);
        fs.writeFileSync(MEETINGS_FILE, JSON.stringify(meetings, null, 2));

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n' + '='.repeat(50));
        console.log(`✅ Bootstrap Complete!`);
        console.log(`   Processed: ${processedMeetings.length} meetings`);
        console.log(`   Total in registry: ${meetings.length}`);
        console.log(`   ⏱️  Time elapsed: ${elapsed}s`);
        console.log('\nNext step: Run analysis with:');
        console.log('   node agents/town-meeting/scrape.js');

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
