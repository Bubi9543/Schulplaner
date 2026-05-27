/**
 * Zeugnis-PDF-Generator. Baut eine schicke Notenübersicht mit Schulplaner-
 * Branding, allen Fächern, allen Noten und der Endnote pro Fach.
 *
 * Wird ausschließlich dynamisch importiert, damit jspdf nicht im Haupt-Bundle
 * landet (≈ 250 KB gzip).
 */

import type { AppSettings, Grade, Subject, SchoolYear, GradingSystem } from '@/types';
import { subjectAverage, overallAverage, formatAverage, getKindLabel, gradeColor } from './grading';

export interface ReportInput {
  subjects: Subject[];
  grades: Grade[];
  settings: AppSettings;
  schoolYear: SchoolYear | null;
}

const THEME = {
  // Schulplaner-Orange (matched ungefähr das Light-Theme).
  primary: [249, 115, 22] as [number, number, number],       // orange-500
  primarySoft: [255, 237, 213] as [number, number, number],  // orange-100
  ink: [15, 18, 32] as [number, number, number],             // ink-900
  inkSoft: [100, 116, 139] as [number, number, number],      // ink-500
  divider: [226, 232, 240] as [number, number, number],      // slate-200
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function gradeRgb(value: number, system: GradingSystem, config: AppSettings['gradingConfig']): [number, number, number] {
  // Wandelt das hex aus gradeColor in RGB für jsPDF.
  const hex = gradeColor(value, system, config);
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [80, 80, 80];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Erzeugt ein PDF-Zeugnis und lädt es automatisch herunter.
 * Liefert den Dateinamen zurück.
 */
export async function generateReportPdf(input: ReportInput): Promise<string> {
  const { default: jsPDF } = await import('jspdf');
  // jspdf-autotable v5: als Funktion aufrufen, autoTable(doc, options).
  const { default: autoTable } = await import('jspdf-autotable');

  const { subjects, grades, settings, schoolYear } = input;
  const config = settings.gradingConfig;
  const digits = settings.averageDigits ?? 2;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;

  // ── Header-Streifen ────────────────────────────────────────────────────
  doc.setFillColor(...THEME.primary);
  doc.rect(0, 0, pageWidth, 12, 'F');

  // Logo-Text "Schulplaner"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...THEME.ink);
  doc.text('Schulplaner', margin, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...THEME.inkSoft);
  doc.text('schulplaner.conor.at', margin, 70);

  // Datum rechts oben
  doc.setFontSize(9);
  doc.setTextColor(...THEME.inkSoft);
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(`Stand: ${today}`, pageWidth - margin, 56, { align: 'right' });

  // ── Titel & Profil ─────────────────────────────────────────────────────
  let y = 110;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...THEME.ink);
  doc.text('Notenübersicht', margin, y);

  // Schülername (nur wenn vorhanden)
  if (settings.name) {
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...THEME.primary);
    doc.text(settings.name, margin, y);
  }

  // Meta-Zeile: Schule · Klasse · Schuljahr
  const metaParts: string[] = [];
  if (settings.school) metaParts.push(settings.school);
  if (settings.classLevel) metaParts.push(`Klasse ${settings.classLevel}`);
  if (schoolYear?.name) metaParts.push(`Schuljahr ${schoolYear.name}`);
  if (metaParts.length) {
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...THEME.inkSoft);
    doc.text(metaParts.join('  ·  '), margin, y);
  }

  // ── Gesamt-Schnitt-Hervorhebung ────────────────────────────────────────
  const overall = overallAverage(grades, subjects, config);
  if (overall != null) {
    y += 32;
    // Kasten links: Schnitt-Zahl groß
    const boxX = margin;
    const boxY = y;
    const boxW = pageWidth - 2 * margin;
    const boxH = 64;
    doc.setFillColor(...THEME.primarySoft);
    doc.roundedRect(boxX, boxY, boxW, boxH, 8, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(38);
    doc.setTextColor(...THEME.primary);
    doc.text(formatAverage(overall, settings.system, digits), boxX + 24, boxY + 44);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...THEME.ink);
    doc.text('Gesamtschnitt', boxX + 24 + 100, boxY + 28);
    doc.setFontSize(9);
    doc.setTextColor(...THEME.inkSoft);
    doc.text(`über ${subjects.length} Fächer · ${grades.filter(g => !g.isPending).length} Noten`, boxX + 24 + 100, boxY + 44);

    y = boxY + boxH;
  }

  // ── Fächer-Tabelle ─────────────────────────────────────────────────────
  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...THEME.ink);
  doc.text('Fächer', margin, y);
  y += 8;

  type Row = { subject: Subject; avg: number | null; grades: Grade[] };
  const rows: Row[] = subjects
    .slice()
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'de'))
    .map(s => ({
      subject: s,
      avg: subjectAverage(grades.filter(g => g.subjectId === s.id && !g.isPending), s, config),
      grades: grades.filter(g => g.subjectId === s.id && !g.isPending).sort((a, b) => a.date - b.date),
    }));

  autoTable(doc, {
    startY: y + 6,
    head: [['Fach', 'Noten', 'Endnote']],
    body: rows.map(r => {
      const noten = r.grades.length
        ? r.grades.map(g => {
            const lbl = getKindLabel(g.kind, config);
            const v = formatGradeValue(g.value, r.subject.system);
            return `${v} (${lbl}, ${fmtDate(g.date)})`;
          }).join('\n')
        : '— keine Noten —';
      const endnote = r.avg != null ? formatAverage(r.avg, r.subject.system, digits) : '—';
      return [r.subject.name, noten, endnote];
    }),
    headStyles: {
      fillColor: THEME.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: THEME.ink,
      cellPadding: 8,
      valign: 'top',
    },
    alternateRowStyles: {
      fillColor: [250, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 110, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 80, halign: 'right', fontStyle: 'bold', fontSize: 12 },
    },
    margin: { left: margin, right: margin },
    // Pro Zeile: Endnote-Spalte einfärben nach Note.
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const row = rows[data.row.index];
        if (row?.avg != null) {
          const rgb = gradeRgb(row.avg, row.subject.system, config);
          data.cell.styles.textColor = rgb;
        }
      }
    },
  });

  // ── Footer ─────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...THEME.divider);
    doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...THEME.inkSoft);
    doc.text('Generiert mit Schulplaner · schulplaner.conor.at', margin, pageHeight - 24);
    doc.text(`Seite ${p} / ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: 'right' });
  }

  // ── Speichern ──────────────────────────────────────────────────────────
  const safeName = (settings.name ?? 'Notenuebersicht').replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
  const yearLabel = schoolYear?.name?.replace(/[^\w-]/g, '_') ?? new Date().getFullYear().toString();
  const filename = `Schulplaner_${safeName}_${yearLabel}.pdf`;
  doc.save(filename);
  return filename;
}

/** Formatiert einen Notenwert für die Anzeige (Bayern/Austria ganzzahlig, Oberstufe mit Punkten, Custom 1 Nachkommastelle). */
function formatGradeValue(v: number, system: GradingSystem): string {
  if (system === 'oberstufe') return `${Math.round(v)} P`;
  if (system === 'custom') return v.toFixed(1);
  return v.toFixed(0);
}
