import {
  // Sprachen
  BookOpen, Type, FileText, Globe, Languages, MessageSquare, Landmark, ScrollText, Speech,
  // MINT
  Calculator, Sigma, Hash, Pi, Percent, Ruler, Shapes, Atom, Zap, Waves, Magnet, Thermometer,
  FlaskConical, TestTube, Beaker, Microscope, Dna, Leaf, Telescope, Orbit,
  // Informatik & Technik
  Monitor, Code2, Cpu, Terminal, Binary, Database, Keyboard, Wrench, Hammer, Settings, Cog, Plug,
  // Gesellschaft
  Clock, Scroll, Map, Globe2, Compass, Building2, Flag, Users, Network, Scale, Gavel, Vote,
  TrendingUp, BarChart2, Coins, Banknote, Wallet, Briefcase,
  // Kunst & Musik / Medien
  Palette, Brush, PenTool, Music, Music2, Piano, Mic2, Guitar, Drum, Headphones, Image, Camera,
  Film, Clapperboard, Drama, Tv2, Radio, Newspaper,
  // Sport & Gesundheit
  Dumbbell, Trophy, Bike, Medal, Goal, Volleyball, Footprints, HeartPulse, Activity, Brain, SmilePlus,
  // Werte & Sonstiges
  Star, Heart, Sun, HandHeart, HeartHandshake, Cross, Church, Lightbulb, Sparkles, BookMarked,
  GraduationCap, School, Puzzle, Flame, Droplet, TreePine, Flower2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registry aller Fach-Icons: Icon-Name (so wird er in Subject.icon gespeichert)
 * → lucide-Komponente. Nur Namen aus dieser Map sind gültige Fach-Icons.
 */
export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  BookOpen, Type, FileText, Globe, Languages, MessageSquare, Landmark, ScrollText, Speech,
  Calculator, Sigma, Hash, Pi, Percent, Ruler, Shapes, Atom, Zap, Waves, Magnet, Thermometer,
  FlaskConical, TestTube, Beaker, Microscope, Dna, Leaf, Telescope, Orbit,
  Monitor, Code2, Cpu, Terminal, Binary, Database, Keyboard, Wrench, Hammer, Settings, Cog, Plug,
  Clock, Scroll, Map, Globe2, Compass, Building2, Flag, Users, Network, Scale, Gavel, Vote,
  TrendingUp, BarChart2, Coins, Banknote, Wallet, Briefcase,
  Palette, Brush, PenTool, Music, Music2, Piano, Mic2, Guitar, Drum, Headphones, Image, Camera,
  Film, Clapperboard, Drama, Tv2, Radio, Newspaper,
  Dumbbell, Trophy, Bike, Medal, Goal, Volleyball, Footprints, HeartPulse, Activity, Brain, SmilePlus,
  Star, Heart, Sun, HandHeart, HeartHandshake, Cross, Church, Lightbulb, Sparkles, BookMarked,
  GraduationCap, School, Puzzle, Flame, Droplet, TreePine, Flower2,
};

/** Neutrales Fallback-Icon, wenn nichts erkannt wird und nichts gewählt ist. */
export const DEFAULT_SUBJECT_ICON = 'BookMarked';

/**
 * Gruppierte Auswahl für den Icon-Picker (kuratiert nach Fachbereich).
 * Alle Namen müssen in SUBJECT_ICONS existieren.
 */
