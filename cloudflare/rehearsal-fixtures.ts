import { MEETUP_SECTIONS } from '../src/lib/meetup15/event'

export const REHEARSAL_ATTENDEES = 200

const topics = [
  '现场认识同行和寻找合作机会',
  '早期创业的客户验证与商业化',
  '在欧洲融资和处理合同',
  '不同背景的创业者如何组队',
  '圆桌分享后的进一步交流',
  '独立顾问如何找到首批客户',
  '欧洲电商和 SaaS 的渠道选择',
  '医疗模型如何进入临床试点',
  '供应链团队如何做好数据协作',
  '能源项目的数据和试点机会',
  '金融产品如何验证早期需求',
  '实验室技术怎样走向商业化',
  '半导体创业如何找到产业伙伴',
  '工业企业如何引入数据产品',
]

const postPrompts = [
  '我想在茶歇时交流「%s」，有人愿意一起聊吗？',
  '关于「%s」，今天哪一点最有启发？',
  '有人在荷兰试过「%s」吗？想听听踩过的坑。',
  '刚记下一些关于「%s」的想法，有兴趣可以在下面交流。',
  '如果只能用一个月尝试「%s」，大家会先做什么？',
]
const questionTopics = ['客户验证', '欧洲融资', '团队搭建', '商业化', '跨境市场', '知识产权', '现金流管理', '技术合作']
const questionPrompts = [
  '关于%s，创业第一年最容易忽略什么？',
  '关于%s，你会怎么判断试点是否值得继续投入？',
  '你能分享一个在%s方面改变原来做法的例子吗？',
  '在%s方面，创始团队应该怎么分工？',
  '要是重新开始，你会更早为%s做哪些准备？',
]

export function rehearsalFixtures(timestamp: number) {
  const members = Array.from({ length: REHEARSAL_ATTENDEES }, (_, i) => ({
    id: crypto.randomUUID(),
    name: '彩排观众 · ' + String(i + 1).padStart(3, '0'),
    lastSeen: timestamp - i * 3,
  }))
  const posts = Object.keys(MEETUP_SECTIONS).flatMap((section, index) =>
    postPrompts.map((prompt, i) => ({
      author: members[index * postPrompts.length + i].id,
      section,
      body: prompt.replace('%s', topics[index]),
      createdAt: timestamp - (index * postPrompts.length + i) * 15,
    })))
  const replies = posts.flatMap((post, i) => [
    {
      target: post.author,
      author: members[70 + i].id,
      body: '我对这个话题感兴趣，想听听具体做法。',
      createdAt: post.createdAt + 4,
    },
    {
      target: post.author,
      author: members[140 + i % 60].id,
      body: '我们也遇到过类似情况，茶歇时可以交流。',
      createdAt: post.createdAt + 8,
    },
  ])
  const questions = questionTopics.flatMap((topic, index) =>
    questionPrompts.map((prompt, i) => ({
      author: members[100 + index * questionPrompts.length + i].id,
      body: prompt.replace('%s', topic),
      answered: Number(i === 4),
      createdAt: timestamp - 240 + index * 10 + i,
    })))
  const likes = [
    ...posts.flatMap((post, i) => [160 + i, 90 + i].map(index => ({
      target: post.author, kind: 'post', member: members[index % REHEARSAL_ATTENDEES].id,
    }))),
    ...questions.flatMap((question, i) => Array.from({ length: 1 + i % 5 }, (_, j) => ({
      target: question.author, kind: 'question', member: members[(i + j * 41) % REHEARSAL_ATTENDEES].id,
    }))),
  ]
  const candidates = members.map(({ id, name }, i) => ({ id, name, weight: i < posts.length ? 3 : 1 }))
  return { members, posts, replies, questions, likes, candidates }
}
