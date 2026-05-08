'use client'

import { useEffect } from 'react'

// 入场介绍 9 屏 deck。原先放 public/intro.html 通过 next.config rewrites
// /ppt → /intro.html 暴露，但 OpenNext Cloudflare adapter 下：
//   1. /intro.html 被 Next.js 强制 strip 后缀 → 307 → /intro → 404
//   2. /ppt 的 rewrites 没生效（worker 里的 page handler 直接 404）
// 所以 port 成真正的 Next.js page。CSS 里把 `html, body { ... }` 改写成
// 作用于 `.ppt-shell` 的样式，避免污染 root layout 的 body 类。

const STYLES = `
  .ppt-shell {
    --bg: #0a0e1a;
    --bg-2: #111827;
    --fg: #f5f5f5;
    --muted: #9ca3af;
    --accent: #fbbf24;
    --accent-2: #60a5fa;
    --pink: #f472b6;
    --green: #34d399;
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
  }
  .ppt-shell, .ppt-shell *, .ppt-shell *::before, .ppt-shell *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .ppt-shell .deck {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  .ppt-shell .slide {
    position: absolute;
    inset: 0;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 4rem 6rem;
    opacity: 0;
    transition: opacity .45s ease;
  }
  .ppt-shell .slide.active {
    display: flex;
    opacity: 1;
  }
  .ppt-shell .eyebrow {
    color: var(--muted);
    font-size: 1.4rem;
    letter-spacing: .25em;
    margin-bottom: 2rem;
    text-transform: uppercase;
  }
  .ppt-shell h1 {
    font-size: 6rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -.02em;
    text-align: center;
  }
  .ppt-shell h1 .hl { color: var(--accent); }
  .ppt-shell h1 .hl-2 { color: var(--accent-2); }
  .ppt-shell h1 .hl-pink { color: var(--pink); }
  .ppt-shell h2 {
    font-size: 4rem;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 2.5rem;
    text-align: center;
  }
  .ppt-shell h2 .hl { color: var(--accent); }
  .ppt-shell .lead {
    font-size: 2.4rem;
    color: var(--muted);
    text-align: center;
    line-height: 1.5;
    max-width: 1200px;
  }
  .ppt-shell .big {
    font-size: 8rem;
    font-weight: 900;
    color: var(--accent);
    line-height: 1;
    margin: 1.5rem 0;
  }
  .ppt-shell .pill {
    display: inline-block;
    padding: .35em .9em;
    border-radius: 999px;
    background: rgba(251, 191, 36, .15);
    color: var(--accent);
    font-size: 1.4rem;
    font-weight: 600;
    margin-bottom: 2rem;
    letter-spacing: .05em;
  }
  .ppt-shell .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    width: 100%;
    max-width: 1500px;
    margin-top: 1rem;
  }
  .ppt-shell .card {
    background: var(--bg-2);
    border: 1px solid #1f2937;
    border-radius: 1.5rem;
    padding: 2.5rem 2rem;
    text-align: left;
  }
  .ppt-shell .card .quote {
    font-size: 1.9rem;
    line-height: 1.4;
    color: var(--fg);
    font-weight: 500;
    margin-bottom: 1rem;
  }
  .ppt-shell .card .who {
    font-size: 1.2rem;
    color: var(--muted);
  }
  .ppt-shell .stack {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
    width: 100%;
    max-width: 1100px;
    margin-top: 2rem;
  }
  .ppt-shell .row {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    background: var(--bg-2);
    padding: 1.5rem 2rem;
    border-radius: 1rem;
    border-left: 6px solid var(--accent);
    font-size: 1.9rem;
  }
  .ppt-shell .row .num {
    font-size: 2.4rem;
    font-weight: 800;
    color: var(--accent);
    min-width: 3rem;
  }
  .ppt-shell .flow-step {
    background: var(--bg-2);
    border-radius: 1.2rem;
    padding: 2rem 1.5rem;
    text-align: center;
    border: 2px solid #1f2937;
  }
  .ppt-shell .flow-step .label {
    font-size: 1rem;
    color: var(--muted);
    letter-spacing: .15em;
    text-transform: uppercase;
    margin-bottom: .8rem;
  }
  .ppt-shell .flow-step .text {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.3;
  }
  .ppt-shell .flow-step.highlight {
    border-color: var(--accent);
    background: rgba(251, 191, 36, .08);
  }
  .ppt-shell .match-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    width: 100%;
    max-width: 1300px;
    margin-top: 1rem;
  }
  .ppt-shell .match-side {
    background: var(--bg-2);
    border: 2px solid #1f2937;
    border-radius: 1.2rem;
    padding: 1.8rem 1.6rem;
    text-align: center;
  }
  .ppt-shell .match-tag {
    display: inline-block;
    padding: .25em .8em;
    border-radius: 999px;
    background: rgba(251, 191, 36, .15);
    color: var(--accent);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: .05em;
    margin-bottom: 1rem;
  }
  .ppt-shell .match-title {
    font-size: 2.2rem;
    font-weight: 800;
    color: var(--fg);
    margin-bottom: .6rem;
  }
  .ppt-shell .match-sub {
    font-size: 1.2rem;
    color: var(--fg);
    line-height: 1.5;
    margin-bottom: 1rem;
  }
  .ppt-shell .match-eg {
    font-size: 1.1rem;
    color: var(--accent-2);
    background: rgba(96, 165, 250, .08);
    padding: .6rem .9rem;
    border-radius: .5rem;
    font-style: italic;
  }
  .ppt-shell .match-merge {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 1.5rem;
    width: 100%;
  }
  .ppt-shell .match-arrow {
    font-size: 2.5rem;
    color: var(--muted);
    margin-bottom: .8rem;
  }
  .ppt-shell .cta-grid {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1.2rem;
    width: 100%;
    margin-top: .5rem;
  }
  .ppt-shell .cta-left {
    text-align: center;
    flex-shrink: 0;
  }
  .ppt-shell .cta-url {
    font-size: 3.4rem;
    font-weight: 800;
    color: var(--accent);
    margin-bottom: .8rem;
    word-break: break-all;
  }
  .ppt-shell .cta-pwd {
    font-size: 1.4rem;
    color: var(--muted);
  }
  .ppt-shell .qr-placeholder {
    width: 100%;
    aspect-ratio: 1;
    max-width: 260px;
    margin: 0 auto;
    background: #fff;
    border-radius: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #111;
    font-size: 1.1rem;
    text-align: center;
    padding: 1rem;
  }
  .ppt-shell .qr-placeholder img {
    width: 100%;
    height: 100%;
    border-radius: 1rem;
  }
  .ppt-shell .credits {
    margin-top: 1.4rem;
    text-align: center;
    font-size: 1rem;
    line-height: 1.6;
    color: var(--muted);
  }
  .ppt-shell .credits-label {
    font-size: .75rem;
    letter-spacing: .3em;
    color: var(--muted);
    opacity: .75;
    margin-bottom: .25rem;
  }
  .ppt-shell .credits-body strong {
    color: var(--fg);
    font-weight: 600;
  }
  .ppt-shell .speaker-card {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.8rem;
    margin-top: .8rem;
    padding: 1rem 2rem;
    background: var(--bg-2);
    border: 1px solid #1f2937;
    border-radius: 1rem;
  }
  .ppt-shell .speaker-info { text-align: left; }
  .ppt-shell .speaker-label {
    font-size: .8rem;
    color: var(--muted);
    letter-spacing: .2em;
    text-transform: uppercase;
    margin-bottom: .3rem;
  }
  .ppt-shell .speaker-name {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--fg);
    line-height: 1.15;
    margin-bottom: 0;
  }
  .ppt-shell .speaker-name-en {
    display: block;
    font-size: .95rem;
    font-weight: 500;
    color: var(--muted);
    letter-spacing: .03em;
    margin-top: .2rem;
  }
  .ppt-shell .speaker-qr {
    width: 155px;
    background: white;
    padding: .4rem;
    border-radius: .5rem;
    text-align: center;
    flex-shrink: 0;
  }
  .ppt-shell .speaker-qr img {
    width: 100%;
    display: block;
    border-radius: .25rem;
  }
  .ppt-shell .speaker-qr-label {
    color: #111;
    font-size: .85rem;
    margin-top: .25rem;
    font-weight: 600;
  }
  .ppt-shell .ppt-nav {
    position: fixed;
    bottom: 1.5rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2.5rem;
    color: var(--muted);
    font-size: 1rem;
    pointer-events: none;
    z-index: 10;
  }
  .ppt-shell .ppt-nav .hint { opacity: .5; }
  .ppt-shell .ppt-nav .counter { font-variant-numeric: tabular-nums; }
  .ppt-shell .ppt-progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 4px;
    background: var(--accent);
    transition: width .4s ease;
    z-index: 10;
  }
  .ppt-shell .accent-line {
    display: block;
    color: var(--accent);
    font-weight: 800;
  }
  @media (max-width: 1024px) {
    .ppt-shell h1 { font-size: 3.5rem; }
    .ppt-shell h2 { font-size: 2.5rem; }
    .ppt-shell .lead { font-size: 1.4rem; }
    .ppt-shell .big { font-size: 5rem; }
    .ppt-shell .slide { padding: 2rem; }
    .ppt-shell .cards { grid-template-columns: 1fr; }
    .ppt-shell .match-grid { grid-template-columns: 1fr; }
    .ppt-shell .cta-url { font-size: 2.2rem; }
  }
`

