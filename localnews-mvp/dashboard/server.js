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
import { createClient } from '@supabase/supabase-js';

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
  console.log('✅ Supabase client initialized');
} else {
  console.log('⚠️ Supabase not configured - using Google Sheets only');
}

/**
 * SUPABASE DUAL-WRITE HELPERS
 * These functions write to Supabase in parallel with Google Sheets
 * During migration, Sheets remains the source of truth for reads
 */

// Save article to Supabase (dual-write)
async function saveArticleToSupabase(article) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('articles')
      .upsert({
        agent_source: article.agentSource,
        headline: article.headline,
        body: article.body,
        summary: article.summary,
        twitter: article.twitter,
        facebook: article.facebook,
        instagram: article.instagram,
        source_url: article.sourceUrl,
        status: article.status || 'draft'
      }, { onConflict: 'source_url' })
      .select();

    if (error) {
      console.error('Supabase article save error:', error.message);
      return null;
    }
    console.log(`📦 Article saved to Supabase: ${article.headline?.substring(0, 50)}...`);
    return data;
  } catch (e) {
    console.error('Supabase article save failed:', e.message);
    return null;
  }
}

// Save meeting to Supabase (dual-write)
async function saveMeetingToSupabase(meeting) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('meetings')
      .upsert({
        video_id: meeting.videoId,
        title: meeting.type || meeting.description,
        date: meeting.date,
        duration: meeting.duration || null,
        status: meeting.status || 'pending',
        ideas_count: meeting.ideasCount || 0
      }, { onConflict: 'video_id' })
      .select();

    if (error) {
      console.error('Supabase meeting save error:', error.message);
      return null;
    }
    console.log(`📦 Meeting saved to Supabase: ${meeting.videoId}`);
    return data;
  } catch (e) {
    console.error('Supabase meeting save failed:', e.message);
    return null;
  }
}

// Save ideas to Supabase (dual-write)
async function saveIdeasToSupabase(videoId, ideas) {
  if (!supabase) return null;
  try {
    // Delete existing ideas for this video first
    await supabase.from('ideas').delete().eq('video_id', videoId);

    // Insert new ideas
    const rows = ideas.map((idea, index) => ({
      video_id: videoId,
      idea_id: idea.id?.toString() || (index + 1).toString(),
      title: idea.title,
      summary: idea.summary || idea.event,
      angles: idea.angles || []
    }));

    const { data, error } = await supabase.from('ideas').insert(rows).select();

    if (error) {
      console.error('Supabase ideas save error:', error.message);
      return null;
    }
    console.log(`📦 ${ideas.length} ideas saved to Supabase for video ${videoId}`);
    return data;
  } catch (e) {
    console.error('Supabase ideas save failed:', e.message);
    return null;
  }
}

// Update article status in Supabase
async function updateArticleStatusInSupabase(sourceUrl, status) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('articles')
      .update({ status })
      .eq('source_url', sourceUrl)
      .select();

    if (error) {
      console.error('Supabase status update error:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Supabase status update failed:', e.message);
    return null;
  }
}

// Get transcript from Supabase (fallback when local file doesn't exist)
async function getTranscriptFromSupabase(videoId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('video_id', videoId)
      .single();

    if (error) {
      console.error('Supabase transcript fetch error:', error.message);
      return null;
    }
    if (data) {
      console.log(`☁️  Transcript loaded from Supabase for video ${videoId}`);
      return {
        videoId: data.video_id,
        fullText: data.full_text,
        segments: data.segments,
        durationMinutes: Math.round(data.duration_seconds / 60)
      };
    }
    return null;
  } catch (e) {
    console.error('Supabase transcript fetch failed:', e.message);
    return null;
  }
}

// Track agent run status
const agentStatus = {
  crimeWatch: { lastRun: null, running: false, error: null, lastResult: null },
  townMeeting: { lastRun: null, running: false, error: null, lastResult: null, currentMeeting: null },
  wastewaterHealth: { lastRun: null, running: false, error: null, lastResult: null }
};

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'town_meeting_settings.json');
const IDEAS_FILE = path.join(__dirname, '..', 'data', 'swagit', 'current_ideas.json');
const IDEAS_SHEET_NAME = 'Ideas';

// Load saved status from file
const statusFile = path.join(__dirname, '..', 'agent-status.json');
try {
  if (fs.existsSync(statusFile)) {
    const saved = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    agentStatus.crimeWatch.lastRun = saved.crimeWatch?.lastRun || null;
    agentStatus.townMeeting.lastRun = saved.townMeeting?.lastRun || null;
    agentStatus.wastewaterHealth.lastRun = saved.wastewaterHealth?.lastRun || null;
  }
} catch (e) {
  console.log('No saved agent status found');
}

function saveStatus() {
  fs.writeFileSync(statusFile, JSON.stringify({
    crimeWatch: { lastRun: agentStatus.crimeWatch.lastRun },
    townMeeting: { lastRun: agentStatus.townMeeting.lastRun },
    wastewaterHealth: { lastRun: agentStatus.wastewaterHealth.lastRun }
  }, null, 2));
}

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// In production, serve the built React app
if (isProduction) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  console.log(`Serving static files from: ${distPath}`);
}

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
const MEETINGS_SHEET_NAME = 'Meetings';

// Meetings column mapping (for Google Sheets persistence)
const MEETINGS_COLUMNS = {
  ID: 0,
  VIDEO_ID: 1,
  DEPARTMENT_ID: 2,
  TYPE: 3,
  DATE: 4,
  STATUS: 5,
  DESCRIPTION: 6,
  SOURCE: 7,
  IDEAS_COUNT: 8,
  PROCESSED_AT: 9,
  SYNCED_AT: 10
};

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
 * MEETINGS PERSISTENCE - Google Sheets as primary storage
 * This ensures meetings survive deployments on Railway
 */

