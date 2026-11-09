/* BỐ CỤC THEO CỠ MÀN HÌNH (4.21.0): iPhone 1 cột; iPad / máy tính bảng nội dung canh giữa
   (không kéo dãn hết 1024–1366 px); iPad ngang trở lên màn Tìm gói chia 2 cột: tiêu chí
   + tóm tắt bên trái, danh sách gói bên phải. */
import { useWindowDimensions } from 'react-native';

export const TWO_COLUMN_MIN = 900;
export const TABLET_MIN = 700;

export function useLayout() {
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_MIN;
  const tablet = width >= TABLET_MIN;
  return {
    width, tablet, twoColumn,
    /** Khung nội dung canh giữa trên máy tính bảng. */
    centered: tablet ? { width: '100%', maxWidth: twoColumn ? 1180 : 760, alignSelf: 'center' } : null,
    sideWidth: twoColumn ? Math.min(460, Math.round(width * 0.4)) : null
  };
}
