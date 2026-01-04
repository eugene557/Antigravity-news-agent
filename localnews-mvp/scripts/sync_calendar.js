#!/usr/bin/env node

/**
 * Jupiter FL Calendar Sync
 * 
 * Scrapes the Jupiter FL community calendar to find upcoming town meetings
 * and adds them to meetings.json for processing when their date passes.
 * 
 * Calendar URL: https://jupiter.fl.us/calendar.aspx?CID=36,29,35&showPastEvents=false
 * 
 * Usage: node sync_calendar.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const MEETINGS_PATH = path.join(ROOT_DIR, 'data/meetings.json');
const SETTINGS_PATH = path.join(ROOT_DIR, 'data/town_meeting_settings.json');

// Calendar URL with relevant committee IDs
const CALENDAR_URL = 'https://jupiter.fl.us/calendar.aspx?CID=36,29,35&showPastEvents=false';

// Map calendar meeting types to our department IDs
// Note: User requested strict "Town Council" mapping
const MEETING_TYPE_MAP = {
    'town council': 'town-council',
    'planning and zoning': 'planning-board',
    'planning & zoning': 'planning-board',
    'commissioners': 'commissioners',
    'school board': 'school-board',
    'art committee': 'art-board',
    'art board': 'art-board',
    'board meeting': 'board-meetings',
};

/**
 * Parse date string like "January 6, 2026" and time "7:00 PM"
 */
function parseMeetingDate(dateText, timeText) {
    try {
        const dateStr = `${dateText} ${timeText || ''}`.trim();
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch (e) {
        return null;
    }
}

/**
 * Match meeting type text to department ID
 */
function matchDepartment(meetingType) {
    const lower = meetingType.toLowerCase();
    for (const [key, deptId] of Object.entries(MEETING_TYPE_MAP)) {
        if (lower.includes(key)) {
            return deptId;
        }
    }
    return null; // Unknown type
}

/**
 * Load existing meetings
 */
function loadMeetings() {
    if (fs.existsSync(MEETINGS_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(MEETINGS_PATH, 'utf-8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

/**
 * Save meetings
 */
function saveMeetings(meetings) {
    fs.writeFileSync(MEETINGS_PATH, JSON.stringify(meetings, null, 2));
}

/**
 * Scrape calendar and return upcoming meetings
 */
async function scrapeCalendar() {
    console.log('🗓️  Jupiter FL Calendar Sync\n');
    console.log(`📡 Fetching: ${CALENDAR_URL}\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.goto(CALENDAR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for ANY event title to appear (faster than waiting for network idle)
        await page.waitForSelector('[id^="eventTitle_"]', { timeout: 10000 });

        // Extract events by iterating specifically over the calendar cells
        const events = await page.evaluate(() => {
            const results = [];
            const eventTitles = document.querySelectorAll('[id^="eventTitle_"]');

            eventTitles.forEach(titleEl => {
                const eventId = titleEl.id.replace('eventTitle_', '');
                const meetingType = titleEl.textContent.trim();

                let dateText = '';
                let parent = titleEl.parentElement;

                // Look for date text in nearby elements (up to 5 levels up)
                for (let i = 0; i < 5 && parent; i++) {
                    const text = parent.textContent;
                    // Match date patterns like "January 6, 2026"
                    const dateMatch = text.match(/(\w+\s+\d{1,2},\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
                    if (dateMatch) {
                        dateText = dateMatch[1];
                        break;
                    }
                    parent = parent.parentElement;
                }

                if (eventId && meetingType && dateText) {
                    results.push({
                        eventId,
                        meetingType,
                        dateText
                    });
                }
            });
            return results;
        });

        return events;

    } finally {
        await browser.close();
    }
}

/**
 * Main sync function
 */
async function syncCalendar() {
    try {
        // Scrape upcoming events
        const events = await scrapeCalendar();
        console.log(`📅 Found ${events.length} calendar events\n`);

        if (events.length === 0) {
            console.log('⚠️  No events found. Calendar may have changed structure.');
            return;
        }

        // Load existing meetings
        const meetings = loadMeetings();
        const existingIds = new Set(meetings.map(m => m.id));

        let added = 0;
        let skipped = 0;

        for (const event of events) {
            const departmentId = matchDepartment(event.meetingType);

            if (!departmentId) {
                console.log(`⏭️  Skipping: "${event.meetingType}" (unknown type)`);
                skipped++;
                continue;
            }

            const date = parseMeetingDate(event.dateText);
            if (!date) {
                console.log(`⏭️  Skipping: "${event.meetingType}" (could not parse date: "${event.dateText}")`);
                skipped++;
                continue;
            }

            // Use calendar event ID as meeting ID
            const meetingId = `cal_${event.eventId}`;

            if (existingIds.has(meetingId)) {
                console.log(`📋 Already exists: ${event.meetingType} on ${date}`);
                continue;
            }

            // Create meeting entry
            const newMeeting = {
                id: meetingId,
                calendarEventId: event.eventId,
                departmentId: departmentId,
                type: event.meetingType,
                date: date,
                status: 'upcoming',
                source: 'jupiter-calendar',
                syncedAt: new Date().toISOString()
            };

            meetings.push(newMeeting);
            existingIds.add(meetingId);
            added++;

            console.log(`✅ Added: ${event.meetingType} on ${date} (${departmentId})`);
        }

        // Save updated meetings
        saveMeetings(meetings);

        console.log(`\n📊 Sync Summary:`);
        console.log(`   Added: ${added} new meetings`);
        console.log(`   Skipped: ${skipped} (unknown type or bad date)`);
        console.log(`   Total in meetings.json: ${meetings.length}`);

    } catch (error) {
        console.error('❌ Calendar sync failed:', error.message);
        process.exit(1);
    }
}

syncCalendar();
