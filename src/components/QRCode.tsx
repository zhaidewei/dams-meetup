import QRCodeLib from 'qrcode'

type Props = {
  value: string
  size?: number
}

export async function QRCode({ value, size = 160 }: Props) {
  const svg = await QRCodeLib.toString(value, {
    type: 'svg',
    margin: 0,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return (
    <div
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
