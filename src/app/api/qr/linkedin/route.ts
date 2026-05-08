import QRCodeLib from 'qrcode'

// 生成"扫码 = 打开演讲者 LinkedIn"的 QR SVG，中心嵌入 LinkedIn 蓝底白字 in 角标。
// 错误纠正级别 H（30%）能容忍中心 ~22% 面积被 logo 遮挡，扫码不受影响。
//
// 使用 SVG post-processing：先用 qrcode 生成不含 logo 的 SVG，读出 viewBox
// 模块数计算几何中心，再注入一个 LinkedIn 风格的圆角方块 + "in" 文字。比起
// 用 canvas 合成 PNG 更轻 — 可矢量缩放、文件更小、SSR 不需要 node-canvas 依赖。
export async function GET() {
  const url = 'https://www.linkedin.com/in/zhaidewei/'

  const svgRaw = await QRCodeLib.toString(url, {
    type: 'svg',
    margin: 1,
    width: 400,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  })

  const m = svgRaw.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  const size = m ? parseFloat(m[1]) : 41
  const cx = size / 2
  const cy = size / 2
  const logoSize = size * 0.22
  const half = logoSize / 2
  const padding = 0.6
  const overlay = `
    <rect x="${cx - half - padding}" y="${cy - half - padding}" width="${logoSize + padding * 2}" height="${logoSize + padding * 2}" fill="#ffffff"/>
    <rect x="${cx - half}" y="${cy - half}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.18}" fill="#0A66C2"/>
    <text x="${cx}" y="${cy + logoSize * 0.32}" font-family="Helvetica, Arial, sans-serif" font-size="${logoSize * 0.78}" font-weight="900" text-anchor="middle" fill="#ffffff">in</text>
  `

  const svg = svgRaw.replace('</svg>', overlay + '</svg>')

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
