import { RELAY_GLASS_GLSL } from './landing-glass-material';

export type LightSection = { top: number; height: number };
export type LightAnchor = { x: number; y: number; radius: number; shape?: number };
export type LightPoint = LightAnchor & { angle: number };

/** A stable route through the actual page, with shared vertices between every beam. */
export function buildLightRoute(width: number, viewportHeight: number, heroBottom: number, sections: LightSection[]): LightAnchor[] {
  const anchors: LightAnchor[] = [{ x: -width * .07, y: heroBottom - 64, radius: 0 }];
  const radius = Math.min(55, Math.max(25, width * .038));
  const add = (y: number) => {
    const side = anchors.length % 2 === 1 ? .085 : .915;
    anchors.push({ x: width * side, y, radius: radius * (anchors.length % 3 === 0 ? .92 : 1), shape: (anchors.length - 1) % 3 });
  };
  add(heroBottom + viewportHeight * .17);
  for (const section of sections) {
    const end = section.top + section.height;
    if (end <= heroBottom) continue;
    const candidate = Math.max(heroBottom, section.top) + Math.min(section.height * .25, viewportHeight * .3);
    let last = anchors[anchors.length - 1].y;
    while (candidate - last > viewportHeight * 1.16) { add(last + viewportHeight * .86); last = anchors[anchors.length - 1].y; }
    if (candidate - last > viewportHeight * .53) add(candidate);
    last = anchors[anchors.length - 1].y;
    while (end - last > viewportHeight * 1.18) { add(last + viewportHeight * .88); last = anchors[anchors.length - 1].y; }
  }
  const last = anchors[anchors.length - 1];
  const pageBottom = Math.max(heroBottom, ...sections.map(section => section.top + section.height));
  anchors.push({ x: width * (anchors.length % 2 ? .22 : .78), y: Math.max(pageBottom + 150, last.y + viewportHeight * .7), radius: 0 });
  return anchors;
}

/** Scroll bends the route in document space; the pointer controls the same shared joints. */
export function projectLightRoute(anchors: LightAnchor[], width: number, height: number, scrollY: number, pointer: [number, number], motion: { mouseStrength?: number; scrollStrength?: number; prismScale?: number; phase?: number } = {}): LightPoint[] {
  const phase = motion.phase ?? scrollY / Math.max(1, height);
  const mouse = motion.mouseStrength ?? 1, scroll = motion.scrollStrength ?? 1;
  const amplitude = Math.min(30, width * .022);
  const points = anchors.map((anchor, index) => ({
    ...anchor,
    radius: anchor.radius * (motion.prismScale ?? 1),
    x: anchor.x + Math.sin(phase * .72 + index * 1.9) * amplitude * scroll + (pointer[0] - .5) * amplitude * 1.8 * Math.cos(index * .7) * mouse,
    y: anchor.y - scrollY + Math.sin(phase * .55 + index * 1.3) * 14 * scroll + (pointer[1] - .5) * 28 * Math.sin(index * .9) * mouse,
    angle: 0,
  }));
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
    const incoming = Math.atan2(point.y - previous.y, point.x - previous.x);
    const outgoing = Math.atan2(next.y - point.y, next.x - point.x);
    point.angle = Math.atan2(Math.sin(incoming) + Math.sin(outgoing), Math.cos(incoming) + Math.cos(outgoing)) + .42 + (pointer[0] - .5) * .16 * mouse + Math.sin(phase * .6 + index) * .09 * scroll;
  });
  return points;
}

export const LIGHT_VERTEX_SHADER = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

export const LIGHT_FRAGMENT_SHADER = `
precision highp float;
#define MAX_LIGHTS 4
uniform vec2 uResolution;
uniform float uRatio;
uniform float uClipTop;
uniform int uSegmentCount;
uniform int uPrismCount;
uniform vec4 uSegments[MAX_LIGHTS];
uniform vec4 uBeams[MAX_LIGHTS];
uniform vec4 uPrisms[MAX_LIGHTS];
uniform vec4 uPrismMeta[MAX_LIGHTS];
uniform vec4 uMaterial;

vec3 spectrum(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < .18) return mix(vec3(1.0,.015,.055), vec3(1.0,.39,.01), t/.18);
  if (t < .35) return mix(vec3(1.0,.39,.01), vec3(1.0,.96,.035), (t-.18)/.17);
  if (t < .50) return mix(vec3(1.0,.96,.035), vec3(.08,1.0,.18), (t-.35)/.15);
  if (t < .68) return mix(vec3(.08,1.0,.18), vec3(0.0,.92,1.0), (t-.50)/.18);
  if (t < .86) return mix(vec3(0.0,.92,1.0), vec3(.08,.13,1.0), (t-.68)/.18);
  return mix(vec3(.08,.13,1.0), vec3(.48,.025,1.0), (t-.86)/.14);
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
  vec2 d = b-a;
  return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
float cross2(vec2 a, vec2 b) { return a.x*b.y-a.y*b.x; }
float triangleDistance(vec2 p) {
  vec2 a=vec2(0.0,-1.0), b=vec2(.866,.5), c=vec2(-.866,.5);
  float d=min(lineDistance(p,a,b),min(lineDistance(p,b,c),lineDistance(p,c,a)));
  bool inside=cross2(b-a,p-a)>=0.0 && cross2(c-b,p-b)>=0.0 && cross2(a-c,p-c)>=0.0;
  return inside ? -d : d;
}
${RELAY_GLASS_GLSL}
void main() {
  vec2 p=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)/uRatio;
  if (p.y < uClipTop) { gl_FragColor=vec4(0.0); return; }
  vec3 light=vec3(0.0);
  float glassAlpha=0.0;
  for (int i=0; i<MAX_LIGHTS; i++) {
    if (i>=uSegmentCount) break;
    vec2 a=uSegments[i].xy, b=uSegments[i].zw, delta=b-a;
    float len=length(delta), t=dot(p-a,delta)/(len*len);
    if (t<0.0 || t>1.0) continue;
    float width=mix(uBeams[i].x,uBeams[i].y,t);
    vec2 normal=vec2(-delta.y,delta.x)/len;
    float across=dot(p-a-delta*t,normal)/width;
    vec3 rgb=spectrum(across*.52+.5);
    float core=1.0-smoothstep(.65,1.08,abs(across));
    float haze=exp(-across*across*.65)*.065;
    float energy=uBeams[i].z*(.84+.16*sin(t*3.14159));
    light+=rgb*(core*.94+haze)*energy;
    light+=vec3(1.0)*exp(-across*across*220.0)*.035*energy;
  }
  for (int i=0; i<MAX_LIGHTS; i++) {
    if (i>=uPrismCount) break;
    float coverage=0.0;
    light=shadeRelayGlass(p,uPrisms[i],uPrismMeta[i],light,coverage);
    glassAlpha=max(glassAlpha,coverage);
  }
  light*=smoothstep(uClipTop,uClipTop+55.0,p.y);
  vec3 rgb=1.0-exp(-light*1.45);
  float alpha=max(clamp(max(max(light.r,light.g),light.b)*1.7,0.0,.98),glassAlpha);
  gl_FragColor=vec4(rgb,alpha);
}
`;
