/**
 * Google Sheets Integration
 *
 * Provides functions to read/write news articles to Google Sheets.
 *
 * Required environment variables:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL: Service account email
 * - GOOGLE_PRIVATE_KEY: Service account private key (with \n for newlines)
 * - GOOGLE_SPREADSHEET_ID: The ID from your Google Sheet URL
 *
 * Sheet structure (first row = headers):
 * agent_source | headline | body | summary | twitter | facebook | instagram | source_url | status | created_at
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// Supabase setup for dual-write
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
  console.log('📦 Sheets lib: Supabase client initialized');
} else {
  console.log('⚠️  Sheets lib: Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_KEY)');
}

// Save article to Supabase (dual-write helper)
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

// Column mapping (0-indexed)
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

const SHEET_NAME = 'Articles';
const HEADER_ROW = [
  'agent_source',
  'headline',
  'body',
  'summary',
  'twitter',
  'facebook',
  'instagram',
  'source_url',
  'status',
  'created_at'
];

let sheetsClient = null;
let spreadsheetId = null;

/**
 * Initialize the Google Sheets client
 */
async function initClient() {
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error(
      'Missing Google Sheets credentials. Required env vars:\n' +
      '  - GOOGLE_SERVICE_ACCOUNT_EMAIL\n' +
      '  - GOOGLE_PRIVATE_KEY\n' +
      '  - GOOGLE_SPREADSHEET_ID'
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Ensure the sheet exists and has headers
 */
async function ensureSheet() {
  const sheets = await initClient();

  try {
    // Check if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId
    });

    const sheetExists = spreadsheet.data.sheets?.some(
      s => s.properties?.title === SHEET_NAME
    );

    if (!sheetExists) {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: SHEET_NAME }
            }
          }]
        }
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:J1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [HEADER_ROW]
        }
      });

      console.log(`   Created sheet "${SHEET_NAME}" with headers`);
    }
  } catch (error) {
    if (error.code === 404) {
      throw new Error(`Spreadsheet not found. Check GOOGLE_SPREADSHEET_ID: ${spreadsheetId}`);
    }
    throw error;
  }
}

/**
 * Append a single article to the sheet
 *
 * @param {Object} article - Article data
 * @param {string} article.agentSource - Source agent (e.g., 'town-meeting', 'crime-watch')
 * @param {string} article.headline - Article headline
 * @param {string} article.body - Full article body
 * @param {string} article.summary - Short summary/lead
 * @param {string} article.twitter - Twitter post
 * @param {string} article.facebook - Facebook post
 * @param {string} article.instagram - Instagram caption
 * @param {string} article.sourceUrl - Source URL or reference
 * @param {string} [article.status='draft'] - Article status
 * @returns {Promise<Object>} Result with row number
 */
async function appendArticle(article) {
  const sheets = await initClient();
  await ensureSheet();

  const row = [
    article.agentSource || '',
    article.headline || '',
    article.body || '',
    article.summary || '',
    article.twitter || '',
    article.facebook || '',
    article.instagram || '',
    article.sourceUrl || '',
    article.status || 'draft',
    new Date().toISOString()
  ];

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });

  const updatedRange = response.data.updates?.updatedRange || '';
  const rowMatch = updatedRange.match(/(\d+)$/);
  const rowNumber = rowMatch ? parseInt(rowMatch[1]) : null;

  // Dual-write to Supabase
  await saveArticleToSupabase(article);

  return {
    success: true,
    rowNumber,
    updatedRange
  };
}

/**
 * Append multiple articles at once (batch operation)
 *
 * @param {Array<Object>} articles - Array of article objects
 * @returns {Promise<Object>} Result with count of rows added
 */
async function appendArticles(articles) {
  if (!articles || articles.length === 0) {
    return { success: true, rowsAdded: 0 };
  }

  const sheets = await initClient();
  await ensureSheet();

  const rows = articles.map(article => [
    article.agentSource || '',
    article.headline || '',
    article.body || '',
    article.summary || '',
    article.twitter || '',
    article.facebook || '',
    article.instagram || '',
    article.sourceUrl || '',
    article.status || 'draft',
    new Date().toISOString()
  ]);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows
    }
  });

  // Dual-write to Supabase
  for (const article of articles) {
    saveArticleToSupabase(article);
  }

  return {
    success: true,
    rowsAdded: response.data.updates?.updatedRows || rows.length,
    updatedRange: response.data.updates?.updatedRange
  };
}

/**
 * Get all articles from the sheet
 *
 * @param {Object} [options] - Query options
 * @param {string} [options.agentSource] - Filter by agent source
 * @param {string} [options.status] - Filter by status
 * @param {number} [options.limit] - Maximum rows to return
 * @returns {Promise<Array<Object>>} Array of article objects
 */
