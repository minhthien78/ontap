import JSZip from 'jszip';

/**
 * Creates a valid DOCX file buffer representing an authentic Vietnamese Chemistry exam
 * with 25 questions strictly conforming to the 2025 Ministry of Education structure:
 * - PHẦN I (Câu 1 - 18): Trắc nghiệm 4 lựa chọn (A, B, C, D) có gạch chân đáp án đúng
 * - PHẦN II (Câu 19 - 22): Đúng - Sai (a, b, c, d) có gạch chân các ý Đúng
 * - PHẦN III (Câu 23 - 25): Trả lời ngắn có dòng Đáp án chuẩn
 * Đánh số thứ tự liên tục từ Câu 1 đến Câu 25.
 */
export async function createSampleChemistryDocx(): Promise<Buffer> {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
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

  // 3. word/_rels/document.xml.rels
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`
  );

  // 4. word/styles.xml
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

  // 5. word/media/image1.png: 64x64 blue flask icon
  const samplePngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAACvElEQVR4nO2bv2sUQRTHP7sX' +
    'E1BRsFEsf0BMISIo2AiCoGBjZ2NjF2wsgqWlhVb+A+20sbSwsBQLwU7ESrESsRBFIb67uXm7L/NmZ2fnZmc3u8/3wz329mbeffNmd' +
    'm/f7I4REREREREREREREREREfF/iABmgB1gG5gBVoA1YAL8BV4B94F3wDvgHfAKWAVa+b1pBFwBNoB9YBe4AWwBv4CbwHPgEfAG' +
    'WAKa+T1rBEwBR8AR8BB4Dtyv/r4B3AOeAI+A+8AmMAts5/e4d/y+p4C3wCfgEfAQOFP93Vn1/1/gTfW4Dkzn98F6/B4DnoqA34HH' +
    'wG3gRMW/W41/BDwFjgGZ3x/r8e+vCNgA3s6fS/4XwHXgC2YEjALPAU+AF8C3fL75L8wI+AUcAI+A/flzfOcf+z+z1yEAfwNHzL9' +
    '4fB5zNsz34e/qI30L7Fv9k/6l1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp' +
    '1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp' +
    '1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp' +
    '1fVp1fVp1fVp1fVp1fVp1fVpERERERERERERERH5n/gLz6B2wM8UuLAAAAAElFTkSuQmCC';

  zip.file('word/media/image1.png', Buffer.from(samplePngBase64, 'base64'));

  // 6. word/document.xml with full 25 chemistry questions
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <!-- Header -->
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ MINH HỌA THI TỐT NGHIỆP THPT</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1E3A8A"/></w:rPr><w:t>BỘ ĐỀ CHUẨN HÓA HỌC - HỌC HÓA CÙNG THẦY THIỆN</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/></w:rPr><w:t>Thời gian làm bài: 50 phút (Tổng 25 câu hỏi - 3 Phần thi theo cấu trúc 2025)</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>======================================================================</w:t></w:r></w:p>

    <!-- PHẦN I: CÂU 1 ĐẾN CÂU 18 -->
    <w:p>
      <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu 18. Mỗi câu hỏi thí sinh chỉ chọn một phương án.</w:t></w:r>
    </w:p>

    <!-- Câu 1 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 1: </w:t></w:r><w:r><w:t>Chất nào sau đây là oxit axit?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>SO</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Na</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>O.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>CaO.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>BaO.</w:t></w:r>
    </w:p>

    <!-- Câu 2 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 2: </w:t></w:r><w:r><w:t>Kim loại nào sau đây có tính dẫn điện tốt nhất ở điều kiện thường?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Đồng (Cu).        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Bạc (Ag).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Vàng (Au).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Nhôm (Al).</w:t></w:r>
    </w:p>

    <!-- Câu 3 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 3: </w:t></w:r><w:r><w:t>Cho dung dịch Fe</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>(SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t>)</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> tác dụng với dung dịch NaOH dư. Kết tủa thu được là Fe(OH)</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> có màu gì?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Trắng xanh.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Xanh lam.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Nâu đỏ.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Vàng tươi.</w:t></w:r>
    </w:p>

    <!-- Câu 4 (Ans: D) with image -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 4: </w:t></w:r><w:r><w:t>Quan sát dụng cụ thí nghiệm điều chế và thu khí trong phòng thí nghiệm:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r>
    </w:p>
    <w:p><w:r><w:t>Phương pháp đẩy nước như hình vẽ trên thích hợp nhất để thu khí nào sau đây?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>HCl.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>NH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>O</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>.</w:t></w:r>
    </w:p>

    <!-- Câu 5 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 5: </w:t></w:r><w:r><w:t>Este etyl axetat có công thức cấu tạo thu gọn là:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>CH</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>COOC</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>H</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>HCOOCH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>CH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>COOCH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>HCOOC</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>.</w:t></w:r>
    </w:p>

    <!-- Câu 6 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 6: </w:t></w:r><w:r><w:t>Cacbohiđrat nào sau đây thuộc loại đisaccarit?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Glucozơ.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Saccarozơ.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Tinh bột.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Xenlulozơ.</w:t></w:r>
    </w:p>

    <!-- Câu 7 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 7: </w:t></w:r><w:r><w:t>Công thức phân tử của anilin là:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>CH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>N.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>7</w:t></w:r><w:r><w:t>N.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>C</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>6</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>H</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>7</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>N.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>7</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>9</w:t></w:r><w:r><w:t>N.</w:t></w:r>
    </w:p>

    <!-- Câu 8 (Ans: D) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 8: </w:t></w:r><w:r><w:t>Polime nào sau đây được điều chế bằng phản ứng trùng hợp?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Nilon-6,6.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Poli(etylen terephtalat).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Tơ lapsan.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Polietilen (PE).</w:t></w:r>
    </w:p>

    <!-- Câu 9 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 9: </w:t></w:r><w:r><w:t>Kim loại nào sau đây thuộc nhóm IA trong bảng tuần hoàn?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Natri (Na).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Canxi (Ca).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Magie (Mg).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Nhôm (Al).</w:t></w:r>
    </w:p>

    <!-- Câu 10 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 10: </w:t></w:r><w:r><w:t>Nước cứng tạm thời chứa các ion nào sau đây cùng với Ca</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2+</w:t></w:r><w:r><w:t>, Mg</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2+</w:t></w:r><w:r><w:t>?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Cl</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>-</w:t></w:r><w:r><w:t> và SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2-</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>HCO</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="superscript"/></w:rPr><w:t>-</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>NO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>-</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>CO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2-</w:t></w:r><w:r><w:t>.</w:t></w:r>
    </w:p>

    <!-- Câu 11 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 11: </w:t></w:r><w:r><w:t>Quặng bauxit là nguyên liệu chính để sản xuất kim loại nào?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Sắt (Fe).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Đồng (Cu).        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Nhôm (Al).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Kẽm (Zn).</w:t></w:r>
    </w:p>

    <!-- Câu 12 (Ans: D) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 12: </w:t></w:r><w:r><w:t>Kim loại sắt tác dụng với dung dịch HNO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> loãng, dư tạo thành muối sắt có số oxi hóa là:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>+1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>+2.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>0.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>+3.</w:t></w:r>
    </w:p>

    <!-- Câu 13 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 13: </w:t></w:r><w:r><w:t>Để bảo vệ vỏ tàu biển bằng thép, người ta thường gắn các tấm kim loại nào sau đây vào vỏ tàu?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Kẽm (Zn).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Đồng (Cu).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Bạc (Ag).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Chì (Pb).</w:t></w:r>
    </w:p>

    <!-- Câu 14 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 14: </w:t></w:r><w:r><w:t>Dung dịch chất nào sau đây làm quỳ tím chuyển sang màu đỏ?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>NaOH.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>HCl.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>NaCl.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>OH.</w:t></w:r>
    </w:p>

    <!-- Câu 15 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 15: </w:t></w:r><w:r><w:t>Chất nào sau đây không tham gia phản ứng thủy phân?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Saccarozơ.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Tinh bột.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Fructozơ.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Xenlulozơ.</w:t></w:r>
    </w:p>

    <!-- Câu 16 (Ans: D) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 16: </w:t></w:r><w:r><w:t>Amino axit đơn giản nhất là glyxin có phân tử khối bằng:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>89.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>117.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>147.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>75.</w:t></w:r>
    </w:p>

    <!-- Câu 17 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 17: </w:t></w:r><w:r><w:t>Số liên kết peptit trong một phân tử tripeptit Gly-Ala-Val là:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>2.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>3.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>4.</w:t></w:r>
    </w:p>

    <!-- Câu 18 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 18: </w:t></w:r><w:r><w:t>Kim loại nào sau đây phản ứng mãnh liệt với nước ở nhiệt độ thường sinh ra dung dịch kiềm?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Fe.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>K (Kali).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Cu.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Ag.</w:t></w:r>
    </w:p>

    <!-- PHẦN II: CÂU 19 ĐẾN CÂU 22 -->
    <w:p>
      <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 19 đến câu 22. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn Đúng hoặc Sai.</w:t></w:r>
    </w:p>

    <!-- Câu 19: a) Đúng (underlined), b) Sai, c) Đúng (underlined), d) Sai -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 19: </w:t></w:r><w:r><w:t>Cho cân bằng hóa học sau trong bình kín: N</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>(k) + 3H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>(k) ⇌ 2NH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>(k); ΔH &lt; 0. Xét các phát biểu sau:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Khi tăng áp suất chung của hệ, cân bằng chuyển dịch theo chiều thuận.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:t>Khi tăng nhiệt độ của hệ, cân bằng chuyển dịch theo chiều thuận.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Thêm chất xúc tác Fe làm tăng tốc độ phản ứng thuận và nghịch như nhau.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:t>Giảm nồng độ NH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> làm cân bằng chuyển dịch theo chiều nghịch.</w:t></w:r>
    </w:p>

    <!-- Câu 20: a) Sai, b) Đúng (underlined), c) Sai, d) Đúng (underlined) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 20: </w:t></w:r><w:r><w:t>Tiến hành thí nghiệm thủy phân tinh bột trong môi trường axit. Xét các khẳng định sau:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:t>Sản phẩm cuối cùng thu được sau khi thủy phân hoàn toàn là fructozơ.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Sản phẩm thủy phân có khả năng tham gia phản ứng tráng bạc với thuốc thử Tollens.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:t>Dùng dung dịch iot để kiểm tra, dung dịch vẫn giữ nguyên màu xanh tím sau khi thủy phân hoàn toàn.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Cần trung hòa axit trước khi thực hiện phản ứng tráng bạc.</w:t></w:r>
    </w:p>

    <!-- Câu 21: a) Đúng (underlined), b) Đúng (underlined), c) Sai, d) Sai -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 21: </w:t></w:r><w:r><w:t>Cho các nhận định về tính chất của kim loại nhôm và hợp chất của nhôm:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Nhôm là kim loại lưỡng tính.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Al(OH)</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t> tan được trong cả dung dịch HCl và dung dịch NaOH dư.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:t>Al thụ động hóa trong dung dịch H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t> loãng nguội.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:t>Sục khí CO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t> dư vào dung dịch NaAlO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t> thì kết tủa tan hoàn toàn.</w:t></w:r>
    </w:p>

    <!-- Câu 22: a) Đúng (underlined), b) Sai, c) Đúng (underlined), d) Đúng (underlined) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 22: </w:t></w:r><w:r><w:t>Về phản ứng este hóa giữa axit axetic và ancol etylic:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Axit H</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>SO</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t> đặc đóng vai trò vừa là chất xúc tác vừa hút nước để chuyển dịch cân bằng.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:t>Phản ứng este hóa là phản ứng một chiều hoàn toàn.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Để tách este etyl axetat ra khỏi hỗn hợp sau phản ứng, người ta thêm dung dịch NaCl bão hòa rồi chiết.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Etyl axetat nhẹ hơn nước và nổi lên trên bề mặt.</w:t></w:r>
    </w:p>

    <!-- PHẦN III: CÂU 23 ĐẾN CÂU 25 -->
    <w:p>
      <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 23 đến câu 25. Thí sinh điền kết quả vào ô trống tương ứng.</w:t></w:r>
    </w:p>

    <!-- Câu 23 (Ans: 4) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 23: </w:t></w:r><w:r><w:t>Este no, đơn chức, mạch hở X có công thức phân tử C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>8</w:t></w:r><w:r><w:t>O</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>. Hỏi X có tất cả bao nhiêu đồng phân cấu tạo este?</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:color w:val="047857"/></w:rPr><w:t>Đáp án: 4</w:t></w:r></w:p>

    <!-- Câu 24 (Ans: 0,1) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 24: </w:t></w:r><w:r><w:t>Hòa tan hoàn toàn 5,6 gam sắt (Fe) vào dung dịch HCl dư. Tính số mol khí H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t> (đktc) sinh ra.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:color w:val="047857"/></w:rPr><w:t>Đáp án: 0,1 mol</w:t></w:r></w:p>

    <!-- Câu 25 (Ans: 12,5%) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 25: </w:t></w:r><w:r><w:t>Hòa tan hoàn toàn 25 gam muối ăn (NaCl) vào 175 gam nước cất. Nồng độ phần trăm của dung dịch thu được là bao nhiêu %? (Làm tròn đến 1 chữ số thập phân nếu cần).</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:color w:val="047857"/></w:rPr><w:t>Đáp án: 12,5%</w:t></w:r></w:p>

  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}
