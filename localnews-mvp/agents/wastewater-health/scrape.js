#!/usr/bin/env node

/**
 * Wastewater Health Monitoring Scraper
 *
 * Fetches wastewater surveillance data from CDC NWSS (National Wastewater Surveillance System)
 * for Palm Beach County, FL area using the public Socrata SODA API.
 *
 * Data Sources:
 * - SARS-CoV-2 wastewater data: https://data.cdc.gov/resource/2ew6-ywp6.json
 * - Influenza A wastewater data: https://data.cdc.gov/resource/ymmh-divb.json
 *
 * Usage: node scrape.js [--weeks=4] [--output=data.json]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

// CDC NWSS API Endpoints (Socrata SODA API)
const CDC_API = {
  covid: 'https://data.cdc.gov/resource/2ew6-ywp6.json',
  influenza: 'https://data.cdc.gov/resource/ymmh-divb.json'
};

// Palm Beach County, FL identifiers
const PALM_BEACH_COUNTY = {
  fips: '12099',
  name: 'Palm Beach',
  state: 'Florida'
};

// WWTP IDs known to serve Palm Beach County area
const PALM_BEACH_WWTPS = ['1897', '2637'];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function parseArgs() {
  const args = {
    weeks: 4,
    output: null
  };

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--weeks=')) {
      args.weeks = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    }
  });

  return args;
}

/**
 * Fetch COVID-19 wastewater data from CDC
 * Note: CDC data may have a lag of several weeks to months
 */
async function fetchCovidData(startDate, endDate) {
  console.log('🦠 Fetching SARS-CoV-2 wastewater data...');

  // Use county_names LIKE query which works better than county_fips
  const params = new URLSearchParams({
    $where: `county_names like '%${PALM_BEACH_COUNTY.name}%'`,
    $order: 'date_end DESC',
    $limit: 100
  });

  try {
    const response = await fetch(`${CDC_API.covid}?${params}`);
    if (!response.ok) {
      throw new Error(`CDC API error: ${response.status}`);
    }
    const data = await response.json();
    console.log(`   Found ${data.length} COVID-19 records`);
    if (data.length > 0) {
      console.log(`   Latest data: ${data[0].date_end}`);
    }
    return data;
  } catch (error) {
    console.error('   Failed to fetch COVID data:', error.message);
    return [];
  }
}

/**
 * Fetch Influenza A wastewater data from CDC
 */
async function fetchInfluenzaData(startDate, endDate) {
  console.log('🤧 Fetching Influenza A wastewater data...');

  // Influenza data uses different column names - search by counties_served
  const params = new URLSearchParams({
    $where: `counties_served like '%Palm Beach%'`,
    $order: 'sample_collect_date DESC',
    $limit: 100
  });

  try {
    const response = await fetch(`${CDC_API.influenza}?${params}`);
    if (!response.ok) {
      // Try alternate query without the date filter
      console.log('   Trying alternate query...');
      const altParams = new URLSearchParams({
        $limit: 100,
        $order: 'sample_collect_date DESC'
      });
      const altResponse = await fetch(`${CDC_API.influenza}?${altParams}`);
      if (!altResponse.ok) {
        throw new Error(`CDC API error: ${altResponse.status}`);
      }
      const allData = await altResponse.json();
      // Filter for Palm Beach manually
      const filtered = allData.filter(r =>
        r.counties_served?.includes('Palm Beach') ||
        r.county_names?.includes('Palm Beach')
      );
      console.log(`   Found ${filtered.length} Influenza A records (filtered from ${allData.length})`);
      return filtered;
    }
    const data = await response.json();
    console.log(`   Found ${data.length} Influenza A records`);
    if (data.length > 0) {
      console.log(`   Latest data: ${data[0].sample_collect_date}`);
    }
    return data;
  } catch (error) {
    console.error('   Failed to fetch Influenza data:', error.message);
    return [];
  }
}

/**
 * Process and normalize COVID-19 data
 */
function processCovidData(rawData) {
  return rawData.map(record => ({
    pathogen: 'SARS-CoV-2',
    dateStart: record.date_start,
    dateEnd: record.date_end,
    county: record.county_names || PALM_BEACH_COUNTY.name,
    countyFips: record.county_fips,
    wwtpId: record.wwtp_id,
    populationServed: parseInt(record.population_served) || null,
    percentile: parseFloat(record.percentile) || null,
    percentileClassification: record.ptc_15d || null, // e.g., 'Low', 'Moderate', 'High', 'Very High'
    detectFlag: record.detect_prop_15d || null,
    trend: record.percent_change_15d || null, // e.g., 'Increasing', 'Decreasing', 'Stable'
    rawConcentration: record.pcr_conc_smoothed || null,
    units: 'copies/mL wastewater'
  })).filter(record => record.dateEnd);
}

/**
 * Process and normalize Influenza data
 */
function processInfluenzaData(rawData) {
  return rawData.map(record => ({
    pathogen: 'Influenza A',
    dateStart: record.sample_collect_date,
    dateEnd: record.sample_collect_date,
    county: record.counties_served || record.county_names || PALM_BEACH_COUNTY.name,
    wwtpId: record.wwtp_id,
    populationServed: parseInt(record.population_served) || null,
    rawConcentration: parseFloat(record.pcr_target_avg_conc) || null,
    units: record.pcr_target_units || 'copies/L wastewater',
    pcrTarget: record.pcr_target
  })).filter(record => record.dateEnd);
}

