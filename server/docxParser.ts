import JSZip from 'jszip';
import { renderToSvg } from 'wmf-emf-renderer';
import { wmf2svg, emf2svg } from '@s8fy/emf2svg';
import {
  ParsedQuestion,
  ImageAsset,
  Part1Option,
  Part2Statement,
  ExamSectionType,
  ExamSource,
} from './types';

interface RunToken {
  text: string;
  isUnderlined: boolean;
  isBold: boolean;
  isItalic: boolean;
  isSubscript: boolean;
  isSuperscript: boolean;
  imageRId?: string;
  isMath?: boolean;
}

interface ParsedParagraph {
  rawXml: string;
  runs: RunToken[];
  plainText: string;
  html: string;
  imageRIds: string[];
  hasMath: boolean;
  isTable?: boolean;
}

/**
 * Convert WMF or EMF vector buffer to clean SVG
 */
export function convertMetafileToSvg(buffer: Buffer): string | null {
  try {
    const svg = renderToSvg(buffer);
    if (svg && svg.includes('<svg')) return svg;
  } catch (err) {}
  try {
    const svg = wmf2svg(buffer);
    if (svg && svg.includes('<svg')) return svg;
  } catch (err) {}
  try {
    const svg = emf2svg(buffer);
    if (svg && svg.includes('<svg')) return svg;
  } catch (err) {}
  return null;
}

/**
 * Strip original question prefix like "Câu 1: ", "<strong>Câu </strong><strong>3</strong><strong>: </strong>", "Câu 4."
 * so questions can be dynamically renumbered without duplicating or mixing numbers
 */
export function stripOriginalQuestionNumber(htmlOrText: string): string {
  if (!htmlOrText) return '';
  let result = htmlOrText;
  for (let loop = 0; loop < 3; loop++) {
    const before = result;
    // Strip HTML-wrapped Câu X [:.]
    result = result.replace(
      /^(?:\s*<p[^>]*>)*\s*(?:<(?:\/?(?:strong|b|em|i|span|p|font)[^>]*|br\s*\/?)>\s*)*(?:Câu|Cau|CÂU|CAU|Question)\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*(?:<(?:strong|b|em|i|span|font)[^>]*>\s*)*\d+\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*(?:<(?:strong|b|em|i|span|font)[^>]*>\s*)*(?:\s*\([^\)]*\)\s*)*[:.–-]?\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*/i,
      ''
    ).trim();
    // Strip plain text prefix
    result = result.replace(/^(?:Câu|Cau|CÂU|CAU|Question)\s*\d+\s*(?:\([^\)]*\)\s*)?[\s.:–-]*\s*/i, '').trim();
    // Clean empty residual formatting tags at start
    result = result.replace(/^(?:<(?:strong|b|em|i|span|font)[^>]*>\s*<\/(?:strong|b|em|i|span|font)>\s*)+/i, '').trim();
    if (result === before) break;
  }
  return result;
}

/**
 * Strip leading option marker (e.g. "A. ", "<strong>A.</strong>", "<u>A</u>. ", "A) ", "(A) ", "A: ")
 */
export function stripLeadingOptionMarker(htmlOrText: string, label?: string): string {
  if (!htmlOrText) return '';
  let result = htmlOrText.trim();
  const escaped = label ? label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[A-D]';

  // Match leading label followed strictly by delimiter OR at least one space/tab
  // This protects chemical formulas starting with that letter (e.g. C2H5OH, Ca, Al, BaCl2, Cu)
  const regex = new RegExp(
    `^(?:\\s*<p[^>]*>)*\\s*(?:<(?:\/?(?:strong|b|em|i|u|span|p|font)[^>]*|br\\s*\/?)>\\s*)*(?:[\\[\\(]?\\s*${escaped}\\s*[\\]\\)]?)\\s*(?:<\\/(?:strong|b|em|i|u|span|p|font)>\\s*)*(?:<(?:strong|b|em|i|u|span|p|font)[^>]*>\\s*)*([.:–—\\-–\\]\\)\\/\\uFF0E\\uFF09]|\\s+|\\t+)\\s*(?:<\\/(?:strong|b|em|i|u|span|p|font)>\\s*)*`,
    'i'
  );

  result = result.replace(regex, '').trim();
  // Also strip any remaining duplicate A-D marker if present
  const anyMarkerRegex = /^(?:<(?:\/?(?:strong|b|em|i|u|span|p|font)[^>]*|br\s*\/?)>\s*)*(?:[\[\(]?\s*[A-D]\s*[\]\)]?)\s*([.:–—\-–\]\)\/\uFF0E\uFF09]|\t+|\s{2,})\s*(?:<\/(?:strong|b|em|i|u|span|p|font)>\\s*)*/i;
  result = result.replace(anyMarkerRegex, '').trim();
  result = result.replace(/^(?:<(?:strong|b|em|i|u|span|font)[^>]*>\s*<\/(?:strong|b|em|i|u|span|font)>\s*)+/i, '').trim();
  return result;
}

/**
 * Extract image and media files from DOCX package with automatic WMF/EMF -> SVG conversion
 */
