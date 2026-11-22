'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../route-engine.js');
// Synthetic fixtures verify graph invariants, NOT real AI business-plan quality.
const businesses=['SaaS startup','Design consultancy','Local cafe','Advanced materials','Manufacturing','Biotechnology'];
const profiles={
 steady:{months:[2,4,7,10,14],gains:[2,3,3,4,5]},
 hockey:{months:[3,6,9,15,24],gains:[1,2,3,9,30]},
 s:{months:[3,6,12,18,24],gains:[1,3,15,12,2]},
 steps:{months:[2,8,13,18,30],gains:[0,20,0,65,2]},
 long:{months:[6,12,24,42,60],gains:[1,1,2,3,18]}
};
const unitFor=(business,id)=>id==='long'?'technology readiness points':business.includes('consultancy')?'retained clients':business.includes('cafe')?'paying cafes':business.includes('materials')?'qualified sites':'paying customers';
function createRoute(business,id,multiplier=1){
 const spec=profiles[id];let cumulative=0;
 return {id,suitability:id==='hockey'&&business==='Design consultancy'?'low':'high',metric_unit:unitFor(business,id),metric_baseline:0,steps:spec.gains.map((n,i)=>{
  cumulative+=n*multiplier;return {title:business+' '+id+' checkpoint '+(i+1),months_from_start:spec.months[i],target_value:cumulative,status:i===4?'aspirational':'planned',difficulty:Math.min(5,i+1),value:3};
 })};
}
for(const business of businesses){
 test(business+': all five milestone-based routes plot correctly',()=>{
  const routes=engine.ROUTES.map(id=>createRoute(business,id));
  assert.equal(routes.length,5);
  const shapes=engine.inspectRouteShapes(routes);
  const distinct=new Set();
  for(const route of routes){
   assert.equal(engine.validRoute(route),true);
   const pts=shapes[route.id];assert.equal(pts.length,6);
   assert.equal(pts[0][0],75);assert.equal(pts[0][1],153);
   for(let i=1;i<pts.length;i++){
    assert.ok(pts[i][0]>pts[i-1][0],'Time coordinates move forward');
    assert.ok(pts[i][1]<=pts[i-1][1],'Cumulative milestone target cannot create artificial decline');
    assert.ok(pts[i][1]>=29,'Never exceed plot ceiling');
   }
   assert.ok(route.steps.every(step=>step.status!=='verified'),'Planning never verifies achievements');
   distinct.add(pts.map(p=>p.map(n=>n.toFixed(2)).join(':')).join('|'));
  }
  assert.equal(distinct.size,5,'Five route strategies have genuinely distinct measured trajectories in the test fixtures');
  assert.equal(routes[1].id,'hockey');
  if(business==='Design consultancy'){
   assert.equal(routes[1].suitability,'low');
   assert.ok(shapes.hockey.length>0,'Low-suitability hockey route remains explorable');
  }
 });
}
test('Higher milestone targets change graph heights without changing unrelated metadata',()=>{
 const original=createRoute('SaaS startup','steady');
 const changed=JSON.parse(JSON.stringify(original));
 changed.steps[2].target_value+=1;
 const old=engine.layout(original,75,153,1550,60),next=engine.layout(changed,75,153,1550,60);
 assert.notDeepEqual(old,next);
 assert.equal(changed.steps[2].status,'planned');
 assert.equal(changed.steps[2].difficulty,original.steps[2].difficulty);
});
test('Long R&D timeline extends farther than a local steady venture on a shared time axis',()=>{
 const a=createRoute('Local cafe','steady'),b=createRoute('Advanced materials','long');
 const steady=engine.layout(a,75,153,1550,60),rd=engine.layout(b,75,153,1550,60);
 assert.ok(steady.at(-1)[0]<rd.at(-1)[0]);
});
test('Planned plateaus stay level and no milestone is manufactured',()=>{
 const r=createRoute('Manufacturing','steps');const pts=engine.layout(r,75,153,1550,60);
 assert.equal(pts.length,r.steps.length+1);
 assert.equal(pts[0][1],pts[1][1]);
 assert.equal(pts[2][1],pts[3][1]);
});
test('Reject out-of-sequence dates and decreases',()=>{
 const a=createRoute('Biotechnology','hockey');a.steps[2].months_from_start=1;
 assert.equal(engine.validRoute(a),false);
 const b=createRoute('Biotechnology','s');b.steps[2].target_value=-5;
 assert.equal(engine.validRoute(b),false);
});

