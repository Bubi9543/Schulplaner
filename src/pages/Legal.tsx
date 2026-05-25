import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';

/**
 * Anpassen: ersetz die Platzhalter durch eure echten Daten.
 * Die Eltern müssen im Impressum als Verantwortliche stehen, weil der App-Betreiber minderjährig ist.
 */
const LEGAL_DATA = {
  // ─── Bitte hier eure echten Daten eintragen ─────────────────────────────
  parentName: 'Jens Becker',         // Name der/des Erziehungsberechtigten
  childName: 'Conor Becker',                    // Dein Name (technischer Betreiber)
  streetAddress: 'Lohengrinstraße 17',
  city: '81925 München',
  country: 'Deutschland',
  email: 'cnrbckr@gmail.com',                   // Kontakt-Email
  phone: '',                                    // optional, leer lassen wenn nicht gewünscht
  websiteUrl: 'https://schulplaner.conor.at',
  // ───────────────────────────────────────────────────────────────────────
};

export function ImpressumPage() {
  const d = LEGAL_DATA;
  return (
    <PageShell title="Impressum" subtitle="Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)">
      <BackLink />
      <Card className="prose-card max-w-3xl">
        <Section title="Anbieter">
          <p className="text-ink-700 leading-relaxed">
            {d.parentName}<br />
            (gesetzlich vertretend für den minderjährigen Betreiber {d.childName})<br />
            {d.streetAddress}<br />
            {d.city}<br />
            {d.country}
          </p>
        </Section>

        <Section title="Kontakt">
          <p className="text-ink-700 leading-relaxed">
            E-Mail: <a href={`mailto:${d.email}`} className="text-theme-deep underline">{d.email}</a>
            {d.phone && <><br />Telefon: {d.phone}</>}
          </p>
        </Section>

        <Section title="Verantwortlich für den Inhalt">
          <p className="text-ink-700 leading-relaxed">
            {d.parentName} (Anschrift wie oben)
          </p>
        </Section>

        <Section title="Hinweis zur Streitbeilegung">
          <p className="text-ink-700 leading-relaxed">
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
            <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-theme-deep underline">
              https://ec.europa.eu/consumers/odr/
            </a>.<br />
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </Section>

        <Section title="Haftung für Inhalte">
          <p className="text-ink-700 leading-relaxed">
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich.
            Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen
            oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
          </p>
        </Section>

        <Section title="Urheberrecht">
          <p className="text-ink-700 leading-relaxed">
            Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht.
            Beiträge Dritter sind als solche gekennzeichnet.
          </p>
        </Section>
      </Card>
    </PageShell>
  );
}

