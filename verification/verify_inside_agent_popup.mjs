import { chromium } from '/Users/clawd57/.hermes/hermes-agent/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'file:///Users/clawd57/private-dashboard/ops-demo.html';
const out = process.argv[3] || '/Users/clawd57/private-dashboard/verification/inside-agent-local';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

async function visibleWithinViewport(locator, page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
}

for (const viewport of [{width:1365,height:871},{width:1440,height:900},{width:390,height:844},{width:320,height:568}]) {
  const page = await browser.newPage({ viewport });
  const errors = [], requests = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.goto(target, { waitUntil: 'load' });
  const agentResults = [];
  const cards = page.locator('.agent[data-agent]');
  for (let i = 0; i < await cards.count(); i++) {
    const card = cards.nth(i);
    const id = await card.getAttribute('data-agent');
    await card.click();
    const agentOpen = await page.locator('#agentModal').evaluate(e => e.open);
    await page.locator('#agentFilesBtn').click();
    const filesOpen = await page.locator('#filesModal').evaluate(e => e.open);
    const agentStillOpen = await page.locator('#agentModal').evaluate(e => e.open);
    const closeVisible = await visibleWithinViewport(page.locator('#filesModal .close'), page);
    const fileButtons = page.locator('#operatingFiles .operating-file');
    const fileCount = await fileButtons.count();
    if (fileCount > 1) {
      await fileButtons.nth(fileCount - 1).click();
      await fileButtons.nth(1).click();
    }
    await page.locator('#filesModal .close').click();
    const restoredAgentOpen = await page.locator('#agentModal').evaluate(e => e.open);
    const focusedOperatingFiles = await page.evaluate(() => document.activeElement?.id === 'agentFilesBtn');
    const cardExpandedWhileAgentOpen = await card.getAttribute('aria-expanded');
    agentResults.push({id,agentOpen,filesOpen,agentStillOpen,closeVisible,fileCount,restoredAgentOpen,focusedOperatingFiles,cardExpandedWhileAgentOpen});
    if (restoredAgentOpen) await page.locator('#agentModal .close').click();
  }
  await page.locator('#insideBtn').click();
  const insideOpen = await page.locator('#insideModal').evaluate(e => e.open);
  const insideCloseVisible = await visibleWithinViewport(page.locator('#insideModal .close'), page);
  const inside = await page.locator('#insideModal .inside-panel').evaluate(e => ({scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflowY:getComputedStyle(e).overflowY}));
  await page.locator('#insideModal .file-node').nth(1).click();
  await page.locator('#insideModal .file-node').nth(4).click();
  await page.locator('#insideModal .close').click();
  const insideFocusRestored = await page.evaluate(() => document.activeElement?.id === 'insideBtn');
  await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}.png`),fullPage:true});
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const external = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('https://jmg424.github.io/private-dashboard/ops-demo.html'));
  const pass = agentResults.every(r => r.agentOpen && r.filesOpen && r.agentStillOpen && r.closeVisible && r.fileCount >= 5 && r.restoredAgentOpen && r.focusedOperatingFiles && r.cardExpandedWhileAgentOpen === 'true') && insideOpen && insideCloseVisible && insideFocusRestored && !horizontalOverflow && errors.length === 0 && external.length === 0;
  results.push({viewport,agentResults,insideOpen,insideCloseVisible,inside,insideFocusRestored,horizontalOverflow,errors,external,pass});
  await page.close();
}
await browser.close();
const receipt={target,results,pass:results.every(r=>r.pass)};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));
if(!receipt.pass) process.exit(1);
