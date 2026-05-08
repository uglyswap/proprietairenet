import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface PdfOptions {
  fontSize?: number;
  lineHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  pageWidth?: number;
  pageHeight?: number;
}

const DEFAULT_OPTIONS: Required<PdfOptions> = {
  fontSize: 11,
  lineHeight: 16,
  marginTop: 80,
  marginBottom: 60,
  marginLeft: 60,
  marginRight: 60,
  pageWidth: 595.28, // A4
  pageHeight: 841.89, // A4
};

/**
 * Converts plain text to a PDF and returns it as base64
 */
export async function textToPdfBase64(text: string, options?: PdfOptions): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const usableWidth = opts.pageWidth - opts.marginLeft - opts.marginRight;
  
  // Split text into lines, respecting line breaks and word wrapping
  const rawLines = text.split('\n');
  const wrappedLines: string[] = [];
  
  for (const rawLine of rawLines) {
    if (rawLine.trim() === '') {
      wrappedLines.push('');
      continue;
    }
    
    const words = rawLine.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const width = font.widthOfTextAtSize(testLine, opts.fontSize);
      
      if (width > usableWidth && currentLine) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);
  }
  
  // Paginate
  const linesPerPage = Math.floor(
    (opts.pageHeight - opts.marginTop - opts.marginBottom) / opts.lineHeight
  );
  
  let lineIndex = 0;
  while (lineIndex < wrappedLines.length) {
    const page = pdfDoc.addPage([opts.pageWidth, opts.pageHeight]);
    const pageLines = wrappedLines.slice(lineIndex, lineIndex + linesPerPage);
    
    for (let i = 0; i < pageLines.length; i++) {
      const y = opts.pageHeight - opts.marginTop - (i * opts.lineHeight);
      page.drawText(pageLines[i], {
        x: opts.marginLeft,
        y,
        size: opts.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    lineIndex += linesPerPage;
  }
  
  // If no content, add a blank page
  if (wrappedLines.length === 0) {
    pdfDoc.addPage([opts.pageWidth, opts.pageHeight]);
  }
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

/**
 * Replace template variables in text
 * Variables format: {{variable_name}} or ##variable_name##
 */
export function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    // Replace both {{var}} and ##var## formats
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    result = result.replace(new RegExp(`##${key}##`, 'g'), value || '');
  }
  return result;
}
