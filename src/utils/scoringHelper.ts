import { ScoringConfig } from '../types';

export function calculateScoringConfig(
  part1Count: number,
  part2Count: number,
  part3Count: number,
  options: {
    mode?: 'custom_sections' | 'equal_all' | 'vietnam_standard';
    part1Total?: number;
    part2Total?: number;
    part3Total?: number;
    part2GradingMode?: 'vietnam_standard' | 'equal_per_statement';
    totalScale?: number;
  }
): ScoringConfig {
  const totalScale = options.totalScale || 10;
  const totalQ = (part1Count + part2Count + part3Count) || 1;
  const part2GradingMode = options.part2GradingMode || 'equal_per_statement';

  // 1. Chế độ: Giáo viên tự nhập điểm cho từng phần (Phần 1, Phần 2, Phần 3)
  // Số điểm cho từng câu thì lấy điểm của giáo viên đã nhập chia cho tổng số câu của phần đó
  if (
    options.mode === 'custom_sections' ||
    (options.part1Total !== undefined && options.part2Total !== undefined && options.part3Total !== undefined)
  ) {
    const p1Total = options.part1Total !== undefined ? Number(options.part1Total) : 0;
    const p2Total = options.part2Total !== undefined ? Number(options.part2Total) : 0;
    const p3Total = options.part3Total !== undefined ? Number(options.part3Total) : 0;

    const p1PerQ = part1Count > 0 ? Math.round((p1Total / part1Count) * 1000) / 1000 : 0;
    const p2PerQ = part2Count > 0 ? Math.round((p2Total / part2Count) * 1000) / 1000 : 0;
    const p3PerQ = part3Count > 0 ? Math.round((p3Total / part3Count) * 1000) / 1000 : 0;
    const sumScale = Math.round((p1Total + p2Total + p3Total) * 100) / 100 || totalScale;

    return {
      scoringMode: 'custom_sections',
      part1TotalPoints: p1Total,
      part2TotalPoints: p2Total,
      part3TotalPoints: p3Total,
      part1PointsPerQ: p1PerQ,
      part2PointsPerQ: p2PerQ,
      part3PointsPerQ: p3PerQ,
      part2GradingMode,
      totalScale: sumScale,
    };
  }

  // 2. Chế độ: Chuẩn Bộ GD&ĐT 2025 (Chỉ dùng khi đúng 18 câu P1, 4 câu P2, 6 câu P3)
  if (options.mode === 'vietnam_standard' && part1Count === 18 && part2Count === 4 && part3Count === 6) {
    return {
      scoringMode: 'vietnam_standard',
      part1TotalPoints: 4.5,
      part2TotalPoints: 4.0,
      part3TotalPoints: 1.5,
      part1PointsPerQ: 0.25,
      part2PointsPerQ: 1.0,
      part3PointsPerQ: 0.25,
      part2GradingMode: 'vietnam_standard',
      totalScale: 10,
    };
  }

  // 3. Chế độ mặc định & 'equal_all': Chia đều cho từng câu/từng ý
  // Công thức: 10 điểm chia cho tổng số câu hỏi nhập vào của 3 phần để ra điểm trung bình của mỗi câu
  const avgPerQ = Math.round((totalScale / totalQ) * 1000) / 1000;
  const p1Total = Math.round(part1Count * avgPerQ * 100) / 100;
  const p2Total = Math.round(part2Count * avgPerQ * 100) / 100;
  const p3Total = Math.round((totalScale - p1Total - p2Total) * 100) / 100;

  return {
    scoringMode: 'equal_all',
    part1TotalPoints: p1Total,
    part2TotalPoints: p2Total,
    part3TotalPoints: p3Total,
    part1PointsPerQ: part1Count > 0 ? avgPerQ : 0,
    part2PointsPerQ: part2Count > 0 ? avgPerQ : 0,
    part3PointsPerQ: part3Count > 0 ? avgPerQ : 0,
    part2GradingMode: options.part2GradingMode || 'equal_per_statement',
    totalScale,
  };
}