// Initialize Meetings sheet if it doesn't exist
async function initMeetingsSheet() {
  try {
    // Check if Meetings sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === MEETINGS_SHEET_NAME);

    if (!sheetExists) {
      // Create the Meetings sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: MEETINGS_SHEET_NAME }
            }
          }]
        }
      });

      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${MEETINGS_SHEET_NAME}!A1:K1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['ID', 'VideoID', 'DepartmentID', 'Type', 'Date', 'Status', 'Description', 'Source', 'IdeasCount', 'ProcessedAt', 'SyncedAt']]
        }
      });
      console.log('Created Meetings sheet in Google Sheets');
    }
  } catch (e) {
    console.error('Failed to initialize Meetings sheet:', e.message);
  }
}

// Get all meetings from Google Sheets
async function getMeetingsFromSheets() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${MEETINGS_SHEET_NAME}!A:K`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    return rows.slice(1).map(row => ({
      id: row[MEETINGS_COLUMNS.ID] || '',
      videoId: row[MEETINGS_COLUMNS.VIDEO_ID] || null,
      departmentId: row[MEETINGS_COLUMNS.DEPARTMENT_ID] || null,
      type: row[MEETINGS_COLUMNS.TYPE] || '',
      date: row[MEETINGS_COLUMNS.DATE] || '',
      status: row[MEETINGS_COLUMNS.STATUS] || 'upcoming',
      description: row[MEETINGS_COLUMNS.DESCRIPTION] || null,
      source: row[MEETINGS_COLUMNS.SOURCE] || null,
      ideasCount: parseInt(row[MEETINGS_COLUMNS.IDEAS_COUNT]) || 0,
      processedAt: row[MEETINGS_COLUMNS.PROCESSED_AT] || null,
      syncedAt: row[MEETINGS_COLUMNS.SYNCED_AT] || null
    })).filter(m => m.id);
  } catch (e) {
    console.error('Failed to get meetings from Sheets:', e.message);
    return [];
  }
}

// Save a meeting to Google Sheets
async function saveMeetingToSheets(meeting) {
  try {
    // Get existing meetings to check for duplicates
    const existing = await getMeetingsFromSheets();
    const existingRow = existing.findIndex(m => m.id === meeting.id);

    const rowData = [
      meeting.id,
      meeting.videoId || '',
      meeting.departmentId || '',
      meeting.type || '',
      meeting.date || '',
      meeting.status || 'upcoming',
      meeting.description || '',
      meeting.source || '',
      meeting.ideasCount || 0,
      meeting.processedAt || '',
      new Date().toISOString()
    ];

    if (existingRow >= 0) {
      // Update existing row (row index + 2 for header and 0-indexing)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${MEETINGS_SHEET_NAME}!A${existingRow + 2}:K${existingRow + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] }
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${MEETINGS_SHEET_NAME}!A:K`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowData] }
      });
    }

    // Dual-write to Supabase
    saveMeetingToSupabase(meeting);

    return true;
  } catch (e) {
    console.error('Failed to save meeting to Sheets:', e.message);
    return false;
  }
}

// Delete a meeting from Google Sheets
async function deleteMeetingFromSheets(meetingId) {
  try {
    const existing = await getMeetingsFromSheets();
    const rowIndex = existing.findIndex(m => m.id === meetingId);

    if (rowIndex < 0) return false;

    // Clear the row (can't actually delete rows via values API)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${MEETINGS_SHEET_NAME}!A${rowIndex + 2}:K${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['', '', '', '', '', '', '', '', '', '', '']] }
    });

    return true;
  } catch (e) {
    console.error('Failed to delete meeting from Sheets:', e.message);
    return false;
  }
}

// Sync local meetings.json to Sheets (one-time migration or backup)
async function syncLocalMeetingsToSheets() {
  const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
  try {
    if (!fs.existsSync(meetingsFile)) return;

    const localMeetings = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
    const sheetMeetings = await getMeetingsFromSheets();
    const sheetIds = new Set(sheetMeetings.map(m => m.id));

    let synced = 0;
    for (const meeting of localMeetings) {
      if (!sheetIds.has(meeting.id)) {
        await saveMeetingToSheets(meeting);
        synced++;
      }
    }

    if (synced > 0) {
      console.log(`Synced ${synced} meetings from local file to Google Sheets`);
    }
  } catch (e) {
    console.error('Failed to sync local meetings:', e.message);
  }
}

// Initialize on startup
initMeetingsSheet().then(() => syncLocalMeetingsToSheets());

/**
 * IDEAS PERSISTENCE - Google Sheets as primary storage
 * This ensures ideas survive deployments on Railway
 */

// Initialize Ideas sheet if it doesn't exist
async function initIdeasSheet() {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === IDEAS_SHEET_NAME);

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: IDEAS_SHEET_NAME }
            }
          }]
        }
      });

      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${IDEAS_SHEET_NAME}!A1:F1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['VideoID', 'IdeaID', 'Title', 'Summary', 'Angles', 'CreatedAt']]
        }
      });
      console.log('Created Ideas sheet in Google Sheets');
    }
  } catch (e) {
    console.error('Failed to initialize Ideas sheet:', e.message);
  }
}