export function DatenschutzPage() {
  const d = LEGAL_DATA;
  return (
    <PageShell title="Datenschutzerklärung" subtitle="Informationen zur Verarbeitung deiner Daten">
      <BackLink />
      <Card className="prose-card max-w-3xl">
        <Section title="1. Verantwortlicher">
          <p className="text-ink-700 leading-relaxed">
            Verantwortlicher im Sinne der DSGVO ist:<br />
            {d.parentName}<br />
            (für den minderjährigen Betreiber {d.childName})<br />
            {d.streetAddress}, {d.city}, {d.country}<br />
            E-Mail: <a href={`mailto:${d.email}`} className="text-theme-deep underline">{d.email}</a>
          </p>
        </Section>

        <Section title="2. Welche Daten wir verarbeiten">
          <p className="text-ink-700 leading-relaxed mb-2">
            Die Notenapp ist eine sogenannte „Local-First"-App – das heißt: standardmäßig werden deine Daten <strong>nur in deinem Browser</strong> (IndexedDB) gespeichert.
            Erst wenn du dich freiwillig einloggst und Cloud-Sync aktivierst, werden deine Daten zusätzlich auf einen Server übertragen.
          </p>
          <p className="text-ink-700 leading-relaxed mb-2">Konkret verarbeiten wir je nach Nutzung:</p>
          <ul className="list-disc pl-5 space-y-1 text-ink-700">
            <li><strong>Lokal im Browser:</strong> deine Fächer, Noten, Aufgaben, Stundenplan, Schuljahre, App-Einstellungen.</li>
            <li><strong>Bei Cloud-Sync:</strong> zusätzlich E-Mail-Adresse (für Login), die obigen Inhaltsdaten, optional von dir hochgeladene Fotos.</li>
            <li><strong>Technisch unvermeidbar:</strong> IP-Adresse und User-Agent in den Server-Logs des Hosters (Vercel, Supabase) zur Abwehr von Missbrauch.</li>
          </ul>
        </Section>

        <Section title="3. Zweck und Rechtsgrundlage">
          <ul className="list-disc pl-5 space-y-1 text-ink-700">
            <li><strong>Bereitstellung der App:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) bzw. lit. f (berechtigtes Interesse am Betrieb).</li>
            <li><strong>Cloud-Sync und Fotos:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung – jederzeit widerrufbar durch Abmelden in den Einstellungen).</li>
            <li><strong>Server-Logs:</strong> Art. 6 Abs. 1 lit. f DSGVO (Sicherheit und Stabilität).</li>
          </ul>
        </Section>

        <Section title="4. Auftragsverarbeiter und externe Dienste">
          <p className="text-ink-700 leading-relaxed mb-2">Wir nutzen folgende Dienstleister:</p>
          <ul className="list-disc pl-5 space-y-2 text-ink-700">
            <li>
              <strong>Vercel Inc.</strong> (440 N Barranca Ave #4133, Covina, CA 91723, USA) – Hosting der Web-App.
              Datenübermittlung in die USA auf Grundlage von EU-Standardvertragsklauseln und EU-US Data Privacy Framework.
              Es können IP-Adresse, Browser-Typ und Anfragezeitpunkt in Logs gespeichert werden.
            </li>
            <li>
              <strong>Supabase Inc.</strong> (970 Toa Payoh North #07-04, Singapur 318992; Server in der EU – Frankfurt) –
              Datenbank, Authentifizierung und Foto-Speicher für die Cloud-Sync-Funktion. Wird nur aktiviert, wenn du dich einloggst.
            </li>
            <li>
              <strong>Google Ireland Limited</strong> (Gordon House, Barrow Street, Dublin 4, Irland) – nur wenn du dich per „Mit Google anmelden" einloggst.
              Google erhält dann deine Login-Anfrage und gibt uns deine E-Mail und Google-User-ID zurück.
            </li>
          </ul>
        </Section>

        <Section title="5. Cookies und lokale Speicherung">
          <p className="text-ink-700 leading-relaxed">
            Die App nutzt <strong>keine Tracking-Cookies und kein Analytics</strong>. Es kommen ausschließlich technisch notwendige Mechanismen zum Einsatz:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-ink-700 mt-2">
            <li><strong>IndexedDB / LocalStorage:</strong> speichert deine App-Daten direkt in deinem Browser.</li>
            <li><strong>Auth-Cookie (nur bei Login):</strong> Supabase setzt ein Cookie zur Aufrechterhaltung deiner Sitzung. Wird beim Abmelden gelöscht.</li>
          </ul>
          <p className="text-ink-700 leading-relaxed mt-2">
            Diese Mechanismen sind nach § 25 Abs. 2 TDDDG zustimmungsfrei, da sie unbedingt erforderlich sind, damit der von dir angeforderte Dienst funktioniert.
          </p>
        </Section>

        <Section title="6. Speicherdauer">
          <p className="text-ink-700 leading-relaxed">
            Inhaltsdaten (Noten, Aufgaben etc.) bleiben so lange gespeichert, wie du sie behältst. Du kannst sie jederzeit in den Einstellungen löschen.
            Server-Logs des Hosters werden in der Regel nach 30 Tagen gelöscht.
            Wenn du deinen Account löschst, werden alle deine Daten unverzüglich aus der Cloud entfernt.
          </p>
        </Section>

        <Section title="7. Deine Rechte">
          <p className="text-ink-700 leading-relaxed mb-2">Nach DSGVO hast du folgende Rechte:</p>
          <ul className="list-disc pl-5 space-y-1 text-ink-700">
            <li>Auskunft über deine gespeicherten Daten (Art. 15)</li>
            <li>Berichtigung unrichtiger Daten (Art. 16)</li>
            <li>Löschung deiner Daten (Art. 17)</li>
            <li>Einschränkung der Verarbeitung (Art. 18)</li>
            <li>Datenübertragbarkeit (Art. 20) – die App hat dafür einen Export-Knopf in den Einstellungen</li>
            <li>Widerspruch gegen die Verarbeitung (Art. 21)</li>
            <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77)</li>
          </ul>
          <p className="text-ink-700 leading-relaxed mt-2">
            Eine Anfrage genügt formlos an die oben angegebene E-Mail-Adresse.
          </p>
        </Section>

        <Section title="8. Hinweis für Minderjährige">
          <p className="text-ink-700 leading-relaxed">
            Diese App richtet sich an Schülerinnen und Schüler. Wenn du jünger als 16 Jahre alt bist und Cloud-Sync nutzen möchtest,
            brauchen wir die Zustimmung deiner Erziehungsberechtigten (Art. 8 DSGVO).
            Ohne Cloud-Sync kannst du die App ohne Account und ohne Datenweitergabe nutzen.
          </p>
        </Section>

        <Section title="9. Änderungen dieser Erklärung">
          <p className="text-ink-700 leading-relaxed">
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie stets aktuellen rechtlichen Anforderungen entspricht.
            Die jeweils aktuelle Version ist immer hier auf dieser Seite abrufbar.
          </p>
          <p className="text-ink-500 text-xs mt-2">Stand: {new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p>
        </Section>
      </Card>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <h2 className="font-display font-bold text-lg text-ink-900 mb-2">{title}</h2>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <div className="mb-4">
      <Link to="/einstellungen" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-theme-deep transition">
        <ArrowLeft className="size-4" />
        Zurück zu den Einstellungen
      </Link>
    </div>
  );
}

// Re-export, damit App.tsx beide Pages einfach in den Router stecken kann
export function LegalPageRouter() {
  const { kind } = useParams();
  if (kind === 'impressum') return <ImpressumPage />;
  return <DatenschutzPage />;
}
