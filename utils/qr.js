// utils/qr.js
import qrcode from './qrcode'

export function makeQrDataUrl(text, cellSize = 8) {
  const qr = qrcode(0, 'M')
  qr.addData(String(text))
  qr.make()
  return qr.createDataURL(cellSize, 4)
}
