(() => {
  const root = document.documentElement;
  let language = 'en';
  try { language = localStorage.getItem('liondapp-language') === 'zh' ? 'zh' : 'en'; } catch {}
  const t = (en, zh) => language === 'zh' ? zh : en;
  const toggle = document.querySelector('[data-language-toggle]');
  let catalogItems = [], catalogState = 'idle', serviceState = null;
  const setLanguage = () => {
    root.dataset.language = language; root.lang = language === 'zh' ? 'zh-CN' : 'en';
    if (toggle) { toggle.textContent = language === 'zh' ? 'English' : '中文'; toggle.setAttribute('aria-label', t('Switch to Chinese', '切换到英文')); }
    const query = document.querySelector('#catalog-query');
    if (query) query.placeholder = t('Search dApps…', '搜索 dApp…');
    renderCatalog(); updateCalculator(); renderService();
  };
  toggle?.addEventListener('click', () => { language = language === 'en' ? 'zh' : 'en'; try { localStorage.setItem('liondapp-language', language); } catch {} setLanguage(); });
  const units = value => {
    if (!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(value)) throw new Error('amount');
    const [whole, fraction = ''] = value.split('.');
    const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6,'0'));
    if (amount <= 0n || amount > 100000000000n) throw new Error('amount');
    return amount;
  };
  const format = value => {
    const whole = value / 1000000n, fraction = (value % 1000000n).toString().padStart(6,'0').replace(/0+$/, '');
    return whole.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') + (fraction ? '.' + fraction : '') + ' SKR';
  };
  function updateCalculator() {
    const count = document.querySelector('#tester-count'), reward = document.querySelector('#tester-reward');
    if (!count || !reward) return;
    const error = document.querySelector('#calculator-error');
    try {
      if (!/^[1-9]\d{0,3}$/.test(count.value) || Number(count.value)>1000) throw new Error('count');
      const amount = units(reward.value.trim()), people = BigInt(count.value);
      const pool = amount * people, fee = ((amount + 9n) / 10n) * people;
      document.querySelector('#reward-pool').textContent = format(pool);
      document.querySelector('#platform-fee').textContent = format(fee);
      document.querySelector('#total-deposit').textContent = format(pool + fee);
      error.textContent = ''; count.setAttribute('aria-invalid', 'false'); reward.setAttribute('aria-invalid','false');
    } catch (e) {
      for (const id of ['reward-pool','platform-fee','total-deposit']) document.getElementById(id).textContent = '—';
      const isCount = e.message === 'count';
      error.textContent = isCount ? t('Enter 1–1,000 testers.', '请输入 1 至 1,000 名测试者。') : t('Enter a reward greater than 0, up to 100,000 SKR, with no more than 6 decimals.', '奖励须大于 0、不超过 100,000 SKR，最多 6 位小数。');
      count.setAttribute('aria-invalid', String(isCount)); reward.setAttribute('aria-invalid', String(!isCount));
    }
  }
  document.querySelector('#reward-calculator')?.addEventListener('submit', e => e.preventDefault());
  document.querySelector('#reward-calculator')?.addEventListener('input', updateCalculator);
  const results = document.querySelector('#catalog-results'), status = document.querySelector('#catalog-status'), retry = document.querySelector('#catalog-retry');
  function renderCatalog() {
    if (!results) return;
    results.replaceChildren(); results.setAttribute('aria-busy',String(catalogState === 'loading'));
    retry.hidden = catalogState !== 'error';
    status.textContent = catalogState === 'loading' ? t('Searching the Store catalog…', '正在搜索商店目录…') : catalogState === 'error' ? t('The catalog is unavailable. Please retry.', '目录暂时无法加载，请重试。') : catalogState === 'ready' && !catalogItems.length ? t('No matching dApps. Try a different name or keyword.', '未找到匹配应用，请更换名称或关键词。') : '';
    if (catalogState !== 'ready') return;
    for (const app of catalogItems) {
      const card = document.createElement('article'); card.className = 'catalog-card';
      const title = document.createElement('div'); title.className='catalog-title';
      const avatar = document.createElement('span'); avatar.className='catalog-avatar'; avatar.setAttribute('aria-hidden','true'); avatar.textContent = String(app.name || '?').slice(0,1).toUpperCase();
      const heading = document.createElement('div');
      const name = document.createElement('h3'); name.textContent = app.name;
      const category = document.createElement('small'); category.textContent = language === 'zh' ? app.categoryZh || app.category || 'dApp' : app.category || 'dApp';
      heading.append(name,category); title.append(avatar,heading);
      const subtitle = document.createElement('p'); subtitle.textContent = (language === 'zh' ? app.subtitleZh || app.subtitle : app.subtitle) || app.publisher || t('Listed in the Solana dApp Store.','来自 Solana dApp Store。');
      const packageLabel = document.createElement('p'); packageLabel.className='package';packageLabel.textContent=app.package;
      const link = document.createElement('a'); link.className='text-link'; link.href='solanadappstore://details?id='+encodeURIComponent(app.package); link.textContent=t('Open on Seeker ↗','在 Seeker 上打开 ↗');
      card.append(title,subtitle,packageLabel,link); results.append(card);
    }
  }
  let searchGeneration = 0, controller;
  async function searchCatalog() {
    if (!results) return;
    const generation=++searchGeneration; controller?.abort(); controller=new AbortController();
    catalogState='loading'; renderCatalog();
    const currentController=controller,timeout=setTimeout(()=>currentController.abort(),12000);
    try {
      const q = document.querySelector('#catalog-query').value.trim();
      const response=await fetch('/api/catalog?q='+encodeURIComponent(q),{signal:controller.signal,credentials:'omit'});
      if(!response.ok)throw new Error('unavailable');
      const body=await response.json(); if(!Array.isArray(body.items))throw new Error('invalid');
      if(generation!==searchGeneration)return;
      catalogItems=body.items;catalogState='ready';
    } catch { if(generation===searchGeneration)catalogState='error'; }
    finally { clearTimeout(timeout);if(generation===searchGeneration)renderCatalog(); }
  }
  document.querySelector('#catalog-search')?.addEventListener('submit', e => {e.preventDefault();searchCatalog();});
  retry?.addEventListener('click',searchCatalog);
  function renderService() {
    const node=document.querySelector('#service-status');if(!node)return;
    node.textContent = serviceState === null ? t('Checking service status…','正在检查服务状态…') : serviceState.available ? t('API online · check the app for current campaign availability.','API 在线 · 活动开放状态以应用内显示为准。') : t('Service status unavailable. Contact support if you need help.','暂无法读取服务状态，可联系支持获取帮助。');
  }
  setLanguage();
  if(results)searchCatalog();
  if(document.querySelector('#service-status')) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    fetch('/api/status',{credentials:'omit',signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();serviceState=await r.json();}).catch(()=>{serviceState={available:false};}).finally(()=>{clearTimeout(timeout);renderService();});
  }
})();
