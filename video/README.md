# 软乎乎 · 打工搭子交互短片

Remotion 制作，1920 × 1080，30 fps，42.6 秒。源画面由当前桌宠实际运行录制，字幕和转场由 React / Remotion 合成。音轨保留产品实际 Web Audio 音效，背景音乐由 `music.mjs` 合成，无外部音乐素材。

## 分镜

| 时间 | 内容 |
| --- | --- |
| 0–4.6 秒 | 上班已经够硬了，搭子要软一点 |
| 4.6–11.6 秒 | 戳戳、揉捏、拉伸和回弹 |
| 11.6–16.6 秒 | 烦躁与气鼓鼓表情 |
| 16.6–29.1 秒 | 老板预警、挥锤驱魔、退散后开心 |
| 29.1–37.1 秒 | 沮丧、戳戳安慰和恢复 |
| 37.1–42.6 秒 | 打工搭子收尾 |

## 再次渲染

在本目录内，使用 Node.js 22 或更高版本：

```sh
npm install
node render.mjs --stills
npm run render
```

输出：`out/softie-workmate.mp4`。`out/cover.png` 为封面。

`src/index.jsx` 控制文字、布局、分镜和混音；`clips.json` 保存素材裁切位置。`npm run studio` 可打开 Remotion 时间线编辑。

## 重新录制

先在根项目启动桌宠网页（默认使用 `http://127.0.0.1:5174/`），再运行：

```sh
npm run capture
node prepare.mjs
node music.mjs
npm run render
```

录制需要根项目的 Playwright 和已安装的 Chrome。第一次录制需安装 Playwright FFmpeg：在根目录执行 `npx playwright install ffmpeg`。`render.mjs` 当前使用 Windows 上 Chrome 的标准安装路径，可按需修改。

视频录制时仅在录制页面放大气泡、显示操作光标，方便观看；不修改桌宠本身。