export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  {
    label: 'Sprachen',
    icons: ['BookOpen', 'Type', 'FileText', 'Globe', 'Languages', 'MessageSquare', 'Landmark', 'ScrollText', 'Speech'],
  },
  {
    label: 'Mathe & Naturwissenschaften',
    icons: ['Calculator', 'Sigma', 'Hash', 'Pi', 'Percent', 'Ruler', 'Shapes', 'Atom', 'Zap', 'Waves', 'Magnet', 'Thermometer', 'FlaskConical', 'TestTube', 'Beaker', 'Microscope', 'Dna', 'Leaf', 'Telescope', 'Orbit'],
  },
  {
    label: 'Informatik & Technik',
    icons: ['Monitor', 'Code2', 'Cpu', 'Terminal', 'Binary', 'Database', 'Keyboard', 'Wrench', 'Hammer', 'Settings', 'Cog', 'Plug'],
  },
  {
    label: 'Gesellschaft & Wirtschaft',
    icons: ['Clock', 'Scroll', 'Map', 'Globe2', 'Compass', 'Building2', 'Flag', 'Users', 'Network', 'Scale', 'Gavel', 'Vote', 'TrendingUp', 'BarChart2', 'Coins', 'Banknote', 'Wallet', 'Briefcase'],
  },
  {
    label: 'Kunst, Musik & Medien',
    icons: ['Palette', 'Brush', 'PenTool', 'Music', 'Music2', 'Piano', 'Mic2', 'Guitar', 'Drum', 'Headphones', 'Image', 'Camera', 'Film', 'Clapperboard', 'Drama', 'Tv2', 'Radio', 'Newspaper'],
  },
  {
    label: 'Sport & Gesundheit',
    icons: ['Dumbbell', 'Trophy', 'Bike', 'Medal', 'Goal', 'Volleyball', 'Footprints', 'HeartPulse', 'Activity', 'Brain', 'SmilePlus'],
  },
  {
    label: 'Werte & Sonstiges',
    icons: ['Star', 'Heart', 'Sun', 'HandHeart', 'HeartHandshake', 'Cross', 'Church', 'Lightbulb', 'Sparkles', 'BookMarked', 'GraduationCap', 'School', 'Puzzle', 'Flame', 'Droplet', 'TreePine', 'Flower2'],
  },
];

