// A prompt to paste, together with a plugin's files, into any AI tool: it adapts a MuseScore plugin
// so it runs in this MuseScore Studio (4.7, Qt 6, in the browser). Shown on the Plugins panel.

const EN = `You are porting a MuseScore plugin so that it runs in MuseScore Studio 4.7 in a web browser (MiniNode). I attach the plugin's files below.

The target:
- MuseScore Studio 4.7.x built with Qt 6.10 for WebAssembly. Plugins are QML files run by MuseScore's plugin engine, exactly as on the desktop.
- Plugin API: keep "import MuseScore 3.0" and the MuseScore { ... } root item (title, description, version, categoryCode, thumbnailName, pluginType "dialog" or none, requiresScore, onRun). Keep the plugin logic as it is where it already works in MuseScore 4.
- Qt 6 QML only: imports without version numbers or with Qt 6 versions (import QtQuick, import QtQuick.Controls, import QtQuick.Layouts). QtQuick.Controls 1.x, QtQuick.Dialogs 1.x and Qt.labs.settings from Qt 5 do not exist; replace them (Controls 2 types, Dialog from QtQuick.Controls, Settings from QtCore).

What the browser does not have:
- No external programs: QProcess / MsProcess start nothing. Remove such features or do the work in QML/JavaScript.
- No native file dialogs or paths on the computer. FileIO works only inside the editor's own file system. Instead of reading or writing files on the computer, work on the open score (curScore) or show the result in the plugin window (e.g. a TextArea the person can copy from).
- Network: only the page's own address. Calls to other websites are blocked; remove them or make them optional with a clear message.
- No eval() and no new Function() in plugin JavaScript.
- Everything runs on one thread: avoid long busy loops; split long work with Qt.callLater or a Timer.

Output:
1. The complete, corrected files, each in its own code block with its file name (the main .qml file first, then images or other files it needs, keeping their relative paths).
2. A short list of what you changed and why, and what no longer works in the browser.
3. How to install: put all files in one folder named after the plugin, zip that folder, then in MuseScore choose Plugins → Manage plugins… → Add plugin, and enable it on the Plugins page.

The plugin files:
`;

const DE = `Du portierst ein MuseScore-Plugin, damit es in MuseScore Studio 4.7 im Webbrowser (MiniNode) läuft. Die Dateien des Plugins hänge ich unten an.

Das Ziel:
- MuseScore Studio 4.7.x, mit Qt 6.10 für WebAssembly gebaut. Plugins sind QML-Dateien und laufen in MuseScores Plugin-Engine, genau wie am Desktop.
- Plugin-API: behalte "import MuseScore 3.0" und das Wurzelelement MuseScore { ... } (title, description, version, categoryCode, thumbnailName, pluginType "dialog" oder keiner, requiresScore, onRun). Lass die Logik, wo sie in MuseScore 4 schon funktioniert.
- Nur Qt-6-QML: Importe ohne Versionsnummer oder mit Qt-6-Versionen (import QtQuick, import QtQuick.Controls, import QtQuick.Layouts). QtQuick.Controls 1.x, QtQuick.Dialogs 1.x und Qt.labs.settings aus Qt 5 gibt es nicht mehr; ersetze sie (Controls-2-Typen, Dialog aus QtQuick.Controls, Settings aus QtCore).

Was der Browser nicht hat:
- Keine externen Programme: QProcess / MsProcess startet nichts. Entferne solche Funktionen oder erledige die Arbeit in QML/JavaScript.
- Keine nativen Dateidialoge und keine Pfade auf dem Computer. FileIO arbeitet nur im eigenen Dateisystem des Editors. Statt Dateien auf dem Computer zu lesen oder zu schreiben: mit der offenen Partitur (curScore) arbeiten oder das Ergebnis im Plugin-Fenster zeigen (z. B. eine TextArea zum Kopieren).
- Netzwerk: nur die eigene Adresse der Seite. Aufrufe anderer Websites werden blockiert; entferne sie oder mache sie optional, mit einer klaren Meldung.
- Kein eval() und kein new Function() im Plugin-JavaScript.
- Alles läuft in einem Thread: keine langen Warteschleifen; lange Arbeit mit Qt.callLater oder einem Timer aufteilen.

Ausgabe:
1. Die vollständigen, korrigierten Dateien, jede in einem eigenen Codeblock mit Dateinamen (zuerst die Haupt-.qml-Datei, dann Bilder oder andere benötigte Dateien mit ihren relativen Pfaden).
2. Eine kurze Liste, was du geändert hast und warum, und was im Browser nicht mehr geht.
3. So wird es installiert: alle Dateien in einen Ordner mit dem Namen des Plugins legen, den Ordner zippen, dann in MuseScore Plug-Ins → Plug-Ins verwalten… → Plugin hinzufügen wählen und es auf der Plug-Ins-Seite aktivieren.

Die Plugin-Dateien:
`;

/** The prompt in the page's language (German or English). */
export function pluginPrompt(lang) {
  return lang === 'en' ? EN : DE;
}
