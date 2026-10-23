const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'matchschema.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const storage = new Map();
const elements = new Map();
function element() {
  return {innerHTML:'',textContent:'',value:'',style:{},dataset:{},
    classList:{add(){},remove(){}},addEventListener(){},removeEventListener(){},
    appendChild(){},remove(){},closest(){return null;}};
}
const document = {
  visibilityState:'visible', body:element(),
  getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
  querySelectorAll(){return[];},querySelector(){return element();},addEventListener(){},elementFromPoint(){return null;},
};
const context = vm.createContext({
  console,document,navigator:{},globalThis:null,
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  alert(){},confirm(){return true;},setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},Date,Math,
});
context.globalThis=context;
vm.runInContext(source,context,{filename:'matchschema.html'});

function evaluate(code){return vm.runInContext(code,context);}
function setPlayers(count,gkCount=3){
  evaluate(`S.players=Array.from({length:${count}},(_,i)=>({id:'p'+i,name:'Player '+i,canGK:i<${gkCount},active:true,returnPriority:false}));`);
}
function schedule(format,count,interval=5){
  evaluate(`S.format='${format}';S.changeInterval=${interval}`); setPlayers(count); assert.equal(evaluate('buildSchedule()'),true);
  return JSON.parse(evaluate('JSON.stringify(S.slots)'));
}

// The setup exposes both interval choices and remembers a change when no match is active.
assert.match(elements.get('interval-toggle').innerHTML,/3 minuter/);
assert.match(elements.get('interval-toggle').innerHTML,/5 minuter/);
evaluate('S.slots=[];setChangeInterval(3)');
assert.equal(evaluate('S.changeInterval'),3);
assert.equal(storage.get('ms2-interval'),'3');

// Setup provides a safe way back to, or out of, an already generated match.
schedule('3x15',8,3);
evaluate("S.matchName='Ongoing test';saveMatchState();renderSetupMatchActions()");
assert.equal(elements.get('ongoing-match-actions').style.display,'block');
assert.equal(elements.get('generate-button').style.display,'none');
evaluate('discardMatch()');
assert.equal(evaluate('S.slots.length'),0);
assert.equal(storage.has('ms2-match'),false);
assert.equal(elements.get('ongoing-match-actions').style.display,'none');
assert.equal(elements.get('generate-button').style.display,'block');

for(const format of ['2x15','3x15']){
  for(const interval of [3,5]){
    const expectedSlots=(format==='2x15'?30:45)/interval;
    for(let count=5;count<=12;count++){
      for(let run=0;run<100;run++){
        const slots=schedule(format,count,interval);
        assert.equal(slots.length,expectedSlots);
        for(const slot of slots){
          const playing=[slot.gk,...slot.on];
          assert.equal(playing.length,5);
          assert.equal(new Set([...playing,...slot.bench]).size,count);
          assert.equal(new Set(playing).size,5);
        }
        for(let i=1;i<slots.length;i++){
          if(slots[i].period===slots[i-1].period)assert.equal(slots[i].gk,slots[i-1].gk);
          if(count<=9){
            const nextPlaying=new Set([slots[i].gk,...slots[i].on]);
            for(const id of slots[i-1].bench)assert(nextPlaying.has(id),`${format}/${interval} min: ${id} stayed benched with ${count} players`);
          }
        }
      }
    }
  }
}

// Rest/injured scheduling remains valid for every format, interval and viable squad size.
for(const format of ['2x15','3x15']){
  for(const interval of [3,5]){
    for(let count=6;count<=12;count++){
      for(let run=0;run<20;run++){
        schedule(format,count,interval);
        evaluate('S.baseSeconds=0;S.seconds=0');
        const id=evaluate('S.slots[0].on[0]');
        const periodCount=format==='3x15'?2:1;
        assert.equal(evaluate(`setPlayerRest('${id}',${periodCount})`),true);
        const slots=JSON.parse(evaluate('JSON.stringify(S.slots)'));
        for(const slot of slots){
          const all=[slot.gk,...slot.on,...slot.bench,...slot.rest];
          assert.equal(new Set(all).size,count);
          assert.equal(new Set([slot.gk,...slot.on]).size,5);
          if(slot.period<periodCount)assert(slot.rest.includes(id));
        }
      }
    }
  }
}

