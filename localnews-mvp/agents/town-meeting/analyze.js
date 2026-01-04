#!/usr/bin/env node

/**
 * Town Meeting Analysis Agent
 *
 * Analyzes meeting transcripts using GPT-4 to extract:
 * - Decisions and votes
 * - Topics debated
 * - Notable quotes
 * - Action items
 *
 * Usage: node analyze.js <transcript_path> [output_path]
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

// GPT-4 has ~128k context, but we need to respect TPM limits (e.g. 30k)
const MAX_TOKENS_PER_CHUNK = 15000;
const CHARS_PER_TOKEN = 4; // rough estimate

async function loadPrompt() {
  const promptPath = path.join(__dirname, '../../prompts/analyze-meeting.txt');
  return fs.readFileSync(promptPath, 'utf-8');
}

async function loadTranscript(transcriptPath) {
  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const data = JSON.parse(content);
  return data;
}

function formatTranscriptForAnalysis(transcript) {
  // Format segments with timestamps for context
  if (transcript.segments && transcript.segments.length > 0) {
    return transcript.segments
      .map(seg => `[${seg.timestamp}] ${seg.text}`)
      .join('\n');
  }
  // Fallback to full text
  return transcript.fullText;
}

function chunkText(text, maxChars) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + line).length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function analyzeChunk(systemPrompt, transcriptChunk, chunkIndex, totalChunks) {
  console.log(`🔍 Analyzing chunk ${chunkIndex + 1}/${totalChunks}...`);

  const userMessage = totalChunks > 1
    ? `This is part ${chunkIndex + 1} of ${totalChunks} of a town council meeting transcript. Analyze this portion:\n\n${transcriptChunk}`
    : `Analyze this town council meeting transcript:\n\n${transcriptChunk}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.3,
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse JSON response:', content.slice(0, 500));
    throw new Error('Invalid JSON response from GPT-4');
  }
}

async function mergeAnalyses(analyses) {
  // If only one chunk, return as-is
  if (analyses.length === 1) {
    return analyses[0];
  }

  // Merge multiple chunk analyses
  const merged = {
    decisions: [],
    topics_debated: [],
    notable_quotes: [],
    action_items: [],
    newsworthy_highlights: [],
    meeting_summary: ''
  };

  for (const analysis of analyses) {
    if (analysis.decisions) merged.decisions.push(...analysis.decisions);
    if (analysis.topics_debated) merged.topics_debated.push(...analysis.topics_debated);
    if (analysis.notable_quotes) merged.notable_quotes.push(...analysis.notable_quotes);
    if (analysis.action_items) merged.action_items.push(...analysis.action_items);
    if (analysis.newsworthy_highlights) merged.newsworthy_highlights.push(...analysis.newsworthy_highlights);
  }

  // Use GPT to synthesize meeting summary from all chunks
  console.log('📝 Synthesizing overall meeting summary...');

  const summaryResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a local news analyst. Synthesize the following partial meeting summaries into one cohesive 2-3 sentence overview. Return only the summary text, no JSON.'
      },
      {
        role: 'user',
        content: analyses.map((a, i) => `Part ${i + 1}: ${a.meeting_summary || 'No summary'}`).join('\n\n')
      }
    ],
    temperature: 0.3,
    max_tokens: 300
  });

  merged.meeting_summary = summaryResponse.choices[0].message.content.trim();

  return merged;
}

async function main() {
  const transcriptPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!transcriptPath) {
    console.error('Usage: node analyze.js <transcript_path> [output_path]');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('📊 Town Meeting Analysis Agent\n');

  try {
    // Load prompt and transcript
    console.log('📄 Loading transcript...');
    const systemPrompt = await loadPrompt();
    const transcript = await loadTranscript(transcriptPath);

    console.log(`   Video ID: ${transcript.videoId}`);
    console.log(`   Duration: ${transcript.durationMinutes} minutes`);
    console.log(`   Segments: ${transcript.segments?.length || 0}`);

    // Format transcript for analysis
    const formattedText = formatTranscriptForAnalysis(transcript);
    console.log(`   Text length: ${formattedText.length} characters\n`);

    if (!formattedText || formattedText.trim().length === 0) {
      console.error('❌ Error: Transcript is empty. Cannot perform analysis.');
      process.exit(1);
    }

    // Chunk if necessary
    const maxChars = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN;
    const chunks = chunkText(formattedText, maxChars);
    console.log(`📦 Split into ${chunks.length} chunk(s) for analysis\n`);

    // Analyze each chunk
    const analyses = [];
    for (let i = 0; i < chunks.length; i++) {
      const analysis = await analyzeChunk(systemPrompt, chunks[i], i, chunks.length);
      analyses.push(analysis);

      // Show progress
      const cost = ((i + 1) * 0.01).toFixed(2); // rough GPT-4 estimate
      console.log(`   Estimated cost so far: ~$${cost}`);
    }

    // Merge analyses if multiple chunks
    console.log('\n🔄 Merging analysis results...');
    const finalAnalysis = await mergeAnalyses(analyses);

    // Add metadata
    const output = {
      metadata: {
        videoId: transcript.videoId,
        sourceFile: transcriptPath,
        analyzedAt: new Date().toISOString(),
        durationMinutes: transcript.durationMinutes,
        model: 'gpt-4o'
      },
      analysis: finalAnalysis
    };

    // Determine output path
    const finalOutputPath = outputPath ||
      transcriptPath.replace('_transcript.json', '_analysis.json');

    // Save output
    fs.writeFileSync(finalOutputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Analysis saved to: ${finalOutputPath}`);

    // Summary
    console.log('\n📊 Analysis Summary:');
    console.log(`   Decisions: ${finalAnalysis.decisions?.length || 0}`);
    console.log(`   Topics: ${finalAnalysis.topics_debated?.length || 0}`);
    console.log(`   Quotes: ${finalAnalysis.notable_quotes?.length || 0}`);
    console.log(`   Action items: ${finalAnalysis.action_items?.length || 0}`);
    console.log(`   Newsworthy items: ${finalAnalysis.newsworthy_highlights?.length || 0}`);

    if (finalAnalysis.meeting_summary) {
      console.log(`\n📝 Meeting Summary:\n   ${finalAnalysis.meeting_summary}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
