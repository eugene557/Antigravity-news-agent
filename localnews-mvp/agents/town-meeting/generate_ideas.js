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
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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

        // Always save to per-meeting ideas file
        const meetingIdeasPath = transcriptPath.replace('_transcript.json', '_ideas.json');
        fs.writeFileSync(meetingIdeasPath, JSON.stringify(output, null, 2));
        console.log(`✅ Ideas saved to: ${meetingIdeasPath}`);

        // Also save to current_ideas.json if a different output path is specified
        if (outputPath && outputPath !== meetingIdeasPath) {
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`✅ Also saved to: ${outputPath}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
