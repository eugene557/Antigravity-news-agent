# Article Generation Logic & Context

This document captures the logic and context for how the LocalNews AI Agent generates articles, angles, and social media captions from town meetings.

## 1. The Core Pipeline
The generation process follows this flow:
1. **Transcription**: Video -> Text (w/ timestamps)
2. **Analysis**: Text -> Structured JSON (Ideas, Quotes, Summary)
3. **Drafting**: Idea + Angle -> Full Article + Social Captions

## 2. Idea Extraction Logic (`analyze.js`)
The system analyzes the meeting transcript to identify **Newsworthy Ideas**.
Each "Idea" is a potential news story. The AI is prompted to extract:
- **Headline**: Catchy, news-style title.
- **Event**: What actually happened (the facts).
- **News Value**: Why this matters to residents (taxes, traffic, schools, etc.).
- **Quotes**: Relevant verbatims from the transcript.

## 3. Coverage Angles
For *each* idea, the system generates multiple **Angles** to cover the story from different perspectives. This allows one meeting topic to spawn multiple distinct articles.

**Standard Angles:**
- **The "Just the Facts" Angle**: Straight reporting, objective, suitable for breaking news.
- **The "Impact" Angle**: Focuses on how this affects the average resident (e.g., "Your taxes are going up").
- **The "Conflict" Angle**: Focuses on the debate, disagreement, or controversy.
- **The "Deep Dive" Angle**: educational/explainer style (e.g., "Why the new zoning law matters").

## 4. Article Drafting Logic
When a user selects an Idea + Angle, the `generate-article` agent runs.
It uses the **Department Context** (e.g., "Town Council" vs "School Board") to tailor the tone.

### Output Structure
The generated article includes:
- **Headline**: Optimized for clicks/interest.
- **Lede**: Strong opening hook.
- **Body**: 4-6 paragraphs, incorporating quotes.
- **Key Takeaways**: Bullet points for skimming.

## 5. Social Media & Captions
Alongside the article, the system generates platform-specific captions:
- **Twitter/X**: Short (<280 chars), punchy, uses hashtags (#JupiterFL), threads if complex.
- **Instagram/Facebook**: Longer, more conversational, focusing on community impact. Emojis are encouraged 🏘️📝.
- **Nextdoor**: focused on local community alerting/safety/property values.

## 6. Development Instructions (for Agents)
When modifying the generation logic:
- **Prompt Location**: `agents/town-meeting/prompts/` (if separated) or inline in `analyze.js`.
- **Tone Guidelines**: Maintains standard journalistic integrity (Neutral, Fact-checking) but with a "Local Community" voice.
- **Data Source**: Always ground the article in the *Transcript JSON* (`data/swagit/*_transcript.json`). Do not hallucinate facts not in the transcript.

## 7. Context Preservation
**Dashboard UI Location**:
- **Upcoming/Meetings View**: Where users choose which meeting to process.
- **Meeting Detail View**: Lists the "Ideas" found.
- **Review Modal**: Where users select the "Angle" and generate the draft.
