#!/usr/bin/env node

/**
 * Town Meeting Scraper (Orchestrator)
 *
 * Orchestrates the full pipeline for the dashboard:
 * 1. Download Video (scripts/swagit_downloader.js)
 * 2. Transcribe (agents/town-meeting/transcribe.js)
 * 3. Analyze (agents/town-meeting/analyze.js)
 *
 * Modes:
 * - Default: Fetches latest meeting from Swagit for the selected department
 * - Upcoming: Processes scheduled meetings from meetings.json when their date has passed
 *
 * This satisfies server.js expectation of a 'scrape.js' entry point.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

// Configuration
const DOWNLOADER_SCRIPT = path.join(ROOT_DIR, 'scripts/swagit_downloader.js');
const TRANSCRIBE_SCRIPT = path.join(__dirname, 'transcribe.js');
const ANALYZE_SCRIPT = path.join(__dirname, 'analyze.js');

const DATA_DIR = path.join(ROOT_DIR, 'data/swagit');
const SETTINGS_PATH = path.join(ROOT_DIR, 'data/town_meeting_settings.json');
const MEETINGS_PATH = path.join(ROOT_DIR, 'data/meetings.json');

async function runStep(scriptPath, args = []) {
    console.log(`\n▶️ Running: ${path.basename(scriptPath)} ${args.join(' ')}`);
    return new Promise((resolve, reject) => {
        const proc = spawn('node', [scriptPath, ...args], {
            cwd: ROOT_DIR,
            stdio: 'inherit',
            env: process.env
        });

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${path.basename(scriptPath)} failed with code ${code}`));
        });

        proc.on('error', reject);
    });
}

async function getLatestMeetingId(departmentId = 'town-council') {
    let swagitUrl = 'https://jupiterfl.new.swagit.com/views/229/'; // Default

    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            const dept = settings.departments.find(d => d.id === departmentId);
            if (dept && dept.viewId) {
                swagitUrl = `https://jupiterfl.new.swagit.com/views/${dept.viewId}/`;
                console.log(`🔎 Found view ID ${dept.viewId} for department "${dept.name}"`);
            } else {
                console.warn(`⚠️  Department "${departmentId}" not found or has no viewId. Using default Town Council.`);
            }
        }
    } catch (e) {
        console.warn(`⚠️  Error loading settings: ${e.message}. Using default.`);
    }

    console.log(`🔎 Finding latest meeting for: ${swagitUrl}`);
    return new Promise((resolve, reject) => {
        const proc = spawn('node', [path.join(ROOT_DIR, 'scripts/fetch_latest_meeting.js'), swagitUrl], {
            cwd: ROOT_DIR,
            env: process.env
        });

        let output = '';
        proc.stdout.on('data', (data) => { output += data.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                const id = output.trim();
                if (id && /^\d+$/.test(id)) {
                    console.log(`   Found latest meeting ID: ${id}`);
                    resolve(id);
                } else {
                    reject(new Error(`Invalid ID returned: ${output}`));
                }
            } else {
                reject(new Error('Failed to fetch meeting ID'));
            }
        });
    });
}

/**
 * Get upcoming meetings that are ready to be processed
 * (date has passed and status is still 'upcoming')
 */
function getReadyUpcomingMeetings(departmentId = null) {
    if (!fs.existsSync(MEETINGS_PATH)) {
        return [];
    }

    try {
        const meetings = JSON.parse(fs.readFileSync(MEETINGS_PATH, 'utf-8'));
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return meetings.filter(m => {
            // Only upcoming meetings whose date has passed
            if (m.status !== 'upcoming') return false;
            const meetingDate = new Date(m.date + 'T23:59:59');
            if (meetingDate > today) return false;
            // Filter by department if specified
            if (departmentId && m.departmentId !== departmentId) return false;
            return true;
        });
    } catch (e) {
        console.warn(`⚠️  Error reading meetings: ${e.message}`);
        return [];
    }
}

/**
 * Update meeting status in meetings.json
 */
function updateMeetingStatus(meetingId, status, videoId = null) {
    if (!fs.existsSync(MEETINGS_PATH)) return;

    try {
        const meetings = JSON.parse(fs.readFileSync(MEETINGS_PATH, 'utf-8'));
        const meeting = meetings.find(m => m.id === meetingId);
        if (meeting) {
            meeting.status = status;
            if (videoId) meeting.videoId = videoId;
            meeting.processedAt = new Date().toISOString();
            fs.writeFileSync(MEETINGS_PATH, JSON.stringify(meetings, null, 2));
            console.log(`📝 Updated meeting ${meetingId} status to: ${status}`);
        }
    } catch (e) {
        console.warn(`⚠️  Error updating meeting: ${e.message}`);
    }
}

/**
 * Process a single video through the pipeline
 */
async function processVideo(videoId) {
    // 1. Download (and Extract VTT)
    await runStep(DOWNLOADER_SCRIPT, [videoId]);

    // 2. Transcribe (or Parse VTT)
    const videoPath = path.join(DATA_DIR, `${videoId}.mp4`);
    await runStep(TRANSCRIBE_SCRIPT, [videoPath]);

    // 3. Analyze
    const transcriptPath = path.join(DATA_DIR, `${videoId}_transcript.json`);
    await runStep(ANALYZE_SCRIPT, [transcriptPath]);
}

async function main() {
    console.log('🏛️  Town Meeting Orchestrator Starting...');

    const departmentId = process.env.DEPARTMENT_ID || 'town-council';
    const mode = process.env.SCRAPE_MODE || 'latest'; // 'latest' or 'upcoming'

    try {
        if (mode === 'upcoming') {
            // Process scheduled meetings that are ready
            const readyMeetings = getReadyUpcomingMeetings(departmentId);

            if (readyMeetings.length === 0) {
                console.log('📭 No upcoming meetings ready to process.');
                console.log('   Falling back to latest meeting mode...');
            } else {
                console.log(`📅 Found ${readyMeetings.length} scheduled meeting(s) ready to process:`);
                for (const meeting of readyMeetings) {
                    console.log(`   - ${meeting.type} on ${meeting.date}${meeting.description ? ` (${meeting.description})` : ''}`);
                }

                // For each ready meeting, try to find and process the video
                for (const meeting of readyMeetings) {
                    console.log(`\n🔍 Processing: ${meeting.type} (${meeting.date})`);

                    try {
                        // Get the latest video for this department
                        const videoId = await getLatestMeetingId(meeting.departmentId);

                        // Process it
                        await processVideo(videoId);

                        // Mark as processed
                        updateMeetingStatus(meeting.id, 'processed', videoId);

                        console.log(`✅ Successfully processed meeting: ${meeting.id}`);
                    } catch (e) {
                        console.error(`❌ Failed to process meeting ${meeting.id}: ${e.message}`);
                        updateMeetingStatus(meeting.id, 'failed');
                    }
                }

                console.log('\n✅ Upcoming meetings processing complete.');
                return;
            }
        }

        // Default: Get latest meeting
        console.log(`\n📺 Fetching latest meeting for department: ${departmentId}`);

        let videoId = process.env.VIDEO_ID;
        try {
            videoId = await getLatestMeetingId(departmentId);
        } catch (e) {
            console.warn(`⚠️  Could not fetch latest meeting dynamically (${e.message}). Using fallback: ${videoId}`);
        }

        if (!videoId) {
            throw new Error('No video ID available. Cannot proceed.');
        }

        await processVideo(videoId);

        console.log('\n✅ Orchestration Complete. Analysis ready for generation.');

    } catch (error) {
        console.error('\n❌ Orchestration Failed:', error.message);
        process.exit(1);
    }
}

main();
