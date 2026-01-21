#!/usr/bin/env node

/**
 * Wastewater Health Article Generator
 *
 * Generates weekly health briefs and social posts from wastewater surveillance data.
 *
 * Usage: node generate.js <data_path> [output_path]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
import OpenAI from 'openai';
import { appendArticlesWithDedup, getExistingSourceUrls } from '../../lib/sheets.js';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function loadPrompt() {
  const promptPath = path.join(__dirname, '../../prompts/generate-health-brief.txt');
  return fs.readFileSync(promptPath, 'utf-8');
}

async function loadData(dataPath) {
  const content = fs.readFileSync(dataPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Format wastewater data for GPT consumption
 */
function formatDataForGeneration(data) {
  const summary = data.summary;
  const covidData = data.data?.covid || [];
  const fluData = data.data?.influenza || [];

  let text = `## Wastewater Health Report - ${summary.location}\n`;
  text += `Report Date: ${new Date(summary.reportDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n`;
  text += `Data Period: ${data.metadata.dateRange.start} to ${data.metadata.dateRange.end}\n\n`;

  // COVID-19 Section
  text += `### SARS-CoV-2 (COVID-19) Wastewater Data\n`;
  if (summary.trends?.covid) {
    text += `- Current Level: ${summary.trends.covid.latestLevel}\n`;
    text += `- Trend: ${summary.trends.covid.trend}\n`;
    text += `- Latest Reading Date: ${summary.trends.covid.latestDate}\n`;
  }
  if (covidData.length > 0) {
    const latest = covidData[0];
    text += `- Population Served: ${latest.populationServed?.toLocaleString() || 'N/A'}\n`;
    if (latest.percentChange) {
      text += `- 15-Day Percent Change: ${latest.trend || 'N/A'}\n`;
    }
  }
  text += `- Data Points Available: ${summary.dataPoints?.covid || 0}\n\n`;

  // Influenza Section
  text += `### Influenza A Wastewater Data\n`;
  if (summary.trends?.influenza) {
    text += `- Trend: ${summary.trends.influenza.trend}\n`;
    if (summary.trends.influenza.percentChange) {
      text += `- Percent Change: ${summary.trends.influenza.percentChange}%\n`;
    }
  }
  if (fluData.length > 0) {
    const latest = fluData[0];
    text += `- Latest Reading: ${latest.rawConcentration?.toLocaleString() || 'N/A'} ${latest.units || ''}\n`;
    text += `- Population Served: ${latest.populationServed?.toLocaleString() || 'N/A'}\n`;
  }
  text += `- Data Points Available: ${summary.dataPoints?.influenza || 0}\n\n`;

  // Alerts
  if (summary.alerts && summary.alerts.length > 0) {
    text += `### Active Alerts\n`;
    summary.alerts.forEach(alert => {
      text += `- [${alert.pathogen}] ${alert.message}\n`;
    });
    text += '\n';
  } else {
    text += `### Status: No Active Health Alerts\n\n`;
  }

  text += `Data Source: CDC National Wastewater Surveillance System (NWSS)\n`;

  return text;
}

/**
 * Generate health brief using GPT-4
 */
