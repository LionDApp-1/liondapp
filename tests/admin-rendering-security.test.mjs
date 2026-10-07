import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parseFragment } from 'parse5';

// Execute the real rendering code with synthetic API responses, then parse its
// HTML. No login, production data, browser automation or wallet is involved.
function consoleHarness(language = 'en', responses = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', innerHTML: '', textContent: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, setAttribute() {}, showModal() {}, close() {},
      querySelector: () => node(`${id}-child`),
    });
    return nodes.get(id);
  };
  const context = createContext({
    document: { getElementById: node, querySelectorAll: () => [], documentElement: {}, hidden: true },
    localStorage: { getItem: () => language }, navigator: { language },
    location: { hash: '', replace() {} }, history: { replaceState() {} },
    setInterval() {}, setTimeout() {}, URL, Intl, console,
    fetch: async path => ({ ok: true, headers: { get: () => 'application/json' },
      json: async () => path === '/api/admin/auth/status' ? { authenticated: false } : responses[path] ?? { items: [] } }),
  });
  runInContext(readFileSync('apps/admin/assets/admin.js', 'utf8'), context);
  return { node, run: source => runInContext(source, context) };
}

function safeTree(markup) {
  const tree = parseFragment(markup);
  const elements = [];
  function visit(n) {
    if (n.tagName) {
      elements.push(n);
      assert.ok(!['script', 'iframe', 'object', 'embed'].includes(n.tagName), `injected ${n.tagName}`);
      for (const a of n.attrs) {
        assert.ok(!/^on/i.test(a.name), `injected ${a.name}`);
        assert.notEqual(a.name, 'srcdoc');
        if (['href', 'src'].includes(a.name)) {
          assert.ok(['http:', 'https:'].includes(new URL(a.value, 'https://console.example.test').protocol));
        }
      }
    }
    for (const child of n.childNodes ?? []) visit(child);
  }
  visit(tree);
  return elements;
}

const payload = '\"><img src=x onerror="alert(1)"><script>alert(2)</script>&\'';

for (const language of ['en', 'zh']) {
  test(`admin ${language}: malicious project attributes and people counts stay text`, () => {
    const h = consoleHarness(language);
    const project = { id: payload, target_type: payload, title: payload, author_skr: payload,
      assignee: payload, stage: payload, stage_since: '2026-10-07T00:00:00Z' };
    const rows = h.run(`projectRows(${JSON.stringify([project])})`);
    const buttons = safeTree(rows).filter(n => n.tagName === 'button');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].attrs.find(a => a.name === 'data-project-type').value, payload);
    h.node('people-filter').value = 'all';
    h.run(`store.users = ${JSON.stringify([{ skr_domain: payload, locale: 'en', status: 'active',
      need_count: payload, work_count: payload, comment_count: payload }])}; renderPeople()`);
    const people = h.node('people-list').innerHTML;
    assert.equal(safeTree(people).filter(n => n.tagName === 'img').length, 0);
    assert.ok(people.includes('&lt;script&gt;'));
  });

  test(`admin ${language}: work, comment, report and promotion content cannot create markup`, () => {
    const work = { id: payload, name: payload, summary: payload, description: payload, author_skr: payload,
      category: payload, moderation_status: 'pending', demo_url: 'javascript:alert(1)',
      icon_key: payload, screenshots: [`uploads/test.skr/${payload}`] };
    const h = consoleHarness(language);
    h.node('work-filter').value = 'all';
    h.run(`store.works = ${JSON.stringify([work])}; renderWorks()`);
    safeTree(h.node('work-list').innerHTML);
    h.run(`openWork(${JSON.stringify(work)})`);
    const detail = safeTree(h.node('detail-body').innerHTML);
    assert.equal(detail.filter(n => n.tagName === 'a').length, 0);
    assert.equal(detail.filter(n => n.tagName === 'img').length, 2);
    assert.ok(h.node('detail-body').innerHTML.includes('&lt;script&gt;'));
    safeTree(h.node('detail-actions').innerHTML);
    h.run(`store.contentType='comments'; store.comments=${JSON.stringify([{ id: payload, body: payload,
      target_type: payload, author_skr: payload, like_count: payload }])}; renderContent()`);
    safeTree(h.node('content-list').innerHTML);
    h.node('report-filter').value = 'all';
    h.run(`store.reports=${JSON.stringify([{ id: payload, reason: payload, reporter_skr: payload,
      target_type: payload, target_id: payload, target_label: payload, details: payload, status: 'open' }])}; renderReports()`);
    safeTree(h.node('report-list').innerHTML);
    h.node('promotion-filter').value = 'all';
    h.run(`store.promotions=${JSON.stringify([{ work_name: payload, buyer_skr: payload, network: payload,
      token_amount: payload, status: payload }])}; renderPromotions()`);
    safeTree(h.node('promotion-list').innerHTML);
    safeTree(h.run(`table([${JSON.stringify(payload)}], [[${JSON.stringify(payload)}]])`));
  });

  test(`admin ${language}: overview, disputes and system lists safely render hostile API values`, async () => {
    const stamp = '2026-10-07T00:00:00Z';
    const h = consoleHarness(language, {
      '/api/admin/overview': { metrics: { pendingWorks: payload }, environment: payload, paymentMode: payload },
      '/api/admin/operations/summary': {
        operator: payload, generatedAt: stamp, totals: { total: 1 }, reports: { total: 1 },
        stages: [{ stage: 'new', count: payload }], projects: [], trend: [],
        owners: [{ assignee: payload, count: payload }],
      },
      '/api/admin/testing-reviews': { items: [{ id: payload, title: payload, app_name: payload,
        app_version: payload, tester_skr: payload, status: 'disputed', requirements: payload,
        body: payload, evidence_url: 'data:text/html,<script>alert(1)</script>',
        review_reason: payload, appeal_reason: payload }] },
      '/api/admin/config': { priceSkr: 10 },
      '/api/admin/store-catalog/status': { active: payload, total: payload, translated: payload,
        translation_budget: { calls: payload, limit: payload, resets_at: stamp } },
      '/api/admin/announcements': { items: [{ id: payload, title_en: payload, title_zh: payload }] },
      '/api/admin/moderation-events': { items: [{ identity_skr: payload, surface: payload, category: payload }] },
      '/api/admin/audit': { items: [{ actor: payload, action: payload, target_type: payload, target_id: payload }] },
    });
    await h.run('loadOverview()');
    for (const id of ['metric-grid', 'ops-summary', 'stage-board', 'attention-list', 'project-board',
      'project-trend', 'owner-workload', 'platform-status']) {
      assert.ok(h.node(id).innerHTML.length > 0, id);
      safeTree(h.node(id).innerHTML);
    }
    await h.run('loadTesting()');
    assert.ok(h.node('testing-list').innerHTML.includes('&lt;script&gt;'));
    assert.equal(safeTree(h.node('testing-list').innerHTML).filter(n => n.tagName === 'a').length, 0);
    await h.run('loadSystem()');
    for (const id of ['catalog-status', 'announcement-list', 'moderation-list', 'audit-list']) {
      assert.ok(h.node(id).innerHTML.length > 0, id);
      safeTree(h.node(id).innerHTML);
    }
  });
}
