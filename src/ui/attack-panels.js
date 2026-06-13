/**
 * Attack Panels UI
 * Renders the two-panel comparison view for the attack demo
 * Left panel: Classical system (RSA + static AES)
 * Right panel: Post-Quantum system (ML-KEM + ratchet)
 */

let _panelElement = null;
let _classicalContentEl = null;
let _pqcContentEl = null;
let _stepIndicatorEl = null;

/**
 * Render the two-panel attack comparison UI
 */
export function renderTwoPanelAttack() {
  // Close existing panel if open
  closeAttackPanels();
  
  // Create the panel container
  _panelElement = document.createElement('div');
  _panelElement.id = 'attack-demo-panel';
  _panelElement.className = 'attack-demo-panel';
  _panelElement.style.display = 'grid';
  
  _panelElement.innerHTML = `
    <div class="attack-demo-header">
      <h3>⚔️ Quantum Attack Simulation: Classical vs Post-Quantum</h3>
      <div class="attack-demo-controls-header">
        <button class="attack-demo-minimize" id="attack-demo-minimize" title="Minimize">−</button>
        <button class="attack-demo-close" id="attack-demo-close" title="Close">×</button>
      </div>
    </div>
    <div class="attack-demo-two-column">
      <div class="attack-demo-classical">
        <div class="attack-demo-title">
          <span class="title-icon">🏛️</span>
          Classical System
          <span class="badge-danger">RSA-2048 + AES-256-GCM (STATIC)</span>
        </div>
        <div class="attack-demo-content" id="attack-classical-content">
          <div class="attack-step-status">Initializing classical system...</div>
        </div>
      </div>
      <div class="attack-demo-pqc">
        <div class="attack-demo-title">
          <span class="title-icon">🔮</span>
          Post-Quantum System
          <span class="badge-success">ML-KEM-1024 + Ratchet (EPOCH-BASED)</span>
        </div>
        <div class="attack-demo-content" id="attack-pqc-content">
          <div class="attack-step-status">Initializing post-quantum system...</div>
        </div>
      </div>
    </div>
    <div class="attack-demo-footer">
      <div class="attack-step-indicator" id="attack-step-indicator">
        <div class="step-item" data-step="1">
          <span class="step-dot">1</span>
          <span class="step-label">Setup</span>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-item" data-step="2">
          <span class="step-dot">2</span>
          <span class="step-label">Encrypt</span>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-item" data-step="3">
          <span class="step-dot">3</span>
          <span class="step-label">Harvest</span>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-item" data-step="4">
          <span class="step-dot">4</span>
          <span class="step-label">Quantum Attack</span>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-item" data-step="5">
          <span class="step-dot">5</span>
          <span class="step-label">Forward Secrecy</span>
        </div>
      </div>
      <div class="attack-demo-controls">
        <button id="attack-prev-step" class="demo-nav-btn" disabled>← Previous</button>
        <button id="attack-next-step" class="demo-nav-btn primary">Next Step →</button>
        <button id="attack-reset-demo" class="demo-nav-btn danger">Reset</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(_panelElement);
  
  // Store references to content elements
  _classicalContentEl = document.getElementById('attack-classical-content');
  _pqcContentEl = document.getElementById('attack-pqc-content');
  _stepIndicatorEl = document.getElementById('attack-step-indicator');
  
  // Add event listeners
  const closeBtn = document.getElementById('attack-demo-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeAttackPanels());
  }
  
  const minimizeBtn = document.getElementById('attack-demo-minimize');
  if (minimizeBtn) {
    let isMinimized = false;
    minimizeBtn.addEventListener('click', () => {
      const twoColumn = _panelElement?.querySelector('.attack-demo-two-column');
      const footer = _panelElement?.querySelector('.attack-demo-footer');
      if (twoColumn && footer) {
        isMinimized = !isMinimized;
        twoColumn.style.display = isMinimized ? 'none' : 'grid';
        footer.style.display = isMinimized ? 'none' : 'flex';
        minimizeBtn.textContent = isMinimized ? '+' : '−';
      }
    });
  }
  
  const prevBtn = document.getElementById('attack-prev-step');
  const nextBtn = document.getElementById('attack-next-step');
  const resetBtn = document.getElementById('attack-reset-demo');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const currentStep = getCurrentStepFromIndicator();
      if (currentStep > 1) {
        triggerStepChange(currentStep - 1);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const currentStep = getCurrentStepFromIndicator();
      if (currentStep < 5) {
        triggerStepChange(currentStep + 1);
      }
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      triggerReset();
    });
  }
  
  // Add keyboard navigation
  const handleKeydown = (e) => {
    if (!_panelElement || _panelElement.style.display !== 'grid') return;
    if (e.key === 'ArrowLeft') {
      const currentStep = getCurrentStepFromIndicator();
      if (currentStep > 1) triggerStepChange(currentStep - 1);
    } else if (e.key === 'ArrowRight') {
      const currentStep = getCurrentStepFromIndicator();
      if (currentStep < 5) triggerStepChange(currentStep + 1);
    } else if (e.key === 'Escape') {
      closeAttackPanels();
    }
  };
  window.addEventListener('keydown', handleKeydown);
  _panelElement.addEventListener('remove', () => window.removeEventListener('keydown', handleKeydown));
  
  // Add CSS animations
  addPanelStyles();
}

/**
 * Close and remove the attack panels
 */
export function closeAttackPanels() {
  if (_panelElement) {
    _panelElement.remove();
    _panelElement = null;
  }
  _classicalContentEl = null;
  _pqcContentEl = null;
  _stepIndicatorEl = null;
}

/**
 * Update the step indicator to show current progress
 */
export function updateStepIndicator(step) {
  if (!_stepIndicatorEl) return;
  
  const stepItems = _stepIndicatorEl.querySelectorAll('.step-item');
  stepItems.forEach((item, index) => {
    const stepNum = parseInt(item.dataset.step, 10);
    const dot = item.querySelector('.step-dot');
    dot.classList.remove('active', 'completed');
    if (stepNum === step) {
      dot.classList.add('active');
    } else if (stepNum < step) {
      dot.classList.add('completed');
    }
  });
  
  // Update navigation buttons
  const prevBtn = document.getElementById('attack-prev-step');
  const nextBtn = document.getElementById('attack-next-step');
  if (prevBtn) prevBtn.disabled = step <= 1;
  if (nextBtn) nextBtn.disabled = step >= 5;
}

/**
 * Update the classical panel content (left side)
 */
export function updateClassicalPanel(step, data) {
  if (!_classicalContentEl) return;
  
  const { title, content, isBroken = false } = data;
  const brokenClass = isBroken ? 'attack-broken' : '';
  
  let contentHtml = '';
  
  if (step === 1) {
    contentHtml = `
      <div class="attack-step-card ${brokenClass}">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Algorithm:</span> ${escapeHtml(content.algorithm)}</div>
          <div class="detail-row"><span class="detail-label">Key Status:</span> ${escapeHtml(content.keyStatus)}</div>
          <div class="detail-row"><span class="detail-label">Session Key:</span> <code>${escapeHtml(content.sessionKey)}</code></div>
          <div class="detail-row"><span class="detail-label">Forward Secrecy:</span> <span class="danger-text">${escapeHtml(content.forwardSecrecy)}</span></div>
          <div class="key-visual">${escapeHtml(content.keyVisual).replace(/\n/g, '<br>')}</div>
          <div class="warning-note">⚠️ Static key means one breach = all messages exposed</div>
        </div>
      </div>
    `;
  } else if (step === 2) {
    contentHtml = `
      <div class="attack-step-card ${brokenClass}">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Plaintext:</span> <span class="plaintext">${escapeHtml(content.plaintext)}</span></div>
          <div class="detail-row"><span class="detail-label">Encryption:</span> ${escapeHtml(content.encryption)}</div>
          <div class="detail-row"><span class="detail-label">Ciphertext:</span> <code class="cipher-demo">${escapeHtml(content.ciphertext)}</code></div>
          <div class="detail-row"><span class="detail-label">IV:</span> <code>${escapeHtml(content.iv)}</code></div>
          <div class="detail-row"><span class="detail-label">HMAC:</span> <code>${escapeHtml(content.hmac)}</code></div>
          <div class="warning-note">${escapeHtml(content.note || '')}</div>
        </div>
      </div>
    `;
  } else if (step === 3) {
    contentHtml = `
      <div class="attack-step-card ${brokenClass}">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Stored Ciphertext:</span> <code>${escapeHtml(content.storedCiphertext)}</code></div>
          <div class="detail-row"><span class="detail-label">Stored IV:</span> <code>${escapeHtml(content.storedIV)}</code></div>
          <div class="detail-row"><span class="detail-label">Stored HMAC:</span> <code>${escapeHtml(content.storedHMAC)}</code></div>
          <div class="detail-row"><span class="detail-label">Attack Status:</span> ${escapeHtml(content.attackStatus)}</div>
          <div class="warning-note">${escapeHtml(content.vulnerability || '')}</div>
          <div class="key-visual">${escapeHtml(content.note || '')}</div>
        </div>
      </div>
    `;
  } else if (step === 4) {
    contentHtml = `
      <div class="attack-step-card attack-broken">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Attack:</span> ${escapeHtml(content.attack)}</div>
          <div class="detail-row"><span class="detail-label">Private Key:</span> <code>${escapeHtml(content.privateKeyRecovered)}</code></div>
          <div class="detail-row"><span class="detail-label">AES Key:</span> <code>${escapeHtml(content.aesKeyExtracted)}</code></div>
          <div class="attack-result danger">${escapeHtml(content.decryptedMessage)}</div>
          <div class="detail-row"><span class="detail-label">Time to break:</span> ${escapeHtml(content.timeToBreak)}</div>
          <div class="detail-row"><span class="detail-label">Impact:</span> <span class="danger-text">${escapeHtml(content.impact)}</span></div>
        </div>
      </div>
    `;
  } else if (step === 5) {
    const pastMessagesHtml = content.pastMessages?.map(msg => `
      <div class="past-message-item ${msg.exposed ? 'exposed' : 'protected'}">
        <span class="msg-epoch">Epoch ${msg.epoch}</span>
        <span class="msg-status">${msg.exposed ? '🔓 EXPOSED' : '🔒 PROTECTED'}</span>
        <div class="msg-text">"${escapeHtml(msg.decryptedText)}"</div>
      </div>
    `).join('');
    
    contentHtml = `
      <div class="attack-step-card attack-broken">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Key Compromised:</span> <span class="danger-text">${escapeHtml(content.currentKeyCompromised)}</span></div>
          <div class="past-messages-list">
            <div class="subsection-title">📜 Past Messages:</div>
            ${pastMessagesHtml}
          </div>
          <div class="attack-result danger">${escapeHtml(content.result)}</div>
          <div class="warning-note">${escapeHtml(content.recommendation || '')}</div>
        </div>
      </div>
    `;
  }
  
  _classicalContentEl.innerHTML = contentHtml;
}

/**
 * Update the PQC panel content (right side)
 */
export function updatePqcPanel(step, data) {
  if (!_pqcContentEl) return;
  
  const { title, content, isSecure = false } = data;
  const secureClass = isSecure ? 'attack-secure' : '';
  
  let contentHtml = '';
  
  if (step === 1) {
    contentHtml = `
      <div class="attack-step-card ${secureClass}">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Algorithm:</span> ${escapeHtml(content.algorithm)}</div>
          <div class="detail-row"><span class="detail-label">Key Status:</span> ${escapeHtml(content.keyStatus)}</div>
          <div class="detail-row"><span class="detail-label">Session Key:</span> <code>${escapeHtml(content.sessionKey)}</code></div>
          <div class="detail-row"><span class="detail-label">Forward Secrecy:</span> <span class="success-text">${escapeHtml(content.forwardSecrecy)}</span></div>
          <div class="key-visual">${escapeHtml(content.keyVisual).replace(/\n/g, '<br>')}</div>
          <div class="success-note">✅ Ratchet ensures keys rotate after each message</div>
        </div>
      </div>
    `;
  } else if (step === 2) {
    contentHtml = `
      <div class="attack-step-card ${secureClass}">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Plaintext:</span> <span class="plaintext">${escapeHtml(content.plaintext)}</span></div>
          <div class="detail-row"><span class="detail-label">Encryption:</span> ${escapeHtml(content.encryption)}</div>
          <div class="detail-row"><span class="detail-label">Ciphertext:</span> <code class="cipher-demo">${escapeHtml(content.ciphertext)}</code></div>
          <div class="detail-row"><span class="detail-label">IV:</span> <code>${escapeHtml(content.iv)}</code></div>
          <div class="detail-row"><span class="detail-label">HMAC:</span> <code>${escapeHtml(content.hmac)}</code></div>
          <div class="success-note">✨ ${escapeHtml(content.note || '')}</div>
        </div>
      </div>
    `;
  } else if (step === 3) {
    contentHtml = `
      <div class="attack-step-card ${secureClass}">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Stored Ciphertext:</span> <code>${escapeHtml(content.storedCiphertext)}</code></div>
          <div class="detail-row"><span class="detail-label">Stored IV:</span> <code>${escapeHtml(content.storedIV)}</code></div>
          <div class="detail-row"><span class="detail-label">Stored HMAC:</span> <code>${escapeHtml(content.storedHMAC)}</code></div>
          <div class="detail-row"><span class="detail-label">Attack Status:</span> ${escapeHtml(content.attackStatus)}</div>
          <div class="success-note">✅ ${escapeHtml(content.note || '')}</div>
          <div class="key-visual">${escapeHtml(content.vulnerability || '')}</div>
        </div>
      </div>
    `;
  } else if (step === 4) {
    contentHtml = `
      <div class="attack-step-card attack-secure">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Attack:</span> ${escapeHtml(content.attack)}</div>
          <div class="detail-row"><span class="detail-label">Attempted:</span> ${escapeHtml(content.attempted)}</div>
          <div class="detail-row"><span class="detail-label">Result:</span> <span class="success-text">${escapeHtml(content.result)}</span></div>
          <div class="attack-result success">${escapeHtml(content.decryptedMessage)}</div>
          <div class="detail-row"><span class="detail-label">Security Level:</span> ${escapeHtml(content.securityLevel || 'N/A')}</div>
          <div class="detail-row"><span class="detail-label">Impact:</span> <span class="success-text">${escapeHtml(content.impact)}</span></div>
        </div>
      </div>
    `;
  } else if (step === 5) {
    const pastMessagesHtml = content.pastMessages?.map(msg => `
      <div class="past-message-item ${msg.exposed ? 'exposed' : 'protected'}">
        <span class="msg-epoch">Epoch ${msg.epoch}</span>
        <span class="msg-status">${msg.exposed ? '🔓 EXPOSED' : '🔒 PROTECTED'}</span>
        <div class="msg-text">"${escapeHtml(msg.decryptedText)}"</div>
      </div>
    `).join('');
    
    contentHtml = `
      <div class="attack-step-card attack-secure">
        <div class="step-title">${escapeHtml(title)}</div>
        <div class="step-detail">
          <div class="detail-row"><span class="detail-label">Key Compromised:</span> <span class="success-text">${escapeHtml(content.currentKeyCompromised)}</span></div>
          <div class="past-messages-list">
            <div class="subsection-title">📜 Past Messages:</div>
            ${pastMessagesHtml}
          </div>
          <div class="attack-result success">${escapeHtml(content.result)}</div>
          <div class="success-note">✅ ${escapeHtml(content.recommendation || '')}</div>
        </div>
      </div>
    `;
  }
  
  _pqcContentEl.innerHTML = contentHtml;
}

/**
 * Helper to get current step from indicator
 */
function getCurrentStepFromIndicator() {
  if (!_stepIndicatorEl) return 1;
  const activeDot = _stepIndicatorEl.querySelector('.step-dot.active');
  if (activeDot) {
    const stepItem = activeDot.closest('.step-item');
    if (stepItem) {
      return parseInt(stepItem.dataset.step, 10);
    }
  }
  return 1;
}

/**
 * Trigger step change (to be handled by parent)
 */
function triggerStepChange(step) {
  const event = new CustomEvent('attack-step-change', { detail: { step } });
  window.dispatchEvent(event);
}

/**
 * Trigger reset (to be handled by parent)
 */
function triggerReset() {
  const event = new CustomEvent('attack-reset', {});
  window.dispatchEvent(event);
}

/**
 * Add CSS styles for the attack panels
 */
function addPanelStyles() {
  if (document.getElementById('attack-panel-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'attack-panel-styles';
  style.textContent = `
    .attack-demo-panel {
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      width: 1400px;
      max-width: 90vw;
      z-index: 100;
      background: linear-gradient(145deg, #0a0e10, #070b0d);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 30px 60px rgba(0,0,0,0.5);
      display: grid;
      grid-template-rows: auto 1fr auto;
      backdrop-filter: blur(8px);
    }
    
    .attack-demo-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--line-soft);
      background: rgba(0,0,0,0.3);
      border-radius: 16px 16px 0 0;
    }
    
    .attack-demo-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--cyan);
      letter-spacing: 0.5px;
    }
    
    .attack-demo-controls-header {
      display: flex;
      gap: 8px;
    }
    
    .attack-demo-minimize, .attack-demo-close {
      background: none;
      border: none;
      color: #54666b;
      font-size: 20px;
      cursor: pointer;
      padding: 0 8px;
      transition: color 0.2s;
    }
    
    .attack-demo-minimize:hover, .attack-demo-close:hover {
      color: var(--cyan);
    }
    
    .attack-demo-close:hover {
      color: var(--danger);
    }
    
    .attack-demo-two-column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--line);
      min-height: 520px;
    }
    
    .attack-demo-classical, .attack-demo-pqc {
      background: #0c1114;
      padding: 20px;
    }
    
    .attack-demo-title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line-soft);
    }
    
    .title-icon {
      font-size: 18px;
    }
    
    .badge-danger, .badge-success {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 8px;
      font-weight: 500;
      font-family: var(--mono);
    }
    
    .badge-danger {
      background: rgba(255,102,110,0.15);
      color: var(--danger);
    }
    
    .badge-success {
      background: rgba(41,232,199,0.12);
      color: var(--cyan);
    }
    
    .attack-demo-content {
      min-height: 420px;
      overflow-y: auto;
      scrollbar-width: thin;
    }
    
    .attack-step-card {
      background: #0a1012;
      border: 1px solid #1a2c30;
      border-radius: 10px;
      padding: 16px;
      transition: all 0.2s;
    }
    
    .attack-step-card.attack-broken {
      border-color: rgba(255,102,110,0.4);
      background: rgba(255,102,110,0.03);
    }
    
    .attack-step-card.attack-secure {
      border-color: rgba(41,232,199,0.3);
      background: rgba(41,232,199,0.02);
    }
    
    .step-title {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 14px;
      color: #8fb3b0;
    }
    
    .step-detail {
      font-size: 9px;
      line-height: 1.8;
      color: #7a9499;
    }
    
    .detail-row {
      margin-bottom: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    
    .detail-label {
      color: #4a6165;
      min-width: 100px;
      font-family: var(--mono);
      font-size: 8px;
    }
    
    .plaintext {
      color: #d4e2e1;
      font-weight: 500;
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .key-visual {
      font-family: var(--mono);
      font-size: 7px;
      background: #050809;
      padding: 10px;
      border-radius: 6px;
      margin-top: 10px;
      word-break: break-all;
      color: #4a6165;
    }
    
    .cipher-demo {
      font-family: var(--mono);
      color: var(--cyan);
      background: rgba(41,232,199,0.08);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 8px;
    }
    
    .attack-result {
      margin: 12px 0;
      padding: 10px;
      border-radius: 6px;
      text-align: center;
      font-weight: 600;
      font-size: 10px;
    }
    
    .attack-result.danger {
      background: rgba(255,102,110,0.12);
      color: var(--danger);
      border: 1px solid rgba(255,102,110,0.2);
    }
    
    .attack-result.success {
      background: rgba(41,232,199,0.08);
      color: var(--cyan);
      border: 1px solid rgba(41,232,199,0.2);
    }
    
    .warning-note {
      margin-top: 12px;
      padding: 8px;
      background: rgba(255,102,110,0.06);
      border-left: 2px solid var(--danger);
      font-size: 8px;
      color: #ff9e9e;
    }
    
    .success-note {
      margin-top: 12px;
      padding: 8px;
      background: rgba(41,232,199,0.06);
      border-left: 2px solid var(--cyan);
      font-size: 8px;
      color: #7ad6c4;
    }
    
    .danger-text {
      color: var(--danger);
    }
    
    .success-text {
      color: var(--cyan);
    }
    
    .past-messages-list {
      margin: 12px 0;
    }
    
    .subsection-title {
      font-size: 8px;
      font-family: var(--mono);
      color: #4a6165;
      margin-bottom: 8px;
    }
    
    .past-message-item {
      padding: 8px;
      margin-bottom: 6px;
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
    }
    
    .past-message-item.exposed {
      border-left: 2px solid var(--danger);
    }
    
    .past-message-item.protected {
      border-left: 2px solid var(--cyan);
    }
    
    .msg-epoch {
      font-family: var(--mono);
      font-size: 7px;
      background: #162327;
      padding: 2px 6px;
      border-radius: 3px;
    }
    
    .msg-status {
      font-size: 7px;
      margin-left: 8px;
    }
    
    .msg-text {
      font-size: 8px;
      margin-top: 4px;
      color: #bdd0ce;
    }
    
    .attack-demo-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--line-soft);
      background: rgba(0,0,0,0.2);
      border-radius: 0 0 16px 16px;
    }
    
    .attack-step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    
    .step-dot {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: #0e1619;
      border: 1px solid #1a2c30;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.2s;
    }
    
    .step-dot.active {
      background: rgba(41,232,199,0.15);
      border-color: var(--cyan);
      color: var(--cyan);
      box-shadow: 0 0 12px rgba(41,232,199,0.2);
    }
    
    .step-dot.completed {
      background: rgba(41,232,199,0.1);
      border-color: var(--cyan);
      color: var(--cyan);
    }
    
    .step-label {
      font-size: 7px;
      font-family: var(--mono);
      color: #4a6165;
    }
    
    .step-arrow {
      color: #2a4147;
      font-size: 14px;
    }
    
    .attack-demo-controls {
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    
    .demo-nav-btn {
      padding: 8px 20px;
      border: 1px solid #1a2c30;
      border-radius: 6px;
      background: #0d1417;
      color: #7a9499;
      font-size: 9px;
      font-family: var(--mono);
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .demo-nav-btn:hover:not(:disabled) {
      border-color: rgba(41,232,199,0.3);
      color: var(--cyan);
    }
    
    .demo-nav-btn.primary {
      background: rgba(41,232,199,0.1);
      border-color: rgba(41,232,199,0.3);
      color: var(--cyan);
    }
    
    .demo-nav-btn.primary:hover {
      background: rgba(41,232,199,0.2);
    }
    
    .demo-nav-btn.danger:hover {
      border-color: rgba(255,102,110,0.4);
      color: var(--danger);
    }
    
    .demo-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    
    .attack-step-status {
      color: #4a6165;
      font-size: 11px;
      text-align: center;
      padding: 40px 20px;
      font-family: var(--mono);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Simple escape function
 */
function escapeHtml(value) {
  if (!value) return '';
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}