async function generateBrief(systemPrompt, dataText) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate a weekly health brief for Jupiter, FL residents based on this wastewater surveillance data:\n\n${dataText}`
      }
    ],
    temperature: 0.5,
    max_tokens: 1000,
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

/**
 * Save article to Supabase
 */
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

async function main() {
  const dataPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!dataPath) {
    console.error('Usage: node generate.js <data_path> [output_path]');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('🏥 Wastewater Health Article Generator\n');

  try {
    // Load prompt and data
    console.log('📄 Loading wastewater data...');
    const systemPrompt = await loadPrompt();
    const wastewaterData = await loadData(dataPath);

    const summary = wastewaterData.summary;
    console.log(`   Location: ${summary.location}`);
    console.log(`   COVID data points: ${summary.dataPoints?.covid || 0}`);
    console.log(`   Influenza data points: ${summary.dataPoints?.influenza || 0}`);
    console.log(`   Alerts: ${summary.alerts?.length || 0}`);

    // Generate unique source URL based on report date
    const reportDate = new Date(summary.reportDate).toISOString().split('T')[0];
    const sourceUrl = `wastewater-report:${reportDate}`;

    // Check for existing article to avoid duplicates
    let existingUrls = new Set();
    if (process.env.GOOGLE_SPREADSHEET_ID || supabase) {
      console.log('\n🔍 Checking for existing articles...');
      try {
        existingUrls = await getExistingSourceUrls('wastewater-health');
        console.log(`   Found ${existingUrls.size} existing health articles`);
      } catch (e) {
        console.log('   Could not check existing articles, continuing...');
      }
    }

    if (existingUrls.has(sourceUrl)) {
      console.log(`\nℹ️  Article for ${reportDate} already exists. Skipping generation.`);
      process.exit(0);
    }

    // Format data for GPT
    const dataText = formatDataForGeneration(wastewaterData);

    // Generate article
    console.log('\n📝 Generating health brief...');
    const brief = await generateBrief(systemPrompt, dataText);

    console.log(`   ✓ Generated: "${brief.headline}"`);
    console.log(`   Severity: ${brief.severity}`);

    // Prepare article output
    const article = {
      metadata: {
        sourceFile: dataPath,
        generatedAt: new Date().toISOString(),
        model: 'gpt-4o',
        reportDate: reportDate,
        location: summary.location
      },
      generated: brief,
      sourceData: {
        alerts: summary.alerts,
        trends: summary.trends,
        dataPoints: summary.dataPoints
      }
    };

    // Determine output path
    const finalOutputPath = outputPath ||
      dataPath.replace('wastewater_', 'article_');

    // Save output
    fs.writeFileSync(finalOutputPath, JSON.stringify(article, null, 2));
    console.log(`\n✅ Article saved to: ${finalOutputPath}`);

    // Write to storage (Supabase primary, Google Sheets backup)
    console.log('\n📊 Saving to database...');
    try {
      const sheetArticle = {
        agentSource: 'wastewater-health',
        headline: brief.headline || '',
        body: brief.brief || '',
        summary: brief.brief?.split('.').slice(0, 2).join('.') + '.' || '',
        twitter: brief.social_posts?.twitter || '',
        facebook: brief.social_posts?.facebook || '',
        instagram: brief.social_posts?.nextdoor || '', // Using nextdoor for instagram column
        sourceUrl: sourceUrl,
        status: 'draft'
      };

      // Save to Supabase first (primary)
      await saveArticleToSupabase(sheetArticle);

      // Also save to Google Sheets if configured (backup)
      if (process.env.GOOGLE_SPREADSHEET_ID) {
        const result = await appendArticlesWithDedup([sheetArticle], 'wastewater-health');
        console.log(`   ✓ Added ${result.rowsAdded} new article to sheet`);
        if (result.skipped > 0) {
          console.log(`   ⚠️  Skipped ${result.skipped} duplicates`);
        }
      }
    } catch (saveError) {
      console.error(`   ⚠️  Save failed: ${saveError.message}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 GENERATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Report Date: ${reportDate}`);
    console.log(`   Severity: ${brief.severity}`);
    console.log(`   Tags: ${brief.tags?.join(', ') || 'N/A'}`);

    // Show recommendations
    if (brief.recommendations && brief.recommendations.length > 0) {
      console.log('\n   Health Recommendations:');
      brief.recommendations.forEach((rec, i) => {
        console.log(`     ${i + 1}. ${rec}`);
      });
    }

    // Preview article
    console.log('\n' + '-'.repeat(60));
    console.log('📰 ARTICLE PREVIEW');
    console.log('-'.repeat(60));
    console.log(`\n📌 ${brief.headline}`);
    console.log(`\n${brief.brief}`);
    console.log(`\n🐦 Twitter: ${brief.social_posts?.twitter || 'N/A'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
