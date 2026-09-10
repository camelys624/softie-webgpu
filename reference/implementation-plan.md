# Softie · 可玩的软乎乎

## 目标与验收
- 单页无输赢减压玩具：按住局部凹陷 → 拖拽拎起 → 放手下落 → 桌面接触压扁 → 衰减回弹。
- 对照先生成的 `target.png` 实现浅灰留白、草莓凝胶、内含气泡、黑豆眼和微笑；桌面不画实体。
- 脸与身体的所有顶点使用相同的连续变形函数，不是随位置移动的硬质眼球。
- Three.js 0.185.1，显式 Renderer + WebGPUBackend + StandardNodeLibrary；没有注册 WebGL fallback。
- 目标桌面 60 fps：1/120 s 固定物理步长，单个主循环，自适应 DPR 1–1.5。
- 构建通过、物理单测通过、真实浏览器按压/拖拽/颜色/滑块/按钮/取消指针测试；桌面和移动布局截图。

## 桌面交付
- 目标运行形态为 Arch Linux 桌面应用，不依赖开发服务器；Electron 桌面壳加载构建后的 `dist`。
- 桌面壳保持原生 WebGPU 路径，不注册 WebGL fallback；Linux 运行时依赖系统 `electron`。
- `npm run desktop` 启动本地桌面窗口；`npm run package:arch` 生成可由 `pacman -U` 安装的 `.pkg.tar.zst`。
- Arch 包包含本地静态资源、桌面菜单项和 `softie` 启动器；浏览器自动化仍作为独立 WebGPU 验收路径。

## 图像分析与模型策略
- 参考图：浅暖灰 #f5f5f3；黑色标题；草莓粉为唯一主彩色。史莱姆圆润、略扁、底部压平，宽高约 1.34。
- 主体是连续参数曲面，并非刚体球；细节为 116 个实例化内部气泡、共享变形场的贴肤五官。
- 内置 image_gen 生成视觉目标，再转译为可变形网格。目标图只作设计参考，不贴进 canvas 冒充实时 3D。
- 3D/其他生成器探测：TRIPO_API_KEY=MISSING；GEMINI_API_KEY=MISSING；ELEVENLABS_API_KEY=MISSING。无运行时外部资产或 API。
- 用户没有要求声音、关卡、障碍或分数：保持单页触觉体验，不加旁支功能。

## 技术美术预算
- 主体约 12k 三角形，气泡实例化，五官合并；目标含 transmission pass < 80k 三角形、< 20 draw calls。
- 单次 WebGPU PMREM 工作室灯卡烘焙；2 方向灯 + 半球填光。
- 1 个高成本凝胶 transmission 材质；1 个黑色亮面五官材质；1 个共享气泡材质。
- 接触阴影用径向渐变贴图，每帧按高度缩放衰减；无 shadow map、无 bloom、无全屏后处理。
- 默认 DPR 上限 1.5，持续低于 52 fps 时逐级降至 1。低分辨率保持模型、材质、交互不变。

## 工作流记录
- Director / graphics / debug / QA 技能已加载；UI 与 physics 由独立 worker 读取对应技能和参考后实现。
- 先图像目标，再基础渲染与截图对齐，最后交互/细节和测量。
- 浏览器按用户后续要求使用 Codex 内置浏览器调试；自动化测试单独标注 headless Chrome 环境，不混同。