const BODY = `
<div class="ppt-progress" id="ppt-progress"></div>
<div class="deck" id="deck">

  <section class="slide active">
    <div class="eyebrow">DAMS Meetup #14 · 2026.05.09</div>
    <h1>
      把 <span class="hl">200 人</span> 的会场<br>
      变成一张<span class="hl-2">实时桌</span>
    </h1>
    <p class="lead" style="margin-top:2.5rem">
      荷兰华人数据群 · 线下会议临时互动论坛
    </p>
  </section>

  <section class="slide">
    <div class="pill">先聊一个浪费</div>
    <h2>你来线下 meetup，<br>最贵的成本是什么？</h2>
    <p class="lead">
      不是门票，不是来回的火车票。<br><br>
      是<span class="accent-line">你只能聊到旁边那 5 个人</span><br>
      其余 <strong style="color:var(--pink)">195 个人</strong> 的需求、机会、想法 —— 你永远不会知道。
    </p>
  </section>

  <section class="slide">
    <h2>这些场景，你熟吗？</h2>
    <div class="cards">
      <div class="card">
        <div class="quote">"我在找数据岗内推，<br>但我不知道对面那桌谁在 Booking。"</div>
        <div class="who">— 求职者</div>
      </div>
      <div class="card">
        <div class="quote">"我有个 side project 想找联创，<br>但喊一嗓子怪尴尬的。"</div>
        <div class="who">— 想做事的人</div>
      </div>
      <div class="card">
        <div class="quote">"在荷兰 sponsor 转工作怎么聊？<br>这种问题不好公开问。"</div>
        <div class="who">— 谁问都会脸红</div>
      </div>
    </div>
  </section>

  <section class="slide">
    <div class="pill">我们的解</div>
    <h2>一个<span class="hl">实时广播</span>的房间</h2>
    <div class="stack">
      <div class="row"><div class="num">1.</div><div>发一条帖子，<strong>全场 200 人</strong>同时看到</div></div>
      <div class="row"><div class="num">2.</div><div>板块跟着议程切 · <strong>信息再多也不被淹没</strong></div></div>
      <div class="row"><div class="num">3.</div><div>投票、QA、抽奖、大屏直播 —— 都是<strong>实时同步</strong></div></div>
    </div>
  </section>

  <section class="slide">
    <div class="pill" style="background:rgba(96,165,250,.15);color:var(--accent-2)">★ 重点功能</div>
    <h2>AI 撮合 ——<br>需要你<span class="hl">两侧都发声</span></h2>
    <div class="match-grid">
      <div class="match-side">
        <div class="match-tag">求方 · 发帖时</div>
        <div class="match-title">暗需求</div>
        <div class="match-sub">"我现在想找什么"<br><span style="color:var(--muted)">（写在帖子里，仅 AI 可见）</span></div>
        <div class="match-eg">例："想找数据岗内推"</div>
      </div>
      <div class="match-side">
        <div class="match-tag" style="background:rgba(244,114,182,.15);color:var(--pink)">供方 · 「我」tab</div>
        <div class="match-title">我能提供什么</div>
        <div class="match-sub">"我有什么经验 / 资源"<br><span style="color:var(--muted)">（profile 写一次，常驻）</span></div>
        <div class="match-eg">例："Booking SRE 5 年，可聊面试内推"</div>
      </div>
    </div>
    <div class="match-merge">
      <div class="match-arrow">↓</div>
      <div class="flow-step highlight" style="max-width:560px">
        <div class="label">每 30 分钟 · DeepSeek 交叉匹配</div>
        <div class="text" style="margin-top:.5rem">在你帖子下留言<br><strong style="color:var(--accent)">"你和 X 可能可以聊聊"</strong></div>
      </div>
    </div>
  </section>

  <section class="slide">
    <h2>为什么这件事 <span class="hl">非 AI 不可</span>？</h2>
    <div class="cards">
      <div class="card">
        <div class="quote" style="color:var(--accent)">看得过来</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          200 人的信息和帖子<br>你刷不完，AI 一次扫完
        </div>
      </div>
      <div class="card">
        <div class="quote" style="color:var(--accent)">挖得出来</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          "招 PM" 和 "想跳槽做 PM"<br>关键词不一样，AI 看得出
        </div>
      </div>
      <div class="card">
        <div class="quote" style="color:var(--accent)">说得出口</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          尴尬的搭话由 AI 替你开<br>双方都不丢面子
        </div>
      </div>
    </div>
  </section>

  <section class="slide">
    <div class="pill">顺便讲两句基础设施</div>
    <h2>进门不烦、署名可控、<br>散场不丢</h2>
    <div class="cards">
      <div class="card">
        <div class="quote" style="color:var(--accent)">无密码登录</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          一个<strong>会场密码</strong>进门<br>
          浏览器自动认你 · 不用注册
        </div>
      </div>
      <div class="card">
        <div class="quote" style="color:var(--accent)">看 vs 说</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          浏览 / 点赞 <strong>可以匿名</strong><br>
          发帖 / 撮合 <strong>需要署名</strong> · VIP 自动实名
        </div>
      </div>
      <div class="card">
        <div class="quote" style="color:var(--accent)">7 天回看 · 7 天后清空</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          会后 7 天还能浏览 / 换设备<br>
          <strong>过期自动删数据</strong> · 不留隐私尾巴
        </div>
      </div>
    </div>
  </section>

  <section class="slide">
    <div class="pill">大屏 × 全场互动</div>
    <h2>嘉宾听不清、举手数不清、<br>抽奖现场乱糟糟</h2>
    <div class="cards">
      <div class="card">
        <div class="quote" style="color:var(--accent)">人人都能问</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          <strong>不用抢话筒</strong> · 按点赞排序<br>
          大屏滚动 · 嘉宾照着读
        </div>
      </div>
      <div class="card">
        <div class="quote" style="color:var(--accent)">实时投票</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          VIP 发起单选 / 多选<br>
          <strong>柱状图实时更新</strong> · 可藏结果
        </div>
      </div>
      <div class="card">
        <div class="quote" style="color:var(--accent)">幸运抽奖</div>
        <div class="who" style="font-size:1.4rem;color:var(--fg);line-height:1.5;margin-top:.5rem">
          从<strong>1 小时内活跃</strong>的人里抽<br>
          大屏滚动 · 中奖私信通知
        </div>
      </div>
    </div>
  </section>

  <section class="slide">
    <div class="eyebrow">现在就打开</div>
    <div class="cta-grid">
      <div class="qr-placeholder">
        <img src="/api/qr/login" alt="扫码登录 live.nl-dams.com" />
      </div>
      <div class="cta-left">
        <div class="cta-url">live.nl-dams.com</div>
        <div class="cta-pwd"><span style="font-size:1.6rem">扫上方二维码 一键登录</span></div>
      </div>
    </div>
    <div class="credits">
      <div class="credits-label">鸣 谢</div>
      <div class="credits-body">
        共同开发 / 测试：<strong>孙喆</strong> · <strong>秦婧</strong><br>
        以及所有参与内测的小伙伴
      </div>
    </div>
    <div class="speaker-card">
      <div class="speaker-info">
        <div class="speaker-label">关于我</div>
        <div class="speaker-name">翟德炜<span class="speaker-name-en">Dewei Zhai</span></div>
      </div>
      <div class="speaker-qr">
        <img src="/api/qr/linkedin" alt="LinkedIn QR" />
        <div class="speaker-qr-label">LinkedIn</div>
      </div>
      <div class="speaker-qr">
        <img src="/speaker-xiaohongshu.png" alt="小红书 QR" />
        <div class="speaker-qr-label">小红书</div>
      </div>
    </div>
  </section>

</div>

<div class="ppt-nav">
  <span class="hint">← → 翻页 · F 全屏</span>
  <span class="counter" id="ppt-counter">1 / 9</span>
</div>
`

