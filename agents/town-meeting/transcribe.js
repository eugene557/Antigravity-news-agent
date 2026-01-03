#!/usr/bin/env node

/**
 * Town Meeting Transcription Agent
 *
 * Extracts audio from video files and transcribes using OpenAI Whisper API.
 *
 * Usage: node transcribe.js <video_path> [output_path]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import OpenAI from 'openai';

const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Whisper API has a 25MB file limit, so we chunk audio
const MAX_CHUNK_SIZE_MB = 24;
const CHUNK_DURATION_MINUTES = 10; // ~10 min chunks stay under 25MB for 16kHz mono

async function extractAudio(videoPath, audioPath) {
  console.log('📼 Extracting audio from video...');

  // Extract as 16kHz mono WAV (optimal for Whisper)
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

    // Convert to MP3 for smaller file size
    const cmd = `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${chunkDurationSec} -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k -y "${chunkPath}"`;

    await execAsync(cmd);
    chunks.push({ path: chunkPath, startTime });
  }

  console.log(`✅ Created ${chunks.length} audio chunks`);
  return chunks;
}

async function transcribeChunk(chunkPath, chunkIndex, totalChunks) {
  console.log(`🎙️  Transcribing chunk ${chunkIndex + 1}/${totalChunks}...`);

  const audioFile = fs.createReadStream(chunkPath);

  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment']
  });

  return response;
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

  // Simple VTT parser
  // WEB VTT often has:
  // 00:00:01.000 --> 00:00:04.000
  // text

  let currentStart = null;
  let currentText = '';

  // Regex for timestamp line (00:00:00.000 or 00:00.000)
  const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.includes('WEBVTT')) continue;

    const timeMatch = line.match(timeRegex);
    if (timeMatch) {
      // If we had a previous segment, push it
      if (currentStart !== null && currentText) {
        segments.push({
          timestamp: currentStart, // Keep string format for display
          startSeconds: parseTimestampToSeconds(currentStart),
          text: currentText.trim()
        });
        fullText += currentText.trim() + ' ';
        currentText = '';
      }
      currentStart = timeMatch[1];
    } else if (currentStart !== null && !line.match(/^\d+$/)) { // Skip simple index numbers
      currentText += line + ' ';
    }
  }

  // Push last segment
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

  // Check for existing VTT file
  const potentialVttPath = path.join(workDir, `${videoName}.vtt`);
  if (fs.existsSync(potentialVttPath)) {
    const vttStats = fs.statSync(potentialVttPath);
    const vttContent = fs.readFileSync(potentialVttPath, 'utf-8');

    if (vttStats.size > 0 && vttContent.trim().length > 0) {
      console.log(`✅ Found existing VTT transcript: ${potentialVttPath}`);
      console.log('⏩ Skipping Whisper API transcription...');

      const { fullText, segments } = parseVtt(vttContent);

      const output = {
        videoId: videoName,
        sourceFile: videoPath,
        transcribedAt: new Date().toISOString(),
        durationMinutes: 0, // Placeholder, calculated properly only if we had audio path. 
        fullText,
        segments
      };

      // Try to get duration from video file if possible
      try {
        // We might not have extracted audio yet if we skipped it, so let's try reading video metadata directly if we want
        // Or just leave it as is. Analyze.js mostly needs text.
        // Let's at least try a quick check if audio exists, else we can skip
      } catch (e) { }

      fs.writeFileSync(finalOutputPath, JSON.stringify(output, null, 2));
      console.log(`✅ Transcript saved to: ${finalOutputPath}`);

      const textOutputPath = finalOutputPath.replace('.json', '.txt');
      const textContent = segments.map(s => `[${s.timestamp}] ${s.text}`).join('\n\n');
      fs.writeFileSync(textOutputPath, textContent);
      console.log(`✅ Plain text saved to: ${textOutputPath}`);

      return;
    } else {
      console.warn(`⚠️  Found existing VTT at ${potentialVttPath} but it appears empty or invalid. Proceeding with transcription.`);
    }
  }

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Step 1: Extract audio
    const audioPath = path.join(tempDir, 'audio.wav');
    await extractAudio(videoPath, audioPath);

    // Step 2: Split into chunks
    const chunks = await splitAudioIntoChunks(audioPath, tempDir);

    // Step 3: Transcribe each chunk
    console.log('\n🚀 Starting transcription (this may take a few minutes)...\n');
    const transcriptions = [];

    for (let i = 0; i < chunks.length; i++) {
      const result = await transcribeChunk(chunks[i].path, i, chunks.length);
      transcriptions.push(result);

      // Show progress
      const cost = ((i + 1) * CHUNK_DURATION_MINUTES * 0.006).toFixed(2);
      console.log(`   Cost so far: ~$${cost}`);
    }

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

    // Also save plain text version
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

  } catch (error) {
    console.error('❌ Error:', error.message);
    // Cleanup on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    process.exit(1);
  }
}

main();
