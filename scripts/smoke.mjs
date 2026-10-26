import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

// Fixtures existem apenas neste teste. A aplicação sempre consulta a fonte real.
const fixtures = Array.from({ length: 12 }, (_, index) => ({
  id: `test-${index}`, title: index % 2 ? `Product Designer ${index}` : `Software Engineer ${index}`,
  company: `Empresa de teste ${index}`, location: index % 2 ? 'Lisboa' : 'São Paulo',
  remote: index % 2 === 0, tags: [index % 2 ? 'Design' : 'Engineering'], types: ['Full time'],
  description: 'Descrição simulada exclusivamente para testes da interface.',
  url: `https://www.arbeitnow.com/jobs/test-${index}`, publishedAt: new Date(Date.now() - index * 86400000).toISOString(),
}));
const payload = { jobs: fixtures, source: 'Arbeitnow', updatedAt: new Date().toISOString(), stale: false };
const base = process.env.BASE_URL || 'http://127.0.0.1:3187';
let server;
let browser;
try {
  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, ['--use-env-proxy', 'server/index.js', '--production'], { env: { ...process.env, PORT: '3187' }, stdio: 'inherit' });
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error('Servidor encerrou antes de iniciar. Execute npm run build.');
      try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* aguardar inicialização */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Servidor deve iniciar');
  }
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/jobs', route => route.fulfill({ json: payload }));
  await page.goto(base);
  await page.locator('.job-card').first().waitFor();
  assert.equal(await page.locator('.job-card').count(), 9);
  await page.getByRole('button', { name: /Mostrar mais oportunidades/ }).click();
  assert.equal(await page.locator('.job-card').count(), 12);
  await page.getByRole('textbox', { name: 'Cargo, empresa ou palavra-chave' }).fill('software');
  await page.getByRole('textbox', { name: 'Cidade ou país' }).fill('sao paulo');
  await page.getByRole('button', { name: 'Encontrar vagas' }).click();
  assert.equal(await page.locator('.job-card').count(), 6);
  await page.getByRole('checkbox', { name: 'Apenas vagas remotas' }).check();
  assert.equal(await page.locator('.job-card').count(), 6);
  const save = page.getByRole('button', { name: 'Salvar vaga: Software Engineer 0', exact: true });
  await save.click();
  await page.reload();
  await page.getByRole('button', { name: /Favoritas/ }).click();
  assert.equal(await page.locator('.job-card').count(), 1);
  await page.getByRole('button', { name: 'Ver oportunidade' }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Candidatar na Arbeitnow' }).getAttribute('href'), fixtures[0].url);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Remover dos favoritos: Software Engineer 0' }).click();
  await page.getByRole('heading', { name: 'Seu próximo passo pode começar com um favorito.' }).waitFor();
  await page.getByRole('button', { name: 'Explorar vagas', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Cargo, empresa ou palavra-chave' }).fill('termo-sem-resultados-xyz');
  await page.getByRole('button', { name: 'Encontrar vagas' }).click();
  await page.getByRole('heading', { name: 'Vamos tentar um novo caminho?' }).waitFor();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  const desktopAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(desktopAxe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], 'Acessibilidade desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Filtrar oportunidades' }).click();
  await page.getByRole('checkbox', { name: 'Apenas vagas remotas' }).check();
  assert.equal(await page.locator('.job-card').count(), 6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const mobileAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(mobileAxe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], 'Acessibilidade mobile');
  await page.unroute('**/api/jobs');
  let fails = true;
  await page.route('**/api/jobs', route => fails ? route.fulfill({ status: 502, json: { error: 'Fonte indisponível no teste' } }) : route.fulfill({ json: payload }));
  await page.reload();
  await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
  assert.equal(await page.locator('.job-card').count(), 0);
  fails = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.locator('.job-card').first().waitFor();
  assert.equal(await page.locator('.job-card').count(), 9);
  assert.deepEqual(errors, []);
  console.log('PASS: busca, filtros, paginação, favoritos persistentes, detalhes, candidatura, estados vazio/erro/recuperação, mobile e acessibilidade automática. Dados simulados apenas neste teste.');
} finally {
  await browser?.close();
  if (server) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
}
