/* Ridge Run · 山脊公报（更新日志 & 活动公告）
 *
 * 如何追加一条新公告：
 * 1. 在 NOTICES 数组最上方新增一条 NoticeEntry，id 必须全局唯一
 *    （推荐 "update-v2.3.0" / "bulletin-2026-12" 这种格式）。
 * 2. 保持“最新一条”排在数组第一项——LATEST_NOTICE_ID 会自动指向它；
 *    首页未读红点依据 save.lastSeenNoticeId !== LATEST_NOTICE_ID 计算。
 * 3. category 决定公告进入哪个 Tab：update = 更新日志，bulletin = 山脊公告。
 * 4. items[].tone 只使用 new / tune / fix / event 四种色调。
 *
 * 公告内容随构建一起打包，不发起任何网络请求。
 */
import type { NoticeEntry } from "./types";

export const NOTICES: NoticeEntry[] = [
  {
    id: "update-v2.2.0",
    category: "update",
    version: "v2.2.0",
    date: "2026-11-12",
    title: "视野拉近、山脊公报与返航优化",
    summary:
      "默认镜头拉近至 36m，新增可随时查阅的山脊公报，并把暂停与结算页的返航路径统一收拾干净。",
    pinned: true,
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "上线「山脊公报」系统，首页右上角提示未读红点，按 N 键或点击入口可随时查阅版本更新与赛段指南。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "默认镜头可视宽度拉近至 36m，首页与暂停菜单支持 28m–52m 无级滑块调节，HUD 右上角支持 32m / 36m / 41m / 46m 四档切换，局内按 [ / ] 可每次 2m 微调。",
      },
      {
        tag: "FIX",
        tone: "fix",
        text: "暂停菜单新增「回到主页」按钮，并将结算页「回到起点」统一更名为「回到主页」（支持快捷键 H）；同步提高 2K 与超宽屏缩放上限至 58。",
      },
    ],
  },
  {
    id: "update-v2.1.0",
    category: "update",
    version: "v2.1.0",
    date: "2026-11-06",
    title: "同屏幽灵、每日试炼、战书挑战与战术战报",
    summary:
      "同一条山脊，所有人跑同一天。幽灵、战书、悬赏与战报把每一次爬坡都变成可以分享的对局。",
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "每日试炼：每日 UTC 零点按日期种子刷新赛道与官方指定车型，全员采用四项 Lv.5 公平规格同场竞技。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "战书挑战与幽灵回放：常规赛自动录制 PB 幽灵（冰川青），粘贴 RR2. 挑战码或打开 #challenge= 链接可与好友 RIVAL 幽灵（琥珀橙）同屏竞速，支持视野外 120m 雷达提示。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "悬赏看板与战术战报：每局追踪 3 项即时悬赏合约；结算页支持一键生成并导出 1200×630 的 PNG 战术战报海报。",
      },
    ],
  },
  {
    id: "update-v2.0.0",
    category: "update",
    version: "v2.0.0",
    date: "2026-11-05",
    title: "山脊车库、四大生态赛段与特技氮气系统",
    summary:
      "车库开门、山脊换季、特技与氮气齐备——这一版把无尽爬坡扩成一条完整的高山试炼道。",
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "山脊车库启用：解锁 #07 阿尔卑斯拉力车、#12 山脊轻骑、#88 极地重卡 三款载具，提供引擎、悬挂、轮胎、油箱四项 10 级永久改装。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "四大生态赛段：每 500m 轮换晨雾松林、高寒冰川（结冰打滑）、赤岩峡谷（泥泞陷车）与极夜山巅（自动车头大灯与波谷上升热气流）。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "特技与局内道具：完成 360° 空翻、贴坡完美落地（最高 ×5 连击）可充能氮气并获额外金币，抬头单轮行驶持续产出火花赏金；赛道新增涡轮气瓶与磁铁信标。",
      },
    ],
  },
  {
    id: "bulletin-welcome",
    category: "bulletin",
    date: "2026-11-12",
    title: "欢迎查阅山脊公报",
    summary:
      "这里是试炼道旁的公告栏。版本更新、赛段规则与驾驶提示都会贴在这里，只在你想看的时候打开。",
    pinned: true,
    items: [
      {
        tag: "EVENT",
        tone: "event",
        text: "公报不会在进入首页时自动打断你；首页只亮起琥珀色未读红点，点击入口或按 N 键即可打开。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "阅后自动存档：红点立即消失，刷新页面也不会重复提示，直到下一次有新公告发布。",
      },
    ],
  },
  {
    id: "bulletin-stage-rules",
    category: "bulletin",
    date: "2026-11-06",
    title: "赛段生态与试炼赏金规则",
    summary:
      "从晨雾松林到极夜山巅，每 500m 都是一套新的抓地力与光线。读懂赛段，再谈赏金。",
    items: [
      {
        tag: "EVENT",
        tone: "event",
        text: "四大生态每 500m 切换（晨雾松林 → 高寒冰川 → 赤岩峡谷 → 极夜山巅），2000m 完成一轮循环后地形起伏继续加大。",
      },
      {
        tag: "EVENT",
        tone: "event",
        text: "每日试炼于 UTC 零点刷新；当日首次完赛且距离 >150m 奖励 +40 金币，每次刷新今日最佳且距离 >200m 再奖励 +25 金币。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "战书挑战锁定出题者的地形种子与模式规格；结算距离超越对手目标即可斩获 +35 金币挑战赏金。",
      },
    ],
  },
  {
    id: "bulletin-driving-tips",
    category: "bulletin",
    date: "2026-11-06",
    title: "进阶驾驶与控姿手册",
    summary:
      "油门不是唯一的答案。学会读坡、控姿与分配燃油，山脊会把你送得更远。",
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "空中控姿：腾空时油门抬车头、刹车压车头；若旋转过快，同时按住油门与刹车双踏板可大幅增加旋转阻尼、迅速稳住车身。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "氮气与连击：空翻每满一圈奖励 +12 金币并补发 0.8s 氮气；滞空满 0.45s 且贴坡落地可触发完美落地连击（奖励 5×连击 金币与 1.6s 氮气）。",
      },
      {
        tag: "FIX",
        tone: "fix",
        text: "燃油与脱困：燃油低于 20% 时警报闪烁，下坡滑行比盲目轰油更省油；若车体卡死超过 4s 且燃油充足，会自动消耗 15% 燃油退回安全坡面脱困。",
      },
    ],
  },
];

/** 最新一条公告的 id；首页未读红点据此判断。 */
export const LATEST_NOTICE_ID = NOTICES[0]?.id ?? "";
