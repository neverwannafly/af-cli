const MAX_CLOSE_REASON_BYTES = 123;

function isSendableCloseCode(code) {
  return Number.isInteger(code)
    && ((code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006)
      || (code >= 3000 && code <= 4999));
}

// Sendable codes pass through; absent/1005 ("no status") become 1000; 1006/1015/anything else becomes `fallback` (1011).
function safeCloseCode(code, fallback = 1011) {
  if (isSendableCloseCode(code)) return code;
  if (code === undefined || code === null || code === 1005) return 1000;
  return isSendableCloseCode(fallback) ? fallback : 1011;
}

// Trims to the 123-byte UTF-8 limit `ws` enforces, without splitting a multi-byte character.
function safeCloseReason(reason) {
  if (reason === undefined || reason === null) return '';
  const text = Buffer.isBuffer(reason) ? reason.toString() : String(reason);
  if (Buffer.byteLength(text) <= MAX_CLOSE_REASON_BYTES) return text;

  let out = '';
  let bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > MAX_CLOSE_REASON_BYTES) break;
    out += char;
    bytes += size;
  }
  return out;
}

// Closes a ws socket with a sanitized code/reason and never throws.
function safeClose(socket, code, reason) {
  try {
    socket.close(safeCloseCode(code), safeCloseReason(reason));
  } catch (_) {
    try {
      socket.terminate();
    } catch (__) {
      // socket already gone
    }
  }
}

module.exports = {
  MAX_CLOSE_REASON_BYTES,
  isSendableCloseCode,
  safeCloseCode,
  safeCloseReason,
  safeClose,
};
