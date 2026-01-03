
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initClient, SHEET_NAME } from '../lib/sheets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function resetGoogleSheet() {
    console.log('📊 Connecting to Google Sheets...');
    try {
        const sheets = await initClient();
        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

        // Clear everything after the header row (A2:J)
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${SHEET_NAME}!A2:J`,
        });

        console.log('✅ Google Sheet cleared (headers preserved).');
    } catch (error) {
        console.error('❌ Error clearing Google Sheet:', error.message);
    }
}

function deleteFiles(directory, pattern) {
    try {
        const dirPath = path.join(__dirname, '..', directory);
        if (!fs.existsSync(dirPath)) return;

        const files = fs.readdirSync(dirPath);
        let count = 0;

        for (const file of files) {
            if (file.match(pattern)) {
                fs.unlinkSync(path.join(dirPath, file));
                count++;
            }
        }
        console.log(`🗑️  Deleted ${count} files in ${directory}`);
    } catch (error) {
        console.error(`❌ Error deleting files in ${directory}:`, error.message);
    }
}

function resetAgentStatus() {
    const statusPath = path.join(__dirname, '../agent-status.json');
    const initialStatus = {
        crimeWatch: { lastRun: null, running: false, error: null },
        townMeeting: { lastRun: null, running: false, error: null }
    };

    try {
        fs.writeFileSync(statusPath, JSON.stringify(initialStatus, null, 2));
        console.log('✅ Agent status reset.');
    } catch (error) {
        console.error('❌ Error resetting agent status:', error.message);
    }
}

async function main() {
    console.log('🚨 RESETTING LOCALNEWS MVP DATA 🚨\n');

    // 1. Clear Google Sheet
    if (process.env.GOOGLE_SPREADSHEET_ID) {
        await resetGoogleSheet();
    } else {
        console.log('⚠️  Skipping Google Sheet reset (no ID in .env)');
    }

    // 2. Delete Cached Files
    deleteFiles('data/crime', /\.json$/);
    deleteFiles('data/swagit', /\.json$/);

    // 3. Reset Agent Status
    resetAgentStatus();

    console.log('\n✨ Reset complete. Ready for fresh demo.');
}

main();
