#!/usr/bin/env node

/**
 * Town Meeting Idea Generator
 *
 * Scans a meeting transcript and suggests 5-10 article ideas,
 * each with multiple possible angles for different types of coverage.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Persist ideas to Google Sheets via API (for Railway deployment persistence)
async function persistIdeasToSheets(videoId, ideas) {
    const port = process.env.PORT || 8080;
    const data = JSON.stringify({ videoId, ideas });

    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/api/agents/town-meeting/ideas',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 10000
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`✅ Persisted ${ideas.length} ideas to Google Sheets`);
                } else {
                    console.error(`⚠️ Failed to persist ideas to Sheets: ${res.statusCode}`);
                }
                resolve();
            });
        });
        req.on('error', (e) => {
            console.error(`⚠️ Could not persist ideas to Sheets: ${e.message}`);
            resolve();
        });
        req.on('timeout', () => {
            req.destroy();
            console.error(`⚠️ Timeout persisting ideas to Sheets`);
            resolve();
        });
        req.write(data);
        req.end();
    });
}

// Update meeting's ideasCount via API
async function updateMeetingIdeasCount(videoId, ideasCount) {
    const port = process.env.PORT || 8080;
    const data = JSON.stringify({ videoId, ideasCount });

    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/api/meetings/update-ideas-count',
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
                    console.log(`✅ Updated meeting ${videoId} with ${ideasCount} ideas`);
                } else {
                    console.error(`⚠️ Failed to update ideas count: ${res.statusCode}`);
                }
                resolve();
            });
        });
        req.on('error', (e) => {
            console.error(`⚠️ Could not update ideas count: ${e.message}`);
            resolve();
        });
        req.on('timeout', () => {
            req.destroy();
            console.error(`⚠️ Timeout updating ideas count`);
            resolve();
        });
        req.write(data);
        req.end();
    });
}

async function loadTranscript(transcriptPath) {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    return JSON.parse(content);
}

async function generateIdeas(transcriptText) {
    console.log('💡 Generating article ideas from transcript...');

    const systemPrompt = `You are a savvy local news editor for a local Jupiter, Florida publication.
Review the meeting transcript and identify ALL newsworthy events, decisions, and discussions.

IMPORTANT: Generate as many article ideas as the content supports (aim for the best and most newsworthy, up to 12 ideas). Be thorough - don't miss important topics. Look for:
- Major decisions and votes
- Budget allocations and financial matters
- New projects, initiatives, or programs
- Community concerns raised by residents during public comment
- Updates on ongoing projects or initiatives
- Recognition of individuals, organizations, or achievements
- Policy changes, ordinances, or resolutions
- Environmental or infrastructure updates
- Public safety announcements or initiatives
- Upcoming events or community activities mentioned
- Intergovernmental relations or partnerships
- Economic development or business matters
- Parks, recreation, or quality of life improvements

For each idea, provide 2-3 different "angles" or hooks that a reporter could use.
Each angle should offer a distinct perspective (e.g., fiscal impact, community benefit, future implications, human interest).

Return a JSON object with this structure:
{
  "ideas": [
    {
      "id": "guid-or-number",
      "event": "Brief description of the specific event/decision",
      "title": "Working Headline for the idea",
      "summary": "1-2 sentence explanation of why this matters to locals",
      "angles": [
        {
          "name": "Hook/Angle Name (e.g., Fiscal Responsibility, Community Impact, Looking Forward)",
          "description": "Short description of this specific coverage angle",
          "prompt_hint": "A short hint for the next LLM call to focus on this angle"
        }
      ]
    }
  ]
}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this transcript for article ideas:\n\n${transcriptText.substring(0, 50000)}` } // Cap for safety
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
}

async function main() {
    const transcriptPath = process.argv[2];
    const outputPath = process.argv[3];

    if (!transcriptPath) {
        console.error('Usage: node generate_ideas.js <transcript_path> [output_path]');
        process.exit(1);
    }

    try {
        const transcript = await loadTranscript(transcriptPath);
        const result = await generateIdeas(transcript.fullText);

        const output = {
            metadata: {
                videoId: transcript.videoId,
                generatedAt: new Date().toISOString()
            },
            ...result
        };

        // Always save to per-meeting ideas file (local storage)
        const meetingIdeasPath = transcriptPath.replace('_transcript.json', '_ideas.json');
        fs.writeFileSync(meetingIdeasPath, JSON.stringify(output, null, 2));
        console.log(`✅ Ideas saved to: ${meetingIdeasPath}`);

        // Also save to current_ideas.json if a different output path is specified
        if (outputPath && outputPath !== meetingIdeasPath) {
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`✅ Also saved to: ${outputPath}`);
        }

        // CRITICAL: Persist ideas to Google Sheets immediately
        // This ensures ideas survive Railway deployments
        const ideasCount = result.ideas ? result.ideas.length : 0;
        if (result.ideas && result.ideas.length > 0) {
            await persistIdeasToSheets(transcript.videoId, result.ideas);
        }

        // Update the meeting's ideasCount in the database
        await updateMeetingIdeasCount(transcript.videoId, ideasCount);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
