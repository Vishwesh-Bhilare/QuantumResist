let _hideTimeout = null;

export function showPipeline(label, steps, direction = 'send') {
  const overlay = getOrCreateOverlay();
  const labelEl = document.getElementById('pipeline-label');
  const stepsEl = document.getElementById('pipeline-steps');

  if (labelEl) labelEl.textContent = label;
  if (!stepsEl) return;

  // Build steps HTML
  stepsEl.innerHTML = steps.map((step, i) => `
    ${i > 0 ? `<div class="pipeline-arrow" id="pipeline-arrow-${i}"></div>` : ''}
    <div class="pipeline-step" id="pipeline-step-${i}">
      <div class="pipeline-step-name">${escapeHtml(step.name)}</div>
      <div class="pipeline-step-label">${escapeHtml(step.label)}</div>
      <div class="pipeline-step-value">${escapeHtml(step.value)}</div>
    </div>`).join('');

  // Show overlay
  overlay.classList.add('visible');

  // Animate steps sequentially
  clearTimeout(_hideTimeout);
  animateSteps(steps.length, direction);

  // Auto-hide after all steps animate plus a pause
  _hideTimeout = setTimeout(() => hidePipeline(), steps.length * 420 + 1800);
}

export function hidePipeline() {
  const overlay = document.getElementById('pipeline-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function animateSteps(count, direction) {
  const indices = direction === 'receive'
    ? Array.from({ length: count }, (_, i) => i).reverse()
    : Array.from({ length: count }, (_, i) => i);

  // Reset all to inactive
  for (let i = 0; i < count; i++) {
    const stepEl = document.getElementById(`pipeline-step-${i}`);
    const arrowEl = document.getElementById(`pipeline-arrow-${i}`);
    if (stepEl) { stepEl.classList.remove('active', 'done'); }
    if (arrowEl) { arrowEl.classList.remove('active'); }
  }

  // Animate each step
  indices.forEach((idx, order) => {
    setTimeout(() => {
      // Mark previous as done
      if (order > 0) {
        const prevIdx = indices[order - 1];
        const prevEl = document.getElementById(`pipeline-step-${prevIdx}`);
        if (prevEl) { prevEl.classList.remove('active'); prevEl.classList.add('done'); }
        const prevArrow = document.getElementById(`pipeline-arrow-${prevIdx}`);
        if (prevArrow) prevArrow.classList.remove('active');
      }

      const stepEl = document.getElementById(`pipeline-step-${idx}`);
      const arrowEl = document.getElementById(`pipeline-arrow-${idx}`);
      if (stepEl) stepEl.classList.add('active');
      if (arrowEl) arrowEl.classList.add('active');

      // Mark all done at the end
      if (order === indices.length - 1) {
        setTimeout(() => {
          for (let i = 0; i < count; i++) {
            const el = document.getElementById(`pipeline-step-${i}`);
            if (el) { el.classList.remove('active'); el.classList.add('done'); }
          }
        }, 350);
      }
    }, order * 420);
  });
}

function getOrCreateOverlay() {
  let overlay = document.getElementById('pipeline-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pipeline-overlay';
    overlay.className = 'pipeline-overlay';
    overlay.innerHTML = `
      <div class="pipeline-label" id="pipeline-label"></div>
      <div class="pipeline-steps" id="pipeline-steps"></div>`;
    document.body.appendChild(overlay);
  }
  return overlay;
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value);
  return node.innerHTML;
}
