/* Ridge Run · 山脊公报（更新日志 & 活动公告）
 *
 * 如何追加一条新公告：
 * 1. 在 NOTICES 数组最上方新增一条 NoticeEntry，id 必须全局唯一
 *    （推荐 "update-v1.3.0" / "bulletin-2026-12" 这种格式）。
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
    id: "update-v1.2.0",
    category: "update",
    version: "v1.2.0",
    date: "2026-11-12",
    title: "镜头视野：把山脊拉近一点",
    summary:
      "默认镜头从远景拉近至 36m，并加入 28m–52m 的手动视野调节。落点、坡度与起跳距离，都比以前更容易读清。",
    pinned: true,
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "默认可视宽度拉近至 36m，发车即可看清前轮落点与坡面起伏。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "首页与暂停菜单新增视野滑杆，可在 28m–52m 间调节；按 [ / ] 每次微调 2m。",
      },
      {
        tag: "FIX",
        tone: "fix",
        text: "统一 2K 与超宽屏下的镜头缩放上限，近景构图不再因屏幕比例跑偏。",
      },
    ],
  },
  {
    id: "update-v1.1.0",
    category: "update",
    version: "v1.1.0",
    date: "2026-10-28",
    title: "每日试炼与好友战书",
    summary:
      "同一条山脊，所有人跑同一天。每日试炼带来固定种子与公平规格，战书挑战则让好友的对局原样重现在你的屏幕上。",
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "每日试炼：每天 UTC 零点刷新地形种子与官方车型，全员使用 Lv.5 公平规格。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "战书挑战：复制挑战链接或粘贴 RR2. 挑战码，即可在完全相同的地形上同屏竞速。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "PB 幽灵回放与实时领先差显示，让每一次刷新纪录都有同屏参照。",
      },
    ],
  },
  {
    id: "update-v1.0.0",
    category: "update",
    version: "v1.0.0",
    date: "2026-10-12",
    title: "车库开张 · 三车十级改装",
    summary:
      "整备车间正式启用：三款性格迥异的山脊机器、四项十级改装，以及一块会轮换的悬赏看板。",
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "阿尔卑斯拉力车、山脊摩托与重型雪地卡车三款车型，各自拥有独立的悬挂与动力手感。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "引擎、悬挂、轮胎、燃油四项改装各十级，改装与解锁永久保存在本地车库。",
      },
      {
        tag: "EVENT",
        tone: "event",
        text: "悬赏看板上线：单局达成即结算金币，每程结束后自动轮换下一批合约。",
      },
    ],
  },
  {
    id: "bulletin-welcome",
    category: "bulletin",
    date: "2026-11-12",
    title: "欢迎来到山脊公报",
    summary:
      "这里是试炼道旁的公告栏。版本更新、赛段规则与驾驶提示都会贴在这里，只在你想看的时候打开。",
    pinned: true,
    items: [
      {
        tag: "EVENT",
        tone: "event",
        text: "公报不会在进入首页时自动打断你；点击首页右上角入口或按 N 键即可阅读。",
      },
      {
        tag: "NEW",
        tone: "new",
        text: "有新内容时，首页入口会亮起琥珀色呼吸红点；读完立即存档，刷新后不再重复提示。",
      },
    ],
  },
  {
    id: "bulletin-stage-rules",
    category: "bulletin",
    date: "2026-11-06",
    title: "赛段规则速览",
    summary:
      "无尽爬坡会穿过晨雾松林、冰川、峡谷与夜峰。每 500m 切换一段风土，任意一程都可能刷新个人最佳。",
    items: [
      {
        tag: "EVENT",
        tone: "event",
        text: "每日试炼按 UTC 零点跨日刷新；跨日后的第一程会重新抽取种子、官方车型与今日最佳。",
      },
      {
        tag: "EVENT",
        tone: "event",
        text: "每日首程超过 150m 可领取首日悬赏，超过 200m 且刷新今日最佳可再领纪录悬赏。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "战书使用出题者的地形种子；载入后双方在同一条山脊上竞速，先越过对手距离者胜。",
      },
    ],
  },
  {
    id: "bulletin-driving-tips",
    category: "bulletin",
    date: "2026-10-30",
    title: "驾驶技巧：把山脊当作跳板",
    summary:
      "油门不是唯一的答案。学会读坡、控姿与分配燃油，山脊会把你送得更远。",
    items: [
      {
        tag: "NEW",
        tone: "new",
        text: "腾空时油门抬车头、刹车压车头；落地前把车身摆回坡面，可触发完美落地连击。",
      },
      {
        tag: "TUNE",
        tone: "tune",
        text: "后轮着地、前轮抬起保持平衡会持续产出单轮奖励；连续完美落地还能叠加氮气。",
      },
      {
        tag: "FIX",
        tone: "fix",
        text: "燃油告急时优先寻找红色油桶；下坡滑行比原地轰油更省油，卡住时等待自动脱困会消耗燃油。",
      },
    ],
  },
];

/** 最新一条公告的 id；首页未读红点据此判断。 */
export const LATEST_NOTICE_ID = NOTICES[0]?.id ?? "";
