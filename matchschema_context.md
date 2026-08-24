# matchschema.html — programbeskrivning och utvecklarkontext

## Översikt

`matchschema.html` är en mobile-first-app för att planera och genomföra fotbollsmatcher. Den är byggd i ren HTML, CSS och JavaScript utan externa körberoenden.

Appen hjälper tränaren att:

- skapa ett balanserat schema för 2×15 eller 3×15 minuter,
- se vilka som spelar, står i mål och sitter på bänken i varje femminutersblock,
- göra direkta spelarbyten under ett pågående block,
- pausa spelare som lämnar matchen tillfälligt,
- ge en återvändande spelare hård prioritet vid nästa block,
- köra och korrigera matchklockan,
- namnge matcher och spara färdigspelade scheman i en lokal historik.

All data sparas i webbläsarens `localStorage`. Det finns ingen server eller databas. Varje mobil har därför sin egen spelarlista, pågående match och historik.

## Matchregler

Reglerna ligger samlade i `FORMATS`:

```javascript
const FORMATS = {
  '3x15': { label: '3×15 min', periods: 3, periodMin: 15, blockMin: 5, outfieldCount: 4 },
  '2x15': { label: '2×15 min', periods: 2, periodMin: 15, blockMin: 5, outfieldCount: 4 },
};
```

Gemensamma regler:

- En målvakt och fyra utespelare är på plan.
- Byten planeras var femte minut.
- Målvakten står normalt hela 15-minutersperioden.
- Minst fem aktiva spelare krävs.
- Minst en aktiv spelare måste vara markerad som målvaktskapabel.
- Spelarnamn måste vara unika, men schemat använder interna spelar-ID:n och är inte tekniskt kopplat till namnet.

Format:

- `3x15`: tre perioder, nio femminutersblock, totalt 45 minuter.
- `2x15`: två perioder, sex femminutersblock, totalt 30 minuter.

Reglerna visas också direkt under formatväljaren i gränssnittet. En pågående match måste sparas eller avslutas innan formatet kan ändras.

## Skärmar och arbetsflöde

### Setup

På setup-skärmen kan tränaren:

1. ange ett matchnamn,
2. ange spelarnamn,
3. markera spelare som kan vara målvakt,
4. välja 2×15 eller 3×15,
5. generera schemat,
6. öppna tidigare sparade matcher.

Om matchnamnet lämnas tomt skapas ett namn baserat på dagens datum.

### Match

Matchskärmen innehåller:

- matchnamn,
- matchklocka,
- manuell tidsjustering,
- alla femminutersblock,
- färgkodade spelarchippar,
- spelbalans,
- spelarhantering,
- regenerering av schemat,
- knappen `Spara` för att avsluta och arkivera matchen.

Färgkodning:

- gult: målvakt,
- grönt: utespelare på plan,
- grått: bänk,
- blå ring: giltigt mål under drag-and-drop.

### Matchhistorik

`finishMatch()` pausar klockan och sparar en ögonblicksbild med:

- match-ID och matchnamn,
- format och datum/tid,
- förfluten matchtid,
- spelare och målvaktsmarkeringar,
- hela blockschemat,
- registrerade pauser, återkomster och direkta byten.

Historiken visar både planerad speltid och hela schemat. Sparade matcher kan raderas. Högst 30 matcher behålls lokalt; de äldsta faller bort när gränsen passeras.

## Datamodell

```javascript
S = {
  players: [{ id, name, canGK, active, returnPriority }],
  slots: [{ startMin, period, sub, gk, on: [], bench: [] }],
  timerOn,
  seconds,
  baseSeconds,
  anchorStart,
  timerRef,
  balanceOpen,
  format,
  matchId,
  matchName,
  events: [],
};
```

Alla hänvisningar i `gk`, `on`, `bench` och `events` är spelar-ID:n, inte namn. Det gör schemat robust mot specialtecken och senare namnändringar.

`loadPlayers()` migrerar automatiskt äldre sparade spelare utan ID. `loadMatchState()` migrerar äldre scheman som refererar till spelarnamn. Ett ogiltigt eller inkompatibelt sparat schema tas bort i stället för att öppnas i ett blandat tillstånd.

## Schemaläggningsalgoritm

### Generering

`buildSchedule()` skapar hela matchen block för block.

Målvakt väljs med `pickGK()` efter:

1. minst antal tidigare målvaktsperioder,
2. minst total speltid,
3. slump vid fullständig likhet.

Utespelare rangordnas med `rankOutfield()` i denna strikta ordning:

1. spelare med aktiv `returnPriority`,
2. längst sammanhängande väntan på bänken,
3. minst ackumulerad speltid,
4. slump vid fullständig likhet.

Detta gör att den som satt på bänken går in i nästa block när det är matematiskt möjligt. Med större trupper, där alla bänkspelare inte kan gå in samtidigt, prioriteras de som väntat längst.

En återvändande spelare har hård prioritet tills spelaren är schemalagd på plan. Prioriteten förbrukas när det prioriterade blocket börjar.

### Omräkning

`recalcFrom(from)` används efter manuella ändringar och räknar bara om block från `from` och framåt. Funktionen:

1. räknar faktisk schemalagd speltid före `from`,
2. återskapar bänkväntan,
3. räknar målvaktsperioder,
4. behåller periodens målvakt när det är möjligt,
5. tillämpar paus- och returstatus,
6. bygger om resterande block med samma prioriteringsregler.

