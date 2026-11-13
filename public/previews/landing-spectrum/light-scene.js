'use strict';

(() => {
  const canvas = document.querySelector('.optical-canvas');
  const hero = document.querySelector('.hero');
  if (!canvas || !globalThis.LabOptics) return;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;
  const { add, sub, scale, mix, createScene } = globalThis.LabOptics;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = [.5, .5], target = [.5, .5];
  let width = 0, height = 0, ratio = 1;
  let frame = 0, visible = true, previousTime = 0, variant = 'a';

  function path(points, close = true) {
    context.beginPath();
    points.forEach((point, i) => i ? context.lineTo(...point) : context.moveTo(...point));
    if (close) context.closePath();
  }

  function color(rgb, opacity) { return `rgba(${rgb.join(',')},${opacity})`; }

  function drawGlass(scene, foreground) {
    const { polygon, center, size } = scene;
    const inset = polygon.map(point => mix(center, point, variant === 'c' ? .86 : .82));
    const back = polygon.map(point => add(point, [-size * .035, size * .025]));
    context.save();
    if (variant === 'b') context.globalAlpha = .55;
    if (!foreground) {
      path(back); context.fillStyle = '#030305'; context.fill();
      context.strokeStyle = '#303035'; context.lineWidth = 1; context.stroke();
      polygon.forEach((point, i) => {
        const next = (i + 1) % polygon.length;
        const shade = context.createLinearGradient(...point, ...polygon[next]);
        shade.addColorStop(0, '#121214'); shade.addColorStop(.5, '#55555c55'); shade.addColorStop(1, '#09090b');
        path([back[i], back[next], polygon[next], point]); context.fillStyle = shade; context.fill();
      });
      const body = context.createLinearGradient(center[0], center[1] - size / 2, center[0], center[1] + size / 2);
      body.addColorStop(0, '#060609'); body.addColorStop(.7, '#020204'); body.addColorStop(1, '#242428');
      path(polygon); context.fillStyle = body; context.fill();
    } else {
      polygon.forEach((point, i) => {
        const next = (i + 1) % polygon.length;
        const gradient = context.createLinearGradient(...point, ...inset[next]);
        gradient.addColorStop(0, '#ffffff38'); gradient.addColorStop(.2, '#c0c0c04d'); gradient.addColorStop(.4, '#111113b0'); gradient.addColorStop(.79, '#b1b1b121'); gradient.addColorStop(1, '#eeeeee62');
        path([point, polygon[next], inset[next], inset[i]]); context.fillStyle = gradient; context.fill();
        context.lineWidth = 1.1; context.strokeStyle = '#ededed6b'; context.stroke();
        path([point, polygon[next]], false);
        const edge = context.createLinearGradient(...point, ...polygon[next]);
        edge.addColorStop(0, '#e8e8e826'); edge.addColorStop(.35, '#fff9'); edge.addColorStop(.7, '#fff4'); edge.addColorStop(1, '#ffffffb8');
        context.strokeStyle = edge; context.lineWidth = 1.7; context.shadowBlur = 6; context.shadowColor = '#fff8'; context.stroke(); context.shadowBlur = 0;
      });
      path(inset); context.strokeStyle = '#000b'; context.lineWidth = 3; context.stroke();
      path(inset.map(point => mix(center, point, .977))); context.strokeStyle = '#8d8d941f'; context.lineWidth = 1; context.stroke();
    }
    context.restore();
  }

  function drawInput(scene) {
    const middle = scene.bands[12].paths;
    if (!middle[0] || !middle[1]) return;
    const points = [middle[0].source, middle[1].source, middle[1].entry, middle[0].entry];
    context.save(); context.globalCompositeOperation = 'lighter';
    const fade = context.createLinearGradient(...scene.source, ...scene.aim);
    fade.addColorStop(0, '#ffffff28'); fade.addColorStop(.75, '#ffffffa6'); fade.addColorStop(1, '#fffffff0');
    path(points); context.fillStyle = fade; context.shadowColor = '#fff'; context.shadowBlur = 22; context.fill();
    context.shadowBlur = 8; context.globalAlpha = .7; context.fill();
    path([mix(middle[0].source, middle[1].source, .5), mix(middle[0].entry, middle[1].entry, .5)], false);
    context.lineWidth = 2.5; context.strokeStyle = '#fff'; context.stroke(); context.restore();
  }

  function drawSpectrum(scene) {
    context.save(); context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < scene.bands.length - 1; i++) {
      const band = scene.bands[i], next = scene.bands[i + 1];
      const paths = [band.paths[0], next.paths[1]];
      if (!paths[0] || !paths[1]) continue;
      const [a, b] = paths;
      const energy = Math.min(a.energy, b.energy);
      const end = mix(a.far, b.far, .5);
      const start = mix(a.exit, b.exit, .5);
      const fill = context.createLinearGradient(...start, ...end);
      fill.addColorStop(0, color(band.color, .26 * energy));
      fill.addColorStop(.13, color(band.color, .41 * energy));
      fill.addColorStop(1, color(band.color, .07 * energy));
      path([a.exit, b.exit, b.far, a.far]); context.fillStyle = fill;
      // A few shared glow sheets keep pointer motion responsive at desktop size.
      context.shadowColor = color(band.color, .5); context.shadowBlur = i % 4 === 0 ? 18 : 0; context.globalAlpha = .5; context.fill();
      context.shadowBlur = 0; context.globalAlpha = .8; context.fill();
      // All internal segments share the same traced boundary points as the outgoing band.
      context.globalAlpha = .22; context.lineWidth = Math.max(1, scene.halfWidth * .14);
      context.strokeStyle = color(band.color, .8);
      for (const ray of [a, b]) { path(ray.points, false); context.stroke(); }
      context.globalAlpha = 1;
    }
    context.restore();
  }

  function drawContact(scene) {
    const ray = scene.bands[12].paths[0];
    if (!ray) return;
    context.save(); context.globalCompositeOperation = 'lighter';
    for (const point of [ray.entry, ray.exit]) {
      const glow = context.createRadialGradient(...point, 0, ...point, 25);
      glow.addColorStop(0, '#ffffffb0'); glow.addColorStop(.12, '#ffffff4a'); glow.addColorStop(1, '#ffffff00');
      context.fillStyle = glow; context.fillRect(point[0] - 25, point[1] - 25, 50, 50);
    }
    context.restore();
  }

  function draw() {
    if (!width || !height) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
    const scene = createScene(width, height, current, variant);
    context.save();
    if (variant === 'b') {
      const squash = scene.mobile ? .3 : .29;
      context.translate(0, height * (scene.mobile ? .57 : .68));
      context.scale(1, squash);
    }
    drawGlass(scene, false);
    drawInput(scene); drawSpectrum(scene); drawGlass(scene, true); drawContact(scene);
    context.restore();
  }

  function render(time) {
    frame = 0;
    if (!visible || document.hidden) return;
    const amount = 1 - Math.pow(.88, Math.min(3, (time - (previousTime || time - 16.67)) / 16.67));
    previousTime = time;
    current = mix(current, target, reduced.matches ? 1 : amount);
    const settled = Math.hypot(...sub(current, target)) < .0004;
    if (settled) current = [...target];
    draw();
    if (!settled) frame = requestAnimationFrame(render);
  }

  function invalidate() { if (!frame && visible && !document.hidden) { previousTime = 0; frame = requestAnimationFrame(render); } }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / Math.max(1, width * height)));
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    invalidate();
  }
  function pointerMove(event) {
    if (reduced.matches || event.isPrimary === false || event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    target = [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
    invalidate();
  }
  window.addEventListener('pointermove', pointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { target = [.5, .5]; invalidate(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else invalidate(); });
  reduced.addEventListener('change', () => { current = target = [.5, .5]; invalidate(); });
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(hero);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) invalidate(); else { cancelAnimationFrame(frame); frame = 0; }
  });
  visibilityObserver.observe(hero);
  globalThis.labLightScene = Object.freeze({
    setVariant(value) { variant = ['a', 'b', 'c'].includes(value) ? value : 'a'; invalidate(); },
    dispose() { cancelAnimationFrame(frame); resizeObserver.disconnect(); visibilityObserver.disconnect(); window.removeEventListener('pointermove', pointerMove); }
  });
  resize();
})();
