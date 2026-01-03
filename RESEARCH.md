# Data Sources Research

## 1. Swagit/Granicus - Town Meeting Videos

**Source URL:** https://jupiterfl.new.swagit.com/videos/364781

### Findings

#### Video Access Methods

1. **Direct MP4 Download** ✅ (Verified & Implemented)
   - The `/download` endpoint redirects to a signed S3 URL
   - **Script:** `scripts/swagit_downloader.js` handles fetching and downloading.
   - **Format:** `https://granicus-aasmp-swagit-video.s3.amazonaws.com/{agency}/{uuid}.mp4`
   - URL includes AWS4-HMAC-SHA256 signed parameters
   - Links expire (X-Amz-Expires parameter, typically 3600 seconds)

   ```
   Download endpoint: https://jupiterfl.new.swagit.com/videos/{VIDEO_ID}/download
   ```

2. **Embed URL**
   ```
   https://jupiterfl.new.swagit.com/videos/{VIDEO_ID}/embed
   ```

3. **Video Player**
   - Uses JW Player with custom API key
   - THEOplayer skin customization
   - WebVTT captions support built-in

#### Programmatic Access Strategy

```javascript
// Step 1: Fetch the download URL (will 302 redirect)
const response = await fetch(`https://jupiterfl.new.swagit.com/videos/${videoId}/download`, {
  redirect: 'manual'
});
const mp4Url = response.headers.get('location');

// Step 2: Download the MP4
// Note: URL is time-limited, download immediately

// Step 3: Extract audio for transcription
// ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav
```

#### Transcript Availability
- Swagit provides auto-generated transcripts with timestamps
- Transcripts enable word-level search within videos
- Closed captions available in WebVTT format
- May be accessible via separate endpoint (needs investigation)

#### Key Considerations
- No authentication required for public meeting videos
- S3 signed URLs expire - must be used immediately
- FFmpeg can extract audio: `ffmpeg -i video.mp4 -vn -ar 16000 -ac 1 audio.wav`
- Consider using Whisper API or Google Speech-to-Text for transcription

---

## 2. LexisNexis Community Crime Map

**Source URL:** https://communitycrimemap.com/datagrid

### Findings

#### Platform Overview
- Operated by LexisNexis Risk Solutions
- Data provided directly by law enforcement agencies
- Displays up to 500 most recent incidents per query
- Data is cleaned/geocoded before display (addresses are block-level only)

#### Data Fields Available
Based on documentation, incident records include:
- Crime/offense type
- Location type
- Block-level address (exact addresses redacted)
- Date and time
- Geocoded coordinates

#### API Access ✅ (Reverse Engineered)

**Base URL:** `https://communitycrimemap.com/api/v1`

##### Endpoints Discovered

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/newToken` | GET | Get JWT Bearer token (no auth required) |
| `/search/map-layers` | GET | Get available crime categories |
| `/search/coverage` | GET | Get list of participating agencies |
| `/search/agency-layers` | GET | Get agencies in bounding box |
| `/search/load-data` | POST | **Main data endpoint** - returns incidents |

##### Authentication

```javascript
// Get token (valid ~3 hours)
const tokenRes = await fetch('https://communitycrimemap.com/api/v1/auth/newToken');
const { data: { jwt } } = await tokenRes.json();

// Use in requests
headers: { 'Authorization': `Bearer ${jwt}` }
```

##### Load Data Request (Verified)

```javascript
POST /api/v1/search/load-data
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "buffer": {
    "enabled": false,
    "restrictArea": false,
    "value": []
  },
  "date": {
    "start": "12/01/2025",    // MM/DD/YYYY format
    "end": "12/31/2025"
  },
  "agencies": [],              // Empty = all agencies in bounds
  "layers": {
    "selection": [             // Crime type filters (index-based)
      null, null,
      {"selected": true},      // Index 2 = Arson
      {"selected": false},     // Index 3 = ...
      // ... see /search/map-layers for full mapping
    ]
  },
  "location": {
    "bounds": {
      "east": -79.9823696,
      "north": 26.9718533,
      "south": 26.8918533,
      "west": -80.22236960
    },
    "lat": 26.9318533,
    "lng": -80.1023696,
    "zoom": 13
  },
  "analyticLayers": {
    "density": {
      "selected": false,
      "transparency": 60
    }
  }
}
```

##### Jupiter, FL Coordinates

```javascript
const JUPITER_FL = {
  lat: 26.9342,
  lng: -80.0942,
  bounds: {
    north: 26.98,
    south: 26.88,
    east: -79.98,
    west: -80.22
  }
};
```

##### Script Location

**Implemented:** `agents/crime-watch/scrape.js`

#### Legal Considerations
- Data is public information (published by law enforcement)
- Scraping may violate Terms of Service
- Consider contacting LexisNexis or the agency for official access
- Rate limiting and IP blocking possible

---

## Recommended Next Steps

### For Town Meeting Videos (Priority: High)
1. Build a scraper to:
   - List available videos from Jupiter FL Swagit
   - Download MP4 via the `/download` endpoint
   - Extract audio using FFmpeg
   - Transcribe using OpenAI Whisper API
2. Store transcripts in Google Sheets

### For Crime Data (Priority: Medium)
1. **Manual inspection first:**
   - Open https://communitycrimemap.com/datagrid in Chrome
   - Open DevTools > Network tab
   - Search for Jupiter, FL
   - Document the actual API endpoints and request/response format
2. If no public API, consider:
   - Puppeteer-based scraper with rate limiting
   - Alternative: Palm Beach County open data portal
   - Alternative: Direct contact with Jupiter PD

---

## Technical Dependencies

```bash
# For video processing
brew install ffmpeg

# For browser automation (if needed)
npm install puppeteer

# Already in package.json
# - openai (for Whisper API)
# - googleapis (for Sheets)
# - dotenv
```

---

## Sources

- [Swagit Video Solutions - Granicus](https://granicus.com/product/swagit/)
- [Community Crime Map - LexisNexis](https://risk.lexisnexis.com/products/community-crime-map)
- [How to download m3u8 streams - GitHub Gist](https://gist.github.com/primaryobjects/7423d7982656a31e72542f60d30f9d30)
- [Generating transcripts from m3u8 - Medium](https://medium.com/@rushikeshsp25/generating-transcripts-for-an-m3u8-video-stream-using-google-cloud-speech-to-text-f59254b9674)
