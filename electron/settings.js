const desktop = window.softieDesktop;
const content = document.querySelector('#settings-content');
const title = document.querySelector('#settings-title');
const close = document.querySelector('#close');

function commandButton(item, className = 'choice') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = item.label;
  if (item.type === 'radio' || item.type === 'checkbox') {
    button.setAttribute('aria-pressed', String(Boolean(item.checked)));
  }
  button.addEventListener('click', () => desktop.send('softie:settings-command', { id: item.id }));
  return button;
}

function render(payload) {
  const template = Array.isArray(payload?.template) ? payload.template : [];
  const settingsItem = template.find(item => item?.id === 'settings');
  const language = payload?.state?.language === 'en' ? 'en' : 'zh';
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  title.textContent = settingsItem?.label || (language === 'en' ? 'Settings' : '设置');
  close.setAttribute('aria-label', language === 'en' ? 'Close' : '关闭');
  content.replaceChildren();

  for (const item of template) {
    if (!item || item.type === 'separator' || item.id === 'settings' || item.id === 'quit') continue;
    if (Array.isArray(item.submenu)) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      const choices = document.createElement('div');
      heading.textContent = item.label;
      choices.className = 'choices';
      for (const child of item.submenu) {
        if (child?.id) choices.append(commandButton(child));
      }
      section.append(heading, choices);
      content.append(section);
    } else if (item.type === 'checkbox') {
      const section = document.createElement('section');
      section.className = 'toggle-row';
      const heading = document.createElement('h2');
      heading.textContent = item.label;
      section.append(heading, commandButton(item));
      content.append(section);
    }
  }

  const actions = template.filter(item => item?.id === 'poke' || item?.id === 'reset');
  if (actions.length) {
    const section = document.createElement('section');
    section.className = 'actions';
    for (const action of actions) section.append(commandButton(action, 'action'));
    content.append(section);
  }
}

desktop.on('softie:settings-state', render);
desktop.send('softie:settings-ready');
close.addEventListener('click', () => desktop.send('softie:settings-close'));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') desktop.send('softie:settings-close');
});
