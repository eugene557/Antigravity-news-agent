
import 'dotenv/config';
import { initClient, SHEET_NAME, HEADER_ROW } from '../lib/sheets.js';

async function clearCrimeWatch() {
    console.log('🧹 Cleaning Crime Watch data from Google Sheets...');
    const sheets = await initClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // 1. Fetch all data
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:J`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
        console.log('   Sheet already empty.');
        return;
    }

    // 2. Filter out crime-watch (Keep header (index 0) and others)
    const newRows = rows.filter((row, index) => {
        if (index === 0) return true; // Keep header
        const agentSource = row[0]; // First column is agent_source
        return agentSource !== 'crime-watch';
    });

    const deletedCount = rows.length - newRows.length;
    console.log(`   Found ${rows.length - 1} total articles.`);
    console.log(`   Removing ${deletedCount} Crime Watch articles...`);

    // 3. Clear Sheet
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${SHEET_NAME}!A:J`
    });

    // 4. Write back filtered data
    if (newRows.length > 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${SHEET_NAME}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: newRows }
        });
    }

    console.log(`✅ Done. Kept ${newRows.length - 1} other articles.`);
}

clearCrimeWatch();