async function extractMediaAssets(zip: JSZip): Promise<Record<string, ImageAsset>> {
  const assets: Record<string, ImageAsset> = {};

  // 1. Scan relationship files, prioritizing word/_rels/document.xml.rels
  const relMap: Record<string, string> = {};
  const relsFiles = Object.keys(zip.files).filter((k) => k.endsWith('.rels'));
  // Ensure document.xml.rels is read last so its document-specific relationships take precedence
  relsFiles.sort((a, b) => {
    if (a.includes('word/_rels/document.xml.rels')) return 1;
    if (b.includes('word/_rels/document.xml.rels')) return -1;
    return 0;
  });

  for (const relPath of relsFiles) {
    const relsXml = await zip.file(relPath)?.async('string');
    if (relsXml) {
      const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
      let m;
      while ((m = relRegex.exec(relsXml)) !== null) {
        const attrs = m[1];
        const idMatch = attrs.match(/\bId="([^"]+)"/i);
        const targetMatch = attrs.match(/\bTarget="([^"]+)"/i);
        if (idMatch && targetMatch) {
          relMap[idMatch[1]] = targetMatch[1];
        }
      }
    }
  }

  // 2. Discover and load all media files directly in the zip
  const mediaFileKeys = Object.keys(zip.files).filter(
    (p) => p.includes('media/') || p.startsWith('word/media/')
  );

  const loadedAssetsByPath: Record<string, ImageAsset> = {};
  for (const fileKey of mediaFileKeys) {
    const file = zip.file(fileKey);
    if (!file) continue;

    const fileName = fileKey.split('/').pop() || 'image.png';
    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
    const fileBuffer = await file.async('nodebuffer');

    let mimeType = 'image/png';
    let dataUrl = '';
    let finalFileName = fileName;

    // Convert Windows Metafiles (WMF / EMF) to SVG so all modern browsers can render them
    if (ext === 'wmf' || ext === 'emf') {
      const svgStr = convertMetafileToSvg(fileBuffer);
      if (svgStr) {
        mimeType = 'image/svg+xml';
        dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgStr).toString('base64')}`;
        finalFileName = fileName.replace(/\.(wmf|emf)$/i, '.svg');
      } else {
        mimeType = ext === 'wmf' ? 'image/x-wmf' : 'image/x-emf';
        dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      }
    } else {
      if (ext === 'jpeg' || ext === 'jpg') mimeType = 'image/jpeg';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'svg') mimeType = 'image/svg+xml';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'bmp') mimeType = 'image/bmp';
      dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }

    const assetObj: ImageAsset = {
      id: fileName,
      rId: fileName,
      fileName: finalFileName,
      mimeType,
      dataUrl,
    };

    loadedAssetsByPath[fileKey] = assetObj;
    loadedAssetsByPath[fileKey.toLowerCase()] = assetObj;
    loadedAssetsByPath[fileName] = assetObj;
    loadedAssetsByPath[fileName.toLowerCase()] = assetObj;
    if (finalFileName !== fileName) {
      loadedAssetsByPath[finalFileName] = assetObj;
      loadedAssetsByPath[finalFileName.toLowerCase()] = assetObj;
    }
  }

  // 3. Map by relationship Id (rId)
  for (const [rId, target] of Object.entries(relMap)) {
    const cleanTarget = target
      .replace(/\\/g, '/')
      .replace(/^\/?(word\/)?/, '')
      .replace(/^(\.\.\/)+/, '');
    const fileName = cleanTarget.split('/').pop() || '';

    const matched =
      loadedAssetsByPath[`word/${cleanTarget}`] ||
      loadedAssetsByPath[`word/${cleanTarget}`.toLowerCase()] ||
      loadedAssetsByPath[cleanTarget] ||
      loadedAssetsByPath[cleanTarget.toLowerCase()] ||
      loadedAssetsByPath[fileName] ||
      loadedAssetsByPath[fileName.toLowerCase()];

    if (matched) {
      assets[rId] = {
        ...matched,
        id: rId,
        rId,
      };
    }
  }

  // Also include all media files under their filename as fallback
  for (const [key, asset] of Object.entries(loadedAssetsByPath)) {
    if (!assets[key]) {
      assets[key] = asset;
    }
  }

  return assets;
}

/**
 * Parse an OOXML run (<w:r>) into token with exact underline & chemistry formatting
 */
function parseRun(runXml: string): RunToken {
  // Check formatting inside <w:rPr>
  const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[1] : '';

  // Underline check: <w:u /> or <w:u w:val="single"/>
  // Must NOT be w:val="none"
  let isUnderlined = false;
  const uMatch = rPr.match(/<w:u(?:\s+w:val="([^"]*)")?[^>]*\/>/);
  if (uMatch) {
    const val = uMatch[1];
    if (val === undefined || (val !== 'none' && val !== 'false')) {
      isUnderlined = true;
    }
  }

  // Bold check
  const isBold = /<w:b(?:\s+w:val="(?!none|false)[^"]*")?[^>]*\/>/.test(rPr);

  // Italic check
  const isItalic = /<w:i(?:\s+w:val="(?!none|false)[^"]*")?[^>]*\/>/.test(rPr);

  // Subscript / Superscript (vital for chemistry like H2SO4, Fe3+)
  const isSubscript = /<w:vertAlign\s+w:val="subscript"[^>]*\/>/.test(rPr);
  const isSuperscript = /<w:vertAlign\s+w:val="superscript"[^>]*\/>/.test(rPr);

  // Check for image or drawing
  let imageRId: string | undefined;
  const blipMatch = runXml.match(/<a:blip[^>]*r:embed="([^"]+)"/);
  if (blipMatch) {
    imageRId = blipMatch[1];
  } else {
    const vImageMatch = runXml.match(/<v:imagedata[^>]*r:id="([^"]+)"/);
    if (vImageMatch) {
      imageRId = vImageMatch[1];
    }
  }

  // MathType / Math check
  const isMath = runXml.includes('<m:oMath>') || runXml.includes('<w:object>');

  // Extract text and inline formatting inside run (handling <w:t>, <w:tab/>, <w:br/>, <w:cr/>, <w:noBreakHyphen/>)
  let text = '';
  const itemRegex = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>|<w:tab\s*\/?>|<w:br(?:\s+[^>]*)?\/?>|<w:cr\s*\/?>|<w:noBreakHyphen\s*\/?>/g;
  let tm;
  while ((tm = itemRegex.exec(runXml)) !== null) {
    const tag = tm[0];
    if (tag.startsWith('<w:t')) {
      const content = tm[1] || '';
      // Decode basic xml entities
      text += content
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    } else if (tag.startsWith('<w:tab')) {
      text += '    ';
    } else if (tag.startsWith('<w:br') || tag.startsWith('<w:cr')) {
      text += '\n';
    } else if (tag.startsWith('<w:noBreakHyphen')) {
      text += '-';
    }
  }

  return {
    text,
    isUnderlined,
    isBold,
    isItalic,
    isSubscript,
    isSuperscript,
    imageRId,
    isMath,
  };
}

/**
 * Convert runs to HTML preserving chemistry sub/sup, bold, italic, images
 */
function runsToHtml(runs: RunToken[], mediaAssets: Record<string, ImageAsset>): string {
  let html = '';
  for (const r of runs) {
    if (r.imageRId && mediaAssets[r.imageRId]) {
      const asset = mediaAssets[r.imageRId];
      html += `<img src="${asset.dataUrl}" alt="Hình minh họa" class="inline-block max-h-48 my-1 rounded border border-gray-200" />`;
    }

    if (!r.text) continue;

    let chunk = r.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    chunk = chunk.replace(/\n/g, '<br/>').replace(/\t/g, '&emsp;&emsp;');

    if (r.isSubscript) chunk = `<sub>${chunk}</sub>`;
    if (r.isSuperscript) chunk = `<sup>${chunk}</sup>`;
    if (r.isBold) chunk = `<strong>${chunk}</strong>`;
    if (r.isItalic) chunk = `<em>${chunk}</em>`;
    // We intentionally keep <u> only when visualizing original preview, or leave clean
    if (r.isUnderlined) chunk = `<u class="underline decoration-red-600 decoration-2">${chunk}</u>`;

    html += chunk;
  }
  return html;
}

/**
 * Parse document.xml into ordered paragraphs
 */
function parseParagraphs(
  docXml: string,
  mediaAssets: Record<string, ImageAsset>
): ParsedParagraph[] {
  const paragraphs: ParsedParagraph[] = [];

  // Split into <w:p> blocks
  const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(docXml)) !== null) {
    const pContent = pMatch[1];
    const rRegex = /<w:r(?:\s+[^>]*)?>([\s\S]*?)<\/w:r>/g;
    const runs: RunToken[] = [];
    const imageRIds: string[] = [];
    let hasMath = false;

    let rMatch;
    while ((rMatch = rRegex.exec(pContent)) !== null) {
      const token = parseRun(rMatch[0]);
      runs.push(token);
      if (token.imageRId) imageRIds.push(token.imageRId);
      if (token.isMath) hasMath = true;
    }

    // Also look for drawing/images directly in paragraph if not captured in runs
    const imgRefRegex = /(?:<a:blip[^>]*\b(?:r:embed|embed|r:link|link)="([^"]+)"|<v:imagedata[^>]*\b(?:r:id|id|r:href|href|o:relid|src)="([^"]+)")/gi;
    let imgM;
    while ((imgM = imgRefRegex.exec(pContent)) !== null) {
      const rId = imgM[1] || imgM[2];
      if (rId && !imageRIds.includes(rId)) {
        imageRIds.push(rId);
      }
    }

    if (pContent.includes('<m:oMath>') || pContent.includes('<w:object>')) {
      hasMath = true;
    }

    const plainText = runs.map((r) => r.text).join('').trim();
    let html = runsToHtml(runs, mediaAssets);

    // If paragraph contains images that were not embedded via runs (e.g. standalone drawing or VML), embed them!
    for (const rId of imageRIds) {
      const asset = mediaAssets[rId];
      if (asset && !html.includes(asset.dataUrl)) {
        html += `<div class="my-2"><img src="${asset.dataUrl}" alt="Hình minh họa" class="max-h-64 object-contain rounded-lg border border-gray-200 inline-block shadow-xs" /></div>`;
      }
    }

    // Keep paragraph if it has text or images or math
    if (plainText.length > 0 || imageRIds.length > 0 || hasMath) {
      paragraphs.push({
        rawXml: pMatch[0],
        runs,
        plainText,
        html,
        imageRIds,
        hasMath,
      });
    }
  }

  return paragraphs;
}

/**
 * Helper to test if a string represents section header
 */
function detectSectionHeader(text: string): ExamSectionType | null {
  if (!text) return null;
  // normalize('NFKC') converts Unicode Roman numerals (Ⅰ, Ⅱ, Ⅲ, Ⅳ) to standard ASCII (I, II, III, IV)
  const norm = text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[\u00A0\uFEFF\s]+/g, ' ')
    .toUpperCase()
    .trim();

  // Strip punctuation for flexible fuzzy matching
  const normClean = norm.replace(/[.,:;!?'"()\[\]\-_/]/g, ' ').replace(/\s+/g, ' ');

  // Part 3: Short answer questions
  if (
    normClean.includes('PHAN III') ||
    normClean.includes('PHAN 3') ||
    normClean.includes('PHAN BA') ||
    normClean.includes('PHAN THU BA') ||
    normClean.includes('TRA LOI NGAN') ||
    normClean.includes('DIEN DAP AN') ||
    normClean.includes('DIEN KET QUA') ||
    /^(?:III|3)[\.\:\s\-]+.*(?:TRA LOI NGAN|DIEN)/i.test(norm)
  ) {
    return 3;
  }

  // Part 2: True/False statements
  if (
    normClean.includes('PHAN II') ||
    normClean.includes('PHAN 2') ||
    normClean.includes('PHAN HAI') ||
    normClean.includes('PHAN THU HAI') ||
    normClean.includes('TRAC NGHIEM DUNG SAI') ||
    normClean.includes('CAU HOI DUNG SAI') ||
    normClean.includes('DUNG SAI') ||
    normClean.includes('DUNG VA SAI') ||
    /^(?:II|2)[\.\:\s\-]+.*(?:DUNG|TRAC NGHIEM)/i.test(norm) ||
    (/^PHAN\s*(?:B|II|2)[\s\:\.\-]/i.test(normClean) && normClean.includes('DUNG'))
  ) {
    return 2;
  }

  // Part 1: Multiple choice 4 options
  if (
    normClean.includes('PHAN I') ||
    normClean.includes('PHAN 1') ||
    normClean.includes('PHAN MOT') ||
    normClean.includes('PHAN NHAT') ||
    normClean.includes('PHAN THU NHAT') ||
    normClean.includes('NHIEU LUA CHON') ||
    normClean.includes('NHIEU PHUONG AN') ||
    normClean.includes('4 PHUONG AN') ||
    normClean.includes('4 LUA CHON') ||
    /^(?:I|1)[\.\:\s\-]+.*(?:NHIEU LUA CHON|4 PHUONG AN|TRAC NGHIEM)/i.test(norm)
  ) {
    return 1;
  }

  return null;
}

/**
 * Helper to test if paragraph starts a new question
 */
function isQuestionStart(text: string): { isStart: boolean; number: number } {
  if (!text) return { isStart: false, number: 0 };
  const clean = text.replace(/[\u00A0\uFEFF\s]+/g, ' ').trim();

  // If this text is an instruction phrase describing question range (e.g. "từ câu 1 đến câu 18", "câu 1 đến câu 18", "câu 1 đến 18")
  // It is NOT an actual question start!
  if (/^(?:Thí sinh\s+)?(?:trả lời\s+)?(?:từ\s+)?(?:câu|cau)\s*\d+\s*(?:đến|den|\-)\s*(?:câu|cau)?\s*\d+/i.test(clean)) {
    return { isStart: false, number: 0 };
  }
  if (/^(?:Câu|Cau|CÂU|CAU|Question|Bài|BAI|Bai)\s*\d+\s*(?:đến|den|\-)\s*(?:câu|cau)?\s*\d+/i.test(clean)) {
    return { isStart: false, number: 0 };
  }

  const match = clean.match(
    /^(?:[\u2022\u2023\u25E6\u2043\u2219\*\-\+•]\s*)?(?:Câu|Cau|CÂU|CAU|Question|Bài|BAI|Bai)\s*(\d+)\s*(?:\([^\)]*\)|\[[^\]]*\])?\s*[:.–—\-]*/i
  );
  if (match) {
    return { isStart: true, number: parseInt(match[1], 10) };
  }
  // Standalone digits "1. ", "1: ", "1/ "
  const digitMatch = clean.match(/^(\d{1,3})[\.\:\/]\s+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    if (num >= 1 && num <= 100) {
      return { isStart: true, number: num };
    }
  }
  return { isStart: false, number: 0 };
}

/**
 * Slices runs to strictly match a character range [startChar, endChar) in plainText
 */
function sliceRuns(runs: RunToken[], startChar: number, endChar: number): RunToken[] {
  const result: RunToken[] = [];
  let charPos = 0;
  for (const r of runs) {
    const rStart = charPos;
    const rEnd = charPos + r.text.length;
    charPos = rEnd;

    const overlapStart = Math.max(rStart, startChar);
    const overlapEnd = Math.min(rEnd, endChar);

    if (overlapEnd > overlapStart) {
      const sliceStart = overlapStart - rStart;
      const sliceEnd = overlapEnd - rStart;
      result.push({
        ...r,
        text: r.text.substring(sliceStart, sliceEnd),
      });
    }
  }
  return result;
}

/**
 * Extract Part 1 options (A, B, C, D) and check underline mark
 */
function parsePart1Options(
  paragraphs: ParsedParagraph[],
  mediaAssets: Record<string, ImageAsset>
): {
  promptParas: ParsedParagraph[];
  options: Part1Option[];
  detectedKeyCount: number;
} {
  // Broad regex to match candidate option markers A, B, C, D
  const optRegex =
    /(?:^|[\s\(\[\r\n\t\u00A0.,;:!?-]|(?:Đáp\s*án|Phương\s*án)\s*[:.]?\s*)([A-D])\s*(?:[\.\:\)\-\–\—\/\]\uFF0E\uFF09]|\t+|\s{2,}|(?=\s+[A-Z0-9\(\[\"\']))\s*/gi;

  // 1. Collect all candidate markers across all paragraphs
  const allMarkers: {
    pIdx: number;
    letter: string;
    charIndex: number;
    markerStart: number;
    markerEnd: number;
    isUnderlined: boolean;
  }[] = [];

  paragraphs.forEach((p, pIdx) => {
    let m;
    const text = p.plainText;
    optRegex.lastIndex = 0;
    while ((m = optRegex.exec(text)) !== null) {
      const letter = m[1].toUpperCase();
      const letterOffset = m[0].toUpperCase().indexOf(letter);
      const letterIndex = m.index + (letterOffset >= 0 ? letterOffset : 0);
      const markerStart = m.index;
      const markerEnd = m.index + m[0].length;

      // Check if the run containing this letter is underlined
      let isUnderlined = false;
      let count = 0;
      for (const r of p.runs) {
        const start = count;
        const end = count + r.text.length;
        count = end;
        if (letterIndex >= start && letterIndex < end) {
          if (r.isUnderlined) {
            isUnderlined = true;
          }
          break;
        }
      }

      allMarkers.push({
        pIdx,
        letter,
        charIndex: letterIndex,
        markerStart,
        markerEnd,
        isUnderlined,
      });
    }
  });

  const isAfter = (
    m1: { pIdx: number; charIndex: number },
    m2: { pIdx: number; charIndex: number }
  ) => {
    return m2.pIdx > m1.pIdx || (m2.pIdx === m1.pIdx && m2.charIndex > m1.charIndex);
  };

  // 2. Select the true option sequence (A -> B -> C -> D in strict document order)
  // Options are placed at the bottom of the question, so find all full 4-letter sequences and pick the LAST one
  const valid4Seqs: typeof allMarkers[] = [];
  for (let i = 0; i < allMarkers.length; i++) {
    if (allMarkers[i].letter === 'A') {
      const aM = allMarkers[i];
      const remaining = allMarkers.slice(i + 1);
      const bM = remaining.find((m) => m.letter === 'B' && isAfter(aM, m));
      const cM = bM ? remaining.find((m) => m.letter === 'C' && isAfter(bM, m)) : null;
      const dM = cM ? remaining.find((m) => m.letter === 'D' && isAfter(cM, m)) : null;
      if (bM && cM && dM) {
        valid4Seqs.push([aM, bM, cM, dM]);
      }
    }
  }

  let seq: typeof allMarkers = [];
  if (valid4Seqs.length > 0) {
    seq = valid4Seqs[valid4Seqs.length - 1];
  } else {
    // Backward search if only 3 options [A, B, C] exist
    for (let i = allMarkers.length - 1; i >= 0; i--) {
      if (allMarkers[i].letter === 'A') {
        const aM = allMarkers[i];
        const remaining = allMarkers.slice(i + 1);
        const bM = remaining.find((m) => m.letter === 'B' && isAfter(aM, m));
        const cM = bM ? remaining.find((m) => m.letter === 'C' && isAfter(bM, m)) : null;
        if (bM && cM) {
          seq = [aM, bM, cM];
          break;
        }
      }
    }
    // Fallback: any increasing chain of distinct letters from the end
    if (seq.length === 0) {
      const letters = ['A', 'B', 'C', 'D'];
      const candidates: typeof allMarkers = [];
      let lastM: typeof allMarkers[0] | null = null;
      for (const lettr of letters) {
        const found = allMarkers.find(
          (m) => m.letter === lettr && (!lastM || isAfter(lastM, m))
        );
        if (found) {
          candidates.push(found);
          lastM = found;
        }
      }
      if (candidates.length >= 2) {
        seq = candidates;
      }
    }
  }

  // If still no options found, return all as prompt
  if (seq.length === 0) {
    return { promptParas: paragraphs, options: [], detectedKeyCount: 0 };
  }

  // 3. Extract Prompt paragraphs (everything before the first option marker)
  const firstMarker = seq[0];
  const promptParas: ParsedParagraph[] = [];

  for (let i = 0; i < firstMarker.pIdx; i++) {
    promptParas.push(paragraphs[i]);
  }

  // In the paragraph of the first marker: text before the marker
  // Slice before markerStart so that opening brackets like '(' in '(A)' are not left in the prompt
  const firstP = paragraphs[firstMarker.pIdx];
  const cutPoint = Math.min(firstMarker.markerStart, firstMarker.charIndex);
  const leadText = firstP.plainText.substring(0, cutPoint).trim();
  const cleanLeadText = leadText.replace(/(?:Đáp\s*án|Phương\s*án)\s*[:.]?\s*$/i, '').trim();
  if (cleanLeadText.length > 0) {
    const leadRuns = sliceRuns(firstP.runs, 0, cutPoint);
    promptParas.push({
      ...firstP,
      runs: leadRuns,
      plainText: cleanLeadText,
      html: runsToHtml(leadRuns, mediaAssets) || cleanLeadText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    });
  }

  // 4. Extract each Option's content and runs cleanly sliced
  const options: Part1Option[] = [];

  for (let i = 0; i < seq.length; i++) {
    const cur = seq[i];
    const next = seq[i + 1];

    let optText = '';
    const optRuns: RunToken[] = [];
    const optStart = cur.charIndex;

    if (!next) {
      // Last option in sequence (typically Option D):
      const p = paragraphs[cur.pIdx];
      optText += p.plainText.substring(optStart);
      optRuns.push(...sliceRuns(p.runs, optStart, p.plainText.length));

      // Append subsequent paragraphs BUT STOP IMMEDIATELY if next paragraph is:
      // - a section header (Phần II, Đúng sai, etc.)
      // - a question start (Câu 19, Câu 1, etc.)
      // - a Part 2 statement (a), b), c), d))
      // - or an end note/footer
      for (let pIdx = cur.pIdx + 1; pIdx < paragraphs.length; pIdx++) {
        const subP = paragraphs[pIdx];
        const subText = subP.plainText.trim();
        if (!subText) continue;
        if (
          detectSectionHeader(subText) ||
          isQuestionStart(subText).isStart ||
          /^[a-d][\)\.\:\-]/i.test(subText) ||
          /^(?:Hết|Het|---|\*\*\*|PHẦN|PHAN|MÃ ĐỀ|MA DE|Chú ý|Lưu ý|Bảng|ĐÁP ÁN|DAP AN)/i.test(subText)
        ) {
          break;
        }
        optText += '\n' + subP.plainText;
        optRuns.push(...subP.runs);
      }
    } else if (cur.pIdx === next.pIdx) {
      // Both options in the SAME paragraph: strictly slice within [optStart, nextStart)
      const nextStart = Math.min(next.markerStart, next.charIndex);
      const p = paragraphs[cur.pIdx];
      optText = p.plainText.substring(optStart, nextStart);
      optRuns.push(...sliceRuns(p.runs, optStart, nextStart));
    } else {
      // Option spans across different paragraphs:
      const curP = paragraphs[cur.pIdx];
      optText += curP.plainText.substring(optStart);
      optRuns.push(...sliceRuns(curP.runs, optStart, curP.plainText.length));

      for (let pIdx = cur.pIdx + 1; pIdx < next.pIdx; pIdx++) {
        optText += '\n' + paragraphs[pIdx].plainText;
        optRuns.push(...paragraphs[pIdx].runs);
      }

      const nextP = paragraphs[next.pIdx];
      const nextStart = Math.min(next.markerStart, next.charIndex);
      if (nextStart > 0) {
        optText += '\n' + nextP.plainText.substring(0, nextStart);
        optRuns.push(...sliceRuns(nextP.runs, 0, nextStart));
      }
    }

    // Clean leading label like A. / A) / A: from text and HTML
    const cleanText = stripLeadingOptionMarker(optText, cur.letter);
    let optHtml = runsToHtml(optRuns, mediaAssets);
    optHtml = stripLeadingOptionMarker(optHtml, cur.letter);

    if (!optHtml) {
      optHtml = cleanText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Clean any trailing section notes or horizontal rules from Option D
    if (!next) {
      optHtml = optHtml.replace(/<br\s*\/?>\s*(?:Hết|PHẦN|---|\*\*\*).*$/i, '').trim();
    }

    options.push({
      id: `opt_${cur.letter}_${Math.random().toString(36).slice(2, 8)}`,
      originalLabel: cur.letter,
      label: cur.letter,
      text: cleanText,
      html: optHtml,
      isCorrect: cur.isUnderlined,
      detectedUnderline: cur.isUnderlined,
    });
  }

  const detectedKeyCount = options.filter((o) => o.isCorrect).length;
  return { promptParas, options, detectedKeyCount };
}

/**
 * Extract Part 2 statements (a, b, c, d) and check underline mark
 * Underlined = TRUE (Đúng), Not Underlined = FALSE (Sai)
 */
function parsePart2Statements(
  paragraphs: ParsedParagraph[]
): {
  promptParas: ParsedParagraph[];
  statements: Part2Statement[];
} {
  const stmtRegex = /(?:^|[\s\(\[\r\n\t\u00A0.,;:!?-])([a-d])\s*[\)\.\:\-\–\]]\s*/g;

  const allMarkers: {
    pIdx: number;
    letter: string;
    charIndex: number;
    isUnderlined: boolean;
  }[] = [];

  paragraphs.forEach((p, pIdx) => {
    let m;
    const text = p.plainText;
    stmtRegex.lastIndex = 0;
    while ((m = stmtRegex.exec(text)) !== null) {
      const letter = m[1].toLowerCase();
      const letterIndex = m.index + m[0].lastIndexOf(letter);

      let isUnderlined = false;
      let count = 0;
      for (const r of p.runs) {
        const start = count;
        const end = count + r.text.length;
        count = end;
        if (letterIndex >= start && letterIndex < end) {
          if (r.isUnderlined) {
            isUnderlined = true;
          }
          break;
        }
      }

      allMarkers.push({
        pIdx,
        letter,
        charIndex: letterIndex,
        isUnderlined,
      });
    }
  });

  // Pick sequence a -> b -> c -> d
  let seq: typeof allMarkers = [];
  for (let i = allMarkers.length - 1; i >= 0; i--) {
    if (allMarkers[i].letter === 'a') {
      const remaining = allMarkers.slice(i);
      const bM = remaining.find((m) => m.letter === 'b');
      const cM = remaining.find((m) => m.letter === 'c');
      const dM = remaining.find((m) => m.letter === 'd');
      if (bM && cM && dM) {
        seq = [allMarkers[i], bM, cM, dM];
        break;
      }
    }
  }

  if (seq.length === 0) {
    const letters = ['a', 'b', 'c', 'd'];
    const uniqueMap = new Map<string, typeof allMarkers[0]>();
    for (let i = allMarkers.length - 1; i >= 0; i--) {
      const m = allMarkers[i];
      if (!uniqueMap.has(m.letter)) {
        uniqueMap.set(m.letter, m);
      }
    }
    const foundLetters = letters.filter((l) => uniqueMap.has(l));
    if (foundLetters.length >= 2) {
      seq = foundLetters.map((l) => uniqueMap.get(l)!);
      seq.sort((a, b) => a.pIdx !== b.pIdx ? a.pIdx - b.pIdx : a.charIndex - b.charIndex);
    }
  }

  if (seq.length === 0) {
    return { promptParas: paragraphs, statements: [] };
  }

  // Extract prompt
  const firstMarker = seq[0];
  const promptParas: ParsedParagraph[] = [];
  for (let i = 0; i < firstMarker.pIdx; i++) {
    promptParas.push(paragraphs[i]);
  }
  const firstP = paragraphs[firstMarker.pIdx];
  const leadText = firstP.plainText.substring(0, firstMarker.charIndex).trim();
  if (leadText.length > 0) {
    promptParas.push({
      ...firstP,
      plainText: leadText,
      html: leadText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    });
  }

  // Extract statements
  const statements: Part2Statement[] = [];
  for (let i = 0; i < seq.length; i++) {
    const cur = seq[i];
    const next = seq[i + 1];

    let stmtText = '';
    if (!next) {
      stmtText += paragraphs[cur.pIdx].plainText.substring(cur.charIndex);
      for (let pIdx = cur.pIdx + 1; pIdx < paragraphs.length; pIdx++) {
        stmtText += '\n' + paragraphs[pIdx].plainText;
      }
    } else if (cur.pIdx === next.pIdx) {
      stmtText = paragraphs[cur.pIdx].plainText.substring(cur.charIndex, next.charIndex);
    } else {
      stmtText += paragraphs[cur.pIdx].plainText.substring(cur.charIndex);
      for (let pIdx = cur.pIdx + 1; pIdx < next.pIdx; pIdx++) {
        stmtText += '\n' + paragraphs[pIdx].plainText;
      }
      stmtText += '\n' + paragraphs[next.pIdx].plainText.substring(0, next.charIndex);
    }

    const cleanContent = stmtText
      .replace(/^[\[\(]?[a-d][\]\)]?\s*[\)\.\:\-\–\]]?\s*/i, '')
      .trim();

    statements.push({
      id: `stmt_${cur.letter}_${Math.random().toString(36).slice(2, 8)}`,
      originalLabel: cur.letter,
      label: cur.letter,
      text: cleanContent,
      html: cleanContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      isCorrect: cur.isUnderlined,
      detectedUnderline: cur.isUnderlined,
    });
  }

  return { promptParas, statements };
}

/**
 * Extract Part 3 short answer from question paragraphs
 * Looks for lines like "A. 25" or "Đáp án: 0.25 mol" or "ĐA: 12.5%"
 */
function parsePart3ShortAnswer(paragraphs: ParsedParagraph[]): {
  promptParas: ParsedParagraph[];
  shortAnswerKey: string;
} {
  const promptParas: ParsedParagraph[] = [];
  let shortAnswerKey = '';

  for (const p of paragraphs) {
    const text = p.plainText.trim();
    // Match answer patterns: "A. 25", "A. 0,25 mol", "Đáp án: 25", "ĐA: 12.5%", "Đáp số: ..."
    const answerMatch = text.match(/^(?:A\s*[\.:]|Đáp\s*án\s*[:.]|ĐA\s*[:.]|Đáp\s*số\s*[:.])\s*(.+)$/i);
    if (answerMatch && !shortAnswerKey) {
      shortAnswerKey = answerMatch[1].trim();
      // Exclude this line from student prompt!
      continue;
    }
    promptParas.push(p);
  }

  return { promptParas, shortAnswerKey };
}

/**
 * Main DOCX Parser
 */
export async function parseDocxBuffer(
  buffer: Buffer,
  fileName: string = 'dethi.docx'
): Promise<ExamSource> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Tệp không đúng định dạng Word DOCX (thiếu word/document.xml)');
  }

  const docXml = await docFile.async('string');
  const mediaAssets = await extractMediaAssets(zip);

  const paragraphs = parseParagraphs(docXml, mediaAssets);

  // Group paragraphs into sections and questions
  let currentSection: ExamSectionType = 1;
  const questions: ParsedQuestion[] = [];

  let currentQNumber = 0;
  let currentQSection: ExamSectionType = 1;
  let currentQParas: ParsedParagraph[] = [];
  let hasExplicitSectionHeaders = false;

  const finalizeCurrentQuestion = () => {
    if (currentQNumber === 0) {
      currentQParas = [];
      return;
    }
    if (currentQParas.length === 0) return;

    let promptHtml = '';
    const qImages: ImageAsset[] = [];
    let mathCount = 0;

    for (const p of currentQParas) {
      for (const rId of p.imageRIds) {
        if (mediaAssets[rId] && !qImages.some((img) => img.rId === rId)) {
          qImages.push(mediaAssets[rId]);
        }
      }
      if (p.hasMath) mathCount++;
    }

    const qId = `q_${currentQSection}_${currentQNumber}_${Math.random().toString(36).slice(2, 7)}`;

    if (currentQSection === 1) {
      const { promptParas, options, detectedKeyCount } = parsePart1Options(
        currentQParas,
        mediaAssets
      );
      promptHtml = stripOriginalQuestionNumber(promptParas.map((p) => p.html).join('<br/>'));
      const promptText = stripOriginalQuestionNumber(promptParas.map((p) => p.plainText).join('\n'));

      let status: 'confirmed' | 'needs_review' | 'error' = 'confirmed';
      let statusMessage = '';

      if (options.length === 0) {
        // Auto-detect if question is actually Part 2 (True/False statements a, b, c, d)
        const { statements: p2Stmts, promptParas: p2Paras } = parsePart2Statements(currentQParas);
        if (p2Stmts.length >= 2) {
          const p2PromptHtml = stripOriginalQuestionNumber(p2Paras.map((p) => p.html).join('<br/>'));
          const p2PromptText = stripOriginalQuestionNumber(p2Paras.map((p) => p.plainText).join('\n'));
          questions.push({
            id: qId,
            originalNumber: currentQNumber,
            section: 2,
            promptText: p2PromptText,
            promptHtml: p2PromptHtml,
            images: qImages,
            mathTypeCount: mathCount,
            statements: p2Stmts,
            status: p2Stmts.length < 4 ? 'needs_review' : 'confirmed',
            statusMessage: p2Stmts.length < 4 ? 'Ít hơn 4 nhận định a), b), c), d). Cần kiểm tra lại cấu trúc.' : '',
            points: 1.0,
          });
          currentQParas = [];
          return;
        }

        // Auto-detect if question is actually Part 3 (Short answer)
        const { shortAnswerKey: p3Key, promptParas: p3Paras } = parsePart3ShortAnswer(currentQParas);
        if (p3Key || currentQNumber > 50) {
          const p3PromptHtml = stripOriginalQuestionNumber(p3Paras.map((p) => p.html).join('<br/>'));
          const p3PromptText = stripOriginalQuestionNumber(p3Paras.map((p) => p.plainText).join('\n'));
          questions.push({
            id: qId,
            originalNumber: currentQNumber,
            section: 3,
            promptText: p3PromptText,
            promptHtml: p3PromptHtml,
            images: qImages,
            mathTypeCount: mathCount,
            shortAnswerKey: p3Key,
            status: p3Key ? 'confirmed' : 'needs_review',
            statusMessage: p3Key ? '' : 'Chưa tìm thấy đáp án chuẩn dưới câu hỏi.',
            points: 0.25,
          });
          currentQParas = [];
          return;
        }

        status = 'error';
        statusMessage = 'Không tìm thấy 4 phương án A, B, C, D';
      } else if (detectedKeyCount === 0) {
        status = 'needs_review';
        statusMessage = 'Chưa nhận diện được đáp án gạch chân. Thầy cô vui lòng chọn đáp án đúng.';
      } else if (detectedKeyCount > 1) {
        status = 'needs_review';
        statusMessage = `Có ${detectedKeyCount} phương án được gạch chân. Thầy cô vui lòng kiểm tra lại.`;
      }

      questions.push({
        id: qId,
        originalNumber: currentQNumber,
        section: 1,
        promptText,
        promptHtml,
        images: qImages,
        mathTypeCount: mathCount,
        options,
        status,
        statusMessage,
        points: 0.25,
      });
    } else if (currentQSection === 2) {
      const { promptParas, statements } = parsePart2Statements(currentQParas);
      promptHtml = stripOriginalQuestionNumber(promptParas.map((p) => p.html).join('<br/>'));
      const promptText = stripOriginalQuestionNumber(promptParas.map((p) => p.plainText).join('\n'));

      let status: 'confirmed' | 'needs_review' | 'error' = 'confirmed';
      let statusMessage = '';
      if (statements.length < 2) {
        status = 'needs_review';
        statusMessage = 'Ít hơn 4 nhận định a), b), c), d). Cần kiểm tra lại cấu trúc.';
      }

      questions.push({
        id: qId,
        originalNumber: currentQNumber,
        section: 2,
        promptText,
        promptHtml,
        images: qImages,
        mathTypeCount: mathCount,
        statements,
        status,
        statusMessage,
        points: 1.0,
      });
    } else if (currentQSection === 3) {
      const { promptParas, shortAnswerKey } = parsePart3ShortAnswer(currentQParas);
      promptHtml = stripOriginalQuestionNumber(promptParas.map((p) => p.html).join('<br/>'));
      const promptText = stripOriginalQuestionNumber(promptParas.map((p) => p.plainText).join('\n'));

      let status: 'confirmed' | 'needs_review' | 'error' = 'confirmed';
      let statusMessage = '';
      if (!shortAnswerKey) {
        status = 'needs_review';
        statusMessage = 'Chưa tìm thấy dòng đáp án chuẩn dưới câu hỏi (ví dụ: A. 25 hoặc Đáp án: ...). Thầy cô vui lòng nhập đáp án chuẩn.';
      }

      questions.push({
        id: qId,
        originalNumber: currentQNumber,
        section: 3,
        promptText,
        promptHtml,
        images: qImages,
        mathTypeCount: mathCount,
        shortAnswerKey,
        status,
        statusMessage,
        points: 0.25,
      });
    }

    currentQParas = [];
  };

  // Walk through paragraphs
  for (const p of paragraphs) {
    // Check if section header
    const detectedSection = detectSectionHeader(p.plainText);
    if (detectedSection) {
      finalizeCurrentQuestion();
      currentSection = detectedSection;
      hasExplicitSectionHeaders = true;
      currentQNumber = 0;
      currentQParas = [];

      // Check if this same paragraph ALSO contains the start of a question
      // e.g. "PHẦN I. CÂU TRẮC NGHIỆM NHIỀU LỰA CHỌN. Câu 1: Cho các chất..."
      const qIdx = p.plainText.search(/(?:Câu|Cau|CÂU|CAU|Question|Bài)\s*\d+/i);
      if (qIdx >= 0) {
        const qSub = p.plainText.substring(qIdx);
        const qSubCheck = isQuestionStart(qSub);
        if (qSubCheck.isStart) {
          currentQNumber = qSubCheck.number;
          currentQSection = currentSection;
          currentQParas = [p];
        }
      }
      continue;
    }

    // Check if question start
    const qCheck = isQuestionStart(p.plainText);
    if (qCheck.isStart) {
      finalizeCurrentQuestion();

      // Automatic section advance:
      // Case 1: Question numbering resets back to 1 (e.g. from Part 1 Question 1..40 down to Question 1 for Part 2)
      if (currentSection === 1 && currentQNumber >= 1 && qCheck.number === 1) {
        currentSection = 2;
      } else if (currentSection === 2 && currentQNumber >= 1 && qCheck.number === 1) {
        currentSection = 3;
      }
      // Case 2: Only when there are NO explicit section headers ("PHẦN I", "PHẦN II", "PHẦN III")
      else if (!hasExplicitSectionHeaders) {
        // Continuous numbering: Part 1 up to 40 questions, Part 2 up to 10 questions (41-50), Part 3 up to 20 questions (51-70)
        if (currentSection === 1 && qCheck.number > 40 && qCheck.number <= 50) {
          currentSection = 2;
        } else if (currentSection <= 2 && qCheck.number > 50) {
          currentSection = 3;
        } else if (currentSection === 1 && qCheck.number > 1) {
          // Check if upcoming text has True/False statement patterns a), b), c), d) AND NO options A, B, C, D
          const pIdx = paragraphs.indexOf(p);
          const peekText = paragraphs.slice(pIdx, pIdx + 6).map((x) => x.plainText).join(' ');
          if (/[a-d]\s*[\)\.\:]/i.test(peekText) && !/[A-D]\s*[\.\:]/i.test(peekText)) {
            currentSection = 2;
          }
        } else if (currentSection === 2 && qCheck.number > 1) {
          const pIdx = paragraphs.indexOf(p);
          const peekText = paragraphs.slice(pIdx, pIdx + 6).map((x) => x.plainText).join(' ');
          if (
            (/Đáp\s*án|ĐA\s*[\:\.]|Trả\s*lời|Điền/i.test(peekText) || !/[a-d]\s*[\)\.\:]/i.test(peekText)) &&
            !/[A-D]\s*[\.\:]/i.test(peekText)
          ) {
            currentSection = 3;
          }
        }
      }

      currentQNumber = qCheck.number;
      currentQSection = currentSection;
      currentQParas = [p];
    } else {
      // Continuation of current question
      if (currentQNumber > 0) {
        currentQParas.push(p);
      }
    }
  }

  // Finalize last question
  finalizeCurrentQuestion();

  const part1Count = questions.filter((q) => q.section === 1).length;
  const part2Count = questions.filter((q) => q.section === 2).length;
  const part3Count = questions.filter((q) => q.section === 3).length;

  let detectedKeysCount = 0;
  for (const q of questions) {
    if (q.section === 1 && q.options?.some((o) => o.isCorrect)) detectedKeysCount++;
    if (q.section === 2 && q.statements && q.statements.length > 0) detectedKeysCount++;
    if (q.section === 3 && q.shortAnswerKey) detectedKeysCount++;
  }

  const warningsCount = questions.filter((q) => q.status !== 'confirmed').length;

  const examSource: ExamSource = {
    id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
    fileName,
    uploadedAt: new Date().toISOString(),
    teacherId: 'teacher_thien',
    part1Count,
    part2Count,
    part3Count,
    totalQuestions: questions.length,
    detectedKeysCount,
    warningsCount,
    questions,
    mediaAssets,
  };

  return examSource;
}
