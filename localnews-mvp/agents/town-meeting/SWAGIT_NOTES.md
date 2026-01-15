# Swagit Video Platform - Technical Notes

## Critical Knowledge for Jupiter FL Town Meeting Agent

### Platform Architecture
The Swagit platform (swagit.com) is a **multi-tenant video hosting system** used by hundreds of municipalities across the US. This has important implications:

1. **Video IDs are GLOBAL** - Not per-municipality. When Jupiter FL uploads video ID 371281, the next video from Miami Beach might be 371282.

2. **Large ID gaps are normal** - Between two Jupiter FL meetings, there can be **6,000+ videos** from other municipalities.

3. **View pages can be STALE** - The `/views/XXX/` pages (like `/views/229/` for Town Council) may be cached and not show recently uploaded videos.

### Video Ownership Verification
To determine if a video belongs to Jupiter FL:
1. Send HEAD request to: `https://jupiterfl.new.swagit.com/videos/{ID}/download`
2. Check if 302 redirect Location header contains `/jupiterfl/` in the S3 URL
3. Example: `s3.amazonaws.com/jupiterfl/xxxxx.mp4` = Jupiter FL video

### Discovery Strategy
The scraper uses a **two-method approach**:

**METHOD 1: Page Scraping (Fast, Sometimes Stale)**
- Scrape video links from `/views/229/`
- Check each video's ownership
- May miss recent videos if page is cached

**METHOD 2: ID Scanning (Slower, Reliable Fallback)**
- Start from highest known video ID
- Scan forward in batches (10,000 IDs, 50 concurrent)
- Check each ID for Jupiter FL ownership
- Saves last scanned ID to `data/last_video_scan.json`

### Key Files
- `scripts/fetch_latest_meeting.js` - Video discovery logic
- `data/last_video_scan.json` - Tracks scan progress
- `data/meetings.json` - Processed meeting records

### Debugging Tips
1. **"No new meetings found"** - Check if the scan range is large enough
2. **Missing recent meeting** - Verify video exists: `curl -I https://jupiterfl.new.swagit.com/videos/{ID}/download`
3. **Check ownership**: S3 URL should contain `/jupiterfl/`

### Example Commands
```bash
# Verify a video belongs to Jupiter FL
curl -sI "https://jupiterfl.new.swagit.com/videos/371281/download" | grep location

# Run the scraper manually
node scripts/fetch_latest_meeting.js

# Check what's been processed
cat data/meetings.json | jq '.[] | {id, date, status}'
```

### Known Video IDs (Reference)
- 364781: Dec 2025 meeting
- 371281: Jan 6, 2026 meeting
- 372045: Jan 13, 2026 meeting

---
*Last updated: January 2026*
