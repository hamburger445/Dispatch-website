export default async function run(page, ui) {
  const out = { steps: [] };
  await page.addInitScript(() => {
    window.__errs = [];
    window.addEventListener('error', e => window.__errs.push('ERR ' + e.message));
    window.addEventListener('unhandledrejection', e => window.__errs.push('REJ ' + (e.reason && e.reason.message || e.reason)));
  });
  await page.waitForSelector('.login-card', { timeout: 10000 });
  await page.evaluate(() => {
    window.__origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await window.__origFetch(...args);
      if (String(args[0]).includes('/api/auth/login')) {
        const clone = res.clone();
        window.__loginBody = await clone.text().catch(() => 'unreadable');
      }
      return res;
    };
  });
  await page.fill('.login-card input >> nth=0', 'dispatch01');
  await page.fill('.login-card input >> nth=1', 'dispatch123');
  await page.click('.login-card .btn');
  await page.waitForTimeout(4000);
  out.steps.push('after login click');
  out.errs = await page.evaluate(() => window.__errs || []);
  out.rootLen = await page.evaluate(() => document.getElementById('root').innerHTML.length);
  out.rootText = await page.evaluate(() => document.getElementById('root').innerText.slice(0, 300));
  out.token = await page.evaluate(() => !!localStorage.getItem('cad_token'));
  out.loginBody = await page.evaluate(() => window.__loginBody || 'not captured').catch(e => 'evalfail: ' + e.message);
  return out;
}
