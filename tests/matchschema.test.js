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

// Finishing creates a history snapshot and clears only the in-progress match.
evaluate("S.matchId='history-test';S.matchName='History test';S.baseSeconds=1800;finishMatch()");
const history=JSON.parse(storage.get('ms2-history'));
assert.equal(history[0].name,'History test');
assert.equal(history[0].slots.length,9);
assert.equal(history[0].changeInterval,5);
assert.equal(storage.has('ms2-match'),false);

console.log('matchschema tests passed');
