/**
 * Renders an SVG connection diagram: LeftNode → Algorithm → RightNode
 * Used by Demo 1 (RSA vs ML-KEM steps) and Demo 5 (resistance meter header).
 *
 * Options:
 *   labelLeft   — left node label (e.g. 'ALICE')
 *   labelRight  — right node label (e.g. 'BOB')
 *   algo        — algorithm name in the centre (e.g. 'ML-KEM-1024')
 *   algoSub     — subtitle under algo (e.g. 'FIPS 203 · Lattice-based')
 *   secure      — boolean; true = cyan/green, false = red/danger
 *   type        — 'classical' | 'quantum' | 'pqc'
 */
export function renderConnectionDiagram({ labelLeft, labelRight, algo, algoSub, secure, type }) {
  const cyan = '#29e8c7';
  const danger = '#ff666e';
  const purple = '#a38cff';
  const muted = '#2a4147';
  const line = '#1c292e';
  const text = '#d4e2e1';
  const subtext = '#5c7479';

  const W = 620;
  const H = 160;

  const nodeColor = type === 'quantum' ? danger : secure ? cyan : danger;
  const algoColor = type === 'quantum' ? danger : secure ? cyan : danger;
  const lineColor = type === 'quantum' ? danger : secure ? cyan : muted;
  const lineOpacity = secure ? '0.55' : type === 'quantum' ? '0.7' : '0.25';

  // Node positions
  const leftX = 80;
  const rightX = W - 80;
  const midX = W / 2;
  const midY = H / 2;

  // Arrow line from left node to algo box
  const lineY = midY;
  const algoBoxW = 180;
  const algoBoxH = 56;
  const algoBoxX = midX - algoBoxW / 2;
  const algoBoxY = midY - algoBoxH / 2;

  const lineStartX = leftX + 36;
  const lineEndX = algoBoxX;
  const lineStartX2 = algoBoxX + algoBoxW;
  const lineEndX2 = rightX - 36;

  // Quantum bolt icon path (simplified)
  const boltPath = type === 'quantum'
    ? `<text x="${midX}" y="${algoBoxY - 14}" text-anchor="middle" font-family="DM Mono,monospace" font-size="11" fill="${danger}" letter-spacing="1">⚡ QUANTUM ATTACK</text>`
    : '';

  const statusLabel = type === 'quantum'
    ? `<text x="${midX}" y="${algoBoxY + algoBoxH + 20}" text-anchor="middle" font-family="DM Mono,monospace" font-size="9" fill="${danger}" letter-spacing="1.2">CHANNEL BROKEN</text>`
    : secure
    ? `<text x="${midX}" y="${algoBoxY + algoBoxH + 20}" text-anchor="middle" font-family="DM Mono,monospace" font-size="9" fill="${cyan}" letter-spacing="1.2">CHANNEL SECURE</text>`
    : '';

  // Animated dash offset for active lines
  const animAttr = type !== 'quantum'
    ? `stroke-dasharray="6 4" stroke-dashoffset="0"`
    : `stroke-dasharray="none"`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">
  <defs>
    <filter id="glow-${type}">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <marker id="arrow-${type}" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="${lineColor}" opacity="${lineOpacity}"/>
    </marker>
  </defs>

  <!-- Background grid lines (subtle) -->
  <line x1="0" y1="${midY}" x2="${W}" y2="${midY}" stroke="${line}" stroke-width="1" stroke-dasharray="4 8" opacity="0.4"/>

  <!-- Connection lines -->
  <line x1="${lineStartX}" y1="${lineY}" x2="${lineEndX}" y2="${lineY}"
        stroke="${lineColor}" stroke-width="1.5" opacity="${lineOpacity}"
        marker-end="url(#arrow-${type})"
        ${type !== 'quantum' ? `stroke-dasharray="6 4"` : ''}/>
  <line x1="${lineStartX2}" y1="${lineY}" x2="${lineEndX2}" y2="${lineY}"
        stroke="${lineColor}" stroke-width="1.5" opacity="${lineOpacity}"
        marker-end="url(#arrow-${type})"
        ${type !== 'quantum' ? `stroke-dasharray="6 4"` : ''}/>

  <!-- Left node -->
  <circle cx="${leftX}" cy="${midY}" r="34"
          fill="none" stroke="${nodeColor}" stroke-width="1"
          opacity="0.3" filter="url(#glow-${type})"/>
  <circle cx="${leftX}" cy="${midY}" r="26"
          fill="#0c1215" stroke="${nodeColor}" stroke-width="1.5" opacity="0.6"/>
  <text x="${leftX}" y="${midY - 5}" text-anchor="middle"
        font-family="DM Mono,monospace" font-size="13" font-weight="700"
        fill="${nodeColor}">${labelLeft.slice(0, 1)}</text>
  <text x="${leftX}" y="${midY + 16}" text-anchor="middle"
        font-family="DM Mono,monospace" font-size="7" letter-spacing="1.5"
        fill="${subtext}">${labelLeft}</text>

  <!-- Algorithm box -->
  ${boltPath}
  <rect x="${algoBoxX}" y="${algoBoxY}" width="${algoBoxW}" height="${algoBoxH}" rx="4"
        fill="#080d0f" stroke="${algoColor}" stroke-width="1"
        opacity="${secure || type === 'quantum' ? '1' : '0.4'}"
        filter="url(#glow-${type})"/>
  <rect x="${algoBoxX}" y="${algoBoxY}" width="${algoBoxW}" height="2" rx="1"
        fill="${algoColor}" opacity="${secure || type === 'quantum' ? '0.6' : '0.2'}"/>
  <text x="${midX}" y="${algoBoxY + 22}" text-anchor="middle"
        font-family="DM Mono,monospace" font-size="12" font-weight="700"
        fill="${algoColor}">${algo}</text>
  <text x="${midX}" y="${algoBoxY + 38}" text-anchor="middle"
        font-family="DM Mono,monospace" font-size="8" letter-spacing=".6"
        fill="${subtext}">${algoSub}</text>

  ${statusLabel}

  <!-- Right node -->
  <circle cx="${rightX}" cy="${midY}" r="34"
          fill="none" stroke="${nodeColor}" stroke-width="1"
          opacity="0.3" filter="url(#glow-${type})"/>
  <circle cx="${rightX}" cy="${midY}" r="26"
          fill="#0c1215" stroke="${nodeColor}" stroke-width="1.5" opacity="0.6"/>
  <text x="${rightX}" y="${midY - 5}" text-anchor="middle"
        font-family="DM Mono,monospace" font-size="13" font-weight="700"
        fill="${nodeColor === danger && type !== 'quantum' ? purple : nodeColor}">${labelRight.slice(0, 1)}</text>
  <text x="${rightX}" y="${midY + 16}" text-anchor="middle"
        font-family="DM Mono,monospace" font-size="7" letter-spacing="1.5"
        fill="${subtext}">${labelRight}</text>
</svg>`;
}
