# matchschema.html — programbeskrivning och utvecklarkontext

## Översikt

`matchschema.html` är en mobile-first-app för att planera och genomföra fotbollsmatcher. Den är byggd i ren HTML, CSS och JavaScript utan externa körberoenden.

Appen hjälper tränaren att:

- skapa ett balanserat schema för 1×25, 2×15 eller 3×15 minuter med byten var tredje eller femte minut,
- se vilka som spelar, står i mål och sitter på bänken i varje bytesblock,
- göra direkta spelarbyten under ett pågående block,
- pausa spelare som lämnar matchen tillfälligt,
- ge en återvändande spelare hård prioritet vid nästa block,
- låta en spelare vila en eller två perioder utan att kompenseras med extra speltid senare,
- köra och korrigera matchklockan,
- namnge matcher och spara färdigspelade scheman i en lokal historik.

All data sparas i webbläsarens `localStorage`. Det finns ingen server eller databas. Varje mobil har därför sin egen spelarlista, pågående match och historik.

## Matchregler

Reglerna ligger samlade i `FORMATS`:

```javascript
const FORMATS = {
  '3x15': { label: '3×15 min', periods: 3, periodMin: 15, outfieldCount: 4 },
  '2x15': { label: '2×15 min', periods: 2, periodMin: 15, outfieldCount: 4 },
};
```

Bytesintervallet lagras separat i `S.changeInterval` och är antingen 2,5, 3 eller 5 minuter. `fmt()` kombinerar det valda formatet med bytesintervallet så att all schemaläggning och tidsvisning använder samma regel.

Gemensamma regler:

- En målvakt och fyra utespelare är på plan.
- Byten planeras var tredje eller femte minut enligt tränarens val.
- Målvakten står normalt hela 15-minutersperioden.
- Minst fem aktiva spelare krävs.
- Minst en aktiv spelare måste vara markerad som målvaktskapabel.
- Spelarnamn måste vara unika, men schemat använder interna spelar-ID:n och är inte tekniskt kopplat till namnet.

Format:

- `3x15`: tre perioder och totalt 45 minuter; 15 treminutersblock eller 9 femminutersblock.
- `2x15`: två perioder och totalt 30 minuter; 10 treminutersblock eller 6 femminutersblock.

Reglerna visas också direkt under formatväljaren i gränssnittet. En pågående match måste sparas eller avslutas innan formatet eller bytesintervallet kan ändras. Äldre sparade matcher utan uppgift om bytesintervall tolkas som femminutersmatcher.

## Skärmar och arbetsflöde

### Setup

På setup-skärmen kan tränaren:

1. ange ett matchnamn,
2. ange spelarnamn,
3. markera spelare som kan vara målvakt,
4. välja 2,5, 3 eller 5 minuter mellan byten,
5. välja 1×25, 2×15 eller 3×15,
6. generera schemat,
7. öppna tidigare sparade matcher.

Om matchnamnet lämnas tomt skapas ett namn baserat på dagens datum.

Om tränaren går tillbaka till setup-skärmen medan ett schema pågår visas en särskild panel med:

- `Tillbaka till pågående match`, som öppnar matchvyn igen utan att ändra schemat,
- `Avsluta utan att spara`, som efter bekräftelse tar bort det pågående schemat men behåller spelarlistan.

Knappen `Generera schema` döljs så länge en match pågår, så att schemat inte skrivs över av misstag.

### Match

Matchskärmen innehåller:

- matchnamn,
- matchklocka,
- manuell tidsjustering,
- alla bytesblock,
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
  players: [{ id, name, canGK, active, returnPriority, restPeriods: [] }],
  slots: [{ startMin, period, sub, gk, on: [], bench: [], rest: [] }],
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

Alla hänvisningar i `gk`, `on`, `bench`, `rest` och `events` är spelar-ID:n, inte namn. Det gör schemat robust mot specialtecken och senare namnändringar.

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

Spelarchippar kan dras till varandra inom samma aktuella eller framtida block. I det gröna aktuella blocket innebär detta ett direkt byte mitt i det pågående bytesblocket. Följande block räknas om utifrån den nya situationen.

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

Schemat arbetar i valda 2,5-, tre- eller femminutersenheter. Ett byte mitt i ett block registreras som en händelse, men speltidsöversikten fördelar fortfarande hela blockets minuter enligt den slutliga blockuppställningen.

### Vila/skadad

`Vila/skadad` är avsiktligt skilt från vanlig paus:

- Tränaren väljer via `Hantera` om spelaren ska vila resten av aktuell period eller aktuell och nästa period.
- Spelaren tas bort från plan och bänk under viloperioderna och visas i en separat orange `vila/skadad`-rad i varje berört block.
- Minst fem andra spelare och minst en annan MV-kapabel spelare måste vara tillgängliga i varje vald period.
- När vilan är slut kommer spelaren automatiskt tillbaka i den vanliga rotationen utan `returnPriority`.
- `Tillgänglig nu` kan avsluta vilan tidigare, fortfarande utan hård returprioritet.