// Get ideas for a specific video from Google Sheets
async function getIdeasFromSheets(videoId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${IDEAS_SHEET_NAME}!A:F`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    return rows.slice(1)
      .filter(row => row[0] === videoId)
      .map(row => ({
        id: parseInt(row[1]) || 0,
        title: row[2] || '',
        summary: row[3] || '',
        angles: JSON.parse(row[4] || '[]'),
        createdAt: row[5] || null
      }));
  } catch (e) {
    console.error('Failed to get ideas from Sheets:', e.message);
    return [];
  }
}

// Save ideas for a video to Google Sheets
async function saveIdeasToSheets(videoId, ideas) {
  try {
    // First, remove existing ideas for this video
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${IDEAS_SHEET_NAME}!A:F`
    });

    const rows = response.data.values || [];
    const rowsToDelete = [];

    rows.forEach((row, index) => {
      if (index > 0 && row[0] === videoId) {
        rowsToDelete.push(index + 1); // +1 for 1-based indexing
      }
    });

    // Clear existing rows for this video (set to empty)
    for (const rowIndex of rowsToDelete.reverse()) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${IDEAS_SHEET_NAME}!A${rowIndex}:F${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['', '', '', '', '', '']] }
      });
    }

    // Append new ideas
    if (ideas.length > 0) {
      const newRows = ideas.map(idea => [
        videoId,
        idea.id.toString(),
        idea.title || '',
        idea.summary || idea.event || '',
        JSON.stringify(idea.angles || []),
        new Date().toISOString()
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${IDEAS_SHEET_NAME}!A:F`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: newRows }
      });
    }

    // Dual-write to Supabase
    saveIdeasToSupabase(videoId, ideas);

    console.log(`Saved ${ideas.length} ideas for video ${videoId} to Sheets`);
    return true;
  } catch (e) {
    console.error('Failed to save ideas to Sheets:', e.message);
    return false;
  }
}

// Sync local ideas files to Sheets on startup
async function syncLocalIdeasToSheets() {
  const dataDir = path.join(__dirname, '..', 'data', 'swagit');
  try {
    if (!fs.existsSync(dataDir)) return;

    const files = fs.readdirSync(dataDir);
    const ideasFiles = files.filter(f => f.match(/^\d+_ideas\.json$/));

    let synced = 0;
    for (const file of ideasFiles) {
      const videoId = file.match(/^(\d+)_ideas\.json$/)[1];
      const existingIdeas = await getIdeasFromSheets(videoId);

      if (existingIdeas.length === 0) {
        const filePath = path.join(dataDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.ideas && data.ideas.length > 0) {
          await saveIdeasToSheets(videoId, data.ideas);
          synced++;
        }
      }
    }

    if (synced > 0) {
      console.log(`Synced ${synced} ideas files to Google Sheets`);
    }
  } catch (e) {
    console.error('Failed to sync local ideas:', e.message);
  }
}

// Initialize Ideas sheet on startup
initIdeasSheet().then(() => syncLocalIdeasToSheets());

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

    // Load meetings data for department lookup
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    let meetingsData = [];
    try {
      if (fs.existsSync(meetingsFile)) {
        meetingsData = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
      }
    } catch (e) { }

    // Load settings for department names
    let settingsData = { departments: [] };
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        settingsData = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      }
    } catch (e) { }

    const articles = rows.slice(1).map((row, index) => {
      const sourceUrl = row[COLUMNS.SOURCE_URL] || '';

      // Extract video ID from sourceUrl
      let departmentId = null;
      let departmentName = null;
      let meetingType = null;
      let meetingDate = null;

      const videoMatch = sourceUrl.match(/\/videos\/(\d+)/);
      if (videoMatch) {
        const videoId = videoMatch[1];
        const meeting = meetingsData.find(m => m.videoId === videoId);
        if (meeting) {
          departmentId = meeting.departmentId;
          meetingType = meeting.type;
          meetingDate = meeting.date;
          const dept = settingsData.departments.find(d => d.id === departmentId);
          departmentName = dept?.name || departmentId;
        }
      }

      return {
        id: index + 2, // Row number (1-indexed, skip header)
        agentSource: row[COLUMNS.AGENT_SOURCE] || '',
        headline: row[COLUMNS.HEADLINE] || '',
        body: row[COLUMNS.BODY] || '',
        summary: row[COLUMNS.SUMMARY] || '',
        twitter: row[COLUMNS.TWITTER] || '',
        facebook: row[COLUMNS.FACEBOOK] || '',
        instagram: row[COLUMNS.INSTAGRAM] || '',
        sourceUrl: sourceUrl,
        status: row[COLUMNS.STATUS] || 'draft',
        createdAt: row[COLUMNS.CREATED_AT] || '',
        departmentId,
        departmentName,
        meetingType,
        meetingDate
      };
    });

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

    // Get the source_url for this article first (for Supabase update)
    const currentRow = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A${rowId}:J${rowId}`
    });
    const sourceUrl = currentRow.data.values?.[0]?.[COLUMNS.SOURCE_URL];

    // Update Google Sheets
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!I${rowId}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[status]]
      }
    });

    // Dual-write to Supabase
    if (sourceUrl) {
      updateArticleStatusInSupabase(sourceUrl, status);
    }

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
 * Returns list of processed meetings - combines local files + Google Sheets
 */
