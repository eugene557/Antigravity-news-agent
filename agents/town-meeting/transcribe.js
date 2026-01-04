#!/usr/bin/env node

/**
 * Town Meeting Transcription Agent (Self-Healing Edition)
 *
 * Features:
 * - Parallel transcription (4x faster)
 * - Adaptive throttling (adjusts concurrency based on success/failures)
 * - Scripted error recovery (rate limits, network issues, memory)
 * - AI diagnosis for unknown failures
 * - Checkpointing for resume-from-failure
 *
 * Usage: node transcribe.js <video_path> [output_path]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import pLimit from 'p-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import OpenAI from 'openai';

const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuration
const CHUNK_DURATION_MINUTES = 10;
const INITIAL_CONCURRENCY = 4;
const MAX_RETRIES = 3;

// ============================================
// ADAPTIVE THROTTLER (Script-based rate control)
// ============================================
class AdaptiveThrottler {
  constructor(initialConcurrency = INITIAL_CONCURRENCY) {
    this.concurrency = initialConcurrency;
    this.successStreak = 0;
    this.limit = pLimit(initialConcurrency);
    this.stats = { success: 0, failure: 0, retries: 0 };
  }

  onSuccess() {
    this.stats.success++;
    this.successStreak++;
    // Speed back up after 5 consecutive successes
    if (this.successStreak > 5 && this.concurrency < INITIAL_CONCURRENCY) {
      this.concurrency++;
      this.limit = pLimit(this.concurrency);
      console.log(`📈 Increasing concurrency to ${this.concurrency}`);
      this.successStreak = 0;
    }
  }

  onRateLimit() {
    this.stats.failure++;
    this.concurrency = Math.max(1, Math.floor(this.concurrency / 2));
    this.limit = pLimit(this.concurrency);
    this.successStreak = 0;
    console.log(`📉 Rate limited - reducing concurrency to ${this.concurrency}`);
  }

  onError() {
    this.stats.failure++;
    this.stats.retries++;
    this.successStreak = 0;
  }

  getSummary() {
    return `✅ ${this.stats.success} success, ❌ ${this.stats.failure} failures, 🔄 ${this.stats.retries} retries`;
  }
}

// ============================================
// ERROR CATEGORIZATION (Script-based)
// ============================================
function categorizeError(error) {
  const msg = error.message?.toLowerCase() || '';

  if (error.status === 429 || msg.includes('rate limit')) {
    return { type: 'rate_limit', action: 'wait_and_reduce', waitMs: 60000 };
  }
  if (msg.includes('connection') || msg.includes('network') || msg.includes('econnreset')) {
    return { type: 'network', action: 'retry_fresh', waitMs: 2000 };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { type: 'timeout', action: 'retry_fresh', waitMs: 5000 };
  }
  if (error.status === 401 || msg.includes('api key') || msg.includes('unauthorized')) {
    return { type: 'auth', action: 'fail_fast', waitMs: 0 };
  }
  if (error.status === 413 || msg.includes('too large')) {
    return { type: 'file_too_large', action: 'fail_fast', waitMs: 0 };
  }
  if (error.status === 503 || msg.includes('overloaded') || msg.includes('unavailable')) {
    return { type: 'service_down', action: 'wait_and_retry', waitMs: 30000 };
  }

  return { type: 'unknown', action: 'ai_diagnose', waitMs: 1000 };
}

// ============================================
// AI DIAGNOSIS (For unknown failures)
// ============================================
async function aiDiagnose(error, context) {
  console.log('🤖 Invoking AI diagnosis for unknown error...');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'You are a debugging expert. Analyze the error and provide a structured diagnosis. Be concise.'
      }, {
        role: 'user',
        content: `Error during Whisper API transcription:

Error: ${error.message}
Status: ${error.status || 'N/A'}
Chunk: ${context.chunkIndex + 1}/${context.totalChunks}
File size: ${context.fileSize} bytes

Respond in JSON:
{
  "diagnosis": "brief explanation of what went wrong",
  "recoverable": true/false,
  "suggestion": "what to try next"
}`
      }],
      response_format: { type: 'json_object' },
      max_tokens: 200
    });

    const diagnosis = JSON.parse(response.choices[0].message.content);
    console.log(`🔍 AI Diagnosis: ${diagnosis.diagnosis}`);
    console.log(`💡 Suggestion: ${diagnosis.suggestion}`);
    return diagnosis;
  } catch (aiError) {
    console.warn('⚠️  AI diagnosis failed, using default recovery');
    return { diagnosis: 'AI unavailable', recoverable: true, suggestion: 'Retry with backoff' };
  }
}

// ============================================
// SELF-HEALING TRANSCRIPTION
// ============================================
async function transcribeChunkWithRecovery(chunkPath, chunkIndex, totalChunks, throttler) {
  const fileSize = fs.statSync(chunkPath).size;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const audioFile = fs.createReadStream(chunkPath);
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment']
      });

      throttler.onSuccess();
      return response;

    } catch (error) {
      const category = categorizeError(error);
      console.warn(`⚠️  Chunk ${chunkIndex + 1} attempt ${attempt}/${MAX_RETRIES}: ${category.type}`);

      // Handle based on error type
      switch (category.action) {
        case 'fail_fast':
          throw new Error(`Unrecoverable error: ${error.message}`);

        case 'wait_and_reduce':
          throttler.onRateLimit();
          console.log(`⏳ Waiting ${category.waitMs / 1000}s for rate limit...`);
          await new Promise(r => setTimeout(r, category.waitMs));
          break;

        case 'retry_fresh':
        case 'wait_and_retry':
          throttler.onError();
          await new Promise(r => setTimeout(r, category.waitMs));
          break;

        case 'ai_diagnose':
          throttler.onError();
          if (attempt === MAX_RETRIES) {
            const diagnosis = await aiDiagnose(error, { chunkIndex, totalChunks, fileSize });
            if (!diagnosis.recoverable) {
              throw new Error(`AI diagnosed unrecoverable: ${diagnosis.diagnosis}`);
            }
          }
          await new Promise(r => setTimeout(r, category.waitMs * attempt));
          break;
      }

      if (attempt === MAX_RETRIES) {
        throw error;
      }
    }
  }
}

// ============================================
// PARALLEL TRANSCRIPTION
// ============================================
async function transcribeChunksParallel(chunks, tempDir, throttler) {
  console.log(`\n🚀 Starting parallel transcription (concurrency: ${throttler.concurrency})...\n`);

  const transcriptions = new Array(chunks.length);
  let completed = 0;

  const tasks = chunks.map((chunk, i) => {
    return throttler.limit(async () => {
      const chunkTranscriptPath = path.join(tempDir, `chunk_${i}_transcript.json`);

      // Check for checkpoint
      if (fs.existsSync(chunkTranscriptPath)) {
        console.log(`⏩ Chunk ${i + 1}/${chunks.length} (cached)`);
        transcriptions[i] = JSON.parse(fs.readFileSync(chunkTranscriptPath, 'utf-8'));
        completed++;
        return;
      }

      console.log(`🎙️  Chunk ${i + 1}/${chunks.length} starting...`);
      const result = await transcribeChunkWithRecovery(chunk.path, i, chunks.length, throttler);

      // Save checkpoint
      fs.writeFileSync(chunkTranscriptPath, JSON.stringify(result, null, 2));
      transcriptions[i] = result;
      completed++;

      const cost = (completed * CHUNK_DURATION_MINUTES * 0.006).toFixed(2);
      console.log(`✅ Chunk ${i + 1}/${chunks.length} done (${completed}/${chunks.length}, ~$${cost})`);
    });
  });

  await Promise.all(tasks);

  console.log(`\n📊 Transcription stats: ${throttler.getSummary()}`);
  return transcriptions;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
async function extractAudio(videoPath, audioPath) {
  console.log('📼 Extracting audio from video...');
  const cmd = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioPath}"`;

  try {
    await execAsync(cmd);
    console.log(`✅ Audio extracted to: ${audioPath}`);
    return audioPath;
  } catch (error) {
    throw new Error(`FFmpeg failed: ${error.message}`);
  }
}

async function getAudioDuration(audioPath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
  );
  return parseFloat(stdout.trim());
}

async function splitAudioIntoChunks(audioPath, outputDir) {
  const duration = await getAudioDuration(audioPath);
  const chunkDurationSec = CHUNK_DURATION_MINUTES * 60;
  const numChunks = Math.ceil(duration / chunkDurationSec);

  console.log(`📊 Audio duration: ${Math.round(duration / 60)} minutes`);
  console.log(`📦 Splitting into ${numChunks} chunks...`);

  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDurationSec;
    const chunkPath = path.join(outputDir, `chunk_${i.toString().padStart(3, '0')}.mp3`);
    const cmd = `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${chunkDurationSec} -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k -y "${chunkPath}"`;
    await execAsync(cmd);
    chunks.push({ path: chunkPath, startTime });
  }

  console.log(`✅ Created ${chunks.length} audio chunks`);
  return chunks;
}

function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTranscript(transcriptions, chunks) {
  let fullText = '';
  let segments = [];

  transcriptions.forEach((transcription, i) => {
    const offsetSeconds = chunks[i].startTime;
    if (transcription.segments) {
      transcription.segments.forEach(seg => {
        const adjustedStart = seg.start + offsetSeconds;
        segments.push({
          timestamp: formatTimestamp(adjustedStart),
          startSeconds: adjustedStart,
          text: seg.text.trim()
        });
      });
    }
    fullText += transcription.text + ' ';
  });

  return { fullText: fullText.trim(), segments };
}

function parseVtt(vttContent) {
  const lines = vttContent.split('\n');
  const segments = [];
  let fullText = '';
  let currentStart = null;
  let currentText = '';
  const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('WEBVTT')) continue;

    const timeMatch = trimmed.match(timeRegex);
    if (timeMatch) {
      if (currentStart !== null && currentText) {
        segments.push({
          timestamp: currentStart,
          startSeconds: parseTimestampToSeconds(currentStart),
          text: currentText.trim()
        });
        fullText += currentText.trim() + ' ';
        currentText = '';
      }
      currentStart = timeMatch[1];
    } else if (currentStart !== null && !trimmed.match(/^\d+$/)) {
      currentText += trimmed + ' ';
    }
  }

  if (currentStart !== null && currentText) {
    segments.push({
      timestamp: currentStart,
      startSeconds: parseTimestampToSeconds(currentStart),
      text: currentText.trim()
    });
    fullText += currentText.trim() + ' ';
  }

  return { fullText: fullText.trim(), segments };
}

function parseTimestampToSeconds(timestamp) {
  const parts = timestamp.split(':').reverse();
  let seconds = 0;
  if (parts[0]) seconds += parseFloat(parts[0]);
  if (parts[1]) seconds += parseInt(parts[1]) * 60;
  if (parts[2]) seconds += parseInt(parts[2]) * 3600;
  return seconds;
}

// ============================================
// MAIN
// ============================================
async function main() {
  const videoPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!videoPath) {
    console.error('Usage: node transcribe.js <video_path> [output_path]');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  const videoName = path.basename(videoPath, path.extname(videoPath));
  const workDir = path.dirname(videoPath);
  const tempDir = path.join(workDir, `${videoName}_temp`);
  const defaultOutputPath = path.join(workDir, `${videoName}_transcript.json`);
  const finalOutputPath = outputPath || defaultOutputPath;

  // Check for existing VTT file (fast path)
  const potentialVttPath = path.join(workDir, `${videoName}.vtt`);
  if (fs.existsSync(potentialVttPath)) {
    const vttContent = fs.readFileSync(potentialVttPath, 'utf-8');
    if (vttContent.trim().length > 0) {
      console.log(`✅ Found existing VTT transcript: ${potentialVttPath}`);
      console.log('⏩ Skipping Whisper API transcription...');

      const { fullText, segments } = parseVtt(vttContent);
      const output = {
        videoId: videoName,
        sourceFile: videoPath,
        transcribedAt: new Date().toISOString(),
        durationMinutes: 0,
        fullText,
        segments
      };

      fs.writeFileSync(finalOutputPath, JSON.stringify(output, null, 2));
      console.log(`✅ Transcript saved to: ${finalOutputPath}`);

      const textOutputPath = finalOutputPath.replace('.json', '.txt');
      const textContent = segments.map(s => `[${s.timestamp}] ${s.text}`).join('\n\n');
      fs.writeFileSync(textOutputPath, textContent);
      console.log(`✅ Plain text saved to: ${textOutputPath}`);
      return;
    }
  }

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const throttler = new AdaptiveThrottler(INITIAL_CONCURRENCY);

  try {
    // Step 1: Extract audio
    const audioPath = path.join(tempDir, 'audio.wav');
    await extractAudio(videoPath, audioPath);

    // Step 2: Split into chunks
    const chunks = await splitAudioIntoChunks(audioPath, tempDir);

    // Step 3: Parallel transcription with self-healing
    const transcriptions = await transcribeChunksParallel(chunks, tempDir, throttler);

    // Step 4: Combine and format
    console.log('\n📝 Formatting transcript...');
    const { fullText, segments } = formatTranscript(transcriptions, chunks);

    const output = {
      videoId: videoName,
      sourceFile: videoPath,
      transcribedAt: new Date().toISOString(),
      durationMinutes: Math.round(await getAudioDuration(audioPath) / 60),
      fullText,
      segments
    };

    // Step 5: Save output
    fs.writeFileSync(finalOutputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Transcript saved to: ${finalOutputPath}`);

    const textOutputPath = finalOutputPath.replace('.json', '.txt');
    const textContent = segments.map(s => `[${s.timestamp}] ${s.text}`).join('\n\n');
    fs.writeFileSync(textOutputPath, textContent);
    console.log(`✅ Plain text saved to: ${textOutputPath}`);

    // Cleanup temp files
    console.log('\n🧹 Cleaning up temp files...');
    fs.rmSync(tempDir, { recursive: true });

    // Summary
    const totalCost = (output.durationMinutes * 0.006).toFixed(2);
    console.log(`\n📊 Summary:`);
    console.log(`   Duration: ${output.durationMinutes} minutes`);
    console.log(`   Segments: ${segments.length}`);
    console.log(`   Estimated cost: ~$${totalCost}`);
    console.log(`   Performance: ${throttler.getSummary()}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('💾 Temp files preserved for resume. Run again to continue from checkpoints.');
    process.exit(1);
  }
}

main();
