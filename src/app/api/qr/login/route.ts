import QRCodeLib from 'qrcode'

// 生成「扫码 = 自动登录」的 QR SVG。/ppt 第 9 页 / 海报印刷都用这个。
// 内容 = 硬编码的生产域名 live.nl-dams.com，避免 dev / staging 域名误印到
// 投影或海报上。密码从 server env 读 → SVG 内容里包含明文密码，但密码本来
// 就是会场公开的（贴在门口告示牌），同 /screen 的 QR 同等安全模型。
export async function GET() {
  const password = process.env.EVENT_PASSWORD ?? ''
  const target =
    `https://live.nl-dams.com/auto-login` +
    `?p=${encodeURIComponent(password)}` +
    `&next=${encodeURIComponent('/feed')}`

  const svg = await QRCodeLib.toString(target, {
    type: 'svg',
    margin: 0,
    width: 400,
    color: { dark: '#000000', light: '#ffffff' },
  })

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
