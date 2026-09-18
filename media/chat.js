// @ts-nocheck
(function () {
  const vscode = acquireVsCodeApi();

  // DOM 元素
  const messagesContainer = document.getElementById('messages-container');
  const emptyState = document.getElementById('empty-state');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const sendBtnIcon = document.getElementById('send-btn-icon');
  const modelSelect = document.getElementById('model-select');
  const searchCheckbox = document.getElementById('search-checkbox');
  const engineTag = document.getElementById('engine-tag');
  const tokenAlert = document.getElementById('token-alert');
  const captchaAlert = document.getElementById('captcha-alert');
  const contextBar = document.getElementById('context-bar');
  const contextTagText = document.getElementById('context-tag-text');
  const btnRemoveContext = document.getElementById('btn-remove-context');
  const skillsPopup = document.getElementById('skills-popup');

  // Header 按钮
  const btnNewChat = document.getElementById('btn-new-chat');
  const btnExport = document.getElementById('btn-export');
  const btnClaudeToggle = document.getElementById('btn-claude-toggle');
  const claudeIcon = document.getElementById('claude-icon');
  const btnSettings = document.getElementById('btn-settings');
  const btnAlertOpenWeb = document.getElementById('btn-alert-open-web');
  const btnAlertSetToken = document.getElementById('btn-alert-set-token');
  const btnCaptchaOpen = document.getElementById('btn-captcha-open');
  const btnCaptchaResume = document.getElementById('btn-captcha-resume');

  // 状态变量
  let isGenerating = false;
  let attachedContext = null;
  let currentAssistantBubble = null;
  let currentThinkingCard = null;
  let currentThinkingContent = null;
  let currentTextContent = null;
  let currentSpeedTag = null;
  let thinkingStartTime = null;
  let fullReasoningText = '';
  let fullMarkdownText = '';
  let availableSkills = [];
  let selectedSkillIndex = 0;

  // 初始化
  vscode.postMessage({ command: 'ready' });

  // 自动调整输入框高度
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    handleSlashCommand();
  });

  // 快捷键发送 (Enter 发送, Shift+Enter 换行)
  chatInput.addEventListener('keydown', (e) => {
    if (skillsPopup.classList.contains('active')) {
      const items = skillsPopup.querySelectorAll('.skill-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSkillIndex = (selectedSkillIndex + 1) % items.length;
        updateSkillSelection(items);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSkillIndex = (selectedSkillIndex - 1 + items.length) % items.length;
        updateSkillSelection(items);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[selectedSkillIndex]) {
          items[selectedSkillIndex].click();
        }
        return;
      }
      if (e.key === 'Escape') {
        skillsPopup.classList.remove('active');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 发送按钮点击
  sendBtn.addEventListener('click', () => {
    if (isGenerating) {
      vscode.postMessage({ command: 'stopGeneration' });
      setGenerating(false);
    } else {
      sendMessage();
    }
  });

  // 快捷提示词点击
  document.querySelectorAll('.quick-prompt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.getAttribute('data-prompt') || '';
      chatInput.focus();
      sendMessage();
    });
  });

  // 头部按钮监听
  btnNewChat.addEventListener('click', () => {
    vscode.postMessage({ command: 'newSession' });
  });

  btnExport.addEventListener('click', () => {
    vscode.postMessage({ command: 'exportMarkdown' });
  });

  function updateClaudeUi(enabled) {
    if (!btnClaudeToggle) return;
    if (enabled) {
      btnClaudeToggle.style.color = '#10b981';
      btnClaudeToggle.style.borderColor = '#10b981';
      btnClaudeToggle.title = '✅ Claude Code 直连已开启 (.claude/settings.local.json)，点击可关闭';
      if (claudeIcon) claudeIcon.textContent = '⚡ Claude (已开启)';
    } else {
      btnClaudeToggle.style.color = '';
      btnClaudeToggle.style.borderColor = '';
      btnClaudeToggle.title = '一键开启 Claude Code 直连配置 (.claude/settings.local.json)';
      if (claudeIcon) claudeIcon.textContent = '⚡ Claude';
    }
  }

  if (btnClaudeToggle) {
    btnClaudeToggle.addEventListener('click', () => {
      vscode.postMessage({ command: 'toggleClaudeConfig' });
    });
  }

  btnSettings.addEventListener('click', () => {
    vscode.postMessage({ command: 'openSettings' });
  });

  btnAlertOpenWeb.addEventListener('click', () => {
    vscode.postMessage({ command: 'openWeb' });
  });

  btnAlertSetToken.addEventListener('click', () => {
    vscode.postMessage({ command: 'setToken' });
  });

  btnCaptchaOpen.addEventListener('click', () => {
    vscode.postMessage({ command: 'openWeb' });
  });

  btnCaptchaResume.addEventListener('click', () => {
    captchaAlert.style.display = 'none';
    vscode.postMessage({ command: 'resumeCaptcha' });
  });

  btnRemoveContext.addEventListener('click', () => {
    attachedContext = null;
    contextBar.style.display = 'none';
  });

  modelSelect.addEventListener('change', () => {
    vscode.postMessage({ command: 'changeModel', model: modelSelect.value });
  });

  searchCheckbox.addEventListener('change', () => {
    vscode.postMessage({ command: 'changeSearch', enabled: searchCheckbox.checked });
  });

  function setGenerating(generating) {
    isGenerating = generating;
    if (generating) {
      sendBtn.classList.add('stop');
      sendBtn.title = '停止生成';
      sendBtnIcon.textContent = '■';
    } else {
      sendBtn.classList.remove('stop');
      sendBtn.title = '发送 (Enter)';
      sendBtnIcon.textContent = '➤';
    }
  }

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isGenerating) return;

    // 移除空状态展示
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    // 渲染用户消息气泡
    appendUserBubble(text, attachedContext);

    // 发送给扩展后端
    vscode.postMessage({
      command: 'sendMessage',
      text,
      context: attachedContext,
      model: modelSelect.value,
      searchEnabled: searchCheckbox.checked,
    });

    chatInput.value = '';
    chatInput.style.height = 'auto';
    attachedContext = null;
    contextBar.style.display = 'none';
    skillsPopup.classList.remove('active');

    // 准备接收助手消息气泡
    createAssistantBubble();
    setGenerating(true);
  }

  function appendUserBubble(text, context) {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble user';

    let metaHtml = `<div class="message-meta"><span class="sender-role">👤 我</span></div>`;
    let contextHtml = '';
    if (context && context.fileName) {
      contextHtml = `<div style="font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:4px;">📎 附带上下文: <code>${escapeHtml(context.fileName)}</code></div>`;
    }

    bubble.innerHTML = `
      ${metaHtml}
      <div class="message-content">
        ${contextHtml}
        <div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      </div>
    `;

    messagesContainer.appendChild(bubble);
    scrollToBottom();
  }

  function createAssistantBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble assistant';

    const isThinking = !modelSelect.value.includes('chat');

    bubble.innerHTML = `
      <div class="message-meta">
        <span class="sender-role">🐳 DeepSeek</span>
        <span class="speed-tag" style="display:none;">0 tok/s</span>
      </div>
      <div class="message-content">
        <div class="thinking-card" style="${isThinking ? '' : 'display:none;'}">
          <div class="thinking-header">
            <span class="thinking-title">
              <span class="thinking-icon">⏳</span>
              <span class="thinking-label">深度思考中...</span>
            </span>
            <span class="thinking-toggle">折叠 ▲</span>
          </div>
          <div class="thinking-content"></div>
        </div>
        <div class="text-content">正在等待 DeepSeek 响应...</div>
      </div>
    `;

    messagesContainer.appendChild(bubble);
    currentAssistantBubble = bubble;
    currentSpeedTag = bubble.querySelector('.speed-tag');
    currentThinkingCard = bubble.querySelector('.thinking-card');
    currentThinkingContent = bubble.querySelector('.thinking-content');
    currentTextContent = bubble.querySelector('.text-content');

    fullReasoningText = '';
    fullMarkdownText = '';
    thinkingStartTime = Date.now();

    // 绑定折叠切换
    const toggle = bubble.querySelector('.thinking-header');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const collapsed = currentThinkingContent.classList.toggle('collapsed');
        bubble.querySelector('.thinking-toggle').textContent = collapsed ? '展开 ▼' : '折叠 ▲';
      });
    }

    scrollToBottom();
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // 技能 Slash 弹窗处理
  function handleSlashCommand() {
    const text = chatInput.value;
    if (text.startsWith('/')) {
      const search = text.slice(1).toLowerCase();
      const matched = availableSkills.filter((s) =>
        s.command.toLowerCase().includes(search) || s.name.toLowerCase().includes(search)
      );

      if (matched.length > 0) {
        renderSkillsPopup(matched);
        skillsPopup.classList.add('active');
        return;
      }
    }
    skillsPopup.classList.remove('active');
  }

  function renderSkillsPopup(skills) {
    skillsPopup.innerHTML = '';
    selectedSkillIndex = 0;

    skills.forEach((skill, idx) => {
      const item = document.createElement('div');
      item.className = `skill-item ${idx === 0 ? 'selected' : ''}`;
      item.innerHTML = `
        <div>
          <span class="skill-name">${skill.icon} ${skill.command}</span>
          <span style="font-size:12px; margin-left:6px;">${escapeHtml(skill.name)}</span>
        </div>
        <div class="skill-desc">${escapeHtml(skill.description)}</div>
      `;

      item.addEventListener('click', () => {
        chatInput.value = `${skill.command} `;
        chatInput.focus();
        skillsPopup.classList.remove('active');
      });

      skillsPopup.appendChild(item);
    });
  }

  function updateSkillSelection(items) {
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === selectedSkillIndex);
      if (idx === selectedSkillIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // 后端消息处理
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.command) {
      case 'init':
        if (message.skills) availableSkills = message.skills;
        if (message.model) {
          modelSelect.value = message.model;
        }
        if (message.tokenStatus === 'expired') {
          tokenAlert.style.display = 'flex';
        } else {
          tokenAlert.style.display = 'none';
        }
        if (typeof message.claudeEnabled === 'boolean') {
          updateClaudeUi(message.claudeEnabled);
        }
        break;

      case 'claudeConfigStatus':
        updateClaudeUi(message.enabled);
        break;

      case 'streamReasoning':
        if (currentThinkingCard) {
          currentThinkingCard.style.display = 'block';
          fullReasoningText += message.delta;
          currentThinkingContent.textContent = fullReasoningText;
          scrollToBottom();
        }
        break;

      case 'streamText':
        if (currentTextContent) {
          fullMarkdownText += message.delta;
          currentTextContent.innerHTML = renderMarkdown(fullMarkdownText);
          scrollToBottom();
        }
        break;

      case 'streamSpeed':
        if (currentSpeedTag) {
          currentSpeedTag.style.display = 'inline-block';
          currentSpeedTag.textContent = `${message.speed} tok/s`;
        }
        break;

      case 'streamFinished':
        setGenerating(false);
        if (currentThinkingCard && fullReasoningText) {
          const duration = Math.max(1, Math.round((Date.now() - (thinkingStartTime || Date.now())) / 1000));
          const label = currentThinkingCard.querySelector('.thinking-label');
          const icon = currentThinkingCard.querySelector('.thinking-icon');
          if (label) label.textContent = `已深度思考 (${duration} 秒)`;
          if (icon) icon.textContent = '💡';
          // 生成完成默认折叠思考过程以保持页面整洁
          if (currentThinkingContent) {
            currentThinkingContent.classList.add('collapsed');
            const toggle = currentThinkingCard.querySelector('.thinking-toggle');
            if (toggle) toggle.textContent = '展开 ▼';
          }
        }
        if (currentTextContent && !fullMarkdownText) {
          currentTextContent.textContent = '(未接收到文本响应)';
        }
        break;

      case 'streamError':
        setGenerating(false);
        if (currentTextContent) {
          currentTextContent.innerHTML = `<div style="color:#ef4444; font-weight:500;">❌ 生成失败: ${escapeHtml(message.error)}</div>`;
        }
        break;

      case 'tokenExpired':
        tokenAlert.style.display = 'flex';
        break;

      case 'tokenValid':
        tokenAlert.style.display = 'none';
        break;

      case 'captchaChallenge':
        captchaAlert.style.display = 'flex';
        break;

      case 'setContext':
        if (message.context && message.context.fileName) {
          attachedContext = message.context;
          contextTagText.textContent = `📄 ${message.context.fileName}${message.context.selectedText ? ' (部分选中)' : ''}`;
          contextBar.style.display = 'flex';
        }
        break;

      case 'appendPrompt':
        if (emptyState) emptyState.style.display = 'none';
        chatInput.value = message.prompt;
        chatInput.focus();
        sendMessage();
        break;

      case 'clearMessages':
        messagesContainer.innerHTML = '';
        if (emptyState) {
          emptyState.style.display = 'flex';
          messagesContainer.appendChild(emptyState);
        }
        break;
    }
  });

  // Markdown 与代码块格式化
  function renderMarkdown(md) {
    if (!md) return '';

    // 提取代码块
    const codeBlocks = [];
    let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'plaintext', code: code.trim() });
      return `%%%CODE_BLOCK_${id}%%%`;
    });

    // 转义 HTML
    processed = escapeHtml(processed);

    // 行内格式化
    processed = processed
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // 还原代码块并包裹动作按钮
    codeBlocks.forEach((block, id) => {
      const encodedCode = encodeURIComponent(block.code);
      const htmlBlock = `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span>${escapeHtml(block.lang)}</span>
            <div class="code-block-actions">
              <button class="code-action-btn" onclick="copyCode(decodeURIComponent('${encodedCode}'), this)">📋 复制</button>
              <button class="code-action-btn" onclick="insertCode(decodeURIComponent('${encodedCode}'))">📥 插入光标</button>
              <button class="code-action-btn" onclick="replaceCode(decodeURIComponent('${encodedCode}'))">🔄 替换选中</button>
              <button class="code-action-btn" onclick="openNewFile(decodeURIComponent('${encodedCode}'), '${block.lang}')">📑 新建文件</button>
            </div>
          </div>
          <pre><code>${escapeHtml(block.code)}</code></pre>
        </div>
      `;
      processed = processed.replace(`%%%CODE_BLOCK_${id}%%%`, htmlBlock);
    });

    return `<p>${processed}</p>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 全局代码操作函数
  window.copyCode = function (code, btn) {
    navigator.clipboard.writeText(code).then(() => {
      const original = btn.textContent;
      btn.textContent = '✓ 已复制';
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    });
  };

  window.insertCode = function (code) {
    vscode.postMessage({ command: 'insertCode', code });
  };

  window.replaceCode = function (code) {
    vscode.postMessage({ command: 'replaceCode', code });
  };

  window.openNewFile = function (code, language) {
    vscode.postMessage({ command: 'openNewFile', code, language });
  };
})();