app.get('/api/agents/town-meeting/meetings', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, '..', 'data', 'swagit');
    const meetings = [];
    const seenIds = new Set();

    // First, get processed meetings from Google Sheets (persistent storage)
    const sheetMeetings = await getMeetingsFromSheets();
    for (const m of sheetMeetings) {
      if (m.status === 'processed' && m.videoId) {
        seenIds.add(m.videoId);
        meetings.push({
          id: m.videoId,
          videoId: m.videoId,
          sourceUrl: `https://jupiterfl.new.swagit.com/videos/${m.videoId}`,
          hasVideo: false, // Not known from Sheets
          hasVtt: false,
          hasTranscript: true, // Assumed if processed
          hasAnalysis: true,
          ideasCount: m.ideasCount || 0,
          articlesGenerated: 0,
          processedAt: m.processedAt,
          date: m.date,
          description: m.description,
          departmentId: m.departmentId,
          type: m.type,
          status: 'processed'
        });
      }
    }

    // Then, add any meetings from local files that aren't in Sheets
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);

      // Find all unique video IDs that have been processed
      const videoIds = new Set();
      files.forEach(f => {
        const transcriptMatch = f.match(/^(\d+)_transcript\.json$/);
        if (transcriptMatch) videoIds.add(transcriptMatch[1]);
        const ideasMatch = f.match(/^(\d+)_ideas\.json$/);
        if (ideasMatch) videoIds.add(ideasMatch[1]);
      });

      for (const videoId of videoIds) {
        if (seenIds.has(videoId)) continue; // Skip if already from Sheets

        const hasVideo = files.includes(`${videoId}.mp4`);
        const hasVtt = files.includes(`${videoId}.vtt`);
        const hasTranscript = files.includes(`${videoId}_transcript.json`);
        const hasAnalysis = files.includes(`${videoId}_analysis.json`);

        const articleFiles = files.filter(f => f.startsWith(`${videoId}_article`));

        let processedDate = null;
        try {
          const stat = fs.statSync(path.join(dataDir, `${videoId}.mp4`));
          processedDate = stat.mtime.toISOString();
        } catch (e) { }

        let ideasCount = 0;
        try {
          const meetingIdeasFile = path.join(dataDir, `${videoId}_ideas.json`);
          if (fs.existsSync(meetingIdeasFile)) {
            const ideasData = JSON.parse(fs.readFileSync(meetingIdeasFile, 'utf-8'));
            ideasCount = ideasData.ideas?.length || 0;
          } else if (fs.existsSync(IDEAS_FILE)) {
            const ideasData = JSON.parse(fs.readFileSync(IDEAS_FILE, 'utf-8'));
            if (ideasData.metadata?.videoId === videoId) {
              ideasCount = ideasData.ideas?.length || 0;
            }
          }
        } catch (e) { }

        const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
        let registry = [];
        try {
          if (fs.existsSync(meetingsFile)) {
            registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
          }
        } catch (e) { }

        const registryEntry = registry.find(m => m.videoId === videoId || m.id === videoId);

        let status = 'downloading';
        if (hasTranscript) status = 'transcribed';
        if (hasTranscript && hasAnalysis) status = 'analyzed';
        if (hasTranscript && hasAnalysis && ideasCount > 0) status = 'processed';
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
          processedAt: processedDate || registryEntry?.processedAt,
          date: registryEntry?.date || null,
          description: registryEntry?.description || null,
          departmentId: registryEntry?.departmentId || null,
          type: registryEntry?.type || null,
          status
        });
      }
    }

    // Sort by processed date, newest first
    meetings.sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0));

    res.json({ meetings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/town-meeting/upcoming
 * Returns list of upcoming meetings - uses Google Sheets as primary storage
 */
app.get('/api/agents/town-meeting/upcoming', async (req, res) => {
  try {
    // Get meetings from Google Sheets (persistent storage)
    const sheetMeetings = await getMeetingsFromSheets();

    // Filter to only future meetings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = sheetMeetings.filter(m => new Date(m.date) >= today);
    res.json({ upcoming });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/agents/town-meeting/meetings/:id
 * Delete any meeting (processed or upcoming) from Google Sheets
 */
app.delete('/api/agents/town-meeting/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const success = await deleteMeetingFromSheets(id);
    if (!success) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Also remove from local file if it exists
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    if (fs.existsSync(meetingsFile)) {
      let registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
      const index = registry.findIndex(m => m.id === id);
      if (index !== -1) {
        registry.splice(index, 1);
        fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));
      }
    }

    // Also remove local transcript/analysis/ideas files if they exist
    const dataDir = path.join(__dirname, '..', 'data', 'swagit');
    const filesToDelete = [
      `${id}_transcript.json`,
      `${id}_analysis.json`,
      `${id}_ideas.json`,
      `${id}.vtt`
    ];
    for (const file of filesToDelete) {
      const filePath = path.join(dataDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted: ${file}`);
      }
    }

    console.log(`Deleted meeting ${id}`);
    res.json({ success: true, deleted: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/agents/town-meeting/upcoming/:id
 * Delete an upcoming meeting from Google Sheets (alias for backwards compat)
 */
app.delete('/api/agents/town-meeting/upcoming/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const success = await deleteMeetingFromSheets(id);
    if (!success) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Also remove from local file if it exists
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    if (fs.existsSync(meetingsFile)) {
      let registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
      const index = registry.findIndex(m => m.id === id);
      if (index !== -1) {
        registry.splice(index, 1);
        fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents/town-meeting/meetings
 * Manual creation of upcoming meetings - saves to Google Sheets
 */
app.post('/api/agents/town-meeting/meetings', async (req, res) => {
  try {
    const { date, type, departmentId, description } = req.body;

    if (!date || !type) {
      return res.status(400).json({ error: 'Date and Type are required' });
    }

    const prefix = departmentId ? departmentId :
      type.toLowerCase().includes('council') ? 'tc' :
        type.toLowerCase().includes('planning') ? 'pb' : 'tm';

    const id = `${prefix}-${date}`;

    // Check if already exists in Sheets
    const existing = await getMeetingsFromSheets();
    if (existing.find(m => m.id === id)) {
      return res.status(409).json({ error: 'Meeting with this ID already exists' });
    }

    const newMeeting = {
      id,
      date,
      type,
      status: 'upcoming',
      departmentId,
      description: description || null,
      source: 'manual',
      processedAt: new Date().toISOString()
    };

    // Save to Google Sheets (primary storage)
    await saveMeetingToSheets(newMeeting);

    // Also save to local file for backwards compatibility
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    let registry = [];
    if (fs.existsSync(meetingsFile)) {
      registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
    }
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
 * SCAN STATE PERSISTENCE
 * Store the video scanner's last position in Google Sheets so it survives deployments.
 * This prevents re-scanning old ID ranges after Railway deployments.
 */

const SCAN_STATE_SHEET_NAME = 'ScanState';

// Initialize ScanState sheet if it doesn't exist
async function initScanStateSheet() {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === SCAN_STATE_SHEET_NAME);

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: SCAN_STATE_SHEET_NAME }
            }
          }]
        }
      });

      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SCAN_STATE_SHEET_NAME}!A1:D1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Key', 'HighestValidId', 'HighestScannedId', 'ScannedAt']]
        }
      });
      console.log('Created ScanState sheet in Google Sheets');
    }
  } catch (e) {
    console.error('Failed to initialize ScanState sheet:', e.message);
  }
}

// Get scan state from Google Sheets
async function getScanStateFromSheets(key = 'video_scanner') {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SCAN_STATE_SHEET_NAME}!A:D`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return null;

    // Find the row for this key
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        return {
          highestValidId: parseInt(rows[i][1]) || 0,
          highestScannedId: parseInt(rows[i][2]) || 0,
          scannedAt: rows[i][3] || null
        };
      }
    }
    return null;
  } catch (e) {
    console.error('Failed to get scan state from Sheets:', e.message);
    return null;
  }
}

// Save scan state to Google Sheets
async function saveScanStateToSheets(key, state) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SCAN_STATE_SHEET_NAME}!A:D`
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    // Find existing row for this key
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === key) {
        rowIndex = i;
        break;
      }
    }

    const rowData = [
      key,
      state.highestValidId || 0,
      state.highestScannedId || 0,
      state.scannedAt || new Date().toISOString()
    ];

    if (rowIndex >= 0) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SCAN_STATE_SHEET_NAME}!A${rowIndex + 1}:D${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] }
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SCAN_STATE_SHEET_NAME}!A:D`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowData] }
      });
    }

    return true;
  } catch (e) {
    console.error('Failed to save scan state to Sheets:', e.message);
    return false;
  }
}

