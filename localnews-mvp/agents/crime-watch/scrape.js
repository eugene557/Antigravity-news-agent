#!/usr/bin/env node

/**
 * Crime Watch Scraper
 *
 * Fetches crime incident data from LexisNexis Community Crime Map
 * for Jupiter, FL area using a two-step process:
 * 1. Get agency list and select Jupiter Police Department
 * 2. Fetch incidents with agency selected
 *
 * Usage: node scrape.js [--days=30] [--output=incidents.json]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const BASE_URL = 'https://communitycrimemap.com/api/v1';

// Jupiter, FL coordinates
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

function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

async function getAuthToken() {
  console.log('🔑 Getting auth token...');

  const response = await fetch(`${BASE_URL}/auth/newToken`);
  const data = await response.json();

  if (!data.data?.jwt) {
    throw new Error('Failed to get auth token');
  }

  console.log('   Token acquired\n');
  return data.data.jwt;
}

async function getAgencies(token) {
  console.log('📍 Finding agencies in Jupiter area...');

  const params = new URLSearchParams({
    MinLongitude: JUPITER_FL.bounds.west,
    MaxLongitude: JUPITER_FL.bounds.east,
    MinLatitude: JUPITER_FL.bounds.south,
    MaxLatitude: JUPITER_FL.bounds.north
  });

  const response = await fetch(`${BASE_URL}/search/agency-layers?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://communitycrimemap.com',
      'Referer': 'https://communitycrimemap.com/'
    }
  });

  const data = await response.json();
  return data.data?.agencies || [];
}

async function fetchIncidents(token, startDate, endDate, agencies) {
  console.log(`\n📡 Fetching incidents from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

  // Build layer selection - select all crime types
  const selection = new Array(150).fill(null);
  // Select major crime categories
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28].forEach(i => {
    selection[i] = { selected: true };
  });

  const requestBody = {
    buffer: {
      enabled: false,
      restrictArea: false,
      value: []
    },
    date: {
      start: formatDate(startDate),
      end: formatDate(endDate)
    },
    agencies: agencies.map(a => ({
      id: a.id,
      name: a.name,
      groups: a.groups || []
    })),
    layers: {
      selection: selection
    },
    location: {
      bounds: JUPITER_FL.bounds,
      lat: JUPITER_FL.lat,
      lng: JUPITER_FL.lng,
      zoom: 13
    },
    analyticLayers: {
      density: {
        selected: false,
        transparency: 60
      }
    }
  };

  const response = await fetch(`${BASE_URL}/search/load-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://communitycrimemap.com',
      'Referer': 'https://communitycrimemap.com/'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return await response.json();
}

function parseArgs() {
  const args = {
    days: 30,
    output: null
  };

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--days=')) {
      args.days = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    }
  });

  return args;
}

async function main() {
  const args = parseArgs();

  console.log('🚔 Crime Watch Scraper - Jupiter, FL\n');
  console.log(`   Location: Jupiter, FL (${JUPITER_FL.lat}, ${JUPITER_FL.lng})`);
  console.log(`   Date range: Last ${args.days} days\n`);

  try {
    // Get auth token
    const token = await getAuthToken();

    // Get agencies in the area
    const agencies = await getAgencies(token);
    console.log(`   Found ${agencies.length} agencies:`);
    agencies.forEach(a => console.log(`   - ${a.name} (ID: ${a.id})`));

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - args.days);

    // Fetch incidents with agencies selected
    const result = await fetchIncidents(token, startDate, endDate, agencies);

    // Process response - pins is an object keyed by entity ID
    const innerData = result.data?.data || {};
    const pinsObj = innerData.pins || {};
    const total = innerData.total || 0;

    // Convert pins object to array
    const incidents = Object.values(pinsObj).map(pin => {
      const mo = pin.EventRecord?.MOs?.MO || {};
      return {
        id: pin.EntityID,
        referenceId: pin.ReferenceID,
        agency: pin.Agency,
        dateTime: pin.DateTime,
        latitude: parseFloat(pin.Latitude),
        longitude: parseFloat(pin.Longitude),
        crimeClass: mo.Class,
        crime: mo.Crime,
        locationType: mo.LocationType,
        address: mo.AddressOfCrime,
        distance: parseFloat(pin.Distance)
      };
    });

    console.log('\n📊 Results:');
    console.log(`   Total reported by API: ${total}`);
    console.log(`   Incidents parsed: ${incidents.length}`);

    // Show sample incidents
    if (incidents.length > 0) {
      console.log('\n📋 Sample incidents:');
      incidents.slice(0, 5).forEach((inc, i) => {
        console.log(`\n   ${i + 1}. ${inc.crime}`);
        console.log(`      Date: ${inc.dateTime}`);
        console.log(`      Location: ${inc.address}`);
        console.log(`      Type: ${inc.crimeClass}`);
      });
    }

    // Save to file
    const outputPath = args.output ||
      path.join(__dirname, '../../data/crime', `incidents_${formatDate(startDate).replace(/\//g, '-')}_to_${formatDate(endDate).replace(/\//g, '-')}.json`);

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const output = {
      metadata: {
        location: 'Jupiter, FL',
        coordinates: JUPITER_FL,
        dateRange: {
          start: formatDate(startDate),
          end: formatDate(endDate)
        },
        fetchedAt: new Date().toISOString(),
        totalIncidents: incidents.length
      },
      incidents: incidents
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
