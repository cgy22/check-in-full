// utils/csv.js
function escapeCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  // 防止 Excel/WPS 把用户输入当作公式执行
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')]
  rows.forEach(row => {
    lines.push(row.map(escapeCell).join(','))
  })
  return '\ufeff' + lines.join('\r\n')
}

export function exportCsv(filename, headers, rows) {
  const csv = buildCsv(headers, rows)
  // H5：直接下载文件
  try {
    if (typeof plus === 'undefined' && typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return 'download'
    }
  } catch (e) {}

  // App：复制 CSV 文本，用户可粘贴到文件/表格
  try {
    uni.setClipboardData({
      data: csv,
      success: () => {
        uni.showModal({
          title: 'CSV 已复制',
          content: '当前环境未直接生成文件，CSV 内容已复制到剪贴板，可粘贴到表格软件保存。',
          showCancel: false
        })
      }
    })
    return 'clipboard'
  } catch (e) {
    uni.showToast({ title: '导出失败', icon: 'none' })
    return 'failed'
  }
}
