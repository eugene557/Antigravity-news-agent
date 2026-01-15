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
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

// Configuration
const DOWNLOADER_SCRIPT = path.join(ROOT_DIR, 'scripts/swagit_downloader.js');
const TRANSCRIBE_SCRIPT = path.join(__dirname, 'transcribe.js');
const ANALYZE_SCRIPT = path.join(__dirname, 'analyze.js');

const DATA_DIR = path.join(ROOT_DIR, 'data/swagit');
const SETTINGS_PATH = path.join(ROOT_DIR, 'data/town_meeting_settings.json');
const MEETINGS_PATH = path.join(ROOT_DIR, 'data/meetings.json');

async function runStep(scriptPath, args = [], extraEnv = {}) {
    console.log(`\n▶️ Running: ${path.basename(scriptPath)} ${args.join(' ')}`);
    return new Promise((resolve, reject) => {
        const proc = spawn('node', [scriptPath, ...args], {
            cwd: ROOT_DIR,
            stdio: 'inherit',
            env: { ...process.env, ...extraEnv }
        });

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${path.basename(scriptPath)} failed with code ${code}`));
        });

        proc.on('error', reject);
    });
}

// Custom error class for "no VTT available" scenario (skip this video)
class NoVttAvailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NoVttAvailableError';
    }
}

// Custom error class for "no new meetings" scenario
class NoNewMeetingsError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NoNewMeetingsError';
    }
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
        let stderr = '';
        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            process.stderr.write(text); // Forward stderr to console for debugging
        });

        proc.on('close', (code) => {
            if (code === 0) {
                const id = output.trim();
                if (id && /^\d+$/.test(id)) {
                    console.log(`   Found latest meeting ID: ${id}`);
                    resolve(id);
                } else {
                    reject(new Error(`Invalid ID returned: ${output}`));
                }
            } else if (code === 2 || stderr.includes('NO_NEW_MEETINGS')) {
                // Special exit code 2 means "no new meetings found" (not an error)
                reject(new NoNewMeetingsError('No new Jupiter meetings found on Swagit'));
            } else {
                reject(new Error(`Failed to fetch meeting ID: ${stderr.trim() || 'Unknown error'}`));
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
 * Persist meeting to Google Sheets via API
 * This ensures the meeting survives Railway deployments
 */
async function persistMeetingToSheets(meeting) {
    // Always use localhost since we're in the same container as the server
    const port = process.env.PORT || 8080;
    const host = 'localhost';

    console.log(`☁️  Persisting meeting ${meeting.id} to Sheets via http://${host}:${port}...`);

    return new Promise((resolve) => {
        const data = JSON.stringify(meeting);
        const options = {
            hostname: host,
            port: port,
            path: `/api/agents/town-meeting/meetings/${meeting.id}`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 10000
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`☁️  Meeting ${meeting.id} persisted to Google Sheets successfully`);
                    resolve(true);
                } else {
                    console.error(`❌ Failed to persist to Sheets (HTTP ${res.statusCode}): ${body}`);
                    resolve(false);
                }
            });
        });

        req.on('timeout', () => {
            console.error(`❌ Timeout persisting to Sheets - server not responding`);
            req.destroy();
            resolve(false);
        });

        req.on('error', (e) => {
            console.error(`❌ Could not persist to Sheets: ${e.message}`);
            resolve(false);
        });

        req.write(data);
        req.end();
    });
}

/**
 * Register a newly processed meeting in meetings.json AND Google Sheets
 */
