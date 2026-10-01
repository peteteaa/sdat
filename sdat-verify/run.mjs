import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('pageerror', e => console.log('pageerror:', e.message));
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 3000));
await p.screenshot({ path: 'd0.png' });
await p.keyboard.press('ArrowRight');
await new Promise(r => setTimeout(r, 300));
await p.screenshot({ path: 'd1.png' });
await new Promise(r => setTimeout(r, 4000));
await p.screenshot({ path: 'd2.png' });
await b.close();