async function getArticles(options = {}) {
  const sheets = await initClient();
  await ensureSheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:J`
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return []; // Only headers or empty

  // Skip header row
  let articles = rows.slice(1).map((row, index) => ({
    rowNumber: index + 2, // 1-indexed, skip header
    agentSource: row[COLUMNS.AGENT_SOURCE] || '',
    headline: row[COLUMNS.HEADLINE] || '',
    body: row[COLUMNS.BODY] || '',
    summary: row[COLUMNS.SUMMARY] || '',
    twitter: row[COLUMNS.TWITTER] || '',
    facebook: row[COLUMNS.FACEBOOK] || '',
    instagram: row[COLUMNS.INSTAGRAM] || '',
    sourceUrl: row[COLUMNS.SOURCE_URL] || '',
    status: row[COLUMNS.STATUS] || '',
    createdAt: row[COLUMNS.CREATED_AT] || ''
  }));

  // Apply filters
  if (options.agentSource) {
    articles = articles.filter(a => a.agentSource === options.agentSource);
  }
  if (options.status) {
    articles = articles.filter(a => a.status === options.status);
  }
  if (options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return articles;
}

/**
 * Update the status of an article
 *
 * @param {number} rowNumber - The row number (1-indexed, as shown in sheet)
 * @param {string} status - New status value
 * @returns {Promise<Object>} Update result
 */
async function updateStatus(rowNumber, status) {
  const sheets = await initClient();

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!I${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[status]]
    }
  });

  return {
    success: true,
    updatedCells: response.data.updatedCells
  };
}

/**
 * Check if an article with the given sourceUrl already exists
 *
 * @param {string} sourceUrl - The source URL to check
 * @param {string} [agentSource] - Optional agent source filter
 * @returns {Promise<Object|null>} Existing article or null
 */
async function findArticleBySourceUrl(sourceUrl, agentSource = null) {
  if (!sourceUrl) return null;

  const sheets = await initClient();
  await ensureSheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:J`
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowSourceUrl = row[COLUMNS.SOURCE_URL] || '';
    const rowAgentSource = row[COLUMNS.AGENT_SOURCE] || '';

    if (rowSourceUrl === sourceUrl) {
      if (!agentSource || rowAgentSource === agentSource) {
        return {
          rowNumber: i + 1,
          agentSource: rowAgentSource,
          headline: row[COLUMNS.HEADLINE] || '',
          body: row[COLUMNS.BODY] || '',
          summary: row[COLUMNS.SUMMARY] || '',
          twitter: row[COLUMNS.TWITTER] || '',
          facebook: row[COLUMNS.FACEBOOK] || '',
          instagram: row[COLUMNS.INSTAGRAM] || '',
          sourceUrl: rowSourceUrl,
          status: row[COLUMNS.STATUS] || '',
          createdAt: row[COLUMNS.CREATED_AT] || ''
        };
      }
    }
  }

  return null;
}

/**
 * Get all existing sourceUrls for an agent (for batch deduplication)
 *
 * @param {string} agentSource - Agent source to filter by
 * @returns {Promise<Set<string>>} Set of existing sourceUrls
 */
async function getExistingSourceUrls(agentSource) {
  const sheets = await initClient();
  await ensureSheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:H` // Only need agent_source and source_url columns
  });

  const rows = response.data.values || [];
  const sourceUrls = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowAgentSource = row[COLUMNS.AGENT_SOURCE] || '';
    const rowSourceUrl = row[COLUMNS.SOURCE_URL] || '';

    if (rowAgentSource === agentSource && rowSourceUrl) {
      sourceUrls.add(rowSourceUrl);
    }
  }

  return sourceUrls;
}

/**
 * Append articles with deduplication - only adds new articles
 *
 * @param {Array<Object>} articles - Array of article objects
 * @param {string} agentSource - Agent source for deduplication
 * @returns {Promise<Object>} Result with counts
 */
async function appendArticlesWithDedup(articles, agentSource) {
  if (!articles || articles.length === 0) {
    return { success: true, rowsAdded: 0, skipped: 0 };
  }

  // Get existing sourceUrls for this agent
  const existingUrls = await getExistingSourceUrls(agentSource);

  // Filter out duplicates
  const newArticles = articles.filter(article => {
    const sourceUrl = article.sourceUrl || '';
    return sourceUrl && !existingUrls.has(sourceUrl);
  });

  const skipped = articles.length - newArticles.length;

  if (newArticles.length === 0) {
    return { success: true, rowsAdded: 0, skipped };
  }

  // Append only new articles
  const result = await appendArticles(newArticles);

  return {
    success: true,
    rowsAdded: result.rowsAdded,
    skipped,
    updatedRange: result.updatedRange
  };
}

/**
 * Update multiple fields of an article
 *
 * @param {number} rowNumber - The row number
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Update result
 */
async function updateArticle(rowNumber, updates) {
  const sheets = await initClient();

  // Get current row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A${rowNumber}:J${rowNumber}`
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

  const updateResponse = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${rowNumber}:J${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [currentRow]
    }
  });

  return {
    success: true,
    updatedCells: updateResponse.data.updatedCells
  };
}

export {
  initClient,
  ensureSheet,
  appendArticle,
  appendArticles,
  appendArticlesWithDedup,
  findArticleBySourceUrl,
  getExistingSourceUrls,
  getArticles,
  updateStatus,
  updateArticle,
  SHEET_NAME,
  HEADER_ROW
};