// A rest is rejected if fewer than five other players would remain.
schedule('2x15',5,5);
const unavailableRestId=evaluate('S.slots[0].on[0]');
assert.equal(evaluate(`setPlayerRest('${unavailableRestId}',1)`),false);
assert(!evaluate(`S.slots.some(sl=>(sl.rest||[]).includes('${unavailableRestId}'))`));

// A returning outfield player receives hard priority in the next block.
schedule('3x15',8);
evaluate("S.players.find(p=>p.id==='p7').returnPriority=true; recalcFrom(1)");
assert(evaluate("[S.slots[1].gk,...S.slots[1].on].includes('p7')"));

// Current-block swaps work; past blocks are immutable.
schedule('2x15',8);
evaluate('S.baseSeconds=30;S.seconds=30');
const before=JSON.parse(evaluate('JSON.stringify(S.slots[0])'));
assert.equal(evaluate(`applySwap(0,'${before.on[0]}','${before.bench[0]}')`),true);
assert(evaluate(`S.slots[0].on.includes('${before.bench[0]}')`));
evaluate('S.baseSeconds=301;S.seconds=301');
const past=JSON.parse(evaluate('JSON.stringify(S.slots[0])'));
assert.equal(evaluate(`applySwap(0,'${past.on[0]}','${past.bench[0]}')`),false);
assert.deepEqual(JSON.parse(evaluate('JSON.stringify(S.slots[0])')),past);

// The in-progress match persists its format, substitution interval and name.
schedule('2x15',8,3);
evaluate("S.matchId='match-test';S.matchName='Testmatch';saveMatchState();S.format='3x15';S.changeInterval=5;S.slots=[];loadMatchState()");
assert.equal(evaluate('S.format'),'2x15');
assert.equal(evaluate('S.changeInterval'),3);
assert.equal(evaluate('S.matchName'),'Testmatch');
assert.equal(evaluate('S.slots.length'),10);

// Pausing replaces an on-field player immediately; returning gives next-block priority.
schedule('3x15',8,5);
evaluate('S.baseSeconds=60;S.seconds=60');
const pausedId=evaluate('S.slots[0].on[0]');
evaluate(`pausePlayer('${pausedId}')`);
assert.equal(evaluate(`[S.slots[0].gk,...S.slots[0].on].length`),5);
assert(!evaluate(`S.slots.slice(1).some(sl=>[sl.gk,...sl.on, ...sl.bench].includes('${pausedId}'))`));
evaluate(`returnPlayer('${pausedId}')`);
assert(evaluate(`[S.slots[1].gk,...S.slots[1].on].includes('${pausedId}')`));

// Rest/injured excludes a player for whole periods and returns them without priority.
schedule('3x15',8,5);
evaluate('S.baseSeconds=60;S.seconds=60');
const restingId=evaluate('S.slots[0].on[0]');
assert.equal(evaluate(`setPlayerRest('${restingId}',2)`),true);
const restedSlots=JSON.parse(evaluate('JSON.stringify(S.slots)'));
for(const slot of restedSlots.filter(sl=>sl.period<2)){
  assert(slot.rest.includes(restingId));
  assert(![slot.gk,...slot.on,...slot.bench].includes(restingId));
}
for(const slot of restedSlots.filter(sl=>sl.period===2)){
  assert(!slot.rest.includes(restingId));
  assert([slot.gk,...slot.on,...slot.bench].includes(restingId));
}
assert.equal(evaluate(`playerById('${restingId}').returnPriority`),false);
const restedMinutes=evaluate(`S.slots.reduce((sum,sl)=>sum+([sl.gk,...sl.on].includes('${restingId}')?fmt().blockMin:0),0)`);
assert(restedMinutes>=5&&restedMinutes<=15);
evaluate("S.matchId='rest-persistence';S.matchName='Rest test';saveMatchState();S.slots=[];loadMatchState()");
assert(evaluate(`S.slots[0].rest.includes('${restingId}')`));