/**
 * Calculate weekly trends from data
 */
function calculateTrends(data, pathogen) {
  const filtered = data.filter(d => d.pathogen === pathogen);
  if (filtered.length < 2) return null;

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.dateEnd) - new Date(a.dateEnd));

  const latest = filtered[0];
  const previous = filtered[Math.min(7, filtered.length - 1)]; // Approximately a week ago

  let trend = 'stable';
  let percentChange = null;

  if (latest.rawConcentration && previous.rawConcentration) {
    const latestVal = parseFloat(latest.rawConcentration);
    const prevVal = parseFloat(previous.rawConcentration);
    if (prevVal > 0) {
      percentChange = ((latestVal - prevVal) / prevVal) * 100;
      if (percentChange > 10) trend = 'increasing';
      else if (percentChange < -10) trend = 'decreasing';
    }
  } else if (latest.percentileClassification) {
    trend = latest.trend || 'stable';
  }

  return {
    pathogen,
    latestDate: latest.dateEnd,
    latestLevel: latest.percentileClassification || 'Unknown',
    trend,
    percentChange: percentChange ? percentChange.toFixed(1) : null
  };
}

/**
 * Generate summary statistics
 */
function generateSummary(covidData, fluData) {
  const summary = {
    reportDate: new Date().toISOString(),
    location: `${PALM_BEACH_COUNTY.name} County, ${PALM_BEACH_COUNTY.state}`,
    dataPoints: {
      covid: covidData.length,
      influenza: fluData.length
    },
    trends: {},
    alerts: []
  };

  // Calculate COVID trends
  const covidTrend = calculateTrends(covidData, 'SARS-CoV-2');
  if (covidTrend) {
    summary.trends.covid = covidTrend;
    if (covidTrend.latestLevel === 'High' || covidTrend.latestLevel === 'Very High') {
      summary.alerts.push({
        pathogen: 'SARS-CoV-2',
        level: covidTrend.latestLevel,
        message: `COVID-19 wastewater levels are ${covidTrend.latestLevel.toLowerCase()} in Palm Beach County`
      });
    }
  }

  // Calculate Influenza trends
  const fluTrend = calculateTrends(fluData, 'Influenza A');
  if (fluTrend) {
    summary.trends.influenza = fluTrend;
    if (fluTrend.trend === 'increasing') {
      summary.alerts.push({
        pathogen: 'Influenza A',
        level: 'Increasing',
        message: 'Influenza A detections are increasing in local wastewater'
      });
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs();

  console.log('🚰 Wastewater Health Monitor - Palm Beach County, FL\n');
  console.log(`   Location: ${PALM_BEACH_COUNTY.name} County, ${PALM_BEACH_COUNTY.state}`);
  console.log(`   Date range: Last ${args.weeks} weeks\n`);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (args.weeks * 7));

  try {
    // Fetch data from CDC
    const covidRaw = await fetchCovidData(startDate, endDate);
    const fluRaw = await fetchInfluenzaData(startDate, endDate);

    // Process data
    const covidData = processCovidData(covidRaw);
    const fluData = processInfluenzaData(fluRaw);

    console.log('\n📊 Processing results:');
    console.log(`   COVID-19 data points: ${covidData.length}`);
    console.log(`   Influenza A data points: ${fluData.length}`);

    // Generate summary
    const summary = generateSummary(covidData, fluData);

    // Show alerts
    if (summary.alerts.length > 0) {
      console.log('\n⚠️  ALERTS:');
      summary.alerts.forEach(alert => {
        console.log(`   - [${alert.pathogen}] ${alert.message}`);
      });
    } else {
      console.log('\n✅ No health alerts at this time');
    }

    // Show trends
    console.log('\n📈 Trends:');
    if (summary.trends.covid) {
      console.log(`   COVID-19: ${summary.trends.covid.latestLevel} (${summary.trends.covid.trend})`);
    }
    if (summary.trends.influenza) {
      console.log(`   Influenza A: ${summary.trends.influenza.trend}${summary.trends.influenza.percentChange ? ` (${summary.trends.influenza.percentChange}%)` : ''}`);
    }

    // Prepare output
    const output = {
      metadata: {
        location: summary.location,
        dateRange: {
          start: formatDate(startDate),
          end: formatDate(endDate)
        },
        fetchedAt: new Date().toISOString(),
        sources: ['CDC NWSS SARS-CoV-2', 'CDC NWSS Influenza A']
      },
      summary,
      data: {
        covid: covidData,
        influenza: fluData
      }
    };

    // Determine output path
    const timestamp = formatDate(new Date()).replace(/-/g, '');
    const outputPath = args.output ||
      path.join(__dirname, '../../data/wastewater', `wastewater_${timestamp}.json`);

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save output
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Data saved to: ${outputPath}`);

    // Return summary for article generation
    return output;

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for use by generate.js
export { main as scrapeWastewater };

main();
