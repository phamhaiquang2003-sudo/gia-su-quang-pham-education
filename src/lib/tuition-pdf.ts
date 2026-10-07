import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  tuitionBank,
  tuitionDate,
  tuitionMoney,
  tuitionMonthLabel,
  type TuitionReport,
} from "./tuition";

const width = 595.28;
const height = 841.89;
const margin = 40;
const bodyWidth = width - margin * 2;
const navy = rgb(0, 0.17, 0.26);
const slate = rgb(0.28, 0.36, 0.43);
const pale = rgb(0.95, 0.98, 1);
const line = rgb(0.84, 0.89, 0.93);
let assets: Promise<ArrayBuffer[]> | undefined;

function loadAssets() {
  if (!assets) {
    assets = Promise.all(
      [
        "fonts/NotoSans-Regular.ttf",
        "fonts/NotoSans-Bold.ttf",
        "logo-lumenpelagi.png",
        tuitionBank.qrPath,
      ].map(async (path) => {
        const response = await fetch(`${import.meta.env.BASE_URL}${path}`, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok)
          throw new Error(
            "Không tải được phông chữ hoặc mã QR để tạo PDF. Hãy thử lại.",
          );
        return response.arrayBuffer();
      }),
    ).catch((error) => {
      assets = undefined;
      throw error;
    });
  }
  return assets;
}

