import ExcelJS from 'exceljs';
import { PublishedExam, StudentSubmission } from './types';

/**
 * Generate a complete, formatted 3-sheet Excel workbook (.xlsx)
 */
export async function generateExamExcel(
  publishedExam: PublishedExam,
  submissions: StudentSubmission[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Học Hóa Cùng Thầy Thiện';
  workbook.created = new Date();

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' }, // Navy blue
  };

  const headerFont: Partial<ExcelJS.Font> = {
    name: 'Times New Roman',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };

  const dataFont: Partial<ExcelJS.Font> = {
    name: 'Times New Roman',
    size: 11,
  };

  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };

  // ==========================================
  // SHEET 1: BẢNG ĐIỂM
  // ==========================================
  const sheet1 = workbook.addWorksheet('BẢNG ĐIỂM', {
    views: [{ showGridLines: true }],
  });

  // Title block
  sheet1.mergeCells('A1:J1');
  const titleCell1 = sheet1.getCell('A1');
  titleCell1.value = `BẢNG ĐIỂM TỔNG HỢP - ${publishedExam.title.toUpperCase()}`;
  titleCell1.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(1).height = 30;

  sheet1.mergeCells('A2:K2');
  const subCell1 = sheet1.getCell('A2');
  subCell1.value = `Hệ thống: Học Hóa Cùng Thầy Thiện | Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} | Tổng số học sinh: ${submissions.length}`;
  subCell1.font = { name: 'Times New Roman', size: 10, italic: true };
  subCell1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet1.addRow([]);

  // Headers
  const s1Headers = [
    'STT',
    'Họ và tên',
    'Lớp',
    'Lần thi',
    'Mã đề',
    'Thời điểm nộp',
    'Điểm tổng kết (10)',
    'Số câu đúng',
    'Số câu sai',
    'Chưa trả lời',
    'Trạng thái',
  ];
  const hRow1 = sheet1.addRow(s1Headers);
  hRow1.height = 24;
  hRow1.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderStyle;
  });

  // Data
  submissions.forEach((sub, idx) => {
    const isSubmitted = sub.status !== 'in_progress' && !!sub.submittedAt;
    const timeStr = isSubmitted
      ? new Date(sub.submittedAt).toLocaleString('vi-VN')
      : sub.lastActiveAt
      ? `Đang làm (${new Date(sub.lastActiveAt).toLocaleTimeString('vi-VN')})`
      : 'Đang làm bài';

    const row = sheet1.addRow([
      idx + 1,
      sub.studentName,
      sub.studentClass,
      sub.attemptNumber ? `Lần ${sub.attemptNumber}` : 'Lần 1',
      sub.testCode,
      timeStr,
      sub.score?.totalScore ?? 0,
      sub.score?.correctQuestionsCount ?? 0,
      sub.score?.wrongQuestionsCount ?? 0,
      sub.score?.unansweredQuestionsCount ?? 0,
      isSubmitted ? 'Đã nộp bài' : 'Đang làm bài (Tạm tính)',
    ]);
    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = dataFont;
      cell.border = borderStyle;
      if (colNum === 1 || colNum === 3 || colNum === 4 || colNum === 5 || colNum === 6 || colNum >= 8) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNum === 7) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '0.00';
        cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF047857' } };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  });

  sheet1.columns = [
    { width: 8 },  // STT
    { width: 28 }, // Họ tên
    { width: 12 }, // Lớp
    { width: 12 }, // Lần thi
    { width: 14 }, // Mã đề
    { width: 22 }, // Thời điểm nộp
    { width: 20 }, // Điểm tổng kết
    { width: 15 }, // Đúng
    { width: 15 }, // Sai
    { width: 15 }, // Chưa trả lời
    { width: 16 }, // Trạng thái
  ];

  // ==========================================
  // SHEET 2: CHI TIẾT BÀI LÀM
  // ==========================================
  const sheet2 = workbook.addWorksheet('CHI TIẾT BÀI LÀM', {
    views: [{ showGridLines: true }],
  });

  sheet2.mergeCells('A1:H1');
  const titleCell2 = sheet2.getCell('A1');
  titleCell2.value = `CHI TIẾT BÀI LÀM TỪNG CÂU HỎI CỦA HỌC SINH`;
  titleCell2.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(1).height = 26;

  sheet2.addRow([]);

  const s2Headers = [
    'Họ và tên',
    'Lớp',
    'Mã đề',
    'Câu hỏi',
    'Đáp án học sinh',
    'Đáp án chuẩn',
    'Trạng thái',
    'Điểm đạt được',
  ];
  const hRow2 = sheet2.addRow(s2Headers);
  hRow2.height = 24;
  hRow2.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF047857' }, // Emerald green
    };
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderStyle;
  });

  submissions.forEach((sub) => {
    sub.score.details.forEach((det) => {
      let studentAns = '';
      let correctAns = '';

      if (det.section === 1) {
        studentAns = det.selectedOptionLabel ? `Phương án ${det.selectedOptionLabel}` : '(Chưa chọn)';
        correctAns = det.correctOptionLabel ? `Phương án ${det.correctOptionLabel}` : '';
      } else if (det.section === 2) {
        if (det.statementResults) {
          studentAns = det.statementResults
            .map((s) => `${s.label}: ${s.studentChoice === true ? 'Đ' : s.studentChoice === false ? 'S' : '-'}`)
            .join(' | ');
          correctAns = det.statementResults
            .map((s) => `${s.label}: ${s.correctChoice ? 'Đ' : 'S'}`)
            .join(' | ');
        }
      } else if (det.section === 3) {
        studentAns = det.studentAnswerText || '(Chưa nhập)';
        correctAns = det.standardAnswers?.join(' hoặc ') || '';
      }

      const row = sheet2.addRow([
        sub.studentName,
        sub.studentClass,
        sub.testCode,
        `Phần ${det.section} - Câu ${det.displayNumber}`,
        studentAns,
        correctAns,
        det.isCorrect ? 'ĐÚNG' : 'SAI',
        det.pointsEarned,
      ]);
      row.height = 20;
      row.eachCell((cell, colNum) => {
        cell.font = dataFont;
        cell.border = borderStyle;
        if (colNum <= 4 || colNum === 7 || colNum === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
        if (colNum === 7) {
          cell.font = {
            name: 'Times New Roman',
            size: 11,
            bold: true,
            color: { argb: det.isCorrect ? 'FF047857' : 'FFDC2626' },
          };
        }
        if (colNum === 8) {
          cell.numFmt = '0.00';
        }
      });
    });
  });

  sheet2.columns = [
    { width: 24 }, // Họ tên
    { width: 12 }, // Lớp
    { width: 12 }, // Mã đề
    { width: 18 }, // Câu hỏi
    { width: 32 }, // ĐA học sinh
    { width: 32 }, // ĐA chuẩn
    { width: 14 }, // Kết quả
    { width: 16 }, // Điểm
  ];

  // ==========================================
  // SHEET 3: THỐNG KÊ CÂU HỎI
  // ==========================================
  const sheet3 = workbook.addWorksheet('THỐNG KÊ CÂU HỎI', {
    views: [{ showGridLines: true }],
  });

  sheet3.mergeCells('A1:G1');
  const titleCell3 = sheet3.getCell('A1');
  titleCell3.value = `THỐNG KÊ MỨC ĐỘ NẮM KIẾN THỨC THEO TỪNG CÂU HỎI`;
  titleCell3.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell3.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet3.getRow(1).height = 26;

  sheet3.addRow([]);

  const s3Headers = [
    'Phần thi',
    'Thứ tự câu',
    'Số lượt làm',
    'Số lượt đúng',
    'Số lượt sai',
    'Tỷ lệ đúng (%)',
    'Đánh giá độ khó',
  ];
  const hRow3 = sheet3.addRow(s3Headers);
  hRow3.height = 24;
  hRow3.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderStyle;
  });

  // Calculate stats per question
  // Aggregate using original question index across submissions
  const questionStatsMap: Record<
    string,
    { section: number; num: number; total: number; correct: number; wrong: number }
  > = {};

  submissions.forEach((sub) => {
    sub.score.details.forEach((det) => {
      const key = `${det.section}_${det.displayNumber}`;
      if (!questionStatsMap[key]) {
        questionStatsMap[key] = {
          section: det.section,
          num: det.displayNumber,
          total: 0,
          correct: 0,
          wrong: 0,
        };
      }
      questionStatsMap[key].total++;
      if (det.isCorrect) questionStatsMap[key].correct++;
      else questionStatsMap[key].wrong++;
    });
  });

  const sortedStats = Object.values(questionStatsMap).sort((a, b) => {
    if (a.section !== b.section) return a.section - b.section;
    return a.num - b.num;
  });

  sortedStats.forEach((stat) => {
    const rate = stat.total > 0 ? (stat.correct / stat.total) * 100 : 0;
    let evalText = 'Trung bình';
    if (rate >= 80) evalText = 'Dễ / Nắm vững';
    else if (rate <= 40) evalText = 'Khó / Nhiều học sinh sai';

    const row = sheet3.addRow([
      `Phần ${stat.section}`,
      `Câu ${stat.num}`,
      stat.total,
      stat.correct,
      stat.wrong,
      rate / 100,
      evalText,
    ]);
    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = dataFont;
      cell.border = borderStyle;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 6) {
        cell.numFmt = '0.0%';
      }
      if (colNum === 7) {
        if (rate <= 40) {
          cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFDC2626' } };
        } else if (rate >= 80) {
          cell.font = { name: 'Times New Roman', size: 11, color: { argb: 'FF047857' } };
        }
      }
    });
  });

  sheet3.columns = [
    { width: 16 }, // Phần thi
    { width: 16 }, // Thứ tự câu
    { width: 16 }, // Lượt làm
    { width: 16 }, // Lượt đúng
    { width: 16 }, // Lượt sai
    { width: 18 }, // Tỷ lệ đúng
    { width: 28 }, // Đánh giá
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
