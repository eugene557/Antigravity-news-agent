import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import https from 'https';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SWAGIT_BASE_URL = 'https://jupiterfl.new.swagit.com';
const SWAGIT_S3_BASE_URL = 'https://swagit-video.granicus.com'; // For VTT files
const OUTPUT_DIR = path.join(__dirname, '../data/swagit');

// Initialize OpenAI (Lazy)
let openai;
function getOpenAI() {
    if (!openai) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY not set");
        }
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openai;
}

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function getDownloadUrl(videoId) {
    const url = `${SWAGIT_BASE_URL}/videos/${videoId}/download`;
    console.log(`Fetching download URL for video ${videoId} from ${url}...`);

    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                resolve(res.headers.location);
            } else {
                reject(new Error(`Failed to get redirect URL. Status code: ${res.statusCode}`));
            }
        });
        req.on('error', reject);
        req.end();
    });
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                // Cleanup the empty file created by createWriteStream
                file.close();
                fs.unlink(destPath, () => { });
                reject(new Error(`Failed to download file. Status: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(destPath);
            });
        }).on('error', (err) => {
            // Cleanup on network error
            file.close();
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

function extractUuidFromS3Url(s3Url) {
    // URL Format: https://granicus-aasmp-swagit-video.s3.amazonaws.com/{agency}/{uuid}.mp4?...
    const match = s3Url.match(/s3\.amazonaws\.com\/([^\/]+)\/([a-f0-9\-]+)\.mp4/);
    if (match) {
        return { agency: match[1], uuid: match[2] };
    }
    return null;
}

function extractAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Extracting audio from ${inputPath} to ${outputPath}...`);
        // ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav
        // using standard mp3 for whisper might be smaller/faster upload
        const command = `ffmpeg -y -i "${inputPath}" -vn -acodec libmp3lame -q:a 4 "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`FFmpeg error: ${error.message}`);
                reject(error);
                return;
            }
            resolve(outputPath);
        });
    });
}

async function transcribeAudio(audioPath) {
    console.log(`Transcribing ${audioPath}...`);
    try {
        const client = getOpenAI();
        const transcription = await client.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "vtt",
        });
        return transcription;
    } catch (e) {
        if (e.message.includes("OPENAI_API_KEY")) {
            console.warn("Skipping transcription: OPENAI_API_KEY not found.");
            return null;
        }
        throw e;
    }
}

async function main() {
    const videoId = process.argv[2];
    const fastMode = process.env.FAST_MODE === 'true' || process.argv.includes('--fast');

    if (!videoId) {
        console.error('Usage: node swagit_downloader.js <video_id> [--fast]');
        console.error('  --fast or FAST_MODE=true: Skip video download if VTT transcript exists');
        process.exit(1);
    }

    if (fastMode) {
        console.log('⚡ FAST MODE enabled - will skip video download if VTT exists');
    }

    try {
        // 1. Get Download URL
        const downloadUrl = await getDownloadUrl(videoId);
        console.log(`Found S3 URL: ${downloadUrl}`);

        const vttInfo = extractUuidFromS3Url(downloadUrl);

        // Validate this is a Jupiter FL video (not from another agency)
        if (vttInfo && vttInfo.agency !== 'jupiterfl') {
            console.error(`\n❌ ERROR: Video ${videoId} belongs to "${vttInfo.agency}", not Jupiter FL!`);
            console.error('   This video was incorrectly listed on Jupiter\'s Swagit page.');
            console.error('   Skipping to avoid downloading wrong content.\n');
            process.exit(1);
        }

        let vttDownloaded = false;
        const vttPath = path.join(OUTPUT_DIR, `${videoId}.vtt`);

        // Check if VTT already exists
        if (fs.existsSync(vttPath)) {
            const vttContent = fs.readFileSync(vttPath, 'utf-8');
            if (vttContent.trim().length > 100) {
                console.log(`✅ VTT already exists: ${vttPath}`);
                vttDownloaded = true;
            }
        }

        // Try to download VTT first (it's fast)
        if (!vttDownloaded && vttInfo) {
            const vttUrl = `${SWAGIT_S3_BASE_URL}/${vttInfo.agency}/${vttInfo.uuid}-en.vtt`;
            console.log(`Attempting to fetch VTT from: ${vttUrl}`);
            try {
                await downloadFile(vttUrl, vttPath);
                console.log(`✅ VTT Transcript downloaded to: ${vttPath}`);
                vttDownloaded = true;
            } catch (e) {
                console.warn(`Could not download VTT: ${e.message}`);
            }
        } else if (!vttDownloaded) {
            console.warn("Could not extract UUID for VTT download.");
        }

        // FAST MODE: If VTT exists, skip video download entirely
        if (fastMode && vttDownloaded) {
            console.log('');
            console.log('⚡ FAST MODE: VTT transcript available!');
            console.log('⏩ Skipping video download (saves 5-15 minutes)');
            console.log('⏩ Skipping audio extraction');
            console.log('⏩ Whisper API transcription not needed');
            console.log('');
            console.log('✅ Ready for analysis. VTT will be used as transcript source.');
            process.exit(0);
        }

        // 2. Download MP4 (only if we don't have VTT or not in fast mode)
        const mp4Path = path.join(OUTPUT_DIR, `${videoId}.mp4`);
        if (!fs.existsSync(mp4Path)) {
            console.log(`Downloading video to ${mp4Path}...`);
            await downloadFile(downloadUrl, mp4Path);
            console.log('Download complete.');
        } else {
            console.log('Video file already exists. Skipping download.');
        }

        // 3. Extract Audio (only needed if we'll use Whisper)
        if (!vttDownloaded) {
            const audioPath = path.join(OUTPUT_DIR, `${videoId}.mp3`);
            if (!fs.existsSync(audioPath)) {
                await extractAudio(mp4Path, audioPath);
                console.log('Audio extraction complete.');
            } else {
                console.log('Audio file already exists. Skipping extraction.');
            }
        } else {
            console.log('⏩ Skipping audio extraction (VTT available)');
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
    process.exit(0);
}

main();
