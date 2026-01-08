#!/usr/bin/env node

/**
 * Town Meeting Content Generator
 *
 * Generates news articles and social media posts from meeting analysis.
 *
 * Usage: node generate.js <analysis_path> [output_path]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import OpenAI from 'openai';
import { appendArticle, findArticleBySourceUrl } from '../../lib/sheets.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function loadPrompt() {
  const promptPath = path.join(__dirname, '../../prompts/generate-article.txt');
  return fs.readFileSync(promptPath, 'utf-8');
}

async function loadAnalysis(analysisPath) {
  const content = fs.readFileSync(analysisPath, 'utf-8');
  return JSON.parse(content);
}

function formatAnalysisForGeneration(analysisData) {
  const { metadata, analysis } = analysisData;

  let formatted = `## Meeting Information\n`;
  formatted += `- Date: December 16, 2025\n`;
  formatted += `- Duration: ${metadata.durationMinutes} minutes\n`;
  formatted += `- Location: Jupiter Town Council\n\n`;

  formatted += `## Meeting Summary\n${analysis.meeting_summary || 'No summary available'}\n\n`;

  if (analysis.decisions?.length > 0) {
    formatted += `## Key Decisions\n`;
    analysis.decisions.forEach((d, i) => {
      formatted += `${i + 1}. **${d.topic}**: ${d.outcome}`;
      if (d.vote_count) formatted += ` (Vote: ${d.vote_count})`;
      if (d.significance) formatted += ` - ${d.significance}`;
      formatted += '\n';
    });
    formatted += '\n';
  }

  if (analysis.topics_debated?.length > 0) {
    formatted += `## Topics Discussed\n`;
    analysis.topics_debated.forEach((t, i) => {
      formatted += `${i + 1}. **${t.title}**: ${t.summary}\n`;
      if (t.key_points?.length > 0) {
        t.key_points.forEach(p => formatted += `   - ${p}\n`);
      }
    });
    formatted += '\n';
  }

  if (analysis.notable_quotes?.length > 0) {
    formatted += `## Notable Quotes\n`;
    analysis.notable_quotes.slice(0, 5).forEach((q, i) => {
      formatted += `${i + 1}. "${q.text}"`;
      if (q.speaker) formatted += ` - ${q.speaker}`;
      if (q.context) formatted += ` (${q.context})`;
      formatted += '\n';
    });
    formatted += '\n';
  }

  if (analysis.action_items?.length > 0) {
    formatted += `## Action Items\n`;
    analysis.action_items.forEach((a, i) => {
      formatted += `${i + 1}. ${a.description}`;
      if (a.responsible_party) formatted += ` (${a.responsible_party})`;
      if (a.deadline) formatted += ` - Due: ${a.deadline}`;
      formatted += '\n';
    });
    formatted += '\n';
  }

  if (analysis.newsworthy_highlights?.length > 0) {
    formatted += `## Newsworthy Highlights\n`;
    analysis.newsworthy_highlights.forEach((h, i) => {
      formatted += `${i + 1}. **${h.headline_suggestion}**\n`;
      formatted += `   Why newsworthy: ${h.why_newsworthy}\n`;
      if (Array.isArray(h.key_facts) && h.key_facts.length > 0) {
        formatted += `   Key facts: ${h.key_facts.join('; ')}\n`;
      } else if (typeof h.key_facts === 'string') {
        formatted += `   Key facts: ${h.key_facts}\n`;
      }
    });
  }

  return formatted;
}

async function loadSettings() {
  const settingsPath = path.join(__dirname, '../../data/town_meeting_settings.json');
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return null;
}

async function generateContent(systemPrompt, contextText, idea, angle, boardMembers = []) {
  console.log(`✍️  Generating article for angle: ${angle.name}...`);

  const membersInfo = boardMembers.length > 0
    ? `\n\nBoard Members for this meeting (ensure correct spelling):\n${boardMembers.map(m => `${m.name} (${m.role})`).join('\n')}`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Based on the following meeting context, generate a news article about this specific event: "${idea.event}"
        
Title of Idea: ${idea.title}
Selected Coverage Angle: ${angle.name}
Angle Description: ${angle.description}
${angle.prompt_hint ? `Prompt Hint: ${angle.prompt_hint}` : ''}
${membersInfo}

Meeting Context:
${contextText.substring(0, 40000)}`
      }
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse JSON response:', content.slice(0, 500));
    throw new Error('Invalid JSON response from GPT-4');
  }
}

async function main() {
  const contextPath = process.argv[2]; // Can be transcript or analysis
  const ideaId = process.argv[3];
  const angleName = process.argv[4];
  const outputPath = process.argv[5];
  const departmentId = process.env.DEPARTMENT_ID || 'town-council';

  if (!contextPath || !ideaId || !angleName) {
    console.error('Usage: node generate.js <context_path> <idea_id> <angle_name> [output_path]');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('📰 Town Meeting Content Generator (Idea-to-Article)\n');

  try {
    // 1. Load Data
    console.log('📄 Loading meeting context...');
    const systemPrompt = await loadPrompt();
    const contextData = contextPath.endsWith('.json')
      ? JSON.parse(fs.readFileSync(contextPath, 'utf-8'))
      : { fullText: fs.readFileSync(contextPath, 'utf-8') };

    const contextText = contextData.fullText || contextData.analysis?.meeting_summary || '';

    // 2. Find Idea and Angle - check per-meeting ideas file first
    const videoId = process.env.VIDEO_ID || contextData.videoId || contextData.metadata?.videoId;
    let ideasPath = path.join(__dirname, '../../data/swagit/current_ideas.json');

    // Try per-meeting ideas file first
    if (videoId) {
      const meetingIdeasPath = path.join(__dirname, `../../data/swagit/${videoId}_ideas.json`);
      if (fs.existsSync(meetingIdeasPath)) {
        ideasPath = meetingIdeasPath;
        console.log(`📂 Using meeting-specific ideas: ${videoId}_ideas.json`);
      }
    }

    if (!fs.existsSync(ideasPath)) throw new Error('Ideas file not found');
    const ideasData = JSON.parse(fs.readFileSync(ideasPath, 'utf-8'));

    const idea = ideasData.ideas.find(i => String(i.id) === String(ideaId));
    if (!idea) throw new Error(`Idea ${ideaId} not found in ${path.basename(ideasPath)}`);

    const angle = idea.angles.find(a => a.name === angleName);
    if (!angle) throw new Error(`Angle "${angleName}" not found for idea ${ideaId}`);

    // 3. Load Board Members
    const settings = await loadSettings();
    const dept = settings?.departments.find(d => d.id === departmentId);
    const boardMembers = dept?.boardMembers || [];

    // 4. Generate
    const generatedContent = await generateContent(systemPrompt, contextText, idea, angle, boardMembers);

    // 5. Add Metadata
    const output = {
      metadata: {
        videoId: contextData.videoId || contextData.metadata?.videoId || 'unknown',
        generatedAt: new Date().toISOString(),
        idea: idea.title,
        angle: angle.name,
        department: departmentId
      },
      content: generatedContent
    };

    // 6. Save and Write to Sheets
    const finalOutputPath = outputPath || contextPath.replace('_transcript.json', `_article_${ideaId}.json`);
    fs.writeFileSync(finalOutputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Content saved to: ${finalOutputPath}`);

    const swagitUrl = output.metadata.videoId !== 'unknown'
      ? `https://jupiterfl.new.swagit.com/videos/${output.metadata.videoId}`
      : null;

    if (process.env.GOOGLE_SPREADSHEET_ID) {
      console.log('\n📊 Writing to Google Sheets...');
      try {
        await appendArticle({
          agentSource: 'town-meeting',
          headline: generatedContent.headline || '',
          body: generatedContent.article || '',
          summary: generatedContent.summary || '',
          twitter: generatedContent.social_posts?.twitter || '',
          facebook: generatedContent.social_posts?.facebook || '',
          instagram: generatedContent.social_posts?.instagram || '',
          sourceUrl: swagitUrl,
          status: 'draft'
        });
        console.log(`   ✓ Added to sheet`);
      } catch (sheetError) {
        console.error(`   ⚠️  Sheet write failed: ${sheetError.message}`);
      }
    }

    // Display
    console.log(`\n📌 HEADLINE: ${generatedContent.headline}`);
    console.log(`\n📄 ARTICLE PREVIEW: ${generatedContent.article?.substring(0, 200)}...`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