För schemaläggningens rättvisa får vilande spelare en intern neutral minutkredit som motsvarar de tillgängliga spelarnas genomsnittliga andel. Krediten visas inte som faktisk speltid. Därmed försöker algoritmen varken ta igen den missade tiden eller straffa spelaren ytterligare efter vilan; den faktiska totalsumman blir lägre och den fortsatta rotationen blir normal.

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
- `ms2-interval`: senast valda bytesintervall,
- `ms2-match`: pågående match inklusive format, bytesintervall, namn, timer, schema och händelser,
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
- Matchformat och bytesintervall sparas tillsammans med den pågående matchen och historiken.
- Äldre lokala data migreras vid inläsning.

## Tester

Automatiska tester finns i `tests/matchschema.test.js` och körs med:

```bash
node tests/matchschema.test.js
```

Testerna omfattar:

- 2×15 och 3×15 med både 3- och 5-minutersintervall,
- truppstorlekar 5–12,
- korrekt antal block och fem spelare på plan,
- unika spelare i varje block,
- målvaktskontinuitet inom perioder,
- att föregående bänk går in när det är möjligt,
- hård returprioritet,
- återgång till samt kassering av en pågående match från setup-skärmen,
- direkta byten i aktuellt block,
- låsning av passerade block,
- paus och återkomst,
- vila/skadad under en eller två perioder, automatisk normal återkomst och avslut i förtid,
- sparning och återläsning av format och matchnamn,
- sparning av färdig match i historiken.

## Kända begränsningar

- Speltidsbalansen arbetar i hela 2,5-, tre- eller femminutersblock. Exakta delminuter från ett byte mitt i blocket visas inte i summeringen.
- Historiken är lokal och saknar molnsynkronisering/export.
- Det finns ingen undo för manuella ändringar.
- Ett drag som råkar pågå exakt när blockgränsen renderas om kan avbrytas.
- Wake Lock kräver webbläsarstöd och normalt HTTPS.

## PWA och publicering

Appen publiceras automatiskt på GitHub Pages som en HTTPS-skyddad Progressive Web App:

`https://jakobenlund.github.io/bkbk-matchschema/`

- `manifest.webmanifest` anger appnamn, färger, startadress och ikoner.
- `service-worker.js` cachar appskalet så att appen kan öppnas utan nät efter ett lyckat onlinebesök.
- `icons/` innehåller ikoner för hemskärm och installation.
- `.github/workflows/pages.yml` kör testerna, kopierar `matchschema.html` till publiceringens `index.html` och driftsätter sidan vid varje push till `main`.
- `.gitignore` är en strikt tillåtelselista som hindrar andra dokument i Dropbox-mappen från att råka laddas upp.

Tränaren öppnar länken i Safari eller Chrome och lägger webbplatsen på hemskärmen. Varje tränare får en egen lokal spelarlista och historik på sin mobil. Uppdateringar publiceras på samma adress och den senaste onlineversionen blir nästa offlineversion.

Att skicka själva HTML-filen via Dropbox fungerar fortfarande, men GitHub Pages ger en stabilare adress, appinstallation, offline-cache och bättre förutsättningar för Wake Lock.

## Stil och varumärke

- Mobile-first med maxbredd 520 px.
- Klubbgrönt definieras av `--bkbk-green` och `--bkbk-green-dark`.
- BKBK-loggan är inbäddad som base64 PNG, så ingen separat bildfil behöver distribueras.
- Setup-skärmen visar `BKBK F18 Svart` och klubbens ledord `Utveckling Glädje Gemenskap`.

## Cupläge, tillägg 2026-10-23

`FORMATS['1x25']` är en period på 25 minuter. `subsPerPeriod()` avrundar uppåt och `slotMinutes()` begränsar sista blocket. Äldre format har fortsatt samma längd och regler. Historikens minutberäkning tar också hänsyn till kort sista block och 2,5-minutersintervall.

`S.cup` / `ms2-cup` innehåller cup-ID, positionsläge, rollkarta, föreslagen målvakt, ackumulerad utespels-/målvaktstid, antal sparade matcher och senast arkiverat match-ID. Pågående match lagrar också cupstatus (schema version 5) för återläsning. Separat cupsummering påverkas inte av historikens gräns på 30 matcher eller av manuell historikradering.

`buildCupSchedule(from)` bygger ett nytt schema transaktionellt och ersätter först efter validering. Den används även vid omräkning, paus och vila. Vid fasta positioner väljs två utespelare per grupp, annars fyra fritt. Historisk utespelstid används som startvärde för rättvisefördelningen. Målvaktstid redovisas separat och styr målvaktsförslagen. Otillräcklig bemanning i en position stoppar omräkningen; tränaren kan stänga av positionsläget. Målvaktsbyte via drag stoppas i cup, medan skada/paus hanteras via Hantera.

Varje cupblock bär sin egen rollkarta (`roles`, eller null vid fri rotation). Positionsläget väljs före matchen och låses när schemat skapas. `renderCupMatch()` visar backar/forwards och nästa in-/utbyten separat. Inställningarna för målvakt och roller är låsta under pågående match; positionsläget är också låst tills matchen sparas eller avslutas.