// Initialize on startup
initScanStateSheet();

/**
 * GET /api/agents/town-meeting/scan-state
 * Get the current scan state (for video scanner to resume from)
 */
app.get('/api/agents/town-meeting/scan-state', async (req, res) => {
  try {
    const state = await getScanStateFromSheets('video_scanner');
    if (state) {
      console.log(`Returning scan state: highestScannedId=${state.highestScannedId}, scannedAt=${state.scannedAt}`);
      res.json(state);
    } else {
      res.json({ highestValidId: 0, highestScannedId: 0, scannedAt: null });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/agents/town-meeting/scan-state
 * Save the scan state (called by video scanner after each scan)
 */
app.put('/api/agents/town-meeting/scan-state', async (req, res) => {
  try {
    const { highestValidId, highestScannedId } = req.body;

    if (highestScannedId === undefined) {
      return res.status(400).json({ error: 'highestScannedId is required' });
    }

    const state = {
      highestValidId: highestValidId || 0,
      highestScannedId: highestScannedId,
      scannedAt: new Date().toISOString()
    };

    const success = await saveScanStateToSheets('video_scanner', state);

    // Also delete local scan file so scripts use API as source of truth
    const localScanFile = path.join(__dirname, '..', 'data', 'last_video_scan.json');
    if (fs.existsSync(localScanFile)) {
      fs.unlinkSync(localScanFile);
      console.log('Deleted local scan state file (API is source of truth)');
    }

    if (success) {
      console.log(`Scan state saved: highestScannedId=${highestScannedId}`);
      res.json({ success: true, state });
    } else {
      res.status(500).json({ error: 'Failed to save scan state' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/agents/town-meeting/meetings/:id
 * Update a meeting (used by agents to persist processed meetings to Sheets)
 */
app.put('/api/agents/town-meeting/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const meetingData = { id, ...req.body };

    // Save to Google Sheets
    await saveMeetingToSheets(meetingData);

    // Also update local file for backwards compatibility
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    let registry = [];
    if (fs.existsSync(meetingsFile)) {
      registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
    }
    const index = registry.findIndex(m => m.id === id);
    if (index >= 0) {
      registry[index] = { ...registry[index], ...meetingData };
    } else {
      registry.push(meetingData);
    }
    registry.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));

    console.log(`Meeting ${id} persisted to Google Sheets`);
    res.json({ success: true, meeting: meetingData });
  } catch (e) {
    console.error('Error updating meeting:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/meetings/update-ideas-count
 * Update a meeting's ideasCount after idea generation completes
 * Called by generate_ideas.js when running in background
 */
app.put('/api/meetings/update-ideas-count', async (req, res) => {
  try {
    const { videoId, ideasCount } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }

    // Find the meeting by videoId in Google Sheets
    const existing = await getMeetingsFromSheets();
    const meeting = existing.find(m => m.videoId === videoId);

    if (!meeting) {
      console.log(`Meeting with videoId ${videoId} not found in Sheets, checking local file...`);

      // Try to find in local meetings.json and update there
      const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
      if (fs.existsSync(meetingsFile)) {
        let registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
        const index = registry.findIndex(m => m.videoId === videoId);
        if (index >= 0) {
          registry[index].ideasCount = ideasCount;
          fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));
          console.log(`Updated ideasCount for ${videoId} to ${ideasCount} in local file`);
          return res.json({ success: true, source: 'local' });
        }
      }

      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Update the meeting in Google Sheets
    meeting.ideasCount = ideasCount;
    await saveMeetingToSheets(meeting);

    // Also update local file for consistency
    const meetingsFile = path.join(__dirname, '..', 'data', 'meetings.json');
    if (fs.existsSync(meetingsFile)) {
      let registry = JSON.parse(fs.readFileSync(meetingsFile, 'utf-8'));
      const index = registry.findIndex(m => m.videoId === videoId);
      if (index >= 0) {
        registry[index].ideasCount = ideasCount;
        fs.writeFileSync(meetingsFile, JSON.stringify(registry, null, 2));
      }
    }

    console.log(`Updated ideasCount for ${videoId} to ${ideasCount}`);
    res.json({ success: true, videoId, ideasCount });
  } catch (e) {
    console.error('Error updating ideas count:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents/town-meeting/ideas
 * Save ideas to Google Sheets for persistence
 * Body: { videoId, ideas }
 */
app.post('/api/agents/town-meeting/ideas', async (req, res) => {
  try {
    const { videoId, ideas } = req.body;

    if (!videoId || !ideas) {
      return res.status(400).json({ error: 'videoId and ideas are required' });
    }

    // Save to Google Sheets immediately
    const success = await saveIdeasToSheets(videoId, ideas);

    if (success) {
      console.log(`Persisted ${ideas.length} ideas for video ${videoId} to Sheets`);
      res.json({ success: true, videoId, count: ideas.length });
    } else {
      res.status(500).json({ error: 'Failed to save ideas to Sheets' });
    }
  } catch (e) {
    console.error('Error saving ideas:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/town-meeting/ideas
 * Query params:
 *   - videoId: Load ideas for a specific meeting (optional)
 */
app.get('/api/agents/town-meeting/ideas', async (req, res) => {
  try {
    const { videoId } = req.query;
    const dataDir = path.join(__dirname, '..', 'data', 'swagit');

    // If videoId provided, load that meeting's specific ideas
    if (videoId) {
      // First check local file
      const meetingIdeasFile = path.join(dataDir, `${videoId}_ideas.json`);
      if (fs.existsSync(meetingIdeasFile)) {
        const ideas = JSON.parse(fs.readFileSync(meetingIdeasFile, 'utf-8'));
        // Also save to Sheets for persistence
        saveIdeasToSheets(videoId, ideas.ideas || []);
        return res.json(ideas);
      }

      // If not on disk, check Google Sheets (ideas might have been saved from another deployment)
      const sheetIdeas = await getIdeasFromSheets(videoId);
      if (sheetIdeas.length > 0) {
        console.log(`Loaded ${sheetIdeas.length} ideas for video ${videoId} from Sheets`);
        return res.json({ ideas: sheetIdeas, metadata: { videoId, source: 'sheets' } });
      }

      // No ideas found anywhere
      return res.json({ ideas: [], metadata: { videoId, message: 'No ideas generated for this meeting' } });
    }

    // Fallback to current_ideas.json for backwards compatibility
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
 * POST /api/agents/town-meeting/regenerate-ideas
 * Regenerate ideas for a specific meeting that has a transcript
 * Body: { videoId }
 */
app.post('/api/agents/town-meeting/regenerate-ideas', async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }

  const agentDir = path.join(__dirname, '..', 'agents', 'town-meeting');
  const dataDir = path.join(__dirname, '..', 'data', 'swagit');
  const transcriptPath = path.join(dataDir, `${videoId}_transcript.json`);

  if (!fs.existsSync(transcriptPath)) {
    return res.status(404).json({ error: `Transcript not found for video ${videoId}` });
  }

  res.json({ status: 'started', message: `Regenerating ideas for video ${videoId}` });

  // Run idea generator in background
  console.log(`🔄 Regenerating ideas for video ${videoId}...`);
  runScriptBackground(agentDir, 'generate_ideas.js', [transcriptPath]);
});

/**
 * POST /api/agents/town-meeting/reprocess
 * Force re-process a specific video ID (download, transcribe, analyze, generate ideas)
 * Body: { videoId }
 */
app.post('/api/agents/town-meeting/reprocess', async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }

  if (agentStatus.townMeeting.running) {
    return res.status(409).json({ error: 'Agent already running' });
  }

  agentStatus.townMeeting.running = true;
  agentStatus.townMeeting.currentMeeting = videoId;
  res.json({ status: 'started', message: `Re-processing video ${videoId}` });

  (async () => {
    const agentDir = path.join(__dirname, '..', 'agents', 'town-meeting');

    try {
      console.log(`🔄 Force re-processing video ${videoId}...`);

      // Run the scraper with the specific video ID
      await runScript(agentDir, 'scrape.js', [], {
        FORCE_VIDEO_ID: videoId,
        DEPARTMENT_ID: 'town-council'
      });

      // After scraping completes, run idea generation
      const dataDir = path.join(__dirname, '..', 'data', 'swagit');
      const transcriptPath = path.join(dataDir, `${videoId}_transcript.json`);

      if (fs.existsSync(transcriptPath)) {
        console.log('Running idea generator...');
        runScriptBackground(agentDir, 'generate_ideas.js', [transcriptPath]);
      }

      agentStatus.townMeeting.lastRun = new Date().toISOString();
      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.currentMeeting = null;
      agentStatus.townMeeting.lastResult = { type: 'success', message: `Video ${videoId} re-processed`, count: 1 };
      saveStatus();
      console.log(`✅ Video ${videoId} re-processed successfully`);
    } catch (error) {
      console.error(`❌ Re-processing failed: ${error.message}`);
      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.currentMeeting = null;
      agentStatus.townMeeting.error = error.message;
      saveStatus();
    }
  })();
});

/**
 * POST /api/agents/town-meeting/generate-article
 * Body: { ideaId, angleName, departmentId, videoId }
 */
app.post('/api/agents/town-meeting/generate-article', async (req, res) => {
  const { ideaId, angleName, departmentId, videoId } = req.body;

  if (agentStatus.townMeeting.running) {
    return res.status(409).json({ error: 'Agent already running' });
  }

  agentStatus.townMeeting.running = true;
  res.json({ status: 'started' });

  (async () => {
    const agentDir = path.join(__dirname, '..', 'agents', 'town-meeting');
    const dataDir = path.join(__dirname, '..', 'data', 'swagit');

    try {
      // Use the specific meeting's transcript if videoId is provided
      let transcriptPath;
      if (videoId) {
        transcriptPath = path.join(dataDir, `${videoId}_transcript.json`);

        // If local file doesn't exist, try to get from Supabase
        if (!fs.existsSync(transcriptPath)) {
          console.log(`Local transcript not found, checking Supabase for video ${videoId}...`);
          const supabaseTranscript = await getTranscriptFromSupabase(videoId);

          if (supabaseTranscript) {
            // Save to local filesystem for the generator script to use
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(transcriptPath, JSON.stringify(supabaseTranscript, null, 2));
            console.log(`☁️  Restored transcript from Supabase to: ${transcriptPath}`);
          } else {
            throw new Error(`Transcript not found for video ${videoId} (checked local + Supabase)`);
          }
        }
      } else {
        // Fallback to latest transcript
        const transcriptFiles = fs.readdirSync(dataDir).filter(f => f.includes('_transcript.json'));
        if (transcriptFiles.length === 0) throw new Error('No transcript file found');
        const latestTranscript = transcriptFiles.sort().reverse()[0];
        transcriptPath = path.join(dataDir, latestTranscript);
      }

      console.log(`Generating article for idea ${ideaId}, angle ${angleName}, video ${videoId || 'latest'}...`);
      await runScript(agentDir, 'generate.js', [transcriptPath, ideaId, angleName], {
        DEPARTMENT_ID: departmentId,
        VIDEO_ID: videoId || ''
      });

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

const CRIME_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'crime_watch_settings.json');
const CRIME_DATA_DIR = path.join(__dirname, '..', 'data', 'crime');

/**
 * GET /api/settings/crime-watch
 * Get crime watch settings
 */
app.get('/api/settings/crime-watch', (req, res) => {
  try {
    if (fs.existsSync(CRIME_SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(CRIME_SETTINGS_FILE, 'utf-8'));
      res.json(settings);
    } else {
      // Default settings
      res.json({
        daysToFetch: 30,
        newsworthyCrimes: ['Assault', 'Robbery', 'Burglary', 'Motor Vehicle Theft', 'Arson', 'Homicide'],
        skipCrimes: ['Vandalism', 'Trespassing', 'Disturbing the Peace'],
        autoRun: false
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/settings/crime-watch
 * Save crime watch settings
 */
app.post('/api/settings/crime-watch', (req, res) => {
  try {
    const settings = req.body;

    // Ensure data directory exists
    const dataDir = path.dirname(CRIME_SETTINGS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(CRIME_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/crime-watch/incidents
 * Get all crime incidents from the latest data file
 */
app.get('/api/agents/crime-watch/incidents', (req, res) => {
  try {
    // Ensure crime data directory exists
    if (!fs.existsSync(CRIME_DATA_DIR)) {
      return res.json({ incidents: [], metadata: { message: 'No crime data yet' } });
    }

    // Find the latest incidents file
    const files = fs.readdirSync(CRIME_DATA_DIR)
      .filter(f => f.startsWith('incidents_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return res.json({ incidents: [], metadata: { message: 'No incidents files found' } });
    }

    const latestFile = path.join(CRIME_DATA_DIR, files[0]);
    const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));

    res.json({
      incidents: data.incidents || [],
      metadata: data.metadata || {}
    });
  } catch (e) {
    console.error('Error fetching crime incidents:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents/crime-watch/generate-article
 * Generate a crime brief article from a single incident
 */
app.post('/api/agents/crime-watch/generate-article', async (req, res) => {
  const { incident } = req.body;

  if (!incident) {
    return res.status(400).json({ error: 'Incident data required' });
  }

  try {
    const agentDir = path.join(__dirname, '..', 'agents', 'crime-watch');
    const promptPath = path.join(__dirname, '..', 'prompts', 'generate-crime-brief.txt');

    // Load the prompt
    let systemPrompt = '';
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    } else {
      systemPrompt = `You are a local news journalist for Jupiter, FL. Generate a brief, factual news article about the following crime incident. Include a headline, brief article body (2-3 paragraphs), and social media posts for Twitter and Facebook. Output as JSON with fields: headline, brief, social_posts (with twitter and facebook fields).`;
    }

    // Format incident for generation
    const date = new Date(incident.dateTime);
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let location = incident.address || 'Jupiter area';
    location = location.replace(/^\\d+\\s+/, '').replace(/\\s+\\d+$/, '');

    const incidentText = `## Incident Details
- Crime Type: ${incident.crime || incident.crimeClass || 'Unknown'}
- Crime Class: ${incident.crimeClass || 'Unknown'}
- Date: ${dateStr}
- Time: ${timeStr}
- Location Area: ${location}
- Location Type: ${incident.locationType || 'Not specified'}
- Agency: ${incident.agency || 'Jupiter Police'}
- Reference ID: ${incident.referenceId || 'N/A'}`;

    // Use OpenAI to generate the article
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a crime brief for this incident:\n\n${incidentText}` }
      ],
      temperature: 0.5,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const generated = JSON.parse(response.choices[0].message.content);

    // Save to Google Sheets
    const { appendArticlesWithDedup } = await import('../lib/sheets.js');
    const sheetArticle = {
      agentSource: 'crime-watch',
      headline: generated.headline || '',
      body: generated.brief || '',
      summary: generated.brief?.split('.')[0] + '.' || '',
      twitter: generated.social_posts?.twitter || '',
      facebook: generated.social_posts?.facebook || '',
      instagram: generated.social_posts?.nextdoor || '',
      sourceUrl: `crime-ref:${incident.referenceId}`,
      status: 'draft'
    };

    const result = await appendArticlesWithDedup([sheetArticle], 'crime-watch');

    // Dual-write to Supabase
    saveArticleToSupabase(sheetArticle);

    res.json({
      success: true,
      article: generated,
      sheetsResult: result
    });
  } catch (e) {
    console.error('Error generating crime article:', e);
    res.status(500).json({ error: e.message });
  }
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
 * GET /api/agents/wastewater-health/data
 * Get latest wastewater health data
 */
app.get('/api/agents/wastewater-health/data', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, '..', 'data', 'wastewater');

    if (!fs.existsSync(dataDir)) {
      return res.json({ data: null, message: 'No wastewater data available yet' });
    }

    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('wastewater_') && f.endsWith('.json'));
    if (files.length === 0) {
      return res.json({ data: null, message: 'No wastewater data available yet' });
    }

    const latestFile = files.sort().reverse()[0];
    const filePath = path.join(dataDir, latestFile);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    res.json({ data, file: latestFile });
  } catch (e) {
    console.error('Error fetching wastewater data:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents/wastewater-health/run
 * Run the wastewater health agent
 */
app.post('/api/agents/wastewater-health/run', async (req, res) => {
  if (agentStatus.wastewaterHealth.running) {
    return res.status(409).json({ error: 'Agent already running' });
  }

  agentStatus.wastewaterHealth.running = true;
  agentStatus.wastewaterHealth.error = null;
  res.json({ status: 'started' }); // Respond immediately

  // Run in background
  (async () => {
    const agentDir = path.join(__dirname, '..', 'agents', 'wastewater-health');
    const dataDir = path.join(__dirname, '..', 'data', 'wastewater');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    try {
      // Run scraper
      console.log('Running wastewater-health scraper...');
      await runScript(agentDir, 'scrape.js');

      // Find the latest data file
      const files = fs.readdirSync(dataDir).filter(f => f.startsWith('wastewater_') && f.endsWith('.json'));
      if (files.length === 0) {
        throw new Error('No wastewater data file generated');
      }
      const latestFile = files.sort().reverse()[0];
      const dataPath = path.join(dataDir, latestFile);

      // Run generator
      console.log('Running wastewater-health generator...');
      const result = await runScript(agentDir, 'generate.js', [dataPath]);

      agentStatus.wastewaterHealth.lastRun = new Date().toISOString();
      agentStatus.wastewaterHealth.running = false;
      agentStatus.wastewaterHealth.lastResult = parseAgentResult(result.stdout, 'wastewater-health');
      saveStatus();
      console.log('Wastewater Watch agent completed successfully');
    } catch (error) {
      console.error('Wastewater Watch agent failed:', error.message);
      agentStatus.wastewaterHealth.running = false;
      agentStatus.wastewaterHealth.error = error.message;
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
      const scraperResult = await runScript(agentDir, 'scrape.js', [], {
        DEPARTMENT_ID: departmentId,
        SCRAPE_MODE: scrapeMode
      });

      // Check if scraper found no new meetings (this is success, not error)
      if (scraperResult.stdout.includes('NO_NEW_MEETINGS_FOUND') || scraperResult.stderr.includes('NO_NEW_MEETINGS')) {
        agentStatus.townMeeting.lastRun = new Date().toISOString();
        agentStatus.townMeeting.running = false;
        agentStatus.townMeeting.lastResult = {
          type: 'info',
          message: 'No new Jupiter meetings found on Swagit. Check back after the next council meeting.',
          count: 0
        };
        saveStatus();
        console.log('Town meeting agent: No new meetings available');
        return;
      }

      // Mismatch fix: Orchestrator saves to ../../data/swagit
      const dataDir = path.join(__dirname, '..', 'data', 'swagit');

      // Find the latest transcript
      const transcriptFiles = fs.readdirSync(dataDir).filter(f => f.includes('_transcript.json'));
      if (transcriptFiles.length === 0) throw new Error('No transcript file found');
      const latestTranscript = transcriptFiles.sort().reverse()[0];
      const transcriptPath = path.join(dataDir, latestTranscript);

      // Run idea generator in background (doesn't block the main flow)
      console.log('Running town-meeting idea generator in background...');
      runScriptBackground(agentDir, 'generate_ideas.js', [transcriptPath, IDEAS_FILE]);

      agentStatus.townMeeting.lastRun = new Date().toISOString();
      agentStatus.townMeeting.running = false;
      agentStatus.townMeeting.lastResult = { type: 'success', message: 'Meeting processed, ideas generating in background', count: 0 };
      saveStatus();
      console.log('Town meeting ingestion complete, idea generation running in background');
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
 * Helper to run a script in the background (fire and forget)
 * Used for tasks that can run independently while the main flow continues
 */
function runScriptBackground(cwd, script, args = [], extraEnv = {}) {
  console.log(`🔄 Starting background task: ${script}`);

  const proc = spawn('node', [script, ...args], {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',  // Still show output in console
    detached: false    // Keep attached so we see logs
  });

  proc.on('close', (code) => {
    if (code === 0) {
      console.log(`✅ Background task completed: ${script}`);
    } else {
      console.error(`❌ Background task failed: ${script} (code ${code})`);
    }
  });

  proc.on('error', (err) => {
    console.error(`❌ Background task error: ${script} - ${err.message}`);
  });

  // Don't wait - return immediately
  return proc;
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

  if (type === 'wastewater-health') {
    // Check for "Article saved to Supabase" pattern
    if (output.includes('Article saved to Supabase')) {
      console.log('[parseAgentResult] Found: Article saved to Supabase');
      return {
        type: 'success',
        message: 'Generated new wastewater health brief',
        count: 1
      };
    }

    // Check for "Added X new article to sheet" pattern
    const addedMatch = output.match(/Added\s+(\d+)\s+new article/i);
    if (addedMatch) {
      const count = parseInt(addedMatch[1]);
      console.log(`[parseAgentResult] Found: Added ${count} articles`);
      return {
        type: 'success',
        message: `Generated ${count} new health brief${count !== 1 ? 's' : ''}`,
        count
      };
    }

    // Check for already exists
    if (output.includes('already exists. Skipping generation')) {
      console.log('[parseAgentResult] Found: Already exists');
      return {
        type: 'info',
        message: 'Health brief already generated for this week',
        count: 0
      };
    }

    // Check for no data
    if (output.includes('No data available') || output.includes('Found 0 COVID') && output.includes('Found 0 Influenza')) {
      console.log('[parseAgentResult] Found: No data');
      return {
        type: 'info',
        message: 'No wastewater data available for Palm Beach County',
        count: 0
      };
    }

    console.log('[parseAgentResult] No pattern matched for wastewater-health');
    return { type: 'info', message: 'Health scan complete', count: 0 };
  }

  return { type: 'info', message: 'Agent completed', count: null };
}

// In production, serve React app for any non-API routes (client-side routing)
if (isProduction) {
  // Express 5 requires named parameter, use {*path} syntax
  app.get('/{*path}', (req, res) => {
    // Don't catch API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Dashboard API running at http://localhost:${PORT}`);
  if (isProduction) {
    console.log(`Production mode: Serving frontend from /dist`);
  } else {
    console.log(`Development mode: Frontend should run separately on port 5173`);
  }
});
