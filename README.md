# 山脊冲刺 · Ridge Run

一款纯前端的无尽爬坡小游戏。驾驶山脊载具一路向上，在燃油耗尽前冲得更远；收集金币，回到车库解锁新车、升级四项性能。

**在线试玩：** https://dcjaychou-design.github.io/Ridge-Run/

## 玩法

- 控制油门与刹车，越过起伏的山脊，稳住车身
- 沿途收集金币；拾取油桶补充燃油
- 腾空时间越长，飞跃等级越高；落地可获得金币奖励
- 腾空时同时按住两只踏板，可大幅稳定车身姿态；地面同时按下时刹车优先
- 翻车会立即结束本程并结算成绩，本程金币计入累计余额；按 `R` 可随时重新开始
- 燃油见底后若车辆停住或滑行超时，也会结束本程
- 金币余额、个人最佳、已解锁车辆与改装等级保存在浏览器本地

## 车库

首页「整备车库」或结算页「升级车辆」进入车库，也可按 `G` 打开。

| 载具 | 解锁条件 | 特点 |
| --- | --- | --- |
| `#07` 阿尔卑斯拉力车 | 默认 | 质量 150 · 双轮 · 均衡好上手 |
| `#12` 山脊轻骑 | 350 金币或最佳 600m | 质量 105 · 双轮 · 空翻扭矩 6.8，空中极灵活 |
| `#88` 极地重卡 | 900 金币或最佳 1200m | 质量 245 · 三轴六轮 · 抗翻稳定 |

每辆车有引擎、悬挂、轮胎、油箱四项独立改装，每项 10 级：

- 引擎：推力 `+8% / 级`
- 悬挂：弹簧刚度 `+4.5% / 级`，阻尼 `+6.5% / 级`
- 轮胎：抓地力 `+7% / 级`
- 油箱：容量 `100 + (level - 1) * 6`，油耗 `-4% / 级`
- 升级费用：`Math.round(20 * 1.42^(level - 1))`

## 操作

| 按键 | 动作 |
| --- | --- |
| `D` / `→` / `Space` | 油门 |
| `A` / `←` | 刹车 / 倒车 |
| `P` / `Esc` | 暂停 / 继续 |
| `R` | 重新开始本程 |
| `M` | 静音 |
| `G` | 打开车库（首页 / 结算页） |
| 触屏 | 右侧油门 · 左侧刹车；腾空时同时按住双踏板稳定车身 |

## 本地开发

需要 Node.js 18+。

```sh
npm install
npm run dev       # Vite 开发服务器，默认 http://localhost:5173
npm run build     # tsc 类型检查 + 生成 dist/ 静态产物
npm run preview   # 本地预览构建结果
```

`vite.config.ts` 使用 `base: "./"`，`dist/` 可直接部署到 GitHub Pages、 itch.io 或任意静态托管目录。

## 技术

Vite + TypeScript，严格模式；Canvas 2D 绘制全部场景与三款载具，Web Audio API 合成引擎与音效，无运行时依赖（仅从 Google Fonts 加载字体）。

```text
src/
├── main.ts                  # 主循环、输入、状态机与子系统装配
├── types.ts                 # 存档 / 载具 / 物理 / 渲染类型
├── constants.ts             # 物理常数、车型规格、升级曲线
├── storage.ts               # v2 存档、v1 迁移与防抖写入
├── utils.ts
├── audio/AudioController.ts # Web Audio 合成器
├── physics/
│   ├── terrain.ts           # heightAt / slopeAt
│   └── VehiclePhysics.ts    # 多轮悬挂刚体求解器
├── render/
│   ├── SkyRenderer.ts
│   ├── MountainRenderer.ts
│   ├── TerrainRenderer.ts
│   ├── VehicleRenderer.ts   # #07 / #12 / #88 三套车体
│   ├── ItemRenderer.ts
│   ├── ParticleSystem.ts
│   ├── JumpFxRenderer.ts
│   └── AtmosphereRenderer.ts
└── ui/
    ├── HudController.ts
    ├── GarageModal.ts
    ├── Overlays.ts
    └── dom.ts
```

旧版 `ridge-run-v1` 存档会在首次启动时自动迁移：继承 `best` 与 `coins`，并初始化车库数据后写入 `ridge-run-v2`。