`cupMatchMinutes()` räknar minuter fram till sparad matchtid och `archiveCupMatch()` summerar dem och föreslår nästa uppställning. Sparning via både Spara och Nästa cupmatch uppdaterar cupen. Dubbelarkivering av samma senaste match-ID ignoreras. Nästa-knappen skapar inte en ny match automatiskt: tränaren får först granska grupperna på setup-skärmen.

Verifiering: befintlig Node-testsvit samt tester av 1×25 med alla tre intervall, positioner, fria byten, låst målvakt, rollrotation mellan matcher, partiell match, låsning av positionsläge under match, sparning/återläsning och transaktionellt avvisade grupper. Mobilstor Chrome kontrolleras separat för det kompletta cupflödet. Återställningspunkt och användarinstruktioner finns i README.

## Positionsval i spelartabellen, 2026-10-23

`canBack` och `canForward` ligger på spelaren, bredvid `canGK`, och migreras till true när de saknas. Den globala positionsflaggan ligger fortfarande i `S.cup.positions` av kompatibilitetsskäl men gäller nu **alla format**. Avstängt läge ignorerar begränsningarna och visar båda rutorna ikryssade/inaktiva; individuella inställningar bevaras för nästa aktivering.

`assignMatchRoles()` söker en genomförbar fast rollkarta med dynamisk programmering över rollantal, periodtillgänglighet och möjliga målvakter. Flexibla spelare får en roll som behålls under hela matchen. `buildCupSchedule()` är numera den gemensamma schemabyggaren för positionsmatcher i alla format och för 1×25 även med fri rotation. Vanliga periodmatcher med fri rotation använder fortsatt den ursprungliga algoritmen. Målvaktskandidater filtreras så att två utespelare per position återstår. Omräkning behåller tidigare block och rollkartan, och gör inga ändringar om bemanningen är omöjlig.

Spelarlistan har en gemensam kryssruta ovanför raderna och MV/Back/Forward bredvid namnen. Separata positionsmenyer i cupinställningarna har tagits bort. Inställningarna låses under match. Cupens gruppförslag och rotation till nästa match uppdaterar även spelarens kryssrutor. Cupens summering och matchernas historik är fortsatt separata.

Pågående match använder schema version 6 med `positionMode` och `matchRoles`, även för periodmatcher. Sparade äldre periodmatcher återöppnas med fri rotation. Testerna täcker alla tre format och bytesintervall, tillåtna positioner, målvaktsbyte mellan perioder, fast rollkarta, omräkning, återläsning, ogiltiga grupper och avstängt läge. Mobilstor Chrome har kontrollerats för hela inställningsflödet, periodmatch, omladdning och återgång till fri rotation samt cup.

### Rättning: endast MV (2026-10-23)

`keeperOnly()` identifierar MV med både canBack och canForward false. Rolltilldelningen accepterar rollen `keeper` och den tillgängliga spelaren väljs som målvakt i samtliga perioder, även om andra är MV-kapabla eller ett tidigare cupförslag pekade på någon annan. Två eller fler aktiva endast-MV-spelare avvisas med specifikt fel när positionsläget är på. Gruppförslag och cupövergång bevarar endast-MV-valet. Tester täcker alla format, omräkning, sparning/återläsning, nästa cupmatch och avstängt positionsläge.

### Automatisk stoppning av matchklockan (2026-10-23)

`timerStopSeconds()` beräknar första periodslutet efter den bankade tiden `baseSeconds`, begränsat av matchlängden. `elapsedSeconds()` klipper verklig förfluten tid mot den gränsen. `syncSeconds()` stoppar intervallet, nollställer ankaret, släpper Wake Lock och sparar stoppet när gränsen nås. Nästa period kräver en separat manuell start. Därmed kan en lång bakgrundsvistelse eller omladdning inte hoppa över periodpausen. Vid matchslut ignoreras starttryck; tidsjustering bakåt tillåter fortsatt användning.

`tick()` förbrukar inte returprioritet för nästa periods spelare under periodpausen. Visning anger avslutad period och hur nästa startas. Tester använder styrd klocka för samtliga format, manuell paus/återstart, långa bakgrundsgap, sparning/återläsning, exakta tidsgränser och ett sent stopptryck.

### Summering från sparad historik (2026-10-23)

`savedCupSummary(cupId)` filtrerar `loadHistory()` på cup-ID, använder `cupMatchMinutes()` för sparad tid och summerar per stabilt spelar-ID. Spelarnamn kommer från den senaste tillgängliga matchens snapshot; nuvarande trupp och `S.cup.totals` används inte. `openCupSummary()` visar en modal med cupval, MV/utespel/total, lagsumma, matchantal och ingående matcher. Den gamla planerade cupöversikten finns kvar separat. Tester täcker flera cuper, partiell match, borttagen spelare, namnändring/HTML-escaping, historikradering och tom cup; en mobilstor webbläsare kontrollerar knappen och tabellen.
