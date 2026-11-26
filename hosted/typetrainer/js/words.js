// Word lists and sentences for the practice texts, written for this app. German nouns keep their
// capital letter; lessons before the Shift level type everything in lower case.

const DE = `der die das und ist nicht ein eine zu mit sich auf für den von dem des im ich du er sie es wir
ihr man auch an als noch nach wie aus bei nur so oder aber wenn was dann schon hier dort sehr mehr
immer wieder heute morgen jetzt bald gern gut neu alt groß klein lang kurz schnell leise laut hell
dunkel warm kalt viel wenig alle jeder kein mein dein sein unser euer dies jene über unter vor hinter
neben zwischen durch gegen ohne um bis seit weil dass ob damit denn doch nie oft selten etwa fast
ganz halb genau gleich sofort später früher zuerst endlich einmal zweimal sagen machen gehen kommen
sehen geben nehmen finden denken stehen liegen sitzen lassen halten bringen fahren laufen lesen
schreiben lernen spielen arbeiten wohnen kaufen essen trinken schlafen fragen antworten hören sprechen
rufen tragen ziehen setzen stellen legen öffnen schließen beginnen enden warten zeigen suchen planen
tippen üben drücken treffen wählen ändern prüfen zählen teilen helfen danken bauen kochen backen
Haus Hand Kopf Fuß Auge Ohr Tag Nacht Jahr Woche Monat Stunde Minute Zeit Welt Land Stadt Dorf Straße
Weg Platz Garten Baum Blume Wald Feld Berg Tal Fluss See Meer Insel Wetter Regen Schnee Sonne Mond
Stern Himmel Wind Luft Wasser Feuer Erde Stein Holz Glas Papier Buch Brief Wort Satz Text Seite Zeile
Taste Finger Tastatur Bildschirm Rechner Programm Datei Ordner Fehler Code Zahl Name Liste Tabelle
Frage Antwort Idee Plan Ziel Weg Spiel Runde Punkt Stufe Rekord Serie Tempo Übung Lektion Kurs
Schule Arbeit Büro Firma Kunde Preis Geld Konto Rechnung Woche Urlaub Reise Zug Bahn Auto Rad Bus
Flug Hotel Zimmer Tür Fenster Tisch Stuhl Bett Lampe Küche Brot Käse Apfel Birne Milch Kaffee Tee
Suppe Kuchen Freund Freundin Familie Mutter Vater Bruder Schwester Kind Leute Gruppe Team Musik
Lied Bild Film Farbe Form Linie Kreis Ecke Mitte Rand Anfang Ende Grund Sinn Recht Glück Ruhe Mut
Kraft Freude Sorge Hilfe Ordnung Wahl Ergebnis Beispiel Moment Abend Mittag Frühling Sommer Herbst
Winter fünf zehn zwölf zwanzig hundert tausend Größe Höhe Länge Breite Tiefe Wärme Kälte Nähe
Ferne Straßenbahn Fußball Schlüssel Geschäft Gefühl Gemüse Märchen Löffel Brücke Hütte Mühle Zügel
Öl Ärger Übermut Bücher Häuser Bäume Wörter Säle Füße Flüsse prüfen müde süß schön grün blöd böse
fröhlich lästig nützlich größer höher länger kürzer wäre hätte könnte möchte würde müsste dürfte
ruhig sicher wichtig richtig falsch leicht schwer einfach möglich fertig bereit frei voll leer
offen klar fein rund still breit tief hoch weit nah fern früh spät jung frisch zart stark schwach
quer Quelle Quark Qualität Quatsch Jacke Jagd Juli Juni jung jetzt Joghurt Xylofon Yacht Zoo Zebra`;

const EN = `the be to of and a in that have it for not on with he as you do at this but his by from they we
say her she or an will my one all would there their what so up out if about who get which go me
when make can like time no just him know take people into year your good some could them see other
than then now look only come its over think also back after use two how our work first well way even
new want because any these give day most us is was are been has had were said did made went took
came saw knew thought told found gave kept left felt brought began ran wrote read typed learned
house hand head foot eye ear night week month hour minute world land city village street road place
garden tree flower forest field mountain valley river lake sea island weather rain snow sun moon star
sky wind air water fire earth stone wood glass paper book letter word sentence text page line key
finger keyboard screen computer program file folder error code number name list table question
answer idea plan goal game round point level record streak speed practice lesson course school
office company customer price money account bill holiday journey train car bike bus flight hotel
room door window chair bed lamp kitchen bread cheese apple pear milk coffee tea soup cake friend
family mother father brother sister child group team music song picture film colour shape circle
corner middle edge start end reason sense luck calm courage strength joy worry help order choice
result example moment evening noon spring summer autumn winter five ten twelve twenty hundred
thousand size height length width depth warmth cold quiet quick quite queen quote question quiz
jump just joke join judge juice jacket jazz box fix mix six next text tax wax yes yet you young
year yellow zero zone zoo lazy size prize puzzle frozen dozen always never often sometimes soon
later early late fast slow loud bright dark warm happy sad easy hard simple possible ready free
full empty open clear fine round still wide deep high far near fresh soft strong weak right wrong
small large long short little great best better every each both few many much more less same
different important public private local common simple single double whole half only own sure
able ask call feel try leave put mean keep let begin seem show hear play run move live believe hold
write learn change follow stop create speak spend grow offer remember love consider appear buy wait
serve send expect build stay fall cut reach kill remain suggest raise pass sell require report decide`;