// A rest can be ended early, still without activating hard return priority.
evaluate(`endPlayerRest('${restingId}')`);
assert(!evaluate(`S.slots.some(sl=>(sl.rest||[]).includes('${restingId}'))`));
assert.equal(evaluate(`playerById('${restingId}').returnPriority`),false);

// Finishing creates a history snapshot and clears only the in-progress match.
evaluate("S.matchId='history-test';S.matchName='History test';S.baseSeconds=1800;finishMatch()");
const history=JSON.parse(storage.get('ms2-history'));
assert.equal(history[0].name,'History test');
assert.equal(history[0].slots.length,9);
assert.equal(history[0].changeInterval,5);
assert.equal(storage.has('ms2-match'),false);

console.log('matchschema tests passed');

function cupSetup(interval=2.5, positions=true) {
  setPlayers(8,8);
  evaluate(`S.slots=[];S.format='1x25';S.changeInterval=${interval};S.baseSeconds=0;S.seconds=0;S.timerOn=false;
    S.cup={id:'cup-test',positions:${positions},roles:{p1:'back',p2:'back',p3:'back',p4:'back',p5:'forward',p6:'forward',p7:'forward'},gk:'p0',totals:{},matches:0};`);
  evaluate("S.players.forEach(p=>{p.canBack=!S.cup.roles[p.id]||S.cup.roles[p.id]==='back';p.canForward=!S.cup.roles[p.id]||S.cup.roles[p.id]==='forward';});localStorage.setItem('ms2-format',S.format);localStorage.setItem('ms2-interval',S.changeInterval)");
  assert.equal(evaluate('buildSchedule()'),true);
}
for(const interval of [2.5,3,5]) {
  for(let run=0;run<40;run++) {
    cupSetup(interval);
    const slots=JSON.parse(evaluate('JSON.stringify(S.slots)'));
    assert.equal(slots.length,Math.ceil(25/interval));
    assert.equal(evaluate('S.slots.reduce((n,sl)=>n+slotMinutes(sl),0)'),25);
    for(const sl of slots) {
      assert.equal(sl.gk,'p0');
      assert.equal(sl.on.filter(id=>sl.roles[id]==='back').length,2);
      assert.equal(sl.on.filter(id=>sl.roles[id]==='forward').length,2);
      assert.equal(new Set([sl.gk,...sl.on,...sl.bench]).size,8);
    }
    if(interval===2.5) {
      const minutes=JSON.parse(evaluate('JSON.stringify(cupMatchMinutes({slots:S.slots,changeInterval:2.5,elapsedSeconds:1500}))'));
      for(const id of ['p1','p2','p3','p4'])assert.equal(minutes[id].out,12.5);
      const forwards=['p5','p6','p7'].map(id=>minutes[id].out);
      assert.ok(Math.max(...forwards)-Math.min(...forwards)<=2.5);
    }
  }
}
// Position settings are locked for the whole match.
cupSetup();
const lockedSlots=evaluate('JSON.stringify(S.slots)');
evaluate('setCupPositions(false)');
assert.equal(evaluate('S.cup.positions'),true);
assert.equal(evaluate('JSON.stringify(S.slots)'),lockedSlots);
cupSetup();
assert.equal(evaluate("applySwap(0,'p1','p5')"),false);
assert.equal(evaluate("applySwap(0,'p0','p1')"),false);
assert.equal(evaluate("applySwap(0,S.slots[0].on.find(id=>cupRole(id)==='back'),S.slots[0].bench.find(id=>cupRole(id)==='back'))"),true);
cupSetup(3,false);
assert.equal(evaluate('S.slots[8].startMin+slotMinutes(S.slots[8])'),25);
assert.equal(evaluate("S.slots.every(sl=>sl.on.length===4&&sl.gk==='p0')"),true);
// The next match moves the previous keeper to backs and a back to keeper.
cupSetup();
evaluate("S.matchId='cup-match-1';S.matchName='Cupmatch 1';S.baseSeconds=1500;nextCupMatch()");
assert.equal(evaluate('S.cup.matches'),1);
assert.equal(evaluate('S.cup.totals.p0.gk'),25);
assert.ok(['p1','p2','p3','p4'].includes(evaluate('S.cup.gk')));
assert.equal(evaluate('S.cup.roles.p0'),'back');
assert.equal(evaluate("Object.values(S.cup.roles).filter(r=>r==='back').length"),4);
assert.equal(evaluate("Object.values(S.cup.roles).filter(r=>r==='forward').length"),3);
const cupSaved=evaluate('JSON.stringify(S.cup)');
evaluate('loadPlayers()');
assert.equal(evaluate('JSON.stringify(S.cup)'),cupSaved);
assert.equal(evaluate('buildSchedule()'),true);
const ongoingCup=evaluate('JSON.stringify(S.cup)');
evaluate("S.matchId='cup-match-2';saveMatchState();S.slots=[];S.changeInterval=5");
assert.equal(evaluate('loadMatchState()'),true);
assert.equal(evaluate('S.changeInterval'),2.5);
assert.equal(evaluate('JSON.stringify(S.cup)'),ongoingCup);
const validSchedule=evaluate('JSON.stringify(S.slots)');
evaluate("S.cup.roles=Object.fromEntries(S.players.map(p=>[p.id,'back']))");
assert.equal(evaluate('buildSchedule()'),false);
assert.equal(evaluate('JSON.stringify(S.slots)'),validSchedule);
// Partial games contribute only elapsed minutes, not the unused plan.
cupSetup(3,false);
assert.equal(evaluate('Object.values(cupMatchMinutes({slots:S.slots,changeInterval:3,elapsedSeconds:600})).reduce((n,m)=>n+m.out+m.gk,0)'),50);
console.log('cup tests passed');

