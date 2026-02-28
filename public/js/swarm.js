/* ── Swarm / Particle visualization ──────────────────────
   Canvas overlay on top of Leaflet. Uses aircraft positions
   to drive a particle swarm + flow field effect.           */
const SWARM = (() => {
  let canvas  = null;
  let ctx     = null;
  let map     = null;
  let enabled = false;
  let raf     = null;
  let particles = [];
  let flowField = [];
  const COLS = 60, ROWS = 40;

  /* ── Particle class ─────────────────────────────────── */
  class Particle {
    constructor(x, y, color) {
      this.x    = x;  this.y    = y;
      this.ox   = x;  this.oy   = y;
      this.vx   = (Math.random()-0.5)*1.5;
      this.vy   = (Math.random()-0.5)*1.5;
      this.life = Math.random()*80 + 40;
      this.age  = 0;
      this.color = color || '#00ff88';
      this.size  = Math.random()*2 + 0.5;
      this.trail = [];
    }
    update(w, h) {
      // Perlin-like flow using sin/cos field
      const col = Math.floor(this.x / w * COLS);
      const row = Math.floor(this.y / h * ROWS);
      const fi  = (row * COLS + col);
      if (flowField[fi]) {
        this.vx += flowField[fi].x * 0.05;
        this.vy += flowField[fi].y * 0.05;
      }
      // Friction
      this.vx *= 0.97;
      this.vy *= 0.97;
      // Drift back toward origin gently
      this.vx += (this.ox - this.x) * 0.001;
      this.vy += (this.oy - this.y) * 0.001;

      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 12) this.trail.shift();

      this.x  += this.vx;
      this.y  += this.vy;
      this.age++;

      // Boundary wrap
      if (this.x < 0) this.x = w;
      if (this.x > w) this.x = 0;
      if (this.y < 0) this.y = h;
      if (this.y > h) this.y = 0;
    }
    draw(ctx) {
      const alpha = 1 - this.age / this.life;
      if (alpha <= 0) return;

      // Draw trail
      if (this.trail.length > 2) {
        ctx.beginPath();
        ctx.moveTo(this.trail[0].x, this.trail[0].y);
        for (let i = 1; i < this.trail.length; i++) {
          ctx.lineTo(this.trail[i].x, this.trail[i].y);
        }
        ctx.strokeStyle = this.color + Math.floor(alpha * 60).toString(16).padStart(2,'0');
        ctx.lineWidth   = this.size * 0.5;
        ctx.stroke();
      }

      // Draw dot
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
      ctx.fillStyle = this.color + Math.floor(alpha * 200).toString(16).padStart(2,'0');
      ctx.fill();

      // Glow
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size*3, 0, Math.PI*2);
      ctx.fillStyle = this.color + '18';
      ctx.fill();
    }
    isDead() { return this.age >= this.life; }
  }

  /* ── Flow field based on aircraft density ─────────── */
  function buildFlowField(aircraftPositions, w, h) {
    const t   = Date.now() * 0.0003;
    flowField = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const angle = Math.sin(c * 0.3 + t) * Math.cos(r * 0.3 + t) * Math.PI * 2;
        flowField.push({ x: Math.cos(angle), y: Math.sin(angle) });
      }
    }
  }

  /* ── Spawn particles from aircraft positions ─────── */
  function spawnFromAircraft(w, h) {
    const states = AIRCRAFT.getData();
    if (!states || !states.length) return;

    const maxSpawn = Math.min(states.length, 50);
    for (let i = 0; i < maxSpawn; i++) {
      const s = states[Math.floor(Math.random() * states.length)];
      if (!s[6] || !s[5]) continue;

      // Convert lat/lng to canvas pixel
      try {
        const pt = map.latLngToContainerPoint([s[6], s[5]]);
        if (pt.x < 0 || pt.x > w || pt.y < 0 || pt.y > h) continue;

        const country = s[2] || '';
        const color   = UTILS.countryColor(country);
        const mil     = AIRCRAFT.isMilitary((s[1]||'').trim());

        particles.push(new Particle(
          pt.x + (Math.random()-0.5)*40,
          pt.y + (Math.random()-0.5)*40,
          mil ? '#ff9900' : color
        ));
      } catch (_) {}
    }

    // Keep particle count manageable
    if (particles.length > 1200) {
      particles = particles.slice(particles.length - 1000);
    }
  }

  /* ── Draw connections between nearby particles ───── */
  function drawConnections(w, h) {
    const maxDist = 60;
    const maxLinks = 300;
    let links = 0;
    for (let i = 0; i < particles.length && links < maxLinks; i++) {
      for (let j = i+1; j < particles.length && links < maxLinks; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        if (d < maxDist) {
          const alpha = (1 - d/maxDist) * 0.3;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
          links++;
        }
      }
    }
  }

  /* ── Main animation loop ─────────────────────────── */
  let frameCount = 0;
  function animate() {
    if (!enabled) return;
    raf = requestAnimationFrame(animate);

    const w = canvas.width;
    const h = canvas.height;

    // Semi-transparent clear for trail effect
    ctx.fillStyle = 'rgba(4,6,8,0.25)';
    ctx.fillRect(0, 0, w, h);

    frameCount++;

    // Rebuild flow field periodically
    if (frameCount % 30 === 0) buildFlowField(null, w, h);

    // Spawn new particles every 20 frames
    if (frameCount % 20 === 0) spawnFromAircraft(w, h);

    // Update + draw particles
    particles = particles.filter(p => !p.isDead());
    drawConnections(w, h);
    particles.forEach(p => { p.update(w, h); p.draw(ctx); });
  }

  /* ── Resize canvas to match map ─────────────────── */
  function resize() {
    const wrap = document.getElementById('map-wrap');
    canvas.width  = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
  }

  function init(mapInstance) {
    map    = mapInstance;
    canvas = document.getElementById('swarm-canvas');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    map.on('resize', resize);
    buildFlowField(null, canvas.width, canvas.height);
  }

  function setEnabled(on) {
    enabled = on;
    if (on) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      animate();
    } else {
      if (raf) cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  return { init, setEnabled };
})();