/** Short sentences with natural punctuation, for the speed level and the harder practice texts. */
const SENTENCES = {
  de: [
    'Wer jeden Tag ein paar Minuten übt, schreibt bald ohne hinzusehen.',
    'Die Finger bleiben auf der Grundreihe und kehren nach jedem Anschlag zurück.',
    'Genauigkeit kommt vor Tempo: Das Tempo folgt von allein.',
    'Am Montag regnete es, am Dienstag schien die Sonne über dem See.',
    'Kannst du mir bis Freitag die Liste mit allen Terminen schicken?',
    'Im Garten blühen Rosen, Tulpen und ein paar wilde Kräuter.',
    'Der Zug fährt um 7:45 Uhr ab Gleis 3; bitte sei pünktlich.',
    'Nach dem Essen gingen wir noch eine Runde durch den Park.',
    'Ein guter Plan passt auf eine Seite und lässt Platz für Änderungen.',
    'Die Brücke über den Fluss ist 120 Meter lang und sehr alt.',
    'Schreib den Satz noch einmal, diesmal ganz ohne Fehler.',
    'Wir treffen uns morgen um zehn Uhr vor der Bibliothek.',
    'Ruhig atmen, locker bleiben und den Blick auf dem Text lassen.',
    'Im Winter wird es früh dunkel, im Sommer bleibt es lange hell.',
    'Dein Ergebnis: 52 Wörter pro Minute bei 98 Prozent Genauigkeit.',
    'Jede Taste hat ihren Finger, und jeder Finger hat seine Taste.',
    'Das neue Programm startet schneller und braucht weniger Speicher.',
    'Zwischen den Bergen liegt ein kleines Dorf mit einer Mühle.',
    'Er kaufte Brot, Käse, Äpfel und frische Milch auf dem Markt.',
    'Fehler sind Hinweise: Sie zeigen, welche Taste noch Übung braucht.',
    'Quer über den Platz lief ein Hund mit einem roten Ball.',
    'Bitte prüfe die Rechnung vom 3. März, bevor du sie bezahlst.',
    'Ohne Pause zu tippen ist anstrengend; kurze Unterbrechungen helfen.',
    'Die Lampe über dem Schreibtisch gibt ein warmes, ruhiges Licht.',
    'Wenn das Tempo sinkt, lohnt sich ein Blick auf die schwachen Tasten.',
    'Sie schrieb den Brief zweimal, weil ihr der erste nicht gefiel.',
    'Viele kleine Schritte führen am Ende zu einem großen Ziel.',
    'Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.',
    'Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.',
    'Heute lernst du die Zahlen: 1, 2, 3 und dann bis 100.',
  ],
  en: [
    'If you practise a few minutes every day, you will soon type without looking.',
    'Keep your fingers on the home row and return after every key.',
    'Accuracy comes before speed: the speed follows on its own.',
    'On Monday it rained, and on Tuesday the sun shone over the lake.',
    'Could you send me the list with all the dates by Friday?',
    'Roses, tulips and a few wild herbs are flowering in the garden.',
    'The train leaves at 7:45 from platform 3; please be on time.',
    'After dinner we went for another walk around the park.',
    'A good plan fits on one page and leaves room for changes.',
    'The bridge over the river is 120 metres long and very old.',
    'Type the sentence once more, this time without a single mistake.',
    'We will meet tomorrow at ten in front of the library.',
    'Breathe calmly, stay relaxed and keep your eyes on the text.',
    'In winter it gets dark early; in summer it stays light for a long time.',
    'Your result: 52 words per minute at 98 per cent accuracy.',
    'Every key has its finger, and every finger has its keys.',
    'The new program starts faster and needs less memory.',
    'Between the mountains lies a small village with an old mill.',
    'He bought bread, cheese, apples and fresh milk at the market.',
    'Mistakes are hints: they show which key still needs practice.',
    'The quick brown fox jumps over the lazy dog.',
    'Pack my box with five dozen liquor jugs.',
    'Please check the invoice from 3 March before you pay it.',
    'Typing without a break is tiring; short pauses help.',
    'The lamp above the desk gives a warm and quiet light.',
    'When your speed drops, look at the keys that need practice.',
    'She wrote the letter twice because she did not like the first one.',
    'Many small steps lead to a big goal in the end.',
    'How vexingly quick daft zebras jump!',
    'Today you learn the numbers: 1, 2, 3 and then up to 100.',
  ],
};

const split = (s) => [...new Set(s.split(/\s+/).filter(Boolean))];

export const WORDS = { de: split(DE), en: split(EN) };
export { SENTENCES };