test('Routes with compatible metrics share a scale, instead of all reaching the top',()=>{
 const a=createRoute('SaaS startup','steady'),b=createRoute('SaaS startup','hockey');
 a.metric='paying customers';b.metric='paying customers';a.metric_unit='customers';b.metric_unit='customers';
 const common=engine.sharedComparisonMax(a,[a,b]);
 assert.equal(common,b.steps.at(-1).target_value);
 const pa=engine.layout(a,75,153,1550,60,common);
 const pb=engine.layout(b,75,153,1550,60,engine.sharedComparisonMax(b,[a,b]));
 assert.ok(pa.at(-1)[1]>pb.at(-1)[1],'Smaller real target stays visibly lower');
});
test('Different units cannot be treated as comparable vertical scales',()=>{
 const a=createRoute('Biotechnology','long'),b=createRoute('Biotechnology','steady');
 assert.equal(engine.sharedComparisonMax(a,[a,b]),null);
});

test('Route quality assessment accepts measured, distinct signatures',()=>{
 const profiles={
  steady:{targets:[2,4,6,8,10],times:[1,2,3,4,5]},
  hockey:{targets:[1,2,4,10,35],times:[1,3,6,9,12]},
  s:{targets:[1,4,18,28,30],times:[1,3,6,9,12]},
  steps:{targets:[0,8,8,35,35],times:[1,3,6,9,12]},
  long:{targets:[1,2,4,6,9],times:[6,12,24,36,60]}
 };
 for(const [id,p] of Object.entries(profiles)){
  const r={id,metric:id==='long'?'technical readiness':'paying customers',metric_type:id==='long'?'technical':'commercial',metric_baseline:0,steps:p.targets.map((v,i)=>({months_from_start:p.times[i],target_value:v}))};
  assert.equal(engine.diagnoseRoute(r).matches,true,id);
 }
});
test('Route name alone does not validate implausible shape',()=>{
 const same={metric_baseline:0,metric:'paying customers',metric_type:'commercial',steps:[1,2,3,4,5].map((v,i)=>({target_value:v,months_from_start:i+1}))};
 for(const id of ['hockey','s','steps']){
  assert.equal(engine.diagnoseRoute({...same,id}).matches,false,id+' must reject flat linear trajectory');
 }
});

test('Measured route deltas follow cumulative target changes, including genuine plateaus',()=>{
 const r=createRoute('SaaS startup','steps');
 const delta=engine.routeValidationDeltas(r);
 assert.equal(delta.length,r.steps.length);
 assert.equal(delta[0],0);
 assert.equal(delta[2],0);
 assert.ok(delta[3]>delta[1],'Largest target breakthrough drives largest visual increase');
 assert.ok(delta.every(v=>Number.isFinite(v)&&v>=0));
});
test('Minor positive milestone still increases route trajectory after a major breakthrough',()=>{
 const r=createRoute('SaaS startup','steps');
 const delta=engine.routeValidationDeltas(r);
 assert.ok(delta[4]>0);
 assert.ok(delta[4]<delta[3]);
 const cumulative=delta.reduce((scores,value)=>{scores.push(Number(((scores.at(-1)||0)+value).toFixed(6)));return scores},[]);
 assert.ok(cumulative[4]>cumulative[3]);
});
test('Changing measured targets changes route validation deltas, not simply labels',()=>{
 const r=createRoute('SaaS startup','steady');
 const original=engine.routeValidationDeltas(r);
 const revised=structuredClone(r);
 revised.steps[3].target_value+=2;
 revised.steps[4].target_value+=2;
 assert.notDeepEqual(engine.routeValidationDeltas(revised),original);
});
test('All five route scenarios derive their shapes from measured milestone targets',()=>{
 const curves=engine.ROUTES.map(id=>engine.routeValidationDeltas(createRoute('SaaS startup',id)));
 assert.equal(new Set(curves.map(x=>x.map(y=>y.toFixed(3)).join(','))).size,5);
});
test('Invalid and flat routes do not invent progress',()=>{
 const invalid=createRoute('SaaS startup','steady');
 invalid.steps[1].target_value=-1;
 assert.deepEqual(engine.routeValidationDeltas(invalid),[]);
 const flat=createRoute('SaaS startup','steady');
 flat.steps.forEach(step=>step.target_value=0);
 assert.deepEqual(engine.routeValidationDeltas(flat),[0,0,0,0,0]);
});
