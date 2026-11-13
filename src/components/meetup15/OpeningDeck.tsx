import Image from 'next/image'
import { OPENING_SLIDE_COUNT } from '@/lib/meetup15/projection'
import { AdmissionScreen } from './AdmissionScreen'

const slides: { title: string; image: string; alt: string; body: string }[] & { length: typeof OPENING_SLIDE_COUNT } = [
  { title: '扫码入场', image: 'admission', alt: '手机首页的现场入场密码输入框', body: '扫左下角的码即可入场，也可以在活动首页输入现场密码。' },
  { title: '查看活动议程', image: 'home', alt: '手机首页的活动议程', body: '在首页查看时间和嘉宾。点一个议程环节，即可进入对应讨论区。' },
  { title: '设置昵称', image: 'profile', alt: '资料表单中的示例昵称', body: '可以先浏览。在「我的 → 资料」填写昵称后，就能发帖、回复和提问。' },
  { title: '在讨论区发帖', image: 'discussion', alt: '自由讨论区里填好的示例帖子', body: '在自由讨论区发帖，或到议程讨论区加入对应环节的讨论。' },
  { title: '回复帖子', image: 'reply', alt: '手机上展开的帖子和示例回复', body: '点「回复帖子」参与讨论，也可以展开回复，看其他人说了什么。' },
  { title: '给同行发私信', image: 'messages', alt: '手机上的示例私信对话', body: '点对方头像发私信。在「我的 → 私信」打开对应联系人查看对话。' },
  { title: '参与现场问答', image: 'qa', alt: '现场问答中已填写的示例问题', body: '点「前往提问」提交最多 100 字的问题。也可以给想听现场回答的问题点赞。' },
  { title: '查看中奖通知', image: 'raffle', alt: '手机上收到的示例中奖私信', body: '抽奖结果在大屏揭晓。中奖后，到「我的 → 私信」查看官方通知。' },
  { title: '换手机后恢复身份', image: 'recovery', alt: '我的页面中的复制恢复链接按钮', body: '在「我的 → 恢复链接」复制并保存链接，换手机或浏览器后打开它即可恢复身份。' },
]

export function OpeningDeck({ index }: { index: number }) {
  const slide = slides[index] ?? slides[0]

  return (
    <div className="grid min-h-svh place-items-center bg-white">
      <section aria-label="开场介绍" className="w-[min(100%,133.333svh)]">
        <div className="@container aspect-[4/3] rounded-[inherit] bg-white text-dams-ink">
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-[2cqw] px-[5cqw] pt-[4cqw] pb-[3cqw]">
            <div className="grid grid-cols-[minmax(0,1.13fr)_minmax(0,1fr)] items-center gap-[5cqw]" aria-live="polite">
              <div className="grid min-w-0 grid-rows-[20cqw_26cqw] gap-[2.5cqw]">
                <div className="space-y-[1.4cqw]">
                  <h1 className="text-[4.7cqw] leading-tight font-bold text-dams-blue">{slide.title}</h1>
                  <p className="text-[2.5cqw] leading-relaxed">{slide.body}</p>
                </div>
                <div className="w-[22cqw] self-start space-y-[0.5cqw] rounded-[1.5cqw] border border-dams-line p-[1cqw] text-center [&_img]:max-w-none [&_p]:text-[1.75cqw] [&_p]:leading-snug">
                  <AdmissionScreen agenda />
                </div>
              </div>
              <figure className="min-w-0">
                <Image src={`/meetup15-opening/${slide.image}.webp`} alt={slide.alt} width={780} height={1220}
                  unoptimized loading="eager"
                  className="mx-auto h-auto w-[38cqw] max-w-full rounded-[1.5cqw] border border-dams-line shadow-sm" />
              </figure>
            </div>
            <div className="flex items-center justify-between text-[1.65cqw] text-slate-600">
              <span>← → 翻页</span>
              <span role="status" className="tabular-nums">{index + 1} / {slides.length}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
