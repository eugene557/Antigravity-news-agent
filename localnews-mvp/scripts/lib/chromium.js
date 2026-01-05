import fs from 'fs';

export function findChromiumPath() {
    // Check environment variable first
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // Try to find in nix store FIRST (Railway/Nixpacks)
    try {
        const nixStore = fs.readdirSync('/nix/store');
        // Look for chromium directory (not sandbox, not unwrapped)
        const chromiumDirs = nixStore.filter(d =>
            d.includes('chromium-') &&
            !d.includes('sandbox') &&
            !d.includes('unwrapped') &&
            !d.includes('chromaprint')
        );
        for (const dir of chromiumDirs) {
            const binPath = `/nix/store/${dir}/bin/chromium`;
            if (fs.existsSync(binPath)) {
                return binPath;
            }
        }
    } catch (e) { /* ignore - not on nixpacks */ }

    // Fallback paths for non-Nix environments
    const possiblePaths = [
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }

    return null; // Let Puppeteer use its default
}

export function getPuppeteerLaunchOptions() {
    const executablePath = findChromiumPath();
    if (executablePath) {
        console.error(`Using Chromium at: ${executablePath}`);
    }
    return {
        headless: true,
        executablePath: executablePath || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
}