Passerade block räknas aldrig om genom gränssnittet.

## Direkta byten, paus och återkomst

### Drag-and-drop-byte

Spelarchippar kan dras till varandra inom samma aktuella eller framtida block. I det gröna aktuella blocket innebär detta ett direkt byte mitt i femminutersblocket. Följande block räknas om utifrån den nya situationen.

- Passerade block är låsta.
- Drag mellan olika block tillåts inte.
- Om målvaktspositionen berörs måste den nya målvakten vara markerad som MV-kapabel.
- Direkta byten i aktuellt block registreras i `S.events` med aktuell tid.

Dragfunktionen använder Pointer Events och fungerar med både touch och mus. CSS-regler och `selectstart.preventDefault()` minskar risken för textmarkering och iOS-menyer vid långtryck.

### Pausa spelare

`pausePlayer(id)` används via `Hantera`:

- En utespelare på plan ersätts direkt av en aktiv bänkspelare.
- En målvakt kan pausas endast om en annan aktiv MV-kapabel spelare kan ta över.
- En spelare som redan sitter på bänken tas bort utan att planuppställningen ändras.
- Senare block räknas om utan den pausade spelaren.
- Minst fem aktiva spelare måste alltid återstå.

Schemat arbetar i femminutersenheter. Ett byte mitt i ett block registreras som en händelse, men speltidsöversikten fördelar fortfarande hela blockets minuter enligt den slutliga blockuppställningen.

### Återvändande spelare

`returnPlayer(id)` aktiverar spelaren och sätter `returnPriority = true`. Spelaren prioriteras hårt i nästa möjliga block. I spelarhanteringen markeras väntande returprioritet med en stjärna.

En helt ny spelare som läggs till under match behandlas på samma sätt och får returprioritet.

## Timer

Timern är klocktidsankrad och räknar inte genom att enbart öka en sekund per `setInterval`.

- Vid start sätts `anchorStart = Date.now()`.
- `elapsedSeconds()` beräknar tiden från verklig klocktid plus bankad tid.
- Vid paus flyttas tiden till `baseSeconds`.
- `visibilitychange` synkroniserar omedelbart när appen blir synlig igen.
- Tiden kan justeras manuellt och begränsas till matchens längd.
- `Wake Lock` begärs medan timern går när webbläsaren och HTTPS-miljön stödjer det.

Detta minskar timerdrift när mobilen låses eller webbläsaren går i bakgrunden.

## Lagring

Appen använder följande `localStorage`-nycklar:

- `ms2-players`: spelarlistan och aktuell tillgänglighet,
- `ms2-format`: senast valda format,
- `ms2-match`: pågående match inklusive format, namn, timer, schema och händelser,
- `ms2-history`: upp till 30 färdigspelade matcher.

Viktiga konsekvenser:

- Data är lokal för just den webbläsaren och mobilen.
- Rensning av webbplatsdata tar bort spelarlista och historik.
- Historik synkroniseras inte automatiskt mellan tränare.
- Samma publicerade HTML-app kan användas av flera tränare utan att deras data blandas.

## Säkerhet och robusthet

- Spelare har stabila interna ID:n.
- Dubbletter av spelarnamn stoppas före generering.
- Användarinmatade namn HTML-escapas före rendering.
- Målvaktsbyten valideras.
- Passerade block är låsta.
- Matchformat sparas tillsammans med den pågående matchen.
- Äldre lokala data migreras vid inläsning.

## Tester

Automatiska tester finns i `tests/matchschema.test.js` och körs med:

```bash
node tests/matchschema.test.js
```

Testerna omfattar:

- 2×15 och 3×15,
- truppstorlekar 5–12,
- korrekt antal block och fem spelare på plan,
- unika spelare i varje block,
- målvaktskontinuitet inom perioder,
- att föregående bänk går in när det är möjligt,
- hård returprioritet,
- direkta byten i aktuellt block,
- låsning av passerade block,
- paus och återkomst,
- sparning och återläsning av format och matchnamn,
- sparning av färdig match i historiken.

## Kända begränsningar

- Speltidsbalansen arbetar i hela femminutersblock. Exakta delminuter från ett byte mitt i blocket visas inte i summeringen.
- Historiken är lokal och saknar molnsynkronisering/export.
- Det finns ingen undo för manuella ändringar.
- Ett drag som råkar pågå exakt när blockgränsen renderas om kan avbrytas.
- Wake Lock kräver webbläsarstöd och normalt HTTPS.

## Mobil användning

Appen fungerar bäst publicerad som en statisk HTTPS-webbplats. Tränaren öppnar länken i Safari eller Chrome och lägger sedan webbplatsen på hemskärmen. Varje tränare får en egen lokal spelarlista och historik på sin mobil.

Att skicka själva HTML-filen via Dropbox fungerar, men en vanlig HTTPS-publicering ger en stabilare adress, bättre helskärmsupplevelse och bättre förutsättningar för Wake Lock.

## Stil och varumärke

- Mobile-first med maxbredd 520 px.
- Klubbgrönt definieras av `--bkbk-green` och `--bkbk-green-dark`.
- BKBK-loggan är inbäddad som base64 PNG, så ingen separat bildfil behöver distribueras.
- Setup-skärmen visar `BKBK F18 Svart` och klubbens ledord `Utveckling Glädje Gemenskap`.
