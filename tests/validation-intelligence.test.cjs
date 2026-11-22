'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function extract(start,end){
 const from=html.indexOf(start);
 const to=html.indexOf(end,from+start.length);
 assert.ok(from>=0&&to>from,'Expected source section '+start);
 return html.slice(from,to);
}
test('Inline app JavaScript parses',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(code=>code.trim());
 assert.ok(scripts.length);
 scripts.forEach(code=>new vm.Script(code));
});
const quality=vm.runInNewContext(extract('function milestoneEvidenceQuality(', 'function milestoneLinkedEvidence(')+'\nmilestoneEvidenceQuality;');
test('Achieved status and planned evidence do not count as observed proof',()=>{
 const value=quality({status:'Achieved',evidence:'Future pilot records'},[]);
 assert.equal(value.score,0);
 assert.equal(value.confidence,0);
});
test('Provenance metadata strengthens documentation score without claiming independent verification',()=>{
 const claim=quality({reported_evidence:'Customer activation increased'},[]);
 const documented=quality({reported_evidence:'Customer activation increased',evidence_source_type:'independent',
  evidence_source_url:'https://example.org/data',evidence_method:'Audited activation from recorded session events',
  evidence_date:'2026-11-22',evidence_sample_size:25},[]);
 assert.ok(documented.score>claim.score);
 assert.ok(documented.score<100);
 assert.match(documented.band,/unverified/i);
});
const contextSource=extract('function contextualMilestoneValue(', 'function milestoneEvidenceQuality(');
const assess=vm.runInNewContext(contextSource+'\ncontextualMilestoneValue;',{
 state:{comparisonBusinessType:'Software / SaaS'},
 planVentureContext:()=>({stage:'Scale'}),inferredBusinessType:()=> 'Software / SaaS',
 milestoneRelevance:()=>({score:1})
});
test('SaaS signups without usage are lower value than observed retention',()=>{
 const raw={value:5,difficulty:2,why:'Base potential'};
 const signups=assess({title:'1000 signups'},raw);
 const retention=assess({title:'Measured cohort retention and active use'},raw);
 assert.ok(signups.value<retention.value);
 assert.match(signups.why,/retention/i);
});
const baseline=vm.runInNewContext(extract('function ensureValidationBaseline(', 'function validationCompare(')+'\nensureValidationBaseline;',{
 state:{plan:{milestones:[{title:'First pilot',status:'Not started'}]}},
 estimateMilestone:()=>({value:4}),save:()=>{}
});
test('Baseline helper is available for persistent original-plan snapshots',()=>assert.equal(typeof baseline,'function'));
test('Experiments rank learning, uncertainty and effort instead of relying only on milestone order',()=>{
 assert.match(html,/RECOMMENDED EXPERIMENTS/);
 assert.match(html,/uncertainty\*learning/);
 assert.ok(html.includes('effort/cost'));
});
test('Exports and live route re-evaluation remain available in More options',()=>{
 assert.match(html,/function showAdaptiveRoutes/);
 assert.match(html,/function showExpectedActual/);
 assert.match(html,/function downloadValidationReport/);
});


const impactCode=extract('function inferMilestoneOutcome(', 'function contextualMilestoneValue(');
const impactEngine=vm.runInNewContext(impactCode+'\n({inferMilestoneOutcome,milestoneImpact,cumulativeMilestonePositions});',{
 milestoneRelevance:m=>m.value_assessment?.relevance===0?{score:0}:{score:1},
 milestoneEvidenceQuality:()=>({confidence:.33}),
 milestoneLinkedEvidence:()=>[]
});
test('A failure subtracts conservatively, rather than the full potential score',()=>{
 const m={title:'Initial Field Deployment and Setback',
  reported_evidence:'Two devices failed after heavy rain; moisture readings drifted'};
 const result=impactEngine.milestoneImpact(m,3,'unclear');
 assert.equal(result.kind,'negative');
 assert.ok(result.value<0&&result.value>-.3);
});
test('A personal event with no business relevance receives zero',()=>{
 const m={title:'had a coke',value_assessment:{relevance:0}};
 assert.equal(impactEngine.milestoneImpact(m,0,'none').value,0);
});
test('Positive outcomes add a modest amount, not the full maximum potential',()=>{
 const m={title:'Paid café trial',reported_evidence:'One café paid £150'};
 const result=impactEngine.milestoneImpact(m,4,'unclear');
 assert.equal(result.kind,'positive');
 assert.ok(result.value>0&&result.value<.4);
});
test('Unreported future milestones have a small conditional contribution, unclear results have none',()=>{
 assert.equal(impactEngine.milestoneImpact({title:'Pilot'},5,'none').value,.12);
 assert.equal(impactEngine.milestoneImpact({title:'Pilot',reported_evidence:'Some feedback was collected'},5,'unclear').value,0);
});
test('First milestone starts at zero, later positive results always raise progress, failures reduce it',()=>{
 const positions=impactEngine.cumulativeMilestonePositions([
  {value:.4},{value:.2},{value:-.25},{value:0},{value:.1}]);
 assert.deepEqual(Array.from(positions),[0,.2,-.05,-.05,.05]);
});
test('Avoid misleading chart autoscaling; support negative values and prevent unrelated event jumps',()=>{
 assert.match(html,/Math\.min\(-2,Math\.floor/);
 assert.match(html,/Math\.max\(5,Math\.ceil/);
 assert.match(html,/kind==='irrelevant'\?0:plotValues\[i\]/);
 assert.doesNotMatch(html,/score\+=routeSignalGain\(step\)/);
});