// Positions persist across period boundaries, including a keeper returning outfield.
for(const format of ['2x15','3x15']) for(const interval of [2.5,3,5]) {
  for(let run=0;run<30;run++) {
    setPlayers(8,8);
    evaluate(`S.slots=[];S.format='${format}';S.changeInterval=${interval};S.baseSeconds=0;S.timerOn=false;
      S.cup.positions=true;S.cup.roles={};
      S.players.forEach((p,i)=>{p.canBack=i<5;p.canForward=i>=3;});`);
    assert.equal(evaluate('buildSchedule()'),true);
    const slots=JSON.parse(evaluate('JSON.stringify(S.slots)'));
    const roles=slots[0].roles;
    for(const sl of slots) {
      assert.deepEqual(sl.roles,roles);
      assert.equal(sl.on.filter(id=>roles[id]==='back').length,2);
      assert.equal(sl.on.filter(id=>roles[id]==='forward').length,2);
      assert.equal(new Set([sl.gk,...sl.on,...sl.bench]).size,8);
      if(sl.sub>0)assert.equal(sl.gk,slots[slots.indexOf(sl)-1].gk);
    }
    for(let i=0;i<3;i++)assert.equal(roles['p'+i],'back');
    for(let i=5;i<8;i++)assert.equal(roles['p'+i],'forward');
    assert.ok(new Set(slots.map(sl=>sl.gk)).size>=2);
    const before=evaluate('JSON.stringify(S.slots.slice(0,2))');
    assert.equal(evaluate('recalcFrom(2)'),true);
    assert.equal(evaluate('JSON.stringify(S.slots.slice(0,2))'),before);
    evaluate('savePlayers();saveMatchState();S.cup.positions=false;S.cup.roles={};S.slots=[]');
    assert.equal(evaluate('loadMatchState()'),true);
    assert.equal(evaluate('S.cup.positions'),true);
    assert.deepEqual(JSON.parse(evaluate('JSON.stringify(S.cup.roles)')),roles);
  }
}
// Off ignores stored restrictions; both checkboxes appear checked and disabled.
evaluate("S.slots=[];setCupPositions(false);S.players.forEach(p=>{p.canBack=false;p.canForward=false;});renderSetupList()");
assert.match(elements.get('setup-list').innerHTML,/checked disabled/);
assert.equal(evaluate('buildSchedule()'),true);
// Impossible role allocation never silently falls back to free rotation.
evaluate('S.slots=[];setCupPositions(true)');
assert.equal(evaluate('buildSchedule()'),false);
assert.equal(evaluate('S.slots.length'),0);
console.log('All-format position tests passed');

