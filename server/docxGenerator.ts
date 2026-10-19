import JSZip from 'jszip';
import { ShuffledExamVersion, ImageAsset } from './types';
import { stripOriginalQuestionNumber, stripLeadingOptionMarker } from './docxParser';

/**
 * Escapes plain text for XML
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts basic HTML tags (sub, sup, b, i, u) back into OOXML runs
 */
function htmlToDocxRuns(
  html: string,
  options: { allowUnderline?: boolean; highlightCorrect?: boolean } = {}
): string {
  // Replace <br> or <br/> with paragraph breaks or breaks
  const tokens = html.split(/(<\/?[a-z0-9_-]+(?:\s+[^>]*)?>)/gi);
  let runsXml = '';

  let isBold = false;
  let isItalic = false;
  let isSub = false;
  let isSup = false;
  let isUnderline = false;

  for (const token of tokens) {
    if (!token) continue;
    const lower = token.toLowerCase();

    if (lower === '<strong>' || lower === '<b>') {
      isBold = true;
      continue;
    }
    if (lower === '</strong>' || lower === '</b>') {
      isBold = false;
      continue;
    }
    if (lower === '<em>' || lower === '<i>') {
      isItalic = true;
      continue;
    }
    if (lower === '</em>' || lower === '</i>') {
      isItalic = false;
      continue;
    }
    if (lower === '<sub>') {
      isSub = true;
      continue;
    }
    if (lower === '</sub>') {
      isSub = false;
      continue;
    }
    if (lower === '<sup>') {
      isSup = true;
      continue;
    }
    if (lower === '</sup>') {
      isSup = false;
      continue;
    }
    if (lower.startsWith('<u')) {
      isUnderline = true;
      continue;
    }
    if (lower === '</u>') {
      isUnderline = false;
      continue;
    }
    if (lower === '<br>' || lower === '<br/>') {
      runsXml += '<w:r><w:br/></w:r>';
      continue;
    }
    if (lower.startsWith('<img')) {
      // Ignored here, images are handled at question level
      continue;
    }
    if (token.startsWith('<') && token.endsWith('>')) {
      // Other tags
      continue;
    }

    // Decode HTML entities
    const text = token
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const xmlEscaped = escapeXml(text);

    let rPr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/>';
    if (isBold) rPr += '<w:b/>';
    if (isItalic) rPr += '<w:i/>';
    if (isSub) rPr += '<w:vertAlign w:val="subscript"/>';
    if (isSup) rPr += '<w:vertAlign w:val="superscript"/>';
    if (isUnderline && options.allowUnderline) rPr += '<w:u w:val="single"/>';
    rPr += '</w:rPr>';

    runsXml += `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscaped}</w:t></w:r>`;
  }

  return runsXml;
}

/**
 * Generate Student DOCX (No underlines, shuffled questions and options)
 */
