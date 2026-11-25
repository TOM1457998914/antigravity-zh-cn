(() => {
  'use strict';

  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const automationRoute = /^\/(?:sidecars|automations?)(?:\/|$)/i;
  const marketplaceRoute = /^\/customizations(?:\/(?!installed(?:\/|$))[^/].*)?\/?$/i;
  const formNameSelector = 'input[placeholder="Untitled"], input[placeholder="未命名"], input[aria-label="Name"], input[aria-label="名称"]';
  const timeSelector = '[aria-label="Time"], [aria-label="时间"]';
  const automationInstructions = 'textarea, [role="textbox"][contenteditable]';
  const marketNavigation = '[aria-label="Customizations views"], [aria-label="自定义项视图"]';
  const marketSearch = 'input[placeholder="Search customizations..."], input[placeholder="搜索自定义项..."]';
  const excluded = 'input, textarea, script, style, pre, code, svg, aside, nav, [contenteditable="true"], [role="navigation"], [data-sidebar-scroll-container="true"]';
  const fields = new Map([
    ['title', '名称'], ['name', '名称'], ['instructions', '指令'],
    ['prompt', '提示词'], ['schedule', '计划'], ['time', '时间'],
    ['trigger', '触发器'], ['timezone', '时区'], ['timeZone', '时区']
  ]);
  const labels = new Map([
    ['Required', '必填'], ['Untitled', '未命名'],
    ['Name', '名称'], ['Time', '时间'],
    ['Schedule', '计划'], ['Scheduled', '定时'],
    ['Time zone', '时区'], ['Time Zone', '时区'],
    ['Monday', '星期一'], ['Tuesday', '星期二'],
    ['Wednesday', '星期三'], ['Thursday', '星期四'],
    ['Friday', '星期五'], ['Saturday', '星期六'], ['Sunday', '星期日']
  ]);
  const marketplaceLabels = new Map([
    ['Featured', '精选'],
    ['See all', '查看全部'],
    ['Plugins in Featured', '精选插件'],
    ['Build applications and shell workflows with the Gemini Interactions API, Decisions API, Live API, Genie 4 interactive worlds, and Gemini API CLI, including text, image, video, speech, and music generation, managed agents, and real-time multimodal streaming.', '使用 Gemini Interactions API、Decisions API、Live API、Genie 4 交互世界和 Gemini API CLI 构建应用和命令行工作流，支持文本、图像、视频、语音和音乐生成、托管智能体以及实时多模态流式传输。'],
    ['Agent skills, databases, and interactive viewers for scientific research.', '提供面向科学研究的智能体技能、数据库和交互式查看器。'],
    ['Antigravity for science highlights, and an overview of the main science plugins.', '了解 Antigravity 在科学研究中的主要功能和常用科学插件。'],
    ['AlphaGenome and major genetics databases to analyze DNA variants, gene regulation, and links between genes and disease.', '借助 AlphaGenome 和主要遗传学数据库分析 DNA 变异、基因调控以及基因与疾病的关联。'],
    ['AlphaFold, 3D visualization tools, and protein databases to explore protein structures, sequences, pathways, and drug interactions.', '使用 AlphaFold、3D 可视化工具和蛋白质数据库探索蛋白质结构、序列、相关通路和药物相互作用。'],
    ['Search scientific papers, clinical trials, FDA records, and historical texts.', '搜索科学论文、临床试验、美国食品药品监督管理局记录和历史文献。'],
    ['RDKit cheminformatics, reaction and property tools, plus ChEMBL and PubChem, to work with molecules, their properties, and bioactivity data.', '结合 RDKit 化学信息学及反应和性质分析工具、ChEMBL 与 PubChem，处理分子结构、分子性质及生物活性数据。'],
    ['Connect Antigravity to your ClickUp workspace — manage tasks, track time, and collaborate with your team without switching context.', '将 Antigravity 连接到 ClickUp 工作区，在当前界面中管理任务、记录用时并与团队协作。'],
    ['Build, test, and debug Docusign integrations with developer skills for authentication, template-based signing, envelope status, and troubleshooting.', '使用开发技能构建、测试与调试 Docusign 集成，涵盖身份验证、基于模板的签署、信封状态及故障排查。'],
    ['Add authentication and user management with Clerk. Skills for setup, frameworks, organizations, billing, webhooks, and testing, plus the Clerk MCP server.', '使用 Clerk 添加身份验证和用户管理。提供安装配置、框架集成、组织管理、计费、Webhook 和测试等技能，以及 Clerk MCP 服务器。'],
    ["Salaries, jobs & career advice. Levels.fyi is your career companion to ensure you get paid fairly and find jobs you'll love.", '查看薪酬、职位和职业建议。Levels.fyi 帮助你争取合理薪酬并找到心仪的工作。'],
    ['Build, test, and manage n8n workflows and Agents through your instance MCP server. Use official skills for node setup, credentials, and debugging.', '通过你部署的 MCP 服务器构建、测试和管理 n8n 工作流和智能体。使用官方技能配置节点和凭据并进行调试。'],
    ['Read-only marketing analytics: report spend, conversions, CPA and ROAS across ad platforms, GA4 and Search Console. It never changes your accounts.', '以只读方式分析营销数据，汇总广告平台、GA4 和 Search Console 的支出、转化量、单次转化费用及广告支出回报率。此功能不会修改账号。'],
    ['Search European procurement data and manage your tender pipeline.', '搜索欧洲采购数据并管理投标进度。'],
    ['Research U.S. case law, statutes, regulations, and court rules. Find authorities, check quotations against opinions, and see how later courts cite a case.', '研究美国判例法、成文法、法规和法院规则。查找法律依据，对照判决意见核实引文，了解后续法院如何引用有关案件。'],
    ['Generate images and V4 videos with Kling AI. Supports multimodal references, reusable subjects, motion control, and task tracking through secure OAuth.', '使用可灵 AI 生成图像和 V4 视频。支持多模态参考、主体复用、运动控制，以及通过 OAuth 安全授权跟踪任务。']
  ]);
  const tiers = new Map([
    ['Low', '低'], ['Medium', '中'], ['High', '高'],
    ['Max', '最高'], ['Extra High', '极高'], ['Very High', '极高']
  ]);
  const observeOptions = {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title']
  };

  function chineseClock(source) {
    const time = /^(\d{1,2}):([0-5]\d)\s*([AP])\.?M\.?$/i.exec(source);
    if (!time || +time[1] < 1 || +time[1] > 12) return source;
    const hour = +time[1] % 12 + (time[3].toUpperCase() === 'P' ? 12 : 0);
    return String(hour).padStart(2, '0') + ':' + time[2];
  }

  function automationText(source, parent) {
    if (source === 'at') {
      // Only translate the connector beside the time chooser in the schedule row.
      const row = parent.parentElement;
      return row?.querySelector(timeSelector) ? '于' : source;
    }
    const timeOption = parent.closest(timeSelector + ', [role="option"], [role="menuitem"]');
    if (timeOption) {
      const time = chineseClock(source);
      if (time !== source) return time;
    }
    const validation = /^(执行[“"「]创建[”"」]所需的条件[：:]\s*)([\w, ]+)$/u.exec(source);
    if (validation) {
      const names = validation[2].split(/\s*,\s*/);
      if (names.every(name => fields.has(name))) return validation[1] + names.map(name => fields.get(name)).join('、');
    }
    if (/^((?:Gemini|Claude|GPT|Orchestrator)\b.*?)(?: \((Low|Medium|High|Very High|Extra High|Max)\)| (Low|Medium|High|Very High|Extra High|Max))$/.test(source)) {
      return source.replace(/(?: \((Low|Medium|High|Very High|Extra High|Max)\)| (Low|Medium|High|Very High|Extra High|Max))$/, (_m, paren, plain) => '（' + tiers.get(paren || plain) + '）');
    }
    return labels.get(source) ?? source;
  }

  function marketText(source, node) {
    if (source === 'Featured' && node.closest('a, h1, h2, h3, h4, [role="heading"]')) return source;
    if (source.startsWith('Build applications and shell workflows with the Gemini')) {
      const match = /^Build applications and shell workflows with the (Gemini(?: [A-Z][\w-]+){1,5})\.?$/.exec(source);
      if (match) return '使用 ' + match[1] + ' 构建应用和命令行工作流。';
    }
    return marketplaceLabels.get(source) ?? source;
  }

  function replaceAttribute(element, name, transform) {
    const value = element.getAttribute(name);
    if (!value) return;
    const translation = transform(value);
    if (translation !== value) element.setAttribute(name, translation);
  }

  function translateText(root, transform) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded)) continue;
      const source = node.nodeValue.trim();
      if (!source || !/[A-Za-z]/.test(source)) continue;
      const translation = transform(source, parent);
      if (translation !== source) {
        const start = node.nodeValue.indexOf(source);
        node.nodeValue = node.nodeValue.slice(0, start) + translation + node.nodeValue.slice(start + source.length);
      }
    }
  }

  function formRoot() {
    for (const name of document.querySelectorAll(formNameSelector)) {
      for (let scope = name.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
        if (scope.querySelector(automationInstructions) && scope.querySelector(timeSelector)) return scope;
      }
    }
    return null;
  }

  function marketRoot() {
    const main = document.querySelector('main, [role="main"]');
    if (main) return main;
    const search = document.querySelector(marketSearch);
    if (!search) return null;
    for (let scope = search.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
      if (scope.querySelector(marketNavigation) && scope.querySelector('[role="tab"], [aria-label="Featured"], [aria-label="精选"]')) return scope;
    }
    return null;
  }

  function translate() {
    const currentPath = document.location.pathname;
    const isAutomation = automationRoute.test(currentPath);
    const isMarketplace = marketplaceRoute.test(currentPath);
    if (!isAutomation && !isMarketplace) return;
    const form = isAutomation ? formRoot() : null;
    if (form) {
      translateText(form, automationText);
      for (const element of form.querySelectorAll('[placeholder], [aria-label], [title]')) {
        for (const name of ['placeholder', 'aria-label', 'title']) {
          replaceAttribute(element, name, value => automationText(value, element));
        }
      }
    }
    if (isAutomation) {
      // Base UI places expanded time and model menus in body-level portals.
      for (const menu of document.querySelectorAll('[role="listbox"], [role="menu"]')) translateText(menu, automationText);
    }
    if (!isMarketplace) return;
    const market = marketRoot();
    if (!market) return;
    translateText(market, marketText);
    for (const element of market.querySelectorAll('[aria-label], [title]')) {
      if (element.closest(excluded)) continue;
      for (const name of ['aria-label', 'title']) {
        replaceAttribute(element, name, value => {
          const install = /^Install\s+(.+)$/u.exec(value);
          return install ? '安装 ' + install[1] : marketText(value, element);
        });
      }
    }
  }

  function start() {
    let framePending = false;
    const queue = () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        translate();
      });
    };
    new MutationObserver(queue).observe(document.body, observeOptions);
    window.addEventListener('popstate', queue);
    queue();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
