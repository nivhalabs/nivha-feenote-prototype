(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const gbp=n=>'£'+n.toLocaleString('en-GB');
const NEEDS=[
 ['longer','Longer than 6 months','The donor has more than 6 cm of head hair and we need to look further back.'],
 ['alcmatch','Alcohol that matches split drug segments','Drugs are cut into segments and the alcohol result must be cut at the same points.'],
 ['alcsplit','Alcohol split into 0 to 3 cm and 3 to 6 cm','Two separate alcohol results instead of one.'],
 ['custom','Segments not offered online','For example, a different layout for each test.'],
 ['other','Something else','Tell us in your own words on the next step.']
];
const HAIR=CATALOGUE.filter(p=>p.group==='hair');
const BY=Object.fromEntries(HAIR.map(p=>[p.code,p]));
const nameOf=c=>BY[c].name;
const basePrice=c=>BY[c].variants?BY[c].variants[(S.variants&&S.variants[c])||0].price:BY[c].price;
const isAlc=c=>ALCOHOL_CODES.includes(c);
const ALC_EtG=330;
const S={step:0,needs:new Set(),tests:new Set(['H-DP1']),variants:{},months:3,monthsOther:'',cuts:new Set(),preset:'one',
 alcMonths:6,alcMatch:true,court:'',wording:'',ack:false,hair:'',hairCm:'',notes:'',
 org:'',name:'',email:'',phone:'',how:'Email',when:'Any time',donor:'',speed:'Standard',loc:'Belfast',date:'',comments:'',consent:false};
const STEPS=['Request','Plan','Contact','Review'];
let errs={};

function per(){return S.months==='other'?6:+S.months}
function bounds(){return [0,...[...S.cuts].filter(c=>c<per()).sort((a,b)=>a-b),per()]}
function segCount(){return bounds().length-1}
function layoutText(){const b=bounds();return b.slice(0,-1).map((v,i)=>(b[i+1]-v)+' cm').join(', ')+' ('+bounds().slice(0,-1).map((v,i)=>v+'–'+bounds()[i+1]).join(', ')+' cm from the scalp)'}
function hairNeeded(){return S.months==='other'?null:per()}
function price(){
 const n=segCount();let tot=0,any=false,unknown=false;
 S.tests.forEach(t=>{const p=basePrice(t);
  if(!isAlc(t)){tot+=p*n;any=true}
  else if(t==='H-EtG'){tot+=ALC_EtG*(S.alcMatch&&S.needs.has('alcmatch')?n:(S.needs.has('alcsplit')?2:1));any=true}
  else{tot+=BY[t].price+ALC_EtG*((S.alcMatch&&S.needs.has('alcmatch')?n:(S.needs.has('alcsplit')?2:1))-1);any=true}
 });
 if(S.months==='other'||(S.preset==='unsure'&&[...S.tests].some(t=>!isAlc(t))))unknown=true;
 return {tot,any,unknown,n};
}
function barText(){
 const p=price();
 if(S.step===0)return 'Choose everything that applies. You can change it on the next step.';
 if(S.months==='other'||p.unknown)return '<strong>Price to be confirmed.</strong> We agree it with you before booking.';
 return '<strong>Indicative: '+p.n+' '+(p.n===1?'segment':'segments')+' over '+per()+' cm, about '+gbp(p.tot)+' + VAT.</strong> Each segment is charged at the panel price. We confirm the final price before anything is booked.';
}

function chips(name,items,sel,multi){return '<div class="chips" role="group">'+items.map(([v,l])=>`<label class="chip"><input type="${multi?'checkbox':'radio'}" name="${name}" value="${esc(v)}" ${sel(v)?'checked':''}><span>${esc(l||v)}</span></label>`).join('')+'</div>'}
function field(id,label,val,opt={}){const e=errs[id];return `<div class="field ${e?'bad':''}"><label for="${id}">${label}${opt.optional?' <span style="font-weight:400;color:var(--faint)">(optional)</span>':''}</label>${opt.area?`<textarea id="${id}" rows="3" placeholder="${esc(opt.ph||'')}">${esc(val)}</textarea>`:`<input id="${id}" type="${opt.type||'text'}" value="${esc(val)}" ${opt.auto?`autocomplete="${opt.auto}"`:''} ${opt.inputmode?`inputmode="${opt.inputmode}"`:''} placeholder="${esc(opt.ph||'')}">`}${e?`<div class="err" role="alert">${e}</div>`:''}</div>`}

function rulerHtml(){
 const P=per();let h='';const rows=P>6?2:1;
 for(let r=0;r<rows;r++){
  h+='<div class="ruler">'+(r===0?'<div class="scalp" aria-hidden="true">Scalp</div>':'<div class="scalp" aria-hidden="true" style="visibility:hidden">Scalp</div>');
  for(let i=1;i<=6;i++){const cm=r*6+i;
   h+=`<div class="cell ${cm>P?'off':''}">${cm-1}–${cm}</div>`;
   if(cm<P) h+=`<button type="button" class="cut" data-cut="${cm}" aria-pressed="${S.cuts.has(cm)}" aria-label="Cut the hair after ${cm} cm"></button>`; else h+='<span class="cut-gap"></span>';
  }
  h+='</div>';
 }
 const b=bounds();
 h+='<div class="segs">'+b.slice(0,-1).map((v,i)=>`<div class="sg" style="flex:${b[i+1]-v}"><b>${i+1}</b>${v}–${b[i+1]}</div>`).join('')+'</div>';
 return h;
}

function prefill(){
 let d=null;try{d=JSON.parse(localStorage.getItem('nivha-sr-prefill')||'null');localStorage.removeItem('nivha-sr-prefill')}catch(e){}
 if(!d||(Date.now()-(d.t||0))>6*3600*1000)return;
 const tests=(d.tests||[]).filter(x=>BY[x.code]);
 if(tests.length){S.tests=new Set(tests.map(x=>x.code));tests.forEach(x=>{S.variants[x.code]=x.variant||0})}
 const drugCm=Number(d.cm)>=1&&Number(d.cm)<=6?Number(d.cm):null;
 if(drugCm){S.months=drugCm;S.cuts=new Set((d.cuts||[]).filter(c=>c>0&&c<drugCm));const m=[...S.cuts].sort((x,y)=>x-y).join(),mo=Array.from({length:drugCm-1},(_,i)=>i+1).join(),bl=Array.from({length:Math.ceil(drugCm/3)-1},(_,i)=>(i+1)*3).join();S.preset=S.cuts.size===0?'one':m===mo?'monthly':m===bl?'three':'custom'}
 if(d.alcCm===3||d.alcCm===6)S.alcMonths=d.alcCm;
 if(d.speed)S.speed='Fast track';
 if(d.loc==='derry')S.loc='Derry';else if(d.loc==='belfast')S.loc='Belfast';else if(d.loc==='onsite')S.loc='Elsewhere';
 if(d.email)S.email=d.email;
 if(d.org)S.org=d.org;
}
function view(){
 const n=S.step;
 $('#steps').innerHTML=STEPS.map((s,i)=>`<li class="${i<=n?'on':''}"><span>${i===n?s:''}</span></li>`).join('');
 const T=[['What do you need?','Choose everything that applies. Online you can choose 1 to 6 months and cut the hair where you like within that. This form covers the rest.'],
  ['Your plan','Tell us the tests, how far back, and how the hair should be cut. We have started it from your basket.'],
  ['How do we reach you?','So we can confirm the plan and the price quickly, without you having to start again.'],
  ['Check and send','This goes straight to the NIVHA team.']][n];
 $('#ft').textContent=T[0];$('#lede').textContent=T[1];
 let h='';
 if(n===0){
  h=`<fieldset><legend class="sr" style="position:absolute;left:-9999px">Special request type</legend><div class="opts">${NEEDS.map(([k,t,d])=>`<label class="opt"><input type="checkbox" name="need" value="${k}" ${S.needs.has(k)?'checked':''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div></fieldset>
  <div class="note">Not sure which fits? Choose "Something else". You do not need to know the right wording.</div>`;
 }
 if(n===1){
  h+=`<fieldset><legend>Which tests?</legend><p class="hint">Started from your basket. Add or remove as needed.</p>${chips('test',HAIR.map(t=>[t.code,t.name]),v=>S.tests.has(v),true)}${errs.tests?`<div class="err" style="color:var(--err);font-size:.8125rem;margin-top:.25rem">${errs.tests}</div>`:''}</fieldset>`;
  const hasDrug=[...S.tests].some(t=>!isAlc(t)),hasAlc=[...S.tests].some(isAlc);
  if(hasDrug||!hasAlc){
   h+=`<fieldset><legend>How far back should the drug test go?</legend><p class="hint">About 1 cm of head hair for each month. The newest hair is closest to the scalp.</p>${chips('months',[['1','1 month'],['2','2 months'],['3','3 months'],['4','4 months'],['5','5 months'],['6','6 months'],['9','9 months'],['12','12 months'],['other','Other']],v=>String(S.months)===v)}
   ${S.months==='other'?field('monthsOther','Tell us the period',S.monthsOther,{ph:'For example, 18 months or the date range in the order'}):''}</fieldset>`;
   if(S.months!=='other'){
    h+=`<fieldset><legend>How should the hair be cut?</legend><p class="hint">Each segment is tested and reported separately. Tap a line to cut the hair there.</p>${chips('preset',[['one','One result'],['monthly','Month by month'],['three','3 cm blocks'],['unsure','Not sure']],v=>S.preset===v)}<div style="height:.75rem"></div>${S.preset==='unsure'?'<div class="sub"><p style="margin:0"><strong>That is fine.</strong> We will contact you to agree how the hair should be cut before the sample is sent. Nothing is cut until you confirm, and you can send us the order or letter of instruction to work from.</p></div>':rulerHtml()}${S.preset==='custom'?'<p class="hint">Your own layout. Tap lines to change it.</p>':''}</fieldset>`;
   }
  }
  if(hasAlc){
   h+=`<fieldset><legend>Alcohol</legend>`;
   if(S.needs.has('alcmatch')&&hasDrug)h+=`<label class="opt"><input type="checkbox" id="alcMatch" ${S.alcMatch?'checked':''}><span><b>Cut the alcohol result at the same points as the drugs</b><small>The EtG result follows the drug segments above. We check the details with you before the sample is cut.</small></span></label>`;
   else if(S.needs.has('alcsplit'))h+=`<p class="hint">Two separate EtG results: 0 to 3 cm and 3 to 6 cm. This needs at least 6 cm of hair.</p>`;
   else h+=`<p class="hint">Alcohol is one result. Choose how far back.</p>${chips('alcm',[['3','3 months (3 cm)'],['6','6 months (6 cm)']],v=>String(S.alcMonths)===v)}`;
   h+=`</fieldset>`;
  }
  h+=`<fieldset><legend>Is this for a court?</legend><p class="hint">Choose the one that fits best.</p>${chips('court',[['order','Ordered by a court'],['pre','Agreed in proceedings'],['may','May be used for court purposes'],['no','No court involvement']],v=>S.court===v)}${errs.court?`<div class="err" style="color:var(--err);font-size:.8125rem;margin-top:.25rem">${errs.court}</div>`:''}`;
  if(S.court==='order'||S.court==='pre'||S.court==='may'){
   h+=`<div class="sub"><div class="warn"><strong>${S.court==='may'?'Please check what the court may need.':'Please check the order.'}</strong> ${S.court==='may'?'If the result may be used in court, it is your responsibility to choose the period and segments the court is likely to require. ':'It is your responsibility to choose the period and segments the court has requested. '}We test what you ask for and cannot change it afterwards.</div>
   ${field('wording','Wording from the order or letter of instruction',S.wording,{area:true,optional:true,ph:'Paste the paragraph that sets the period or segments, if there is one'})}
   <p class="hint">After you send this, you can email the order or letter of instruction to <a href="mailto:info@nivha.net">info@nivha.net</a> quoting your reference.</p>
   <label class="check" style="display:flex;gap:.75rem;margin-top:.75rem;align-items:flex-start;font-size:.875rem;cursor:pointer"><input type="checkbox" id="ack" ${S.ack?'checked':''} style="width:20px;height:20px;accent-color:var(--primary);margin-top:2px;flex-shrink:0"><span>${S.preset==='unsure'?'I will confirm the period and segments with NIVHA against the court requirements before the sample is cut, and I am responsible for that choice.':'I have checked the plan above against the court requirements and I am responsible for choosing it.'}</span></label>${errs.ack?`<div class="err" style="color:var(--err);font-size:.8125rem;margin-top:.25rem">${errs.ack}</div>`:''}</div>`;
  }
  h+='</fieldset>';
  const need=hairNeeded()||'';
  h+=`<fieldset><legend>How much hair does the donor have?</legend><p class="hint">We collect what there is and record the hair taken. If there is not enough for the plan, we call you before going ahead and adjust the invoice, or refund if you paid online.</p>${chips('hair',[['enough',need?`At least ${need} cm`:'Enough for the plan'],['short','Shorter'],['unsure','Not sure']],v=>S.hair===v)}${S.hair==='short'?`<div class="two" style="margin-top:.75rem">${field('hairCm','About how many cm',S.hairCm,{inputmode:'decimal',ph:'For example, 4'})}</div>`:''}${errs.hair?`<div class="err" style="color:var(--err);font-size:.8125rem;margin-top:.25rem">${errs.hair}</div>`:''}</fieldset>`;
  h+=field('notes','Anything else about the hair or the request',S.notes,{area:true,optional:true,ph:'For example, dyed or bleached hair, or a date the court wants covered'});
 }
 if(n===2){
  h+=`<div class="two">${field('org','Organisation',S.org,{optional:true,auto:'organization'})}${field('name','Your name',S.name,{auto:'name'})}</div>
  <div class="two">${field('email','Email',S.email,{type:'email',auto:'email'})}${field('phone','Phone',S.phone,{type:'tel',auto:'tel',inputmode:'tel'})}</div>
  <fieldset><legend>How should we reach you?</legend>${chips('how',[['Phone','Phone'],['Email','Email']],v=>S.how===v)}</fieldset>
  <fieldset><legend>Best time to call</legend>${chips('when',['Morning','Afternoon','Any time'].map(x=>[x,x]),v=>S.when===v)}</fieldset>
  <fieldset><legend>Where and when?</legend><div class="chips" style="margin-bottom:.75rem">${chips('loc',['Belfast','Derry','Elsewhere'].map(x=>[x,x]),v=>S.loc===v)}</div>${chips('speed',[['Standard','Standard turnaround'],['Fast track','Fast track']],v=>S.speed===v)}<div style="height:.75rem"></div>${field('date','Date the donor can attend',S.date,{ph:'As soon as possible, or a date'})}</fieldset>
  ${field('donor','Donor name',S.donor,{optional:true,auto:'off'})}
  ${field('comments','Anything we should know before we call',S.comments,{area:true,optional:true})}
  <label style="display:flex;gap:.75rem;align-items:flex-start;font-size:.875rem;cursor:pointer"><input type="checkbox" id="consent" ${S.consent?'checked':''} style="width:20px;height:20px;accent-color:var(--primary);margin-top:2px;flex-shrink:0"><span>I agree to NIVHA using these details to contact me about this request. See the privacy notice.</span></label>${errs.consent?`<div class="err" style="color:var(--err);font-size:.8125rem;margin-top:.25rem">${errs.consent}</div>`:''}`;
 }
 if(n===3){h+=`<div class="card review">${reviewHtml()}</div><p class="help" style="margin-top:1rem">Sending this does not book anything and does not charge you.</p>`}
 $('#panel').innerHTML=h;
 $('#bar').innerHTML=barText();
 $('#back').style.visibility=n===0?'hidden':'visible';
 $('#next').textContent=n===3?'Send request':'Continue';
 $('#next').disabled=(n===0&&S.needs.size===0);
}

function reviewHtml(){
 const row=(l,v,step)=>`<dt>${l}${step!=null?`<button class="edit" data-edit="${step}">Change</button>`:''}</dt><dd>${v}</dd>`;
 const needs=NEEDS.filter(x=>S.needs.has(x[0])).map(x=>x[1]).join('; ');
 const hasDrug=[...S.tests].some(t=>!isAlc(t));
 let h='<dl>';
 h+=row('Request',esc(needs),0);
 h+=row('Tests',esc([...S.tests].map(nameOf).join(', ')),1);
 if(hasDrug)h+=row('Period and cuts',S.months==='other'?esc(S.monthsOther||'To be agreed'):S.preset==='unsure'?esc(per()+' cm. Cutting not decided: NIVHA to agree with the booker before the sample is cut'):esc(per()+' cm: '+layoutText()),1);
 if([...S.tests].some(isAlc))h+=row('Alcohol',S.needs.has('alcmatch')&&S.alcMatch?'Cut at the same points as the drugs':S.needs.has('alcsplit')?'Two EtG results, 0 to 3 cm and 3 to 6 cm':esc(S.alcMonths+' months, one result'),1);
 h+=row('Court',S.court==='order'?'Ordered by a court. Period and segments confirmed by the booker':S.court==='pre'?'Agreed in proceedings. Period and segments confirmed by the booker':S.court==='may'?'May be used for court purposes. Period and segments confirmed by the booker':'No court involvement',1);
 if(S.wording)h+=row('Wording from the order',esc(S.wording),1);
 h+=row('Hair available',S.hair==='enough'?'Confirmed enough for the plan':S.hair==='short'?'About '+esc(S.hairCm||'?')+' cm':'Not sure',1);
 if(S.notes)h+=row('Notes',esc(S.notes),1);
 h+=row('Contact',esc(S.name)+(S.org?', '+esc(S.org):'')+'<br>'+esc(S.email)+' · '+esc(S.phone)+'<br>Prefers '+esc(S.how.toLowerCase())+', '+esc(S.when.toLowerCase()),2);
 h+=row('Where and when',[S.loc,S.speed,S.date].filter(Boolean).map(esc).join(' · '),2);
 if(S.donor)h+=row('Donor',esc(S.donor),2);
 const p=price();
 h+=row('Indicative price',p.unknown?'To be confirmed once the cutting is agreed':gbp(p.tot)+' + VAT. We confirm the final price before booking.');
 return h+'</dl>';
}

function validate(){
 errs={};const n=S.step;
 if(n===1){
  if(!S.tests.size)errs.tests='Choose at least one test.';
  if(!S.court)errs.court='Please tell us whether this is for a court.';
  if((S.court&&S.court!=='no')&&!S.ack)errs.ack='Please confirm you have checked the plan against the court requirements.';
  if(!S.hair)errs.hair='Choose one. "Not sure" is fine.';
  if(S.months==='other'&&!S.monthsOther.trim())errs.monthsOther='Tell us the period in a few words.';
 }
 if(n===2){
  if(!S.name.trim())errs.name='Please add your name.';
  if(!/^\S+@\S+\.\S+$/.test(S.email))errs.email='Please enter a valid email address.';
  if(S.phone.replace(/\D/g,'').length<7)errs.phone='Please enter a phone number we can reach you on.';
  if(!S.consent)errs.consent='Please tick to let us contact you.';
 }
 return !Object.keys(errs).length;
}

function go(n){S.step=n;view();const t=$('#ft');t.focus({preventScroll:true});window.scrollTo({top:$('#form').offsetTop-8,behavior:'smooth'})}

document.addEventListener('click',e=>{
 const c=e.target.closest('[data-cut]');
 if(c){const k=+c.dataset.cut;S.cuts.has(k)?S.cuts.delete(k):S.cuts.add(k);S.preset='custom';view();return}
 const ed=e.target.closest('[data-edit]');if(ed){go(+ed.dataset.edit)}
});
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.name==='need'){t.checked?S.needs.add(t.value):S.needs.delete(t.value);
   if(S.needs.has('alcmatch')||S.needs.has('alcsplit')){if(![...S.tests].some(isAlc))S.tests.add('H-EtG')}
   if(S.needs.has('longer')&&per()<=6&&S.months!=='other'){S.months=12;setPreset('three')}
   view();return}
 if(t.name==='test'){if(t.checked){S.tests.add(t.value);INCLUSION_RULES.forEach(x=>{if(x.superset===t.value)S.tests.delete(x.subset);if(x.subset===t.value)S.tests.delete(x.superset)})}else S.tests.delete(t.value);view();return}
 if(t.name==='months'){S.months=t.value;if(S.months!=='other')setPreset(S.preset==='custom'?'one':S.preset);view();return}
 if(t.name==='preset'){setPreset(t.value);view();return}
 if(t.name==='alcm'){S.alcMonths=+t.value;view();return}
 if(t.name==='court'){S.court=t.value;view();return}
 if(t.name==='hair'){S.hair=t.value;view();return}
 if(t.name==='how'){S.how=t.value;return}
 if(t.name==='when'){S.when=t.value;return}
 if(t.name==='loc'){S.loc=t.value;return}
 if(t.name==='speed'){S.speed=t.value;$('#bar').innerHTML=barText();return}
 if(t.id==='alcMatch'){S.alcMatch=t.checked;view();return}
 if(t.id==='ack'){S.ack=t.checked;return}
 if(t.id==='consent'){S.consent=t.checked;return}
});
document.addEventListener('input',e=>{const t=e.target;if(t.id&&t.id in S&&typeof S[t.id]==='string'){S[t.id]=t.value}});
function setPreset(p){S.preset=p;const P=per();S.cuts=new Set();
 if(p==='monthly')for(let i=1;i<P;i++)S.cuts.add(i);
 if(p==='three')for(let i=3;i<P;i+=3)S.cuts.add(i);}

$('#form').hidden=false;prefill();S.step=0;view();
$('#back').addEventListener('click',()=>go(Math.max(0,S.step-1)));
$('#next').addEventListener('click',async()=>{
 if(!validate()){view();const f=document.querySelector('.err');if(f)f.scrollIntoView({block:'center',behavior:'smooth'});return}
 if(S.step<3)return go(S.step+1);
 const btn=$('#next');btn.disabled=true;btn.textContent='Sending';$('#send-err').hidden=true;
 const rows=[...document.querySelectorAll('.review dt')].map(dt=>[dt.firstChild.textContent.trim(),dt.nextElementSibling.innerHTML.replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')]);
 const body={needs:[...S.needs],tests:[...S.tests],rows,name:S.name,email:S.email,phone:S.phone,org:S.org,how:S.how,when:S.when,consent:S.consent,website:''};
 try{
  const res=await fetch('/api/special-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  if(!res.ok||!j.ok)throw new Error(j.error||'failed');
  $('#ref').textContent=j.reference;
  $('#done-sum').innerHTML='<div class="review">'+reviewHtml().replace(/<button class="edit"[^>]*>Change<\/button>/g,'')+'</div>';
  $('#done-mail').textContent=S.email;
  $('#form').hidden=true;$('#done').hidden=false;$('#done').focus();window.scrollTo({top:0,behavior:'smooth'});
 }catch(e){
  btn.disabled=false;btn.textContent='Send request';
  const m=$('#send-err');m.textContent='We could not send this just now. Please try again, or email info@nivha.net or call 02890 737942.';m.hidden=false;
 }
});
})();