export async function generateStudentDocx(version: ShuffledExamVersion): Promise<Buffer> {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );

  // 2. _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // 3. Collect media images across all questions
  const mediaMap: Record<string, { rId: string; fileTarget: string; buffer: Buffer }> = {};
  let rIdCounter = 10;
  for (const q of version.questions) {
    for (const img of q.images) {
      if (!mediaMap[img.id] && img.dataUrl) {
        const matches = img.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches) {
          const ext = img.mimeType.includes('jpeg') ? 'jpg' : 'png';
          const fileTarget = `media/img_${rIdCounter}.${ext}`;
          mediaMap[img.id] = {
            rId: `rIdImg${rIdCounter}`,
            fileTarget,
            buffer: Buffer.from(matches[2], 'base64'),
          };
          rIdCounter++;
        }
      }
    }
  }

  // Add images to zip
  for (const media of Object.values(mediaMap)) {
    zip.file(`word/${media.fileTarget}`, media.buffer);
  }

  // 4. word/_rels/document.xml.rels
  let docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  for (const media of Object.values(mediaMap)) {
    docRels += `\n  <Relationship Id="${media.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${media.fileTarget}"/>`;
  }
  docRels += `\n</Relationships>`;
  zip.file('word/_rels/document.xml.rels', docRels);

  // 5. word/styles.xml
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`
  );

  // 6. Build document.xml
  let bodyXml = '';

  // Header info
  bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>SỞ GIÁO DỤC VÀ ĐÀO TẠO - TRƯỜNG THPT</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1E3A8A"/></w:rPr><w:t>${escapeXml(version.title.toUpperCase())}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="B91C1C"/><w:sz w:val="26"/></w:rPr><w:t>MÃ ĐỀ THI: ${escapeXml(version.testCode)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:i/></w:rPr><w:t>Họ và tên thí sinh: ................................................................ Lớp: ................................</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>======================================================================</w:t></w:r></w:p>`;

  // Filter questions by section
  const p1 = version.questions.filter((q) => q.section === 1);
  const p2 = version.questions.filter((q) => q.section === 2);
  const p3 = version.questions.filter((q) => q.section === 3);

  // SECTION I
  if (p1.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (Thí sinh trả lời từ câu 1 đến câu ${p1.length})</w:t></w:r>
      </w:p>`;

    for (let i = 0; i < p1.length; i++) {
      const q = p1[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Câu ${i + 1}: </w:t></w:r>
          ${htmlToDocxRuns(stripOriginalQuestionNumber(q.promptHtml), { allowUnderline: false })}
        </w:p>`;

      // Insert images if any
      for (const img of q.images) {
        const media = mediaMap[img.id];
        if (media) {
          bodyXml += `
            <w:p>
              <w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:drawing><a:blip r:embed="${media.rId}"/></w:drawing></w:r>
            </w:p>`;
        }
      }

      // Options (clean, NO UNDERLINES!)
      if (q.options) {
        for (const opt of q.options) {
          const cleanOptHtml = stripLeadingOptionMarker(opt.html, opt.label);
          bodyXml += `
            <w:p>
              <w:pPr><w:ind w:left="360"/></w:pPr>
              <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${opt.label}. </w:t></w:r>
              ${htmlToDocxRuns(cleanOptHtml, { allowUnderline: false })}
            </w:p>`;
        }
      }
    }
  }

  // SECTION II
  if (p2.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PHẦN II. Câu trắc nghiệm đúng sai (Thí sinh trả lời từ câu 1 đến câu ${p2.length})</w:t></w:r>
      </w:p>`;

    for (let i = 0; i < p2.length; i++) {
      const q = p2[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Câu ${i + 1}: </w:t></w:r>
          ${htmlToDocxRuns(stripOriginalQuestionNumber(q.promptHtml), { allowUnderline: false })}
        </w:p>`;

      // Insert images
      for (const img of q.images) {
        const media = mediaMap[img.id];
        if (media) {
          bodyXml += `
            <w:p>
              <w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:drawing><a:blip r:embed="${media.rId}"/></w:drawing></w:r>
            </w:p>`;
        }
      }

      if (q.statements) {
        for (const stmt of q.statements) {
          bodyXml += `
            <w:p>
              <w:pPr><w:ind w:left="360"/></w:pPr>
              <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${stmt.label}) </w:t></w:r>
              ${htmlToDocxRuns(stmt.html, { allowUnderline: false })}
            </w:p>`;
        }
      }
    }
  }

  // SECTION III
  if (p3.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PHẦN III. Câu trắc nghiệm trả lời ngắn (Thí sinh trả lời từ câu 1 đến câu ${p3.length})</w:t></w:r>
      </w:p>`;

    for (let i = 0; i < p3.length; i++) {
      const q = p3[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Câu ${i + 1}: </w:t></w:r>
          ${htmlToDocxRuns(stripOriginalQuestionNumber(q.promptHtml), { allowUnderline: false })}
        </w:p>
        <w:p>
          <w:pPr><w:ind w:left="360"/></w:pPr>
          <w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>Trả lời: ................................................................</w:t></w:r>
        </w:p>`;
    }
  }

  // End of test footer
  bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:before="360"/></w:pPr>
      <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>--- HẾT --- (Cán bộ coi thi không giải thích gì thêm)</w:t></w:r>
    </w:p>`;

  const fullDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`;

  zip.file('word/document.xml', fullDocXml);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Generate Teacher Answer Key DOCX (Includes answer summary table and highlighted questions)
 */
