let _hideTimeout = null;

export function showPipeline(label, steps, direction = 'send') {
  const overlay = getOrCreateOverlay();
  const labelEl = document.getElementById('pipeline-label');
  const stepsEl = document.getElementById('pipeline-steps');
  if (!stepsEl) return;

  if (labelEl) labelEl.textContent = label;

  stepsEl.innerHTML = steps.map((step, i) => `
    ${i > 0 ? `<div class="pipeline-arrow" id="pipeline-arrow-${i}"></div>` : ''}
    <div class="pipeline-step" id="pipeline-step-${i}">
      <div class="pipeline-step-name">${esc(step.name)}</div>
      <div class="pipeline-step-label">${esc(step.label)}</div>
      <div class="pipeline-step-value">${esc(step.value)}</div>
    </div>`).join('');

  overlay.classList.add('visible');
  clearTimeout(_hideTimeout);
  animateSteps(steps.length, direction);
  _hideTimeout = setTimeout(hidePipeline, steps.length * 420 + 2000);
}

export function hidePipeline() {
  document.getElementById('pipeline-overlay')?.classList.remove('visible');
}

function animateSteps(count, direction) {
  const indices = direction === 'receive'
    ? Array.from({ length: count }, (_, i) => count - 1 - i)
    : Array.from({ length: count }, (_, i) => i);

  for (let i = 0; i < count; i++) {
    document.getElementById(`pipeline-step-${i}`)?.classList.remove('active', 'done');
    document.getElementById(`pipeline-arrow-${i}`)?.classList.remove('active');
  }

  indices.forEach((idx, order) => {
    setTimeout(() => {
      if (order > 0) {
        const prev = indices[order - 1];
        document.getElementById(`pipeline-step-${prev}`)?.classList.replace('active', 'done');
        document.getElementById(`pipeline-arrow-${prev}`)?.classList.remove('active');
      }
      document.getElementById(`pipeline-step-${idx}`)?.classList.add('active');
      document.getElementById(`pipeline-arrow-${idx}`)?.classList.add('active');

      if (order === indices.length - 1) {
        setTimeout(() => {
          for (let i = 0; i < count; i++) {
            const el = document.getElementById(`pipeline-step-${i}`);
            if (el) { el.classList.remove('active'); el.classList.add('done'); }
          }
        }, 400);
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

function esc(value) {
  const n = document.createElement('div');
  n.textContent = String(value ?? '');
  return n.innerHTML;
}