export default function PptPage() {
  useEffect(() => {
    const root = document.querySelector('.ppt-shell')
    if (!root) return
    const slides = root.querySelectorAll<HTMLElement>('.slide')
    const counter = document.getElementById('ppt-counter')
    const progress = document.getElementById('ppt-progress')
    let i = 0

    const show = (n: number) => {
      i = Math.max(0, Math.min(slides.length - 1, n))
      slides.forEach((s, idx) => s.classList.toggle('active', idx === i))
      if (counter) counter.textContent = `${i + 1} / ${slides.length}`
      if (progress) progress.style.width = `${((i + 1) / slides.length) * 100}%`
      history.replaceState(null, '', `#${i + 1}`)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        show(i + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        show(i - 1)
      } else if (e.key === 'Home') {
        show(0)
      } else if (e.key === 'End') {
        show(slides.length - 1)
      } else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
        else document.exitFullscreen?.()
      }
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('a')) return
      const x = e.clientX / window.innerWidth
      show(x < 0.3 ? i - 1 : i + 1)
    }

    document.addEventListener('keydown', onKey)
    root.addEventListener('click', onClick as EventListener)

    const hash = parseInt(location.hash.replace('#', ''), 10)
    show(Number.isFinite(hash) && hash > 0 ? hash - 1 : 0)

    return () => {
      document.removeEventListener('keydown', onKey)
      root.removeEventListener('click', onClick as EventListener)
    }
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="ppt-shell" dangerouslySetInnerHTML={{ __html: BODY }} />
    </>
  )
}
