#!/usr/bin/env node

/**
 * Crime Watch Article Generator
 *
 * Generates news briefs and social posts from crime incident data.
 *
 * Usage: node generate.js <incidents_path> [output_path]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
import OpenAI from 'openai';
import { appendArticlesWithDedup, getExistingSourceUrls } from '../../lib/sheets.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Crime types considered newsworthy
const NEWSWORTHY_CRIMES = [
  'Assault',
  'Aggravated Assault',
  'Sexual Assault',
  'Sexual Offense',
  'Robbery',
  'Burglary',
  'Burglary of Vehicle',
  'Motor Vehicle Theft',
  'Arson',
  'Homicide',
  'Kidnapping',
  'Weapons Violation'
];

// Crime types to skip (minor incidents)
const SKIP_CRIMES = [
  'Vandalism',
  'Trespassing',
  'Disturbing the Peace',
  'Other'
];

async function loadPrompt() {
  const promptPath = path.join(__dirname, '../../prompts/generate-crime-brief.txt');
  return fs.readFileSync(promptPath, 'utf-8');
}

async function loadIncidents(incidentsPath) {
  const content = fs.readFileSync(incidentsPath, 'utf-8');
  return JSON.parse(content);
}

function filterNewsworthyIncidents(incidents) {
  return incidents.filter(incident => {
    const crime = incident.crime || '';
    const crimeClass = incident.crimeClass || '';

    // Skip if explicitly in skip list
    if (SKIP_CRIMES.some(skip => crime.includes(skip) || crimeClass.includes(skip))) {
      return false;
    }

    // Include if in newsworthy list
    if (NEWSWORTHY_CRIMES.some(worthy => crime.includes(worthy) || crimeClass.includes(worthy))) {
      return true;
    }

    // Include theft over certain implied severity (property crimes)
    if (crimeClass === 'Theft' && crime.includes('Theft')) {
      // Include most theft except petty/minor
      return !crime.toLowerCase().includes('petty');
    }

    return false;
  });
}

function formatIncidentForGeneration(incident) {
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

  // Anonymize address (remove specific numbers, keep street/area)
  let location = incident.address || 'Jupiter area';
  // Remove specific street numbers for privacy
  location = location.replace(/^\d+\s+/, '');
  location = location.replace(/\s+\d+$/, '');

  return `## Incident Details
- Crime Type: ${incident.crime || incident.crimeClass || 'Unknown'}
- Crime Class: ${incident.crimeClass || 'Unknown'}
- Date: ${dateStr}
- Time: ${timeStr}
- Location Area: ${location}
- Location Type: ${incident.locationType || 'Not specified'}
- Agency: ${incident.agency || 'Jupiter Police'}
- Reference ID: ${incident.referenceId || 'N/A'}`;
}

async function generateBrief(systemPrompt, incidentText) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate a crime brief for this incident:\n\n${incidentText}`
      }
    ],
    temperature: 0.5,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse JSON response:', content.slice(0, 300));
    throw new Error('Invalid JSON response from GPT-4');
  }
}

async function main() {
  const incidentsPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!incidentsPath) {
    console.error('Usage: node generate.js <incidents_path> [output_path]');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('🚨 Crime Watch Article Generator\n');

  try {
    // Load prompt and incidents
    console.log('📄 Loading incidents...');
    const systemPrompt = await loadPrompt();
    const incidentsData = await loadIncidents(incidentsPath);

    const incidents = incidentsData.incidents || incidentsData;
    console.log(`   Total incidents: ${incidents.length}`);

    // Filter for newsworthy incidents
    const newsworthy = filterNewsworthyIncidents(incidents);
    console.log(`   Newsworthy incidents: ${newsworthy.length}`);

    if (newsworthy.length === 0) {
      console.log('ℹ️  No newsworthy incidents found in this data set.');
      process.exit(0);
    }

    // Check for existing articles to avoid regenerating duplicates
    let existingUrls = new Set();
    if (process.env.GOOGLE_SPREADSHEET_ID) {
      console.log('\n🔍 Checking for existing articles...');
      existingUrls = await getExistingSourceUrls('crime-watch');
      console.log(`   Found ${existingUrls.size} existing crime articles in sheet`);
    }

    // Filter out incidents we've already processed
    const newIncidents = newsworthy.filter(incident => {
      const sourceUrl = `crime-ref:${incident.referenceId}`;
      return !existingUrls.has(sourceUrl);
    });

    console.log(`   New incidents to process: ${newIncidents.length}`);
    console.log(`   Skipping: ${newsworthy.length - newIncidents.length} (already in sheet)\n`);

    if (newIncidents.length === 0) {
      console.log('ℹ️  All newsworthy incidents have already been processed.');
      process.exit(0);
    }

    // Generate briefs for each NEW newsworthy incident
    const articles = [];
    let estimatedCost = 0;

    for (let i = 0; i < newIncidents.length; i++) {
      const incident = newIncidents[i];
      console.log(`📝 [${i + 1}/${newIncidents.length}] Generating brief for: ${incident.crime || incident.crimeClass}`);

      const incidentText = formatIncidentForGeneration(incident);
      const brief = await generateBrief(systemPrompt, incidentText);

      articles.push({
        incident: {
          id: incident.id,
          referenceId: incident.referenceId,
          crime: incident.crime,
          crimeClass: incident.crimeClass,
          dateTime: incident.dateTime,
          locationType: incident.locationType
        },
        generated: brief
      });

      estimatedCost += 0.005; // rough estimate per call
      console.log(`   ✓ Generated: "${brief.headline}"`);

      // Small delay to avoid rate limits
      if (i < newIncidents.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Prepare output
    const output = {
      metadata: {
        sourceFile: incidentsPath,
        generatedAt: new Date().toISOString(),
        model: 'gpt-4o',
        totalIncidents: incidents.length,
        newsworthyIncidents: newsworthy.length,
        newIncidents: newIncidents.length,
        skippedDuplicates: newsworthy.length - newIncidents.length,
        articlesGenerated: articles.length,
        estimatedCost: `~$${estimatedCost.toFixed(2)}`
      },
      articles
    };

    // Determine output path
    const finalOutputPath = outputPath ||
      incidentsPath.replace('incidents_', 'articles_');

    // Save output
    fs.writeFileSync(finalOutputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Articles saved to: ${finalOutputPath}`);

    // Write to Google Sheets if configured
    if (process.env.GOOGLE_SPREADSHEET_ID && articles.length > 0) {
      console.log('\n📊 Writing to Google Sheets...');
      try {
        const sheetArticles = articles.map(a => ({
          agentSource: 'crime-watch',
          headline: a.generated.headline || '',
          body: a.generated.brief || '',
          summary: a.generated.brief?.split('.')[0] + '.' || '',
          twitter: a.generated.social_posts?.twitter || '',
          facebook: a.generated.social_posts?.facebook || '',
          instagram: a.generated.social_posts?.nextdoor || '', // Using nextdoor for instagram column
          sourceUrl: `crime-ref:${a.incident.referenceId}`,
          status: 'draft'
        }));

        // Use dedup function as safety net (should already be filtered, but double-check)
        const result = await appendArticlesWithDedup(sheetArticles, 'crime-watch');
        console.log(`   ✓ Added ${result.rowsAdded} new articles to sheet`);
        if (result.skipped > 0) {
          console.log(`   ⚠️  Skipped ${result.skipped} duplicates`);
        }
      } catch (sheetError) {
        console.error(`   ⚠️  Sheet write failed: ${sheetError.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 GENERATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Articles generated: ${articles.length}`);
    console.log(`   Estimated cost: ~$${estimatedCost.toFixed(2)}`);

    // Show severity breakdown
    const severityCounts = { high: 0, medium: 0, low: 0 };
    articles.forEach(a => {
      const sev = a.generated.severity || 'medium';
      severityCounts[sev]++;
    });
    console.log(`\n   Severity breakdown:`);
    console.log(`     High: ${severityCounts.high}`);
    console.log(`     Medium: ${severityCounts.medium}`);
    console.log(`     Low: ${severityCounts.low}`);

    // Preview first article
    if (articles.length > 0) {
      const first = articles[0].generated;
      console.log('\n' + '-'.repeat(60));
      console.log('📰 SAMPLE ARTICLE');
      console.log('-'.repeat(60));
      console.log(`\n📌 ${first.headline}`);
      console.log(`\n${first.brief}`);
      console.log(`\n🐦 Twitter: ${first.social_posts?.twitter || 'N/A'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
