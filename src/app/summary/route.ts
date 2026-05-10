import { SUMMARY_HTML } from './summary-html'

export const dynamic = 'force-static'

export function GET() {
  return new Response(SUMMARY_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
