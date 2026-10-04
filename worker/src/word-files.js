export const DOC_MIME = "application/msword";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const isWordMime = (mime) => mime === DOC_MIME || mime === DOCX_MIME;

// Inspect archive metadata only: never extract or execute uploaded documents.
function isDocx(bytes) {
  if (bytes.length < 22) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    return false;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const limit = offset + view.getUint32(end + 12, true);
  if (
    !count ||
    count > 10000 ||
    limit !== end ||
    view.getUint16(end + 8, true) !== count
  )
    return false;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > limit || view.getUint32(offset, true) !== 0x02014b50)
      return false;
    const nameLength = view.getUint16(offset + 28, true);
    const next =
      offset +
      46 +
      nameLength +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
    if (next > limit) return false;
    names.add(
      new TextDecoder().decode(
        bytes.slice(offset + 46, offset + 46 + nameLength),
      ),
    );
    const local = view.getUint32(offset + 42, true);
    if (
      local + 30 > view.getUint32(end + 16, true) ||
      view.getUint32(local, true) !== 0x04034b50
    )
      return false;
    offset = next;
  }
  return (
    offset === limit &&
    names.has("[Content_Types].xml") &&
    names.has("word/document.xml")
  );
}

export function validWordFile(bytes, mime) {
  if (mime === DOCX_MIME) return isDocx(bytes);
  if (mime !== DOC_MIME || bytes.length < 512) return false;
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return (
    signature.every((value, i) => bytes[i] === value) &&
    new TextDecoder("utf-16le").decode(bytes).includes("WordDocument")
  );
}