/** Deutsche/englische Suchbegriffe je Icon, damit der Picker auf „mathe", „chemie" usw. trifft. */
const ICON_KEYWORDS: Record<string, string> = {
  BookOpen: 'deutsch buch lesen book',
  Type: 'text schrift buchstabe deutsch',
  FileText: 'aufsatz text dokument',
  Globe: 'englisch welt erde global language',
  Languages: 'sprache fremdsprache französisch spanisch latein übersetzung translate',
  MessageSquare: 'gespräch dialog konversation chat sprechen',
  Landmark: 'latein antike gebäude geschichte säulen',
  ScrollText: 'latein schriftrolle text alt',
  Speech: 'rhetorik reden sprechen vortrag',
  Calculator: 'mathe mathematik rechnen taschenrechner zahlen',
  Sigma: 'mathe summe statistik stochastik',
  Hash: 'mathe zahlen raute nummer',
  Pi: 'mathe pi geometrie kreis',
  Percent: 'mathe prozent anteil',
  Ruler: 'mathe geometrie lineal messen technik',
  Shapes: 'mathe geometrie formen körper',
  Atom: 'physik atom kern teilchen chemie',
  Zap: 'physik strom elektrik energie blitz',
  Waves: 'physik welle akustik schall wasser',
  Magnet: 'physik magnet feld',
  Thermometer: 'physik temperatur wärme chemie',
  FlaskConical: 'chemie kolben labor reagenz',
  TestTube: 'chemie reagenzglas labor probe',
  Beaker: 'chemie becher labor',
  Microscope: 'biologie chemie mikroskop labor zellen',
  Dna: 'biologie genetik dna erbgut',
  Leaf: 'biologie pflanze natur blatt botanik nawi',
  Telescope: 'astronomie physik teleskop sterne',
  Orbit: 'astronomie physik umlaufbahn planet',
  Monitor: 'informatik computer bildschirm edv pc',
  Code2: 'informatik programmieren code coding',
  Cpu: 'informatik prozessor chip technik hardware',
  Terminal: 'informatik konsole code shell',
  Binary: 'informatik binär bits daten',
  Database: 'informatik datenbank daten speicher',
  Keyboard: 'informatik tastatur eingabe schreiben',
  Wrench: 'technik werken werkzeug schraubenschlüssel reparatur',
  Hammer: 'technik werken hammer handwerk bauen',
  Settings: 'technik zahnrad einstellungen mechanik',
  Cog: 'technik zahnrad maschine mechanik',
  Plug: 'technik elektrik stecker strom',
  Clock: 'geschichte zeit uhr history epoche',
  Scroll: 'geschichte schriftrolle dokument alt',
  Map: 'geographie erdkunde karte geografie landkarte',
  Globe2: 'geographie erdkunde welt erde globus',
  Compass: 'geographie erdkunde kompass orientierung navigation',
  Building2: 'politik sozialkunde gebäude staat verwaltung wirtschaft',
  Flag: 'politik fahne flagge land nation',
  Users: 'sozialkunde sowi gesellschaft menschen gruppe gemeinschaft',
  Network: 'sozialkunde netzwerk verbindung informatik',
  Scale: 'ethik recht waage gerechtigkeit jura gleichgewicht',
  Gavel: 'recht jura richter hammer gericht',
  Vote: 'politik wahl abstimmung demokratie',
  TrendingUp: 'wirtschaft bwl vwl wachstum kurve ökonomie',
  BarChart2: 'wirtschaft statistik diagramm balken daten',
  Coins: 'wirtschaft geld münzen finanzen',
  Banknote: 'wirtschaft geld schein finanzen',
  Wallet: 'wirtschaft geld geldbeutel finanzen',
  Briefcase: 'wirtschaft beruf business arbeit aktentasche',
  Palette: 'kunst malen farbe palette art',
  Brush: 'kunst pinsel malen farbe',
  PenTool: 'kunst design zeichnen vektor stift',
  Music: 'musik note melodie song',
  Music2: 'musik note melodie',
  Piano: 'musik klavier tasten piano instrument',
  Mic2: 'musik gesang mikrofon singen theater',
  Guitar: 'musik gitarre instrument',
  Drum: 'musik schlagzeug trommel rhythmus',
  Headphones: 'musik kopfhörer hören audio',
  Image: 'kunst bild foto medien',
  Camera: 'medien foto kamera fotografie film',
  Film: 'medien film kino video theater',
  Clapperboard: 'medien film klappe video drehen',
  Drama: 'theater drama maske darstellendes spiel schauspiel',
  Tv2: 'medien fernsehen tv bildschirm',
  Radio: 'medien radio hören rundfunk',
  Newspaper: 'medien zeitung presse nachrichten',
  Dumbbell: 'sport fitness hantel kraft training',
  Trophy: 'sport pokal sieg wettkampf',
  Bike: 'sport fahrrad radfahren bewegung',
  Medal: 'sport medaille sieg auszeichnung',
  Goal: 'sport tor ziel fußball',
  Volleyball: 'sport ball volleyball spiel',
  Footprints: 'sport laufen schritte bewegung',
  HeartPulse: 'gesundheit puls herz psychologie biologie',
  Activity: 'sport gesundheit aktivität puls bewegung',
  Brain: 'philosophie psychologie gehirn denken kopf ethik',
  SmilePlus: 'psychologie gefühl emotion lächeln',
  Star: 'religion stern glaube fach',
  Heart: 'religion ethik herz liebe werte',
  Sun: 'religion sonne licht natur',
  HandHeart: 'ethik werte fürsorge hand herz sozial',
  HeartHandshake: 'ethik sozial werte hände vertrauen',
  Cross: 'religion kreuz glaube kirche christlich',
  Church: 'religion kirche glaube gebäude',
  Lightbulb: 'philosophie idee denken glühbirne lernen',
  Sparkles: 'sonstige glitzer besonders fach',
  BookMarked: 'fach buch allgemein lernen lesezeichen',
  GraduationCap: 'schule abschluss bildung lernen',
  School: 'schule gebäude bildung unterricht',
  Puzzle: 'logik denken puzzle teil',
  Flame: 'feuer flamme energie',
  Droplet: 'wasser tropfen chemie biologie',
  TreePine: 'natur baum wald biologie umwelt',
  Flower2: 'natur blume biologie botanik pflanze',
};