async function registerProcessedMeeting(videoId, departmentId) {
    try {
        // Load existing meetings
        let meetings = [];
        if (fs.existsSync(MEETINGS_PATH)) {
            meetings = JSON.parse(fs.readFileSync(MEETINGS_PATH, 'utf-8'));
        }

        // Check if already registered
        if (meetings.some(m => m.videoId === videoId)) {
            console.log(`📋 Meeting ${videoId} already registered.`);
            return;
        }

        // Load department info
        let departmentName = departmentId;
        try {
            if (fs.existsSync(SETTINGS_PATH)) {
                const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
                const dept = settings.departments.find(d => d.id === departmentId);
                if (dept) departmentName = dept.name;
            }
        } catch (e) { /* ignore */ }

        // Load meeting metadata (date, title, type) if available
        let meetingDate = new Date().toISOString().split('T')[0];
        let meetingTitle = null;
        const metadataPath = path.join(DATA_DIR, `${videoId}_metadata.json`);
        if (fs.existsSync(metadataPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
                if (metadata.date) meetingDate = metadata.date;
                if (metadata.title) meetingTitle = metadata.title;
                if (metadata.type) departmentName = metadata.type;
            } catch (e) { /* ignore */ }
        }

        // Load transcript for duration
        let durationMinutes = 0;
        const transcriptPath = path.join(DATA_DIR, `${videoId}_transcript.json`);
        if (fs.existsSync(transcriptPath)) {
            try {
                const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
                durationMinutes = transcript.durationMinutes || 0;
            } catch (e) { /* ignore */ }
        }

        // Load analysis for description
        let description = `${departmentName} Meeting`;
        const analysisPath = path.join(DATA_DIR, `${videoId}_analysis.json`);
        if (fs.existsSync(analysisPath)) {
            try {
                const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
                if (analysis.analysis?.meeting_summary) {
                    // Truncate to first 100 chars for description
                    description = analysis.analysis.meeting_summary.slice(0, 150);
                    if (analysis.analysis.meeting_summary.length > 150) description += '...';
                }
            } catch (e) { /* ignore */ }
        }

        // Count ideas if available
        let ideasCount = 0;
        const ideasPath = path.join(DATA_DIR, `${videoId}_ideas.json`);
        if (fs.existsSync(ideasPath)) {
            try {
                const ideas = JSON.parse(fs.readFileSync(ideasPath, 'utf-8'));
                ideasCount = ideas.ideas?.length || 0;
            } catch (e) { /* ignore */ }
        }

        // Create meeting entry
        const newMeeting = {
            id: videoId,
            videoId: videoId,
            departmentId: departmentId,
            type: `${departmentName} Meeting`,
            date: meetingDate,
            status: 'processed',
            processedAt: new Date().toISOString(),
            description: description,
            durationMinutes: durationMinutes,
            ideasCount: ideasCount
        };

        // Save to local file first
        meetings.push(newMeeting);
        fs.writeFileSync(MEETINGS_PATH, JSON.stringify(meetings, null, 2));
        console.log(`✅ Registered meeting ${videoId} in meetings.json`);
        console.log(`   Meeting data: ${JSON.stringify(newMeeting, null, 2)}`);

        // Also persist to Google Sheets (survives deployments)
        console.log(`\n📤 Attempting to persist to Google Sheets...`);
        const persisted = await persistMeetingToSheets(newMeeting);
        if (!persisted) {
            console.error(`⚠️  Meeting saved locally but NOT persisted to Google Sheets!`);
            console.error(`   This meeting may be lost on next deployment.`);
        }

    } catch (e) {
        console.warn(`⚠️  Could not register meeting: ${e.message}`);
    }
}

/**
 * Process a single video through the pipeline
 *
 * If VTT transcript exists: Use it (free, instant)
 * If no VTT: Download video, extract audio, use Whisper API (~$0.006/min)
 */
async function processVideo(videoId) {
    console.log(`\n⚡ Processing video ${videoId}`);

    // 1. Download VTT if available, otherwise download video for Whisper
    await runStep(DOWNLOADER_SCRIPT, [videoId], { FAST_MODE: 'true' });

    // 2. Transcribe - now accepts video ID and auto-detects VTT vs MP4
    const transcriptPath = path.join(DATA_DIR, `${videoId}_transcript.json`);

    if (!fs.existsSync(transcriptPath)) {
        // Transcribe will auto-detect VTT and use it if available (fast!)
        await runStep(TRANSCRIBE_SCRIPT, [videoId]);
    } else {
        console.log('\n⏩ Transcript already exists, skipping transcription');
    }

    // 3. Analyze
    await runStep(ANALYZE_SCRIPT, [transcriptPath]);
}

async function main() {
    console.log('🏛️  Town Meeting Orchestrator Starting...');
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    const departmentId = process.env.DEPARTMENT_ID || 'town-council';
    const mode = process.env.SCRAPE_MODE || 'latest'; // 'latest' or 'upcoming'

    console.log(`   Department: ${departmentId}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   PORT env: ${process.env.PORT || '(not set, using 8080)'}`);

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
            // Handle "no new meetings" as a success case, not an error
            if (e instanceof NoNewMeetingsError) {
                console.log('\n📭 NO_NEW_MEETINGS_FOUND');
                console.log('   No new Jupiter meetings are available on Swagit.');
                console.log('   This is normal - check back after the next council meeting.\n');
                process.exit(0); // Exit successfully - this is not an error
            }
            console.warn(`⚠️  Could not fetch latest meeting dynamically (${e.message}). Using fallback: ${videoId}`);
        }

        if (!videoId) {
            throw new Error('No video ID available. Cannot proceed.');
        }

        await processVideo(videoId);

        // 4. Register the meeting in meetings.json AND Google Sheets for persistence
        await registerProcessedMeeting(videoId, departmentId);

        console.log('\n✅ Orchestration Complete. Analysis ready for generation.');

    } catch (error) {
        console.error('\n❌ Orchestration Failed:', error.message);
        process.exit(1);
    }
}

main();
