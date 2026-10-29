const templates = [
  {id:'customer-support',name:'Customer Support Agent',initials:'CS',tone:'blue',industry:'ecommerce',industryLabel:'E-commerce',useCase:'customer-support',useCaseLabel:'Customer support',description:'A friendly support agent that answers product questions, helps resolve issues, and knows when to bring in a human.',tools:2,integrations:1,workflow:true,capabilities:['Answers common product and order questions','Collects context before escalating an issue','Keeps the conversation clear and empathetic']},
  {id:'appointment-setter',name:'Appointment Setter',initials:'AS',tone:'green',industry:'healthcare',industryLabel:'Healthcare',useCase:'scheduling',useCaseLabel:'Scheduling',description:'A helpful scheduling assistant that qualifies callers, finds an available time, and confirms the details.',tools:1,integrations:2,workflow:true,capabilities:['Qualifies each caller with a few clear questions','Checks availability and books appointments','Sends a concise confirmation']},
  {id:'sales-assistant',name:'Sales Assistant',initials:'SA',tone:'purple',industry:'finance',industryLabel:'Financial services',useCase:'sales',useCaseLabel:'Sales',description:'A conversational sales assistant that learns what a customer needs and guides them toward the right next step.',tools:2,integrations:1,workflow:true,capabilities:['Understands customer goals and intent','Explains relevant product benefits','Routes qualified leads to the right team']},
  {id:'real-estate',name:'Real Estate Assistant',initials:'RE',tone:'amber',industry:'real-estate',industryLabel:'Real estate',useCase:'information',useCaseLabel:'Information',description:'An always-available property assistant that answers listing questions and helps prospective buyers arrange a viewing.',tools:1,integrations:1,workflow:false,capabilities:['Shares property details and availability','Captures buyer requirements','Schedules a viewing with an agent']},
  {id:'travel-concierge',name:'Travel Concierge',initials:'TC',tone:'rose',industry:'travel',industryLabel:'Travel',useCase:'customer-support',useCaseLabel:'Customer support',description:'A calm travel companion for answering trip questions, explaining policies, and helping travelers find support.',tools:2,integrations:1,workflow:true,capabilities:['Answers common itinerary questions','Explains travel and booking policies','Escalates urgent changes to a person']},
  {id:'order-status',name:'Order Status Assistant',initials:'OS',tone:'blue',industry:'ecommerce',industryLabel:'E-commerce',useCase:'information',useCaseLabel:'Information',description:'A quick and reliable assistant that helps customers check an order and understand what happens next.',tools:1,integrations:1,workflow:false,capabilities:['Collects an order reference safely','Explains delivery status in plain language','Shares the best next step if an order is delayed']}
];
let selectedId=templates[0].id;
let activeView='preview';
let toastTimer;
const grid=document.querySelector('#template-grid');
const search=document.querySelector('#template-search');
const industry=document.querySelector('#industry-filter');
const usecase=document.querySelector('#usecase-filter');
const source=document.querySelector('#source-filter');
const empty=document.querySelector('#empty-state');
const count=document.querySelector('#template-count');
const text=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
function filteredTemplates(){
 const q=search.value.trim().toLowerCase();
 return templates.filter(t=>(!q||`${t.name} ${t.description} ${t.industryLabel} ${t.useCaseLabel}`.toLowerCase().includes(q))&&(industry.value==='all'||industry.value===t.industry)&&(usecase.value==='all'||usecase.value===t.useCase)&&(source.value==='all'||source.value==='elevenlabs'));
}
function render(){
 const rows=filteredTemplates();
 if(!rows.some(t=>t.id===selectedId)&&rows.length)selectedId=rows[0].id;
 grid.innerHTML=rows.map(t=>`<button class="template-card${t.id===selectedId?' selected':''}" data-id="${t.id}" aria-pressed="${t.id===selectedId}"><span class="card-title-row"><span class="template-avatar ${t.tone}">${t.initials}</span><h3>${t.name}</h3><span class="card-trailing">${t.workflow?'Workflow':''}</span></span><p class="card-description">${t.description}</p><span class="card-meta"><span class="meta-pill"><i class="mini-dot"></i>${t.industryLabel}</span><span class="meta-pill">${t.useCaseLabel}</span><span class="card-trailing">${t.tools} tools</span></span></button>`).join('');
 count.textContent=`${rows.length} templates`;
 empty.hidden=rows.length>0;
 grid.hidden=rows.length===0;
 const selected=templates.find(t=>t.id===selectedId)||templates[0];
 text('preview-name',selected.name);text('preview-category',`${selected.industryLabel} · ${selected.useCaseLabel}`);text('preview-subtitle',selected.useCaseLabel);text('workflow-agent-label',selected.name);text('detail-name',selected.name);text('detail-description',selected.description);
 document.querySelector('#detail-tags').innerHTML=`<span class="meta-pill"><i class="mini-dot"></i>${selected.industryLabel}</span><span class="meta-pill">${selected.useCaseLabel}</span><span class="meta-pill">${selected.tools} tools</span><span class="meta-pill">${selected.integrations} integrations</span>`;
 document.querySelector('#detail-capabilities').innerHTML=selected.capabilities.map(x=>`<li>${x}</li>`).join('');
 const workflowTab=document.querySelector('[data-view="workflow"]');workflowTab.hidden=!selected.workflow;
 if(!selected.workflow&&activeView==='workflow')setView('preview');
 document.querySelectorAll('.template-card').forEach(card=>card.addEventListener('click',()=>{selectedId=card.dataset.id;render();}));
}
function setView(view){activeView=view;document.querySelectorAll('.view-tab').forEach(tab=>{const active=tab.dataset.view===view;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});document.querySelector('#agent-demo').hidden=view!=='preview';document.querySelector('#workflow-demo').hidden=view!=='workflow';}
function showToast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2600);}
function resetFilters(){search.value='';industry.value='all';usecase.value='all';source.value='all';render();search.focus();}
search.addEventListener('input',render);industry.addEventListener('change',render);usecase.addEventListener('change',render);source.addEventListener('change',render);
document.querySelector('#reset-filters').addEventListener('click',resetFilters);document.querySelector('#empty-reset').addEventListener('click',resetFilters);
document.querySelectorAll('.view-tab').forEach(tab=>tab.addEventListener('click',()=>setView(tab.dataset.view)));
document.querySelector('#details-toggle').addEventListener('click',event=>{const extra=document.querySelector('#detail-extra');extra.hidden=!extra.hidden;event.currentTarget.textContent=extra.hidden?'View details':'Hide details';});
document.querySelector('#use-template').addEventListener('click',()=>showToast('Local reference preview · template actions are disabled'));
document.querySelector('#create-agent').addEventListener('click',()=>showToast('Local reference preview · no account is connected'));
document.querySelector('#talk-button').addEventListener('click',()=>showToast('Conversation preview is unavailable in the offline copy'));
document.querySelector('#copy-link').addEventListener('click',()=>showToast('This is a local template preview'));
document.querySelector('.share-button').addEventListener('click',()=>showToast('This is a local template preview'));
document.querySelector('.sort-button').addEventListener('click',()=>showToast('Templates are sorted by featured order'));
search.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.focus();}});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.focus();}});
render();
