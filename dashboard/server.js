/**
 * Dashboard API Server
 *
 * Proxies Google Sheets API for the React dashboard.
 * Run with: node server.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';

// Track agent run status
const agentStatus = {
  crimeWatch: { lastRun: null, running: false, error: null, lastResult: null },
  townMeeting: { lastRun: null, running: false, error: null, lastResult: null, currentMeeting: null }
};

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'town_meeting_settings.json');
const IDEAS_FILE = path.join(__dirname, '..', 'data', 'swagit', 'current_ideas.json');

// Load saved status from file
const statusFile = path.join(__dirname, '..', 'agent-status.json');
try {
  if (fs.existsSync(statusFile)) {
    const saved = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    agentStatus.crimeWatch.lastRun = saved.crimeWatch?.lastRun || null;
    agentStatus.townMeeting.lastRun = saved.townMeeting?.lastRun || null;
  }
} catch (e) {
  console.log('No saved agent status found');
}

function saveStatus() {
  fs.writeFileSync(statusFile, JSON.stringify({
    crimeWatch: { lastRun: agentStatus.crimeWatch.lastRun },
    townMeeting: { lastRun: agentStatus.townMeeting.lastRun }
  }, null, 2));
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Google Sheets setup
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
const SHEET_NAME = 'Articles';

// Column mapping
const COLUMNS = {
  AGENT_SOURCE: 0,
  HEADLINE: 1,
  BODY: 2,
  SUMMARY: 3,
  TWITTER: 4,
  FACEBOOK: 5,
  INSTAGRAM: 6,
  SOURCE_URL: 7,
  STATUS: 8,
  CREATED_AT: 9
};

/**
 * GET /api/articles
 * Fetch all articles from the sheet
 */