export async function generateTeacherAnswerDocx(version: ShuffledExamVersion): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`
  );

  let bodyXml = '';

  bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="047857"/></w:rPr><w:t>ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM - MÃ ĐỀ: ${escapeXml(version.testCode)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(version.title)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>======================================================================</w:t></w:r></w:p>`;

  // 1. PART 1 ANSWERS TABLE
  const p1 = version.questions.filter((q) => q.section === 1);
  if (p1.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E3A8A"/></w:rPr><w:t>BẢNG ĐÁP ÁN PHẦN I (TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN)</w:t></w:r>
      </w:p>`;

    for (let i = 0; i < p1.length; i++) {
      const q = p1[i];
      const correctOptId = version.answerKeys.part1[q.id];
      const correctOpt = q.options?.find((o) => o.id === correctOptId);
      const ansLabel = correctOpt ? correctOpt.label : 'Chưa có';

      const optText = correctOpt
        ? stripLeadingOptionMarker(correctOpt.text || correctOpt.html.replace(/<[^>]+>/g, ''), correctOpt.label)
        : '';
      bodyXml += `
        <w:p>
          <w:r><w:rPr><w:b/></w:rPr><w:t>Câu ${i + 1}: </w:t></w:r>
          <w:r><w:rPr><w:b/><w:color w:val="B91C1C"/><w:sz w:val="26"/></w:rPr><w:t>${ansLabel}</w:t></w:r>
          <w:r><w:t> (Nội dung: ${escapeXml(optText)})</w:t></w:r>
        </w:p>`;
    }
  }

  // 2. PART 2 ANSWERS TABLE
  const p2 = version.questions.filter((q) => q.section === 2);
  if (p2.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E3A8A"/></w:rPr><w:t>BẢNG ĐÁP ÁN PHẦN II (ĐÚNG - SAI)</w:t></w:r>
      </w:p>`;

    for (let i = 0; i < p2.length; i++) {
      const q = p2[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/></w:rPr><w:t>Câu ${i + 1}: </w:t></w:r>
        </w:p>`;

      if (q.statements) {
        for (const stmt of q.statements) {
          const isCorrect = version.answerKeys.part2[q.id]?.[stmt.id];
          const resultText = isCorrect ? 'ĐÚNG' : 'SAI';
          const color = isCorrect ? '047857' : 'B91C1C';
          const stmtText = stmt.text || stmt.html.replace(/<[^>]+>/g, '');
          bodyXml += `
            <w:p>
              <w:pPr><w:ind w:left="360"/></w:pPr>
              <w:r><w:rPr><w:b/></w:rPr><w:t>${stmt.label}) </w:t></w:r>
              <w:r><w:t>${escapeXml(stmtText)}: </w:t></w:r>
              <w:r><w:rPr><w:b/><w:color w:val="${color}"/></w:rPr><w:t> -> ${resultText}</w:t></w:r>
            </w:p>`;
        }
      }
    }
  }

  // 3. PART 3 ANSWERS TABLE
  const p3 = version.questions.filter((q) => q.section === 3);
  if (p3.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E3A8A"/></w:rPr><w:t>BẢNG ĐÁP ÁN PHẦN III (TRẢ LỜI NGẮN)</w:t></w:r>
      </w:p>`;

    for (let i = 0; i < p3.length; i++) {
      const q = p3[i];
      const answers = version.answerKeys.part3[q.id] || [];
      bodyXml += `
        <w:p>
          <w:r><w:rPr><w:b/></w:rPr><w:t>Câu ${i + 1}: </w:t></w:r>
          <w:r><w:rPr><w:b/><w:color w:val="047857"/><w:sz w:val="26"/></w:rPr><w:t>${escapeXml(answers.join(' | '))}</w:t></w:r>
        </w:p>`;
    }
  }

  const fullDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`;

  zip.file('word/document.xml', fullDocXml);

  return await zip.generateAsync({ type: 'nodebuffer' });
}
