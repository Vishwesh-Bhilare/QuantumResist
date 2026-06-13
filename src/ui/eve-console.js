import { startAttackDemo, resetAttackDemo, attackStep, selectMessageForAttack, addInterceptedMessage } from '../attack-demo.js';

let _state = null;
let _broadcast = null;
let _interceptCount = 0;
let _recentMessages = [];

export function initEveConsole(mountEl, state, broadcast) {
  _state = state;
  _broadcast = broadcast;
  if (!mountEl) return;

  mountEl.innerHTML = `
    <div class="eve-attack-layout">
      <!-- Attack Demo Panel will be rendered here -->
      <div id="attack-demo-container"></div>
      
      <!-- Simple message monitor -->
      <div class="eve-monitor">
        <div class="eve-monitor-header">
          <span>📡 INTERCEPTED MESSAGES</span>
          <span id="intercept-count">0</span>
        </div>
        <div class="eve-message-list" id="eve-message-list">
          <div class="empty-state">No messages intercepted yet...<br>Send a message from Alice</div>
        </div>
      </div>
    </div>`;

  // Bind attack demo buttons (will be created by attack-demo)
  bindAttackControls();
  
  // Listen for intercepted messages
  document.addEventListener('eve:intercept', e => handleIntercept(e.detail));
}

function bindAttackControls() {
  // These will be re-bound when attack panel is created
  // The attack-demo.js will handle its own buttons
}

async function handleIntercept(message) {
  _interceptCount++;
  
  // Store recent message
  const recentMsg = {
    epoch: message.epoch,
    ciphertext: message.ciphertext,
    iv: message.iv,
    hmac: message.hmac,
    timestamp: Date.now()
  };
  _recentMessages.unshift(recentMsg);
  if (_recentMessages.length > 10) _recentMessages.pop();
  
  // Add to attack demo's message list
  addInterceptedMessage(recentMsg);
  
  // Update UI
  updateMessageList();
}

function updateMessageList() {
  const container = document.getElementById('eve-message-list');
  if (!container) return;
  
  if (_recentMessages.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages intercepted yet...<br>Send a message from Alice</div>';
    return;
  }
  
  container.innerHTML = _recentMessages.map((msg, idx) => `
    <div class="intercept-item" data-idx="${idx}">
      <div class="intercept-header">
        <span class="intercept-epoch">Epoch ${msg.epoch}</span>
        <span class="intercept-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="intercept-cipher">${msg.ciphertext.slice(0, 40)}…</div>
      <button class="intercept-select-btn" data-msg-idx="${idx}">Attack This Message</button>
    </div>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.intercept-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.msgIdx, 10);
      const msg = _recentMessages[idx];
      if (msg) {
        selectMessageForAttack(idx);
        // Highlight selected
        container.querySelectorAll('.intercept-item').forEach(item => item.classList.remove('selected'));
        btn.closest('.intercept-item')?.classList.add('selected');
      }
    });
  });
}

// Export for getting recent messages
export function getRecentMessages() {
  return _recentMessages;
}
