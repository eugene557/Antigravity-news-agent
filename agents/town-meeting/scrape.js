#!/usr/bin/env node

/**
 * Town Meeting Scraper (Orchestrator)
 * 
 * Orchestrates the full pipeline for the dashboard:
 * 1. Download Video (scripts/swagit_downloader.js)
 * 2. Transcribe (agents/town-meeting/transcribe.js)
 * 3. Analyze (agents/town-meeting/analyze.js)
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
const VIDEO_ID = '364781'; // Hardcoded for MVP, ideally dynamic or scrapes list
const DOWNLOADER_SCRIPT = path.join(ROOT_DIR, 'scripts/swagit_downloader.js');
const TRANSCRIBE_SCRIPT = path.join(__dirname, 'transcribe.js');
const ANALYZE_SCRIPT = path.join(__dirname, 'analyze.js');

const DATA_DIR = path.join(ROOT_DIR, 'data/swagit');
const SETTINGS_PATH = path.join(ROOT_DIR, 'data/town_meeting_settings.json');

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

async function main() {
    console.log('🏛️  Town Meeting Orchestrator Starting...');

    try {
        // 0. Get Video ID (Dynamic or Default)
        let videoId = process.env.VIDEO_ID || '364781'; // Fallback
        const departmentId = process.env.DEPARTMENT_ID || 'town-council';

        try {
            videoId = await getLatestMeetingId(departmentId);
        } catch (e) {
            console.warn(`⚠️  Could not fetch latest meeting dynamically (${e.message}). Using fallback: ${videoId}`);
        }

        // 1. Download (and Extract VTT)
        await runStep(DOWNLOADER_SCRIPT, [videoId]);

        // 2. Transcribe (or Parse VTT)
        const videoPath = path.join(DATA_DIR, `${videoId}.mp4`);
        await runStep(TRANSCRIBE_SCRIPT, [videoPath]);

        // 3. Analyze
        const transcriptPath = path.join(DATA_DIR, `${videoId}_transcript.json`);
        await runStep(ANALYZE_SCRIPT, [transcriptPath]);

        console.log('\n✅ Orchestration Complete. Analysis ready for generation.');

    } catch (error) {
        console.error('\n❌ Orchestration Failed:', error.message);
        process.exit(1);
    }
}

main();
