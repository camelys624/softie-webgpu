# softie · 软乎乎。

[![License: MIT](https://img.shields.io/github/license/yuanyang749/softie-webgpu)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-softie.520ai.site-4c6ef5)](https://softie.520ai.site)
[![WebGPU](https://img.shields.io/badge/WebGPU-native-22863a)](https://www.w3.org/TR/webgpu/)
[![Three.js](https://img.shields.io/badge/three.js-0.185-black)](https://threejs.org)
[![GitHub stars](https://img.shields.io/github/stars/yuanyang749/softie-webgpu?style=social)](https://github.com/yuanyang749/softie-webgpu/stargazers)

一个原生 WebGPU 的 Three.js 软体小玩具。在线体验：[https://softie.520ai.site](https://softie.520ai.site)

## 运行

```sh
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。生产构建与预览：

```sh
npm run build
npm run preview
```

预览地址 http://127.0.0.1:4173 。`dist` 可以作为静态站点部署；线上需要 HTTPS，本地使用 localhost。

## Arch Linux 桌面宠物

项目提供透明、置顶的 Electron 桌面宠物，不依赖 Vite 开发服务器。Arch Linux 上先安装构建与运行依赖：

```sh
sudo pacman -S nodejs npm electron
npm install
```

直接启动桌面宠物：

```sh
npm run desktop
```

鼠标悬停到宠物顶部可显示拖动把手；右键宠物或点击托盘图标后选择「随你揉捏」，会打开可连续操作的独立设置面板，也可按 `Ctrl+,` 打开。窗口初始位置遵循桌面状态区习惯：Linux/macOS 在右上角，Windows 在右下角。`Ctrl+Q` 或托盘菜单可退出。

生成 Arch 安装包：

```sh
npm run package:arch
sudo pacman -U ./softie-desktop-1.0.0-1-x86_64.pkg.tar.zst
```

安装包运行时只依赖系统 `electron`，加载本地构建的 `dist`，不启动开发服务器；桌面宠物仍只使用原生 WebGPU，不提供 WebGL 回退。

## 玩法

- 蟹老板式上司每隔 25–55 秒随机附身，冒出催需求、挑刺的气泡；揉捏时推迟登场。网页点击「老板来了」，或桌宠右键 / 托盘菜单选择同名入口，也能主动召唤。
- 老板采用已确认的「背手训话」造型：原版果冻、小眼睛和紫色高腰裤，半垂眼皮、挑眉坏笑。挨敲后从嘴硬变为圆眼护头，针对刚才的要求改口，最后装扮散开，软乎乎松口气。设计约定与台词见 `reference/boss-design.md`。
- 净化星锤使用奶油粉锤头、金色星星与魔杖柄，随窗口放大并避开表情。命中出现净化光环、星屑和轻铃音，驱散时光环收拢；尊重静音及减少动态效果设置。
- 附身时鼠标移到老板身上变成卡通玩具锤；点击、按住连续敲击，或按空格反击。从首次命中起 2 秒后退场，后续打击不延长时间；完全不打则登场 5 秒后退场。原桌宠颜色、配件和揉捏玩法保留。
- 在史莱姆上按住：局部凹陷；拖动：拎起、拉伸与横向揉捏。
- 松手：带惯性落回看不见的桌面，压扁后晃着恢复。
- 「戳一下」或空格：弹一下。
- 三种颜色、软硬、阻尼实时调整；「恢复默认」重置。
- 支持触摸、指针取消与失焦释放；滑块支持键盘。
- 右上角「中文 / EN」切换完整界面语言，首次默认中文；记住手动选择，切换不重置颜色或物理参数。
- 鼠标移动时眼睛轻轻跟随，离开页面后平滑回正；触摸设备保持自然视线。
- 点击或空格：惊讶圆嘴；按住：舒服眯眼；松手：开心笑；换色：俏皮眨眼；闲置时偶尔自然眨眼。
- 尊重系统「减少动态效果」设置，关闭新增的自动眨眼与视线跟随。

## 实现

- Three.js **0.185.1**，显式 `Renderer` + `WebGPUBackend` + `StandardNodeLibrary`，`getFallback: null`。
- 没有 WebGL 回退。WebGPU 初始化或设备连接失败会显示明确状态。
- 固定 **120 Hz** 模态弹簧物理：体积保持的挤压/拉伸、惯性剪切、局部按压、重力和桌面接触。
- 身体与五官的每个顶点使用同一个连续变形场；五官不以刚体跟随。
- 表情先在局部空间插值并重新贴合表面，再进入同一物理变形场；单一状态控制器协调表情优先级，没有竞争的定时器。
- 凝胶使用实体 transmission、折射、吸收色和 clearcoat。工作室环境贴图在启动时用 WebGPU PMREM 烘焙。
- 116 个实例化气泡；无实时阴影贴图和全屏后处理。DPR 范围 1–1.5，持续低帧率时逐级降至 1。
- FPS 是实际渲染帧统计，不是预置数字。最新浏览器检查、硬件信息、实际渲染性能和截图路径记录在 `artifacts/test-results.json`；此前的设计验证记录见 `artifacts/qa-report.md`。

## 验证与设计证据

```sh
npm test
npm run test:browser
npm run test:boss
TEST_URL=http://127.0.0.1:4173 npm run test:browser
```

自动化需要本机安装 Chrome，使用 headless 原生 WebGPU，不启动可见 Chrome 窗口。Codex 内置浏览器用于截图对照与交互调试，两个环境的测量分开记录。

- `reference/target.png`：先生成的目标效果图。
- `reference/image-prompt.txt`：生成提示词；使用内置 image_gen 工具。
- `reference/user-slime.png`：用户提供的视觉参考。
- `reference/design-analysis.md`：目标图的布局分析。
- `reference/implementation-plan.md`：实现约束、预算和技能工作流。
- `artifacts/`：实际浏览器截图及测试报告。

参考图不参与运行时渲染，页面中的史莱姆是真实可变形 3D 网格。

## API 参考

- [Three.js WebGPU 手册](https://threejs.org/manual/en/webgpurenderer)
- [Three.js WebGPURenderer 文档](https://threejs.org/docs/pages/WebGPURenderer.html)

Three.js 默认的 WebGPURenderer 包含自动后备逻辑，本项目直接组合 WebGPUBackend 与 Renderer，从构造层面移除后备路径。

## License

Released under the [MIT License](LICENSE).
