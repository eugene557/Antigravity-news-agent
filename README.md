# LocalNews MVP

Local news aggregation and processing with AI agents.

## Structure

- `agents/` - AI agent implementations
  - `town-meeting/` - Town meeting coverage agent
  - `crime-watch/` - Crime report monitoring agent
- `dashboard/` - Web dashboard for viewing results
- `lib/` - Shared utilities and helpers
- `prompts/` - Agent prompt templates
- `scripts/` - Utility scripts

## Setup

```bash
npm install
cp .env.example .env
# Add your API keys to .env
```

## Environment Variables

- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_SHEETS_CREDENTIALS` - Google Sheets API credentials
