(() => {
  'use strict';

  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  const button = ':is(button, [role="button"])';
  const locationPrefix = 'Where the agent runs, current: ';
  const locationControl = `:is(button, [role="button"], [role="combobox"])[aria-label^="${locationPrefix}"]`;
  const composer = ':is([contenteditable]:not([contenteditable="false"]), [data-lexical-editor="true"], textarea)[aria-label="Message input"]';
  const detailsPrefix = 'Details for ';
  const marketDetails = `:is(a[href], [role="link"])[aria-label^="${detailsPrefix}"]`;
  const actionsPrefix = 'More actions for ';
  const pluginActions = `${button}[aria-label^="${actionsPrefix}"]`;
  const marketRoute = /^\/customizations(?:\/|$)/i;
  const installedRoute = /^\/customizations\/installed\/?$/i;
  const swarmRoute = /^\/customizations\/plugins\/swarm\/?$/i;
  const swarmDescription = "Live view of the native swarm board, roster and @mention graph for the current conversation's swarm.";
  const translatedSwarmDescription = '实时查看当前对话的 Swarm 原生看板、成员名单和 @提及关系图。';
  const swarmAttributes = ['aria-label', 'aria-description', 'title'];
  const swarmLabels = swarmAttributes.map(attribute => '[' + attribute + ']').join(', ');
  const swarmText = 'h1, h2, h3, h4, [role="heading"], p, span, div';
  const protectedContent = 'pre, code, .monaco-editor, .xterm, .markdown, .markdown-body, .user-message, [data-testid="user-message-content"], [data-testid*="message-content"]';
  const controls = `${locationControl}, ${composer}, ${marketDetails}, ${pluginActions}`;

  function translateControl(element) {
    if (!element.matches(controls) || element.closest(protectedContent)) return;

    const label = element.getAttribute('aria-label');
    if (element.matches(composer)) {
      element.setAttribute('aria-label', '消息输入框');
      return;
    }
    if (element.matches(marketDetails)) {
      const productName = label.slice(detailsPrefix.length);
      if (marketRoute.test(document.location.pathname) && productName.trim()) {
        element.setAttribute('aria-label', '查看 ' + productName + ' 详情');
      }
      return;
    }
    if (element.matches(pluginActions)) {
      const pluginName = label.slice(actionsPrefix.length);
      const route = document.location.pathname;
      if ((installedRoute.test(route) || swarmRoute.test(route)) && pluginName.trim()) {
        element.setAttribute('aria-label', pluginName + ' 的更多操作');
      }
      return;
    }

    const location = label.slice(locationPrefix.length);
    element.setAttribute('aria-label', '智能体运行位置，当前为：' + (location === 'This Computer' ? '本机' : location));
  }

  function translateSwarmText(node) {
    const parent = node.parentElement;
    if (!parent || !parent.matches(swarmText) || parent.closest(protectedContent)) return;
    const text = node.data.trim();
    if (text === swarmDescription || text === 'Description: ' + swarmDescription) {
      node.data = node.data.replace(text, translateSwarmDescription(text));
    }
    if (text === 'Swarm Plugin' && parent.matches('h1, h2, h3, h4, [role="heading"]')) {
      node.data = node.data.replace(text, 'Swarm 插件');
    }
  }

  function translateSwarmDescription(text) {
    return text.replaceAll('Description: ' + swarmDescription, '说明：' + translatedSwarmDescription)
      .replaceAll(swarmDescription, translatedSwarmDescription);
  }

  function translateSwarmLabels(element) {
    if (element.closest(protectedContent)) return;
    for (const attribute of swarmAttributes) {
      const label = element.getAttribute(attribute);
      if (!label?.includes(swarmDescription)) continue;
      element.setAttribute(attribute, translateSwarmDescription(label));
    }
  }

  function translateAddedControls(root, onSwarmDetail) {
    if (root.nodeType === Node.ELEMENT_NODE) {
      translateControl(root);
      root.querySelectorAll(controls).forEach(translateControl);
      if (onSwarmDetail) {
        translateSwarmLabels(root);
        root.querySelectorAll(swarmLabels).forEach(translateSwarmLabels);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) translateSwarmText(node);
      }
    }
    if (onSwarmDetail && root.nodeType === Node.TEXT_NODE) translateSwarmText(root);
  }

  function start() {
    translateAddedControls(document.body, swarmRoute.test(document.location.pathname));
    new MutationObserver(records => {
      const onSwarmDetail = swarmRoute.test(document.location.pathname);
      for (const record of records) {
        if (record.type === 'attributes') {
          translateControl(record.target);
          if (onSwarmDetail) translateSwarmLabels(record.target);
        } else if (record.type === 'characterData') {
          if (onSwarmDetail) translateSwarmText(record.target);
        } else {
          record.addedNodes.forEach(node => translateAddedControls(node, onSwarmDetail));
        }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: swarmAttributes,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
