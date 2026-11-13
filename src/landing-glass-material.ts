/**
 * Studio lighting translated from the vgpu homepage's WGSL environment.
 * Copyright (c) 2025 Vercel, Inc. MIT; see public/vendor/vgpu/LICENSE.
 * Relay geometry is ray-marched beveled glass, with the hero's IOR and material settings.
 */
export const RELAY_GLASS_GLSL = `
float studioPanel(vec3 direction, vec3 forward, vec2 size, float feather) {
  forward=normalize(forward);
  vec3 helper=abs(forward.y)>.92 ? vec3(0.,0.,1.) : vec3(0.,1.,0.);
  vec3 right=normalize(cross(helper,forward)), up=cross(forward,right);
  float facing=dot(direction,forward);
  if (facing<=.01) return 0.;
  vec2 local=abs(vec2(dot(direction,right),dot(direction,up))/facing);
  vec2 edge=1.-smoothstep(size,size+vec2(feather),local);
  return edge.x*edge.y;
}
vec3 studioEnvironment(vec3 inputDirection) {
  vec3 d=normalize(inputDirection);
  float floorBlend=1.-smoothstep(-.22,-.02,d.y);
  vec3 room=mix(vec3(.00025,.0003,.0004),vec3(.006,.007,.009),floorBlend);
  room=mix(room,vec3(.00002),(1.-smoothstep(-.08,.08,d.z))*smoothstep(-.28,-.08,d.y));
  float horizon=exp(-abs(d.y+.1)*22.)*.0012;
  vec3 color=room+vec3(horizon,horizon*.96,horizon*.9);
  color+=vec3(.82,.84,.88)*studioPanel(d,vec3(-.82,.08,.57),vec2(1.35,1.1),.22)*.011;
  color+=vec3(1.,.97,.91)*studioPanel(d,vec3(0.,-.707,.707),vec2(.38,.62),.18)*.22;
  color+=vec3(.76,.88,1.)*studioPanel(d,vec3(.612,.354,.707),vec2(.5,.16),.035)*20.;
  vec3 encoded=pow(max(color/(1.+color),vec3(0.)),vec3(1./2.2));
  return mix(encoded/12.92,pow((encoded+.055)/1.055,vec3(2.4)),step(vec3(.04045),encoded));
}
vec3 intoGlass(vec3 p, vec2 tilt) {
  float cy=cos(tilt.x), sy=sin(tilt.x), cx=cos(tilt.y), sx=sin(tilt.y);
  p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  return vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
}
float rectangleDistance(vec2 p,vec2 size) {
  vec2 q=abs(p)-size;
  return length(max(q,0.))+min(max(q.x,q.y),0.);
}
float relayOutline(vec2 p,float shape) {
  if (shape<.5) return triangleDistance(p);
  if (shape<1.5) return rectangleDistance(p,vec2(.72,1.));
  p=mat2(.7071,-.7071,.7071,.7071)*p;
  return rectangleDistance(p,vec2(.73));
}
float glassDistance(vec3 world,float shape,vec2 tilt) {
  vec3 p=intoGlass(world,tilt);
  float outside=relayOutline(p.xy,shape);
  float inside=relayOutline(p.xy/.865,shape)*.865;
  float ring=max(outside,-inside);
  vec2 d=vec2(ring,abs(p.z)-.12);
  return min(max(d.x,d.y),0.)+length(max(d,0.))-.018;
}
vec3 glassNormal(vec3 p,float shape,vec2 tilt) {
  vec2 e=vec2(.002,0.);
  return normalize(vec3(
    glassDistance(p+e.xyy,shape,tilt)-glassDistance(p-e.xyy,shape,tilt),
    glassDistance(p+e.yxy,shape,tilt)-glassDistance(p-e.yxy,shape,tilt),
    glassDistance(p+e.yyx,shape,tilt)-glassDistance(p-e.yyx,shape,tilt)));
}
vec3 shadeRelayGlass(vec2 pixel,vec4 prism,vec4 meta,vec3 beam,out float coverage) {
  coverage=0.;
  vec2 q=(pixel-prism.xy)/prism.z;
  if (max(abs(q.x),abs(q.y))>1.45) return beam;
  float c=cos(prism.w),s=sin(prism.w);
  q=mat2(c,-s,s,c)*q;
  vec3 camera=vec3(0.,0.,3.2), direction=normalize(vec3(q,-3.2));
  float travel=1.5;
  bool hit=false;
  vec3 position=vec3(0.);
  for (int stepIndex=0;stepIndex<32;stepIndex++) {
    position=camera+direction*travel;
    float distance=glassDistance(position,meta.x,meta.yz);
    if (distance<.0018) { hit=true; break; }
    travel+=max(distance*.92,.0018);
    if (travel>5.2) break;
  }
  if (!hit) return beam;
  vec3 normal=glassNormal(position,meta.x,meta.yz), view=-direction;
  float facing=clamp(dot(normal,view),0.,1.);
  float f0=pow((uMaterial.x-1.)/(uMaterial.x+1.),2.);
  float fresnel=f0+(1.-f0)*pow(1.-facing,5.);
  vec3 reflected=studioEnvironment(reflect(direction,normal))*uMaterial.y*uMaterial.z;
  vec3 redRay=refract(direction,normal,1./(uMaterial.x-.013));
  vec3 greenRay=refract(direction,normal,1./uMaterial.x);
  vec3 blueRay=refract(direction,normal,1./(uMaterial.x+.013));
  vec3 transmission=vec3(studioEnvironment(redRay).r,studioEnvironment(greenRay).g,studioEnvironment(blueRay).b)*.08;
  vec3 absorption=exp(-vec3(1.,1.,.54)*.16);
  vec3 glass=beam*absorption*(1.-fresnel)*.76+reflected*fresnel+transmission;
  // A narrow clear bevel carries the studio softboxes rather than a drawn outline.
  glass+=vec3(.012,.014,.02)*(1.-facing)*uMaterial.w;
  coverage=(.28+fresnel*.68)*uMaterial.w;
  return mix(beam,glass,uMaterial.w);
}
`;