function clean(text: string) {
  return text
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function wrapped(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of clean(text).split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    for (const character of word) {
      if (
        current &&
        font.widthOfTextAtSize(current + character, size) > maxWidth
      ) {
        lines.push(current);
        current = "";
      }
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function issuedDate(timestamp: number) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(timestamp);
}
function filename(report: TuitionReport) {
  const name =
    (report.student.username || report.student.displayName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "hoc-sinh";
  return `Hoc-phi-${name}-${report.month}.pdf`;
}

export async function createTuitionPdf(report: TuitionReport) {
  if (
    report.lessons.length !== report.totals.lessonCount ||
    report.lessons.reduce((sum, lesson) => sum + lesson.fee, 0) !==
      report.totals.totalFee
  )
    throw new Error("Dữ liệu thống kê chưa khớp. Hãy tải lại và xuất PDF.");
  const [regularBytes, boldBytes, logoBytes, qrBytes] = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, bold, logo, qr] = await Promise.all([
    pdf.embedFont(regularBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
    pdf.embedPng(logoBytes),
    pdf.embedPng(qrBytes),
  ]);
  pdf.setTitle(
    `Học phí ${report.student.displayName} · Tháng ${tuitionMonthLabel(report.month)}`,
  );
  pdf.setAuthor(report.teacher.displayName);
  pdf.setSubject("Thống kê buổi học và học phí theo tháng · PHQ Education");
  pdf.setCreator("PHQ Education · LumenPelagi");
  pdf.setCreationDate(new Date(report.generatedAt));
  let page!: PDFPage;
  let cursor = 0;
  const rightText = (
    text: string,
    right: number,
    top: number,
    size = 11,
    font = regular,
    color = navy,
  ) => {
    page.drawText(text, {
      x: right - font.widthOfTextAtSize(text, size),
      y: top - size,
      size,
      font,
      color,
    });
  };
  const paragraph = (
    text: string,
    size = 11,
    font = regular,
    color = slate,
  ) => {
    for (const part of wrapped(text, font, size, bodyWidth)) {
      page.drawText(part, { x: margin, y: cursor - size, size, font, color });
      cursor -= size + 5;
    }
  };
  function addPage(continuation = false) {
    page = pdf.addPage([width, height]);
    cursor = height - margin;
    page.drawImage(logo, { x: margin, y: cursor - 38, width: 38, height: 38 });
    page.drawText("PHQ Education", {
      x: margin + 50,
      y: cursor - 17,
      size: 17,
      font: bold,
      color: navy,
    });
    page.drawText("LumenPelagi®", {
      x: margin + 50,
      y: cursor - 34,
      size: 10,
      font: regular,
      color: slate,
    });
    cursor -= 58;
    page.drawText("THỐNG KÊ BUỔI HỌC VÀ HỌC PHÍ", {
      x: margin,
      y: cursor - 18,
      size: 18,
      font: bold,
      color: navy,
    });
    cursor -= 30;
    page.drawText(`Tháng ${tuitionMonthLabel(report.month)}`, {
      x: margin,
      y: cursor - 12,
      size: 12,
      font: bold,
      color: navy,
    });
    rightText(
      `Ngày xuất: ${issuedDate(report.generatedAt)}`,
      width - margin,
      cursor,
      10,
      regular,
      slate,
    );
    cursor -= 28;
    page.drawLine({
      start: { x: margin, y: cursor + 7 },
      end: { x: width - margin, y: cursor + 7 },
      thickness: 1,
      color: line,
    });
    paragraph(`Học sinh: ${report.student.displayName}`, 12, bold, navy);
    if (report.student.username)
      paragraph(`Tên đăng nhập: ${report.student.username}`, 10);
    paragraph(`Giáo viên: ${report.teacher.displayName}`, 10);
    cursor -= 12;
    if (!continuation) {
      const cardHeight = 58,
        countWidth = 164,
        amountX = margin + countWidth + 12;
      page.drawRectangle({
        x: margin,
        y: cursor - cardHeight,
        width: countWidth,
        height: cardHeight,
        color: pale,
      });
      page.drawRectangle({
        x: amountX,
        y: cursor - cardHeight,
        width: bodyWidth - countWidth - 12,
        height: cardHeight,
        color: navy,
      });
      page.drawText("Số buổi học trong tháng", {
        x: margin + 14,
        y: cursor - 20,
        size: 9,
        font: regular,
        color: slate,
      });
      page.drawText(`${report.totals.lessonCount} buổi`, {
        x: margin + 14,
        y: cursor - 43,
        size: 17,
        font: bold,
        color: navy,
      });
      page.drawText("Tổng học phí trong tháng", {
        x: amountX + 14,
        y: cursor - 20,
        size: 9,
        font: regular,
        color: rgb(0.82, 0.9, 0.95),
      });
      page.drawText(tuitionMoney(report.totals.totalFee), {
        x: amountX + 14,
        y: cursor - 44,
        size: 19,
        font: bold,
        color: rgb(1, 1, 1),
      });
      cursor -= cardHeight + 22;
    }
  }
  function tableHeader() {
    page.drawRectangle({
      x: margin,
      y: cursor - 28,
      width: bodyWidth,
      height: 28,
      color: navy,
    });
    for (const [text, x] of [
      ["Buổi", margin + 12],
      ["Ngày học", margin + 82],
    ] as const)
      page.drawText(text, {
        x,
        y: cursor - 18,
        size: 10,
        font: bold,
        color: rgb(1, 1, 1),
      });
    rightText(
      "Học phí buổi học",
      width - margin - 12,
      cursor - 6,
      10,
      bold,
      rgb(1, 1, 1),
    );
    cursor -= 28;
  }
  function ensureSpace(required: number, table = false) {
    if (cursor - required < 52) {
      addPage(true);
      if (table) tableHeader();
    }
  }
  addPage();
  tableHeader();
  if (!report.lessons.length) {
    paragraph("Chưa có buổi học được ghi nhận trong tháng này.", 11);
    cursor -= 8;
  }
  report.lessons.forEach((lesson, index) => {
    ensureSpace(index === report.lessons.length - 1 ? 56 : 24, true);
    if (index % 2 === 0)
      page.drawRectangle({
        x: margin,
        y: cursor - 24,
        width: bodyWidth,
        height: 24,
        color: pale,
      });
    page.drawText(String(index + 1), {
      x: margin + 12,
      y: cursor - 16,
      size: 10,
      font: regular,
      color: navy,
    });
    page.drawText(tuitionDate(lesson.date), {
      x: margin + 82,
      y: cursor - 16,
      size: 10,
      font: regular,
      color: navy,
    });
    rightText(tuitionMoney(lesson.fee), width - margin - 12, cursor - 6, 10);
    page.drawLine({
      start: { x: margin, y: cursor - 24 },
      end: { x: width - margin, y: cursor - 24 },
      thickness: 0.4,
      color: line,
    });
    cursor -= 24;
  });
  ensureSpace(32, true);
  page.drawRectangle({
    x: margin,
    y: cursor - 32,
    width: bodyWidth,
    height: 32,
    color: pale,
  });
  page.drawText(`Tổng cộng: ${report.totals.lessonCount} buổi`, {
    x: margin + 12,
    y: cursor - 21,
    size: 11,
    font: bold,
    color: navy,
  });
  rightText(
    tuitionMoney(report.totals.totalFee),
    width - margin - 12,
    cursor - 8,
    12,
    bold,
  );
  cursor -= 48;

  const paymentHeight = 166;
  ensureSpace(paymentHeight);
  page.drawRectangle({
    x: margin,
    y: cursor - paymentHeight,
    width: bodyWidth,
    height: paymentHeight,
    color: pale,
    borderColor: line,
    borderWidth: 1,
  });
  const paymentX = margin + 16;
  page.drawText("THÔNG TIN CHUYỂN KHOẢN", {
    x: paymentX,
    y: cursor - 26,
    size: 12,
    font: bold,
    color: navy,
  });
  for (const [text, offset, font] of [
    [`Ngân hàng: ${tuitionBank.name}`, 51, regular],
    [`Chủ tài khoản: ${tuitionBank.accountName}`, 71, regular],
    [`Số tài khoản: ${tuitionBank.accountNumber}`, 91, bold],
    [`Số tiền: ${tuitionMoney(report.totals.totalFee)}`, 113, bold],
  ] as const)
    page.drawText(text, {
      x: paymentX,
      y: cursor - offset,
      size: 10,
      font,
      color: navy,
    });
  page.drawText(`Học phí tháng ${tuitionMonthLabel(report.month)}`, {
    x: paymentX,
    y: cursor - 136,
    size: 10,
    font: regular,
    color: slate,
  });
  page.drawImage(qr, {
    x: width - margin - 142,
    y: cursor - 147,
    width: 128,
    height: 128,
  });
  page.drawText("Quét mã để chuyển khoản", {
    x: width - margin - 146,
    y: cursor - 158,
    size: 8,
    font: regular,
    color: slate,
  });

  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    sheet.drawLine({
      start: { x: margin, y: 39 },
      end: { x: width - margin, y: 39 },
      thickness: 0.5,
      color: line,
    });
    sheet.drawText("PHQ Education · LumenPelagi", {
      x: margin,
      y: 24,
      size: 8,
      font: regular,
      color: slate,
    });
    const label = `Trang ${index + 1}/${pages.length}`;
    sheet.drawText(label, {
      x: width - margin - regular.widthOfTextAtSize(label, 8),
      y: 24,
      size: 8,
      font: regular,
      color: slate,
    });
  });
  return { bytes: await pdf.save(), filename: filename(report) };
}

export async function downloadTuitionPdf(report: TuitionReport) {
  const file = await createTuitionPdf(report);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(file.bytes)], { type: "application/pdf" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return file.filename;
}