// One keeper-only player is valid in every format, even with other MV-capable players.
const alerts=[];
context.alert=message=>alerts.push(message);
for(const format of ['1x25','2x15','3x15']) {
  setPlayers(8,8);
  evaluate(`S.slots=[];S.format='${format}';S.changeInterval=5;S.baseSeconds=0;S.timerOn=false;
    S.cup={id:'keeper-cup',positions:true,roles:{},gk:'p1',totals:{},matches:0};
    S.players.forEach((p,i)=>{p.canBack=i>0;p.canForward=i>0;});`);
  assert.equal(evaluate('buildSchedule()'),true);
  assert.equal(evaluate("S.slots.every(sl=>sl.gk==='p0'&&!sl.on.includes('p0')&&!sl.bench.includes('p0'))"),true);
  assert.equal(evaluate('recalcFrom(1)'),true);
  assert.equal(evaluate("S.slots.every(sl=>sl.gk==='p0')"),true);
  evaluate('savePlayers();saveMatchState();S.slots=[];loadPlayers()');
  assert.equal(evaluate('loadMatchState()'),true);
  assert.equal(evaluate('keeperOnly(S.players[0])'),true);
  if(format==='1x25') {
    evaluate("S.matchId='keeper-match';S.baseSeconds=1500;finishMatch()");
    assert.equal(evaluate('keeperOnly(S.players[0])'),true);
    assert.equal(evaluate('S.cup.gk'),'p0');
    evaluate('suggestCupGroups()');
    assert.equal(evaluate('keeperOnly(S.players[0])'),true);
    assert.equal(evaluate('buildSchedule()'),true);
    assert.equal(evaluate("S.slots.every(sl=>sl.gk==='p0')"),true);
  }
  evaluate('S.slots=[];S.cup.roles={};S.players[1].canBack=false;S.players[1].canForward=false');
  assert.equal(evaluate('buildSchedule()'),false);
  assert.match(alerts.at(-1),/Två eller fler spelare har endast MV/);
  assert.equal(evaluate('S.slots.length'),0);
  // With positions off, stored unchecked boxes do not constrain free rotation.
  evaluate('S.cup.positions=false');
  assert.equal(evaluate('buildSchedule()'),true);
}
console.log('Keeper-only tests passed');

// Deterministic wall clock: long background gaps stop at ONE period boundary.
const realDate=context.Date;
let fakeNow=1000000;
context.Date=class extends Date { static now(){return fakeNow;} };
for(const format of ['1x25','2x15','3x15']) {
  evaluate("S.cup.positions=false;S.slots=[];S.timerOn=false;S.baseSeconds=0;S.seconds=0");
  schedule(format,8,5);
  const periodSeconds=format==='1x25'?1500:900;
  const periods=format==='3x15'?3:format==='2x15'?2:1;
  for(let period=0;period<periods;period++) {
    evaluate('toggleTimer()');
    assert.equal(evaluate('S.timerOn'),true);
    fakeNow+=10000;
    evaluate('tick()');
    assert.equal(evaluate('S.seconds'),period*periodSeconds+10);
    // Manual pause/resume must not move the target boundary.
    evaluate('toggleTimer()');fakeNow+=600000;evaluate('toggleTimer()');
    fakeNow+=periodSeconds*1000+3600000;
    evaluate('tick()');
    assert.equal(evaluate('S.seconds'),(period+1)*periodSeconds);
    assert.equal(evaluate('S.timerOn'),false);
    assert.equal(evaluate('S.anchorStart'),null);
    assert.equal(JSON.parse(storage.get('ms2-match')).timerOn,false);
    fakeNow+=600000;evaluate('tick()');
    assert.equal(evaluate('S.seconds'),(period+1)*periodSeconds);
  }
  evaluate('toggleTimer()');
  assert.equal(evaluate('S.timerOn'),false);
  assert.equal(elements.get('timer-period').textContent,'Matchen slut');
}
// Reload a still-running persisted timer after the device slept past period end.
evaluate("S.cup.positions=false;S.slots=[];S.timerOn=false;S.baseSeconds=0;S.seconds=0");
schedule('3x15',8,3);
evaluate('toggleTimer();savePlayers();saveMatchState()');
fakeNow+=2000000;
assert.equal(evaluate('loadMatchState()'),true);
evaluate('renderMatch()');
assert.equal(evaluate('S.seconds'),900);
assert.equal(evaluate('S.timerOn'),false);
assert.equal(elements.get('timer-hint').textContent,'Tryck för att starta period 2');
// Rewinding allows replay; setting an exact boundary stops a running timer.
evaluate('setElapsedTime(850);toggleTimer();setElapsedTime(900)');
assert.equal(evaluate('S.timerOn'),false);
evaluate('toggleTimer()');fakeNow+=1000;evaluate('tick()');
assert.equal(evaluate('S.seconds'),901);
// A late pause tap must stop, not immediately resume the next period.
fakeNow+=2000000;evaluate('toggleTimer()');
assert.equal(evaluate('S.seconds'),1800);
assert.equal(evaluate('S.timerOn'),false);
context.Date=realDate;
console.log('Period and match timer tests passed');