/** Erkennt anhand des Fachnamens ein passendes Icon (erster Treffer gewinnt). */
const DETECTION: Array<[string[], string]> = [
  [['mathemat', 'geometr', 'algebra', 'stochast', 'analysis', 'rechnen'], 'Calculator'],
  [['deutsch'], 'BookOpen'],
  [['latein', 'latin'], 'Landmark'],
  [['englisch', 'english'], 'Globe'],
  [['franz', 'spanisch', 'español', 'italien', 'russisch', 'chinesisch', 'griechisch', 'fremdsprache', 'sprache'], 'Languages'],
  [['geschicht', 'history', 'histor'], 'Clock'],
  [['erdkunde', 'geographie', 'geografie', 'geograf', 'geologie', 'geo'], 'Map'],
  [['biolog', 'nawi', 'naturwissenschaft'], 'Leaf'],
  [['chemie', 'chemi'], 'FlaskConical'],
  [['physik', 'physic'], 'Atom'],
  [['informat', 'computer', ' itg', 'edv', 'programmier', 'coding'], 'Monitor'],
  [['musik', 'music', 'chor', 'orchester'], 'Music'],
  [['kunst', 'malerei', 'zeichn', 'gestalt'], 'Palette'],
  [['sport', 'turnen', 'fitness'], 'Dumbbell'],
  [['religion', 'reli', 'katho', 'evangel', 'islam'], 'Star'],
  [['ethik', 'moral'], 'Scale'],
  [['philosoph', 'philo'], 'Brain'],
  [['psycholog', 'psycho'], 'HeartPulse'],
  [['wirtschaft', 'bwl', 'vwl', 'ökonom', 'okonom', 'business', 'rechnungs'], 'TrendingUp'],
  [['sozial', 'sowi', 'gemeinschaftsk'], 'Users'],
  [['politik', 'powi', 'gemeinschaftsl'], 'Building2'],
  [['technik', 'werken', 'nwt', 'handwerk'], 'Wrench'],
  [['theater', 'drama', 'darstellend'], 'Drama'],
  [['medien', 'film', 'journalis'], 'Tv2'],
  [['recht', 'jura'], 'Scale'],
];

/** Liefert den Icon-Namen, der automatisch zu einem Fachnamen passt. */
export function detectSubjectIcon(name: string): string {
  const n = name.toLowerCase();
  for (const [keys, icon] of DETECTION) {
    if (keys.some(k => n.includes(k))) return icon;
  }
  return DEFAULT_SUBJECT_ICON;
}

/** Resolved den finalen Icon-Namen eines Fachs: manuell gewählt → sonst automatisch erkannt. */
export function resolveSubjectIconName(subject: { icon?: string; name?: string }): string {
  if (subject.icon && SUBJECT_ICONS[subject.icon]) return subject.icon;
  return detectSubjectIcon(subject.name ?? '');
}

/** Liefert die lucide-Komponente für ein Fach (manuell oder erkannt). */
export function getSubjectIcon(subject: { icon?: string; name?: string }): LucideIcon {
  return SUBJECT_ICONS[resolveSubjectIconName(subject)] ?? BookMarked;
}

/** Liefert die lucide-Komponente zu einem Icon-Namen (für den Picker). */
export function iconComponent(name: string): LucideIcon {
  return SUBJECT_ICONS[name] ?? BookMarked;
}

/** Sucht Icons im Picker anhand Name oder deutschen Suchbegriffen. */
export function searchIcons(query: string): string[] {
  const q = query.trim().toLowerCase();
  const all = Object.keys(SUBJECT_ICONS);
  if (!q) return all;
  return all.filter(name => name.toLowerCase().includes(q) || (ICON_KEYWORDS[name] ?? '').includes(q));
}
