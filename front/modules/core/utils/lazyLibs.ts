/**
 * Carregamento sob demanda das bibliotecas pesadas de exportação.
 * Só são descarregadas quando o utilizador exporta/importa algo,
 * em vez de entrarem no bundle de cada página (exceljs ≈ 1 MB, jspdf, html2canvas, xlsx).
 */
export const loadJsPDF = async () => (await import('jspdf')).default;
export const loadHtml2Canvas = async () => (await import('html2canvas')).default;
export const loadExcelJS = async () => (await import('exceljs')).default;
export const loadXLSX = () => import('xlsx');