app.get('/api/articles', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:J`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      return res.json([]);
    }

    const articles = rows.slice(1).map((row, index) => ({
      id: index + 2, // Row number (1-indexed, skip header)
      agentSource: row[COLUMNS.AGENT_SOURCE] || '',
      headline: row[COLUMNS.HEADLINE] || '',
      body: row[COLUMNS.BODY] || '',
      summary: row[COLUMNS.SUMMARY] || '',
      twitter: row[COLUMNS.TWITTER] || '',
      facebook: row[COLUMNS.FACEBOOK] || '',
      instagram: row[COLUMNS.INSTAGRAM] || '',
      sourceUrl: row[COLUMNS.SOURCE_URL] || '',
      status: row[COLUMNS.STATUS] || 'draft',
      createdAt: row[COLUMNS.CREATED_AT] || ''
    }));

    res.json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/articles/:id
 * Fetch a single article by row ID
 */
app.get('/api/articles/:id', async (req, res) => {
  try {
    const rowId = parseInt(req.params.id);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A${rowId}:J${rowId}`
    });

    const row = response.data.values?.[0];
    if (!row) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const article = {
      id: rowId,
      agentSource: row[COLUMNS.AGENT_SOURCE] || '',
      headline: row[COLUMNS.HEADLINE] || '',
      body: row[COLUMNS.BODY] || '',
      summary: row[COLUMNS.SUMMARY] || '',
      twitter: row[COLUMNS.TWITTER] || '',
      facebook: row[COLUMNS.FACEBOOK] || '',
      instagram: row[COLUMNS.INSTAGRAM] || '',
      sourceUrl: row[COLUMNS.SOURCE_URL] || '',
      status: row[COLUMNS.STATUS] || 'draft',
      createdAt: row[COLUMNS.CREATED_AT] || ''
    };

    res.json(article);
  } catch (error) {
    console.error('Error fetching article:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/articles/:id
 * Update an article
 */
app.put('/api/articles/:id', async (req, res) => {
  try {
    const rowId = parseInt(req.params.id);
    const updates = req.body;

    // Get current row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A${rowId}:J${rowId}`
    });

    const currentRow = response.data.values?.[0] || Array(10).fill('');

    // Apply updates
    if (updates.agentSource !== undefined) currentRow[COLUMNS.AGENT_SOURCE] = updates.agentSource;
    if (updates.headline !== undefined) currentRow[COLUMNS.HEADLINE] = updates.headline;
    if (updates.body !== undefined) currentRow[COLUMNS.BODY] = updates.body;
    if (updates.summary !== undefined) currentRow[COLUMNS.SUMMARY] = updates.summary;
    if (updates.twitter !== undefined) currentRow[COLUMNS.TWITTER] = updates.twitter;
    if (updates.facebook !== undefined) currentRow[COLUMNS.FACEBOOK] = updates.facebook;
    if (updates.instagram !== undefined) currentRow[COLUMNS.INSTAGRAM] = updates.instagram;
    if (updates.sourceUrl !== undefined) currentRow[COLUMNS.SOURCE_URL] = updates.sourceUrl;
    if (updates.status !== undefined) currentRow[COLUMNS.STATUS] = updates.status;

    // Write back
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A${rowId}:J${rowId}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [currentRow]
      }
    });

    res.json({ success: true, id: rowId });
  } catch (error) {
    console.error('Error updating article:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/articles/:id/status
 * Quick status update (approve/discard)
 */
app.patch('/api/articles/:id/status', async (req, res) => {
  try {
    const rowId = parseInt(req.params.id);
    const { status } = req.body;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!I${rowId}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[status]]
      }
    });

    res.json({ success: true, id: rowId, status });
  } catch (error) {
    console.error('Error updating status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/status
 * Get status of all agents
 */
app.get('/api/agents/status', (req, res) => {
  res.json(agentStatus);
});

/**
 * GET /api/settings/town-meeting
 */
app.get('/api/settings/town-meeting', (req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      res.json(settings);
    } else {
      res.status(404).json({ error: 'Settings not found' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/settings/town-meeting
 */
app.post('/api/settings/town-meeting', (req, res) => {
  try {
    const settings = req.body;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/town-meeting/meetings
 * Returns list of processed meetings from the data directory
 */
app.get('/api/agents/town-meeting/meetings', (req, res) => {
  try {
    const dataDir = path.join(__dirname, '..', 'data', 'swagit');

    if (!fs.existsSync(dataDir)) {
      return res.json({ meetings: [] });
    }

    const files = fs.readdirSync(dataDir);

    // Find all unique video IDs that have been processed
    // Also detect from transcript files (for bootstrap script which doesn't download videos)
    const videoIds = new Set();
    files.forEach(f => {
      // Match video/audio files
      const mediaMatch = f.match(/^(\d+)\.(mp4|vtt|mp3)$/);
      if (mediaMatch) videoIds.add(mediaMatch[1]);

      // Also match transcript files (e.g., "362440_transcript.json")
      const transcriptMatch = f.match(/^(\d+)_transcript\.json$/);
      if (transcriptMatch) videoIds.add(transcriptMatch[1]);
    });

    const meetings = [];

    for (const videoId of videoIds) {
      const hasVideo = files.includes(`${videoId}.mp4`);
      const hasVtt = files.includes(`${videoId}.vtt`);
      const hasTranscript = files.includes(`${videoId}_transcript.json`);
      const hasAnalysis = files.includes(`${videoId}_analysis.json`);
      const hasIdeas = files.includes(`${videoId}_ideas.json`) || fs.existsSync(IDEAS_FILE);

      // Count articles generated for this video
      const articleFiles = files.filter(f => f.startsWith(`${videoId}_article`));

      // Get video file stats for date
      let processedDate = null;
      try {
        const stat = fs.statSync(path.join(dataDir, `${videoId}.mp4`));
        processedDate = stat.mtime.toISOString();
      } catch (e) { }

      // Get ideas count if current_ideas.json matches this video
      let ideasCount = 0;
      try {
        if (fs.existsSync(IDEAS_FILE)) {
          const ideasData = JSON.parse(fs.readFileSync(IDEAS_FILE, 'utf-8'));
          if (ideasData.metadata?.videoId === videoId) {
            ideasCount = ideasData.ideas?.length || 0;
          }
        }
      } catch (e) { }

      // Lookup metadata in meetings.json FIRST (needed for status check)
      const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
      let registry = [];
      try {
        if (fs.existsSync(meetingsFile)) {
          registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
        }
      } catch (e) { }

      const registryEntry = registry.find(m => m.videoId === videoId || m.id === videoId);

      // Determine status - support both video+transcript and transcript-only workflows
      let status = 'downloading';
      if (hasTranscript) status = 'transcribed';
      if (hasTranscript && hasAnalysis) status = 'analyzed';
      if (hasTranscript && hasAnalysis && ideasCount > 0) status = 'processed';
      // Also check registry for status override
      if (registryEntry?.status === 'processed' || registryEntry?.ideasCount > 0) {
        status = 'processed';
        if (!ideasCount && registryEntry?.ideasCount) ideasCount = registryEntry.ideasCount;
      }

      meetings.push({
        id: videoId,
        videoId,
        sourceUrl: `https://jupiterfl.new.swagit.com/videos/${videoId}`,
        hasVideo,
        hasVtt,
        hasTranscript,
        hasAnalysis,
        ideasCount,
        articlesGenerated: articleFiles.length,
        processedAt: processedDate,
        date: registryEntry?.date || null,
        description: registryEntry?.description || null,
        departmentId: registryEntry?.departmentId || null,
        type: registryEntry?.type || null,
        status
      });
    }

    // Sort by processed date, newest first
    meetings.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));

    res.json({ meetings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/town-meeting/upcoming
 * Returns list of upcoming meetings from meetings.json
 */
app.get('/api/agents/town-meeting/upcoming', (req, res) => {
  try {
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');

    if (!fs.existsSync(meetingsFile)) {
      return res.json({ upcoming: [] });
    }

    const registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
    // Filter to only future meetings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = registry.filter(m => new Date(m.date) >= today);
    res.json({ upcoming });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/agents/town-meeting/upcoming/:id
 * Delete an upcoming meeting
 */
app.delete('/api/agents/town-meeting/upcoming/:id', (req, res) => {
  try {
    const { id } = req.params;
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');

    if (!fs.existsSync(meetingsFile)) {
      return res.status(404).json({ error: 'No meetings file found' });
    }

    let registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
    const index = registry.findIndex(m => m.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    registry.splice(index, 1);
    fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents/town-meeting/meetings
 * Manual creation of upcoming meetings
 */
app.post('/api/agents/town-meeting/meetings', (req, res) => {
  try {
    const { date, type, departmentId, description } = req.body;

    if (!date || !type) {
      return res.status(400).json({ error: 'Date and Type are required' });
    }

    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    let registry = [];

    if (fs.existsSync(meetingsFile)) {
      registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
    }

    const prefix = departmentId ? departmentId :
      type.toLowerCase().includes('council') ? 'tc' :
        type.toLowerCase().includes('planning') ? 'pb' : 'tm';

    const id = `${prefix}-${date}`;
    if (registry.find(m => m.id === id)) {
      return res.status(409).json({ error: 'Meeting with this ID already exists' });
    }

    const newMeeting = {
      id,
      date,
      type,
      status: 'upcoming',
      departmentId,
      description: description || null,
      createdAt: new Date().toISOString()
    };

    registry.push(newMeeting);
    registry.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));

    res.json(newMeeting);
  } catch (e) {
    console.error('Error creating meeting:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/town-meeting/ideas
 */
app.get('/api/agents/town-meeting/ideas', (req, res) => {
  try {
    if (fs.existsSync(IDEAS_FILE)) {
      const ideas = JSON.parse(fs.readFileSync(IDEAS_FILE, 'utf-8'));
      res.json(ideas);
    } else {
      res.json({ ideas: [] });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents/town-meeting/generate-article
 * Body: { ideaId, angleName, departmentId }
 */
app.post('/api/agents/town-meeting/generate-article', async (req, res) => {
  const { ideaId, angleName, departmentId } = req.body;

  if (agentStatus.townMeeting.running) {
    return res.status(409).json({ error: 'Agent already running' });
  }

  agentStatus.townMeeting.running = true;
  res.json({ status: 'started' });

  (async () => {
    const agentDir = path.join(__dirname, '..', 'agents', 'town-meeting');
    const dataDir = path.join(__dirname, '..', 'data', 'swagit');

    try {
      // Find the latest transcript
      const transcriptFiles = fs.readdirSync(dataDir).filter(f => f.includes('_transcript.json'));
      if (transcriptFiles.length === 0) throw new Error('No transcript file found');
      const latestTranscript = transcriptFiles.sort().reverse()[0];
      const transcriptPath = path.join(dataDir, latestTranscript);

      console.log(`Generating article for idea ${ideaId}, angle ${angleName}...`);
      await runScript(agentDir, 'generate.js', [transcriptPath, ideaId, angleName], { DEPARTMENT_ID: departmentId });

      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.lastResult = { type: 'success', message: 'Article generated and added to drafts', count: 1 };
      saveStatus();
    } catch (error) {
      console.error('Article generation failed:', error.message);
      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.error = error.message;
      saveStatus();
    }
  })();
});
app.post('/api/agents/crime-watch/run', async (req, res) => {
  if (agentStatus.crimeWatch.running) {
    return res.status(409).json({ error: 'Agent already running' });
  }

  agentStatus.crimeWatch.running = true;
  agentStatus.crimeWatch.error = null;
  res.json({ status: 'started' }); // Respond immediately

  // Run in background
  (async () => {
    const agentDir = path.join(__dirname, '..', 'agents', 'crime-watch');
    const outputDir = path.join(agentDir, 'output');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      // Run scraper
      console.log('Running crime-watch scraper...');
      await runScript(agentDir, 'scrape.js');

      // Mismatch fix: Scraper saves to ../../data/crime by default
      const dataDir = path.join(__dirname, '..', 'data', 'crime');

      // Ensure data directory exists
      if (!fs.existsSync(dataDir)) {
        throw new Error(`Data directory not found: ${dataDir}`);
      }

      const files = fs.readdirSync(dataDir).filter(f => f.startsWith('incidents_'));
      if (files.length === 0) {
        throw new Error('No incidents file generated');
      }
      const latestFile = files.sort().reverse()[0];
      const incidentsPath = path.join(dataDir, latestFile);

      // Run generator
      console.log('Running crime-watch generator...');
      const result = await runScript(agentDir, 'generate.js', [incidentsPath]);

      agentStatus.crimeWatch.lastRun = new Date().toISOString();
      agentStatus.crimeWatch.running = false;
      agentStatus.crimeWatch.lastResult = parseAgentResult(result.stdout, 'crime-watch');
      saveStatus();
      console.log('Crime watch agent completed successfully');
    } catch (error) {
      console.error('Crime watch agent failed:', error.message);
      agentStatus.crimeWatch.running = false;
      agentStatus.crimeWatch.error = error.message;
      saveStatus();
    }
  })();
});

/**
 * POST /api/agents/town-meeting/run
 * Run the town meeting agent
 */
app.post('/api/agents/town-meeting/run', async (req, res) => {
  if (agentStatus.townMeeting.running) {
    return res.status(409).json({ error: 'Agent already running' });
  }

  agentStatus.townMeeting.running = true;
  agentStatus.townMeeting.error = null;
  res.json({ status: 'started' }); // Respond immediately

  // Run in background
  (async () => {
    const agentDir = path.join(__dirname, '..', 'agents', 'town-meeting');
    const departmentId = req.body.departmentId || 'town-council';
    const scrapeMode = req.body.scrapeMode || 'latest'; // 'latest' or 'upcoming'

    try {
      // Run scraper (gets latest meeting or processes upcoming)
      console.log(`Running town-meeting scraper for ${departmentId} (mode: ${scrapeMode})...`);
      await runScript(agentDir, 'scrape.js', [], {
        DEPARTMENT_ID: departmentId,
        SCRAPE_MODE: scrapeMode
      });

      // Mismatch fix: Orchestrator saves to ../../data/swagit
      const dataDir = path.join(__dirname, '..', 'data', 'swagit');

      // Find the latest transcript
      const transcriptFiles = fs.readdirSync(dataDir).filter(f => f.includes('_transcript.json'));
      if (transcriptFiles.length === 0) throw new Error('No transcript file found');
      const latestTranscript = transcriptFiles.sort().reverse()[0];
      const transcriptPath = path.join(dataDir, latestTranscript);

      // Run idea generator
      console.log('Running town-meeting idea generator...');
      await runScript(agentDir, 'generate_ideas.js', [transcriptPath, IDEAS_FILE]);

      agentStatus.townMeeting.lastRun = new Date().toISOString();
      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.lastResult = { type: 'success', message: 'Meeting processed and ideas generated', count: 0 };
      saveStatus();
      console.log('Town meeting ingestion and idea generation complete');
    } catch (error) {
      console.error('Town meeting agent failed:', error.message);
      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.error = error.message;
      saveStatus();
    }
  })();
});

/**
 * Helper to run a script and capture output
 */
function runScript(cwd, script, args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn('node', [script, ...args], {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ['inherit', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text); // Still show in console
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Parse agent output for result summary
 */
function parseAgentResult(output, type) {
  console.log(`\n[parseAgentResult] Parsing ${type} output (${output.length} chars)`);

  if (type === 'crime-watch') {
    // Check for "Added X new articles to sheet" pattern
    const addedMatch = output.match(/Added\s+(\d+)\s+new articles/i);
    if (addedMatch) {
      const count = parseInt(addedMatch[1]);
      console.log(`[parseAgentResult] Found: Added ${count} articles`);
      return {
        type: 'success',
        message: `Added ${count} new crime article${count !== 1 ? 's' : ''}`,
        count
      };
    }

    // Check for "All newsworthy incidents have already been processed"
    if (output.includes('All newsworthy incidents have already been processed')) {
      console.log('[parseAgentResult] Found: All already processed');
      return {
        type: 'info',
        message: 'No new entries - all incidents already processed',
        count: 0
      };
    }

    // Check for "No newsworthy incidents found"
    if (output.includes('No newsworthy incidents found')) {
      console.log('[parseAgentResult] Found: No newsworthy');
      return {
        type: 'info',
        message: 'No newsworthy incidents found',
        count: 0
      };
    }

    console.log('[parseAgentResult] No pattern matched for crime-watch');
    return { type: 'info', message: 'Scan complete - no new articles', count: 0 };
  }

  if (type === 'town-meeting') {
    // Check for "Added to sheet (row X)" pattern
    const addedMatch = output.match(/Added to sheet/i);
    if (addedMatch) {
      console.log('[parseAgentResult] Found: Added to sheet');
      return {
        type: 'success',
        message: 'Added 1 new town meeting article',
        count: 1
      };
    }

    // Check for already exists / skipping
    if (output.includes('Article already exists') || output.includes('Skipping generation')) {
      console.log('[parseAgentResult] Found: Already exists');
      return {
        type: 'info',
        message: 'No new entries - meeting already processed',
        count: 0
      };
    }

    console.log('[parseAgentResult] No pattern matched for town-meeting');
    return { type: 'info', message: 'Scan complete - no new articles', count: 0 };
  }

  return { type: 'info', message: 'Agent completed', count: null };
}

app.listen(PORT, () => {
  console.log(`Dashboard API running at http://localhost:${PORT}`);
});
