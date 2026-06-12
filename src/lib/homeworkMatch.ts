// ── Inhaltlicher Abgleich zweier Hausaufgaben-Titel ─────────────────────────
// Erkennt, ob zwei unterschiedlich geschriebene Hausaufgaben dieselbe meinen –
// z. B. "S.150/4 b) c) f) und S 151/8" == "150/4bcf,8". Wird beim Gruppieren
// (Tasks-Seite) UND beim Übernehmen einer Fremdaufgabe (Store) benutzt.

// Wörter (länger als 2 Zeichen, ohne Satzzeichen) – Fallback wenn keine Zahlen.
export function titleWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2),
  );
}

// Eine einzelne Seiten-/Aufgaben-Referenz, z. B. Seite 150, Aufgabe 4.
// page === null heißt "ohne Seitenangabe" und passt dann auf jede Seite.
export interface ExRef { page: number | null; ex: number }

// Liest aus einem Hausaufgaben-Titel die referenzierten Seiten + Aufgaben heraus –
// egal in welcher Schreibweise. "Seite"/"S."/"S" zählt als Seitenmarker, "/" als
// Trenner zwischen Seite und Aufgabe. Buchstaben-Teile (a, b, c) werden ignoriert,
// weil sie nur Unteraufgaben derselben Aufgabe sind. Beispiele:
//   "S.150/4 b) c) f) und S 151/8" → [150/4, 151/8]
//   "150/4bcf,8"                   → [150/4, 150/8]
//   "Seite 165 Aufgabe 5 und 7a"   → [165/5, 165/7]
export function parseExRefs(title: string): ExRef[] {
  const s = title.toLowerCase()
    .replace(/seiten?/g, ' s ')                                   // "Seite" → Marker s
    .replace(/aufgaben?|aufg\.?|übung(?:en)?|nummer|nr\.?/g, ' ') // Aufgaben-Wörter raus
    .replace(/(^|[^a-zäöüß])s\.?(?=\s*\d)/g, '$1 ⟂ ');            // Seitenmarker → ⟂
  const re = /(⟂)|(\d+)|(\/)/g;
  type Tok = { kind: 's' | 'num' | 'slash'; val?: number };
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) toks.push({ kind: 's' });
    else if (m[2] !== undefined) toks.push({ kind: 'num', val: parseInt(m[2], 10) });
    else toks.push({ kind: 'slash' });
  }
  const refs: ExRef[] = [];
  let page: number | null = null;
  let pendingPage = false;                                        // gerade einen Seitenmarker gesehen
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.kind === 's') pendingPage = true;
    else if (tk.kind === 'slash') continue;
    else if (pendingPage) { page = tk.val!; pendingPage = false; }      // Zahl nach "S" → Seite
    else if (toks[i + 1]?.kind === 'slash') page = tk.val!;             // Zahl vor "/" → Seite
    else refs.push({ page, ex: tk.val! });                             // sonst → Aufgabe
  }
  return refs;
}

// Teilen sich zwei Referenz-Listen mindestens eine Seite + Aufgabe?
function refsOverlap(a: ExRef[], b: ExRef[]): boolean {
  for (const x of a) for (const y of b) {
    if (x.ex === y.ex && (x.page === y.page || x.page === null || y.page === null)) return true;
  }
  return false;
}

// Beschreiben zwei Titel wahrscheinlich dieselbe Aufgabe?
// Wenn beide Seiten-/Aufgabennummern enthalten, gelten sie als gleich, sobald
// sie sich eine Seite + Aufgabe teilen – dadurch passen "S.150/4 b) c) f)" und
// "150/4bcf,8" zusammen. Ganz verschiedene Aufgaben (andere Seite/Nummer)
// werden NICHT gruppiert. Ohne Zahlenbezug zählt die Wort-Überschneidung.
export function tasksLikelySame(a: string, b: string): boolean {
  const ra = parseExRefs(a), rb = parseExRefs(b);
  if (ra.length && rb.length) return refsOverlap(ra, rb);
  const wa = titleWords(a), wb = titleWords(b);
  if (!wa.size || !wb.size) return false;
  let inter = 0; for (const w of wa) if (wb.has(w)) inter++;
  const union = new Set([...wa, ...wb]).size;
  return inter / union >= 0.5;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Minimal-Form einer Hausaufgabe für den Abgleich (passt auf FriendTask).
export interface HomeworkLike { title: string; subjectName?: string; dueDate?: number }

// Beschreiben zwei Hausaufgaben (Fach + Tag + Inhalt) wahrscheinlich dieselbe?
export function sameHomework(a: HomeworkLike, b: HomeworkLike): boolean {
  if (!a.subjectName || !b.subjectName || a.dueDate == null || b.dueDate == null) {
    // Ohne Fach/Datum nur exakt gleiche Titel zusammenfassen.
    return a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
      && (a.subjectName ?? '') === (b.subjectName ?? '');
  }
  return a.subjectName.toLowerCase() === b.subjectName.toLowerCase()
    && startOfDay(a.dueDate) === startOfDay(b.dueDate)
    && tasksLikelySame(a.title, b.title);
}
