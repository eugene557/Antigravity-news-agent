#!/usr/bin/env node

/**
 * Crime Map API Discovery Script
 *
 * Uses Puppeteer to intercept API calls and discover endpoint structure.
 */

import puppeteer from 'puppeteer';

async function discoverAPI() {
  console.log('🔍 Launching browser to discover Crime Map API...\n');

  const browser = await puppeteer.launch({
    headless: true
  });

  const page = await browser.newPage();

  const apiCalls = [];
  const responses = {};

  // Intercept all network requests
  await page.setRequestInterception(true);

  page.on('request', request => {
    const url = request.url();

    if (url.includes('communitycrimemap.com/api/')) {
      const shortUrl = url.replace('https://communitycrimemap.com', '');
      apiCalls.push({
        method: request.method(),
        url: url,
        shortUrl: shortUrl,
        headers: request.headers(),
        postData: request.postData()
      });
      console.log(`📡 ${request.method()} ${shortUrl.slice(0, 100)}`);
      if (request.postData()) {
        try {
          const body = JSON.parse(request.postData());
          console.log(`   Body: ${JSON.stringify(body)}\n`);
        } catch {
          console.log(`   Body: ${request.postData()}\n`);
        }
      }
    }

    request.continue();
  });

  page.on('response', async response => {
    const url = response.url();

    if (url.includes('communitycrimemap.com/api/')) {
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        const endpoint = url.replace('https://communitycrimemap.com', '').split('?')[0];
        responses[endpoint] = json;

        // Log incidents specifically
        if (url.includes('incidents') || url.includes('search/events')) {
          console.log(`\n✅ INCIDENTS DATA FOUND:`);
          console.log(JSON.stringify(json, null, 2).slice(0, 3000));
          console.log('\n');
        }
      } catch (e) {
        // Not JSON
      }
    }
  });

  try {
    // Jupiter, FL is covered by Palm Beach County Sheriff's Office
    // Go directly to the map with Jupiter bounds
    const jupiterLat = 26.9342;
    const jupiterLng = -80.0942;

    console.log('📍 Step 1: Loading crime map homepage...\n');
    await page.goto('https://communitycrimemap.com', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(r => setTimeout(r, 3000));

    // Get the JWT token from the page
    const token = await page.evaluate(() => {
      return localStorage.getItem('ccm_token') || sessionStorage.getItem('ccm_token');
    });
    console.log(`🔑 Token from storage: ${token ? 'Found' : 'Not found'}\n`);

    // Try to interact with the search
    console.log('📍 Step 2: Searching for Jupiter, FL...\n');

    // Type in the search box
    await page.waitForSelector('input', { timeout: 10000 });
    const inputs = await page.$$('input');

    for (const input of inputs) {
      const placeholder = await input.evaluate(el => el.placeholder || '');
      if (placeholder.toLowerCase().includes('search') || placeholder.toLowerCase().includes('address')) {
        await input.click();
        await input.type('Jupiter, FL', { delay: 50 });
        await page.keyboard.press('Enter');
        console.log('   Typed "Jupiter, FL" in search\n');
        break;
      }
    }

    await new Promise(r => setTimeout(r, 5000));

    // Click on any agency marker or select Jupiter area
    console.log('📍 Step 3: Waiting for map interaction...\n');
    await new Promise(r => setTimeout(r, 5000));

    // Try navigating to data grid with preserved session
    console.log('📍 Step 4: Going to data grid...\n');
    await page.goto('https://communitycrimemap.com/datagrid', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(r => setTimeout(r, 8000));

    // Try clicking around to trigger incident loading
    console.log('📍 Step 5: Looking for data grid interactions...\n');

    // Look for any buttons or tabs
    const buttons = await page.$$('button, [role="button"], .mat-tab-label');
    console.log(`   Found ${buttons.length} clickable elements`);

    for (const button of buttons.slice(0, 5)) {
      try {
        const text = await button.evaluate(el => el.textContent || '');
        if (text.toLowerCase().includes('search') || text.toLowerCase().includes('load') || text.toLowerCase().includes('apply')) {
          console.log(`   Clicking: "${text.trim()}"`);
          await button.click();
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (e) {
        // Element not clickable
      }
    }

    await new Promise(r => setTimeout(r, 5000));

  } catch (error) {
    console.error('Error during navigation:', error.message);
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 ALL API ENDPOINTS DISCOVERED');
  console.log('='.repeat(60) + '\n');

  const uniqueEndpoints = [...new Set(apiCalls.map(c => c.method + ' ' + c.shortUrl.split('?')[0]))];
  uniqueEndpoints.forEach((endpoint, i) => {
    console.log(`${i + 1}. ${endpoint}`);
  });

  // Find incidents-related calls
  const incidentCalls = apiCalls.filter(c =>
    c.shortUrl.includes('incident') ||
    c.shortUrl.includes('event') ||
    c.shortUrl.includes('search')
  );

  if (incidentCalls.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCH/INCIDENT RELATED CALLS');
    console.log('='.repeat(60) + '\n');

    incidentCalls.forEach(call => {
      console.log(`${call.method} ${call.shortUrl}`);
      if (call.postData) {
        console.log(`Body: ${call.postData}`);
      }
      console.log();
    });
  }

  return { apiCalls, responses };
}

discoverAPI().catch(console.error);
