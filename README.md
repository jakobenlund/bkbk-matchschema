# BKBK Matchschema

Mobile-first match scheduler for BKBK F18 Svart. It supports 1×25 cup matches as well as 2×15 and 3×15 minute matches, with selectable 2.5-, 3- or 5-minute substitution intervals, fair bench rotation, live substitutions, temporary player pauses, period-based rest/injury status without later playing-time compensation, a match timer, and local match history.

**Live app:** https://jakobenlund.github.io/bkbk-matchschema/

The published app stores player names and match history only in the browser on each coach's device. No roster or match data is sent to GitHub.

## Development

Run the scheduler tests with:

```bash
node tests/matchschema.test.js
```

Technical documentation is available in [`matchschema_context.md`](matchschema_context.md).

## Cup med åtta spelare (2026-10-23)

1. Ange spelarna och vilka som kan vara målvakt. Välj **1×25 min (cup)** och bytesintervall, gärna **2,5 minuter**.
2. Slå på **Välj backar och forwards** ovanför spelartabellen. Välj Back och/eller Forward bredvid varje spelares MV-ruta. Båda kryssen låter appen välja en fast utespelarposition för hela matchen. I cupläget finns även **Föreslå grupper** och val av matchens målvakt. Med åtta spelare blir förslaget en målvakt, fyra backar och tre forwards.
3. Med positionsläget av roterar alla sju utespelare fritt. Målvakten står fortfarande hela matchen. Positionsläget och spelarvalen låses när schemat skapas. Välj på nytt inför nästa match.
4. Starta matchklockan. Vid treminutersbyten är sista blocket bara en minut (24–25).
5. Efter matchen: **Spara och förbered nästa cupmatch**. Justera matchklockan först om den inte visar spelad tid. Appen återgår till uppställningen så att nästa matchnamn, målvakt och grupper kan granskas innan ett nytt schema skapas.

I positionsläget blir en tidigare back nästa målvakt, övriga tre backar forwards och tidigare forwards plus målvakten fyra backar. Bara MV-markerade spelare föreslås som målvakt. Om ingen tidigare back kan stå i mål måste nästa uppställning justeras manuellt. Fri rotation föreslår en annan tillgänglig målvakt med lite tidigare målvaktstid när det finns någon.

Cupsummeringen skiljer utespelstid från målvaktstid. Den visar sparad cupspeltid plus hela den pågående matchens plan. En sparad match räknas bara fram till matchklockans värde, högst 25 minuter. Manuella byten mitt i blocket räknas fortfarande enligt blockets slutliga uppställning; detta är ingen exakt sekundlogg. Lika total speltid för alla är inte garanterad under en kort cup.

**Starta ny cup** nollställer cupsummeringen och gruppförslaget men behåller matchhistoriken. Att radera en match ur historiken ändrar inte cupsummeringen. Data ligger bara i den egna webbläsaren.

## Säkerhetskopia och återställning

Före cupändringen sparades den rena versionen `a786850` som lokal git-tagg **backup-before-cup-2026-10-23** och som ZIP i `../bkbk-before-cup-2026-10-23.zip`. ZIP-filen innehåller appens versionshanterade filer, inte privata familjedokument eller webbläsardata.

Återställning av enbart appkoden kan göras från taggen i git, eller genom att packa upp ZIP-filen i en separat mapp för att prova den gamla versionen. En återgång på GitHub Pages kräver att den återställda koden publiceras. Säkerhetskopian återställer inte lokal matchhistorik, och den gamla versionen förstår inte en pågående 1×25-match. Spara pågående match innan en återgång.

## Positioner i alla matchformat

**Välj backar och forwards** gäller 1×25, 2×15 och 3×15. När det är av visar båda positionsrutorna kryss och är inaktiva: alla kan spela på båda positionerna och rotationen är fri. De senast valda begränsningarna sparas och återkommer när läget slås på igen.

När läget är på behåller varje spelare samma utespelarposition hela matchen, även över periodgränser. Markera Back, Forward eller båda. Appen väljer en fast roll för flexibla spelare och kontrollerar att två backar och två forwards kan spela i varje period, utöver målvakten. Om grupperna inte räcker visas ett fel i stället för att positionerna ändras automatiskt. I periodmatcher kan målvakten bytas mellan perioderna; en tidigare målvakt återgår till sin fasta utespelarposition. I 1×25 står målvakten hela matchen.

Paus och vila för befintliga spelare kan användas om tillräckligt många finns kvar i varje position. I positionsläget behöver nya spelare läggas till före matchen. Direkta byten görs inom samma position; målvaktsskada hanteras via Hantera.

### Enbart målvakt

Med positionsval på kan en spelare ha endast MV ikryssat och båda utespelarpositionerna tomma. Spelaren står då i mål hela matchen, även i 2×15 och 3×15. Om två eller fler aktiva spelare har endast MV valt stoppas genereringen med ett tydligt meddelande: ge alla utom en även en utespelarposition. Med positionsläget av ignoreras de sparade utespelarbegränsningarna som tidigare.

En spelare med endast MV behåller detta val även vid gruppförslag och nästa cupmatch; ändra kryssen inför nästa match om någon annan ska stå i mål.

## Klocka och periodpaus

Klockan stannar automatiskt vid varje periodslut: 15:00 och 30:00 (samt 45:00 i 3×15), eller 25:00 i cupformatet. Tryck på klockan för att starta nästa period när pausen är över. Efter sista perioden visas **Matchen slut** och klockan kan inte startas igen utan att tiden först justeras bakåt manuellt.

Om mobilen låses eller fliken ligger i bakgrunden stannar den beräknade tiden ändå vid den första periodgränsen. Paustiden räknas inte in i nästa period. Det gäller även vid omladdning. Manuell tidsjustering till en exakt periodgräns stoppar också klockan.

## Summering av sparade cupmatcher

**Visa cupsummering** finns vid Sparade matcher och i cupens matchvy. Tabellen visar **MV**, **Utespel** och **Totalt** i minuter per spelare samt en summa för laget. Bara sparade matcher i vald cup ingår; den pågående matchens plan och rotationsräknaren räknas inte in. Välj även tidigare cuper i listan och öppna ”Matcher som ingår” för att kontrollera underlaget.

Tiden begränsas av varje sparad matchklocka. Rader finns även för spelare som senare tagits bort ur truppen. Om en match raderas ur historiken försvinner den från denna summering, men den befintliga rotationsräknaren ändras inte. Historikens befintliga gräns på 30 matcher gäller även underlaget här; äldre matcher som fallit ur historiken kan inte räknas med. Manuella byten mitt i ett block har samma begränsning som övrig speltidsvisning.