// Summary uses saved snapshots only, not the current plan or rotation totals.
const summaryHistory=storage.get('ms2-history');
const fixtures=[
  {id:'summary-2',cupId:'summary-cup',name:'Match 2',finishedAt:'2026-10-24T11:00:00Z',changeInterval:5,elapsedSeconds:300,
   players:[{id:'a',name:'A & B'},{id:'b',name:'Borta'}],slots:[{startMin:0,gk:'b',on:['a'],bench:[]}]},
  {id:'summary-1',cupId:'summary-cup',name:'Match 1',finishedAt:'2026-10-24T10:00:00Z',changeInterval:5,elapsedSeconds:150,
   players:[{id:'a',name:'Äldre namn'},{id:'b',name:'Borta'}],slots:[{startMin:0,gk:'a',on:['b'],bench:[]}]},
  {id:'other',cupId:'other-cup',name:'Annan cup',finishedAt:'2026-10-23T10:00:00Z',changeInterval:5,elapsedSeconds:300,
   players:[{id:'a',name:'A'}],slots:[{startMin:0,gk:'a',on:[],bench:[]}]}
];
storage.set('ms2-history',JSON.stringify(fixtures));
evaluate("S.cup.id='summary-cup';S.cup.totals={a:{gk:999,out:999}};S.players=[]");
const summary=JSON.parse(evaluate("JSON.stringify(savedCupSummary('summary-cup'))"));
assert.equal(summary.matches.length,2);
assert.deepEqual(summary.players.find(p=>p.id==='a'),{id:'a',name:'A & B',gk:2.5,out:5,total:7.5});
assert.deepEqual(summary.players.find(p=>p.id==='b'),{id:'b',name:'Borta',gk:5,out:2.5,total:7.5});
evaluate('openCupSummary()');
assert.match(elements.get('modal-body').innerHTML,/A &amp; B/);
assert.match(elements.get('modal-body').innerHTML,/Utespel/);
assert.match(elements.get('modal-body').innerHTML,/Totalt/);
assert.match(elements.get('modal-sub').textContent,/2 sparade matcher/);
evaluate("deleteHistory('summary-2')");
assert.equal(evaluate("savedCupSummary('summary-cup').matches.length"),1);
assert.equal(evaluate("savedCupSummary('summary-cup').players[0].total"),2.5);
evaluate("S.cup.id='new-cup';openCupSummary()");
assert.match(elements.get('modal-body').innerHTML,/Inga sparade matcher/);
assert.equal(evaluate("savedCupSummary('other-cup').players[0].total"),5);
if(summaryHistory)storage.set('ms2-history',summaryHistory);else storage.delete('ms2-history');
console.log('Saved cup summary tests passed');
