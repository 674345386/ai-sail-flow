'use strict';

// Independent planar optics. Interaction reference: vgpu's runtime/interaction.ts.
// The geometry is solved for each wavelength, rather than rotating a rainbow image.
// Deployed-bundle static evidence: ev_49c65ecdc62230ac0b028850fcea709b1130c614d149efff3d8b45eb9fa2f5c7.
// Reference inspection did not execute the remote page; geometry and rendering below are local.
(() => {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const scale = (a, n) => [a[0] * n, a[1] * n];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const normalize = a => scale(a, 1 / (Math.hypot(...a) || 1));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mix = (a, b, amount) => add(a, scale(sub(b, a), amount));

  function intersect(polygon, origin, direction) {
    const area = polygon.reduce((sum, point, i) => sum + cross(point, polygon[(i + 1) % polygon.length]), 0);
    let closest;
    polygon.forEach((start, i) => {
      const edge = sub(polygon[(i + 1) % polygon.length], start);
      const denominator = cross(direction, edge);
      if (Math.abs(denominator) < 1e-9) return;
      const offset = sub(start, origin);
      const distance = cross(offset, edge) / denominator;
      const along = cross(offset, direction) / denominator;
      if (distance < .02 || along < 0 || along > 1 || (closest && closest.distance <= distance)) return;
      closest = { distance, normal: scale(normalize([edge[1], -edge[0]]), area >= 0 ? 1 : -1), point: add(origin, scale(direction, distance)), edge: i };
    });
    return closest;
  }

  function refract(direction, normal, ratio) {
    const cosine = clamp(-dot(direction, normal), 0, 1);
    const discriminant = 1 - ratio * ratio * (1 - cosine * cosine);
    if (discriminant < 0) return null;
    return normalize(add(scale(direction, ratio), scale(normal, ratio * cosine - Math.sqrt(discriminant))));
  }

  function transmission(direction, normal, a, b) {
    const r0 = ((a - b) / (a + b)) ** 2;
    return 1 - (r0 + (1 - r0) * (1 - clamp(-dot(direction, normal), 0, 1)) ** 5);
  }

  function trace(polygon, origin, direction, ior) {
    const first = intersect(polygon, origin, direction);
    if (!first || dot(direction, first.normal) >= 0) return null;
    let inside = refract(direction, first.normal, 1 / ior);
    if (!inside) return null;
    let point = first.point;
    let energy = transmission(direction, first.normal, 1, ior);
    const points = [point];
    for (let bounce = 0; bounce < 5; bounce++) {
      const hit = intersect(polygon, point, inside);
      if (!hit) return null;
      point = hit.point; points.push(point);
      const inward = scale(hit.normal, -1);
      const outgoing = refract(inside, inward, ior);
      if (outgoing) {
        energy *= transmission(inside, inward, ior, 1);
        return { points, entry: first.point, exit: point, direction: outgoing, energy, bounces: bounce };
      }
      inside = sub(inside, scale(hit.normal, 2 * dot(inside, hit.normal)));
      energy *= .9;
    }
    return null;
  }

  function wavelengthColor(nm) {
    let rgb;
    if (nm < 440) rgb = [(440 - nm) / 60, 0, 1];
    else if (nm < 490) rgb = [0, (nm - 440) / 50, 1];
    else if (nm < 510) rgb = [0, 1, (510 - nm) / 20];
    else if (nm < 580) rgb = [(nm - 510) / 70, 1, 0];
    else if (nm < 645) rgb = [1, (645 - nm) / 65, 0];
    else rgb = [1, 0, 0];
    return rgb.map(n => Math.round(clamp(n, 0, 1) * 255));
  }

  function createScene(width, height, pointer = [.5, .5], variant = 'a') {
    const x = clamp(pointer[0], 0, 1), y = clamp(pointer[1], 0, 1);
    const mobile = width < 820;
    const center = [width * (mobile ? .68 : .735), height * (mobile ? .77 : .54)];
    const size = Math.min(width * (mobile ? .64 : .38), height * (mobile ? .34 : .74));
    const shapeWidth = size * 1.09, shapeHeight = size;
    const local = variant === 'c'
      ? [[-.36, -.56], [.52, -.38], [.22, .52], [-.41, .35]].map(p => [p[0] * shapeWidth, p[1] * shapeHeight])
      : [[0, -.54 * shapeHeight], [.55 * shapeWidth, .46 * shapeHeight], [-.55 * shapeWidth, .46 * shapeHeight]];
    const angle = (x - .5) * .045;
    const polygon = local.map(([px, py]) => add(center, [px * Math.cos(angle) - py * Math.sin(angle), px * Math.sin(angle) + py * Math.cos(angle)]));
    const rightEdge = variant === 'c' ? [polygon[1], polygon[2]] : [polygon[0], polygon[1]];
    const aim = mix(...rightEdge, .52 + (x - .5) * .31);
    const source = [width * 1.2, center[1] + size * (.35 + (y - .5) * 1.8)];
    const incident = normalize(sub(aim, source));
    const perpendicular = [-incident[1], incident[0]];
    const halfWidth = Math.max(2.8, size * (.009 + (x * .65 + y * .35) * .013));
    const rayLength = Math.hypot(width, height) * 2.2;
    const bands = [];
    for (let i = 0; i <= 24; i++) {
      const nm = 420 + i * 11;
      const ior = 1.2 + .065 / ((nm / 1000) ** 2);
      const paths = [-1, 1].map(rail => {
        const start = add(source, scale(perpendicular, rail * halfWidth * (1.6 + y * .5)));
        const end = add(aim, scale(perpendicular, rail * halfWidth));
        const direction = normalize(sub(end, start));
        const path = trace(polygon, start, direction, ior);
        return path ? { ...path, source: start, far: add(path.exit, scale(path.direction, rayLength)) } : null;
      });
      bands.push({ wavelength: nm, color: wavelengthColor(nm), paths });
    }
    return { width, height, center, polygon, source, aim, incident, halfWidth, bands, size, variant, mobile };
  }

  globalThis.LabOptics = Object.freeze({ add, sub, scale, normalize, mix, clamp, intersect, refract, trace, wavelengthColor, createScene });
})();
