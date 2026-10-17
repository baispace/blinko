# 霞鹜文楷 1.7.0：站点本地资源与 CDN 部署

此目录来自 npm 包 `lxgw-wenkai-webfont@1.7.0`，包含 LXGW WenKai 的 300、400、700 三种字重及其全部字符分片，不包含未使用的 LXGW WenKai Mono 等宽字体。字体分片和字重 CSS 保持上游原样；入口 style.css 仅引入这三种字重。

## 本地部署

项目构建时自动复制本目录。站点字体入口为：

`/font-assets/lxgw-wenkai/1.7.0/style.css`

旧数据库中指向 jsDelivr 上述版本 style.css 的默认配置，前端会自动改用这份本地入口，无需运行数据库重置或重新导入字体。

## 使用站点现有的 CDN 功能

1. 部署包含此目录的新版本。
2. 打开设置中的“静态资源 CDN”，沿用现有的对象存储、CDN 域名和默认路径。
3. 点击原有的“上传静态资源到 CDN”，保留字体资源 `font-assets/lxgw-wenkai/1.7.0/` 的全部文件。
4. 上传完成并启用静态资源 CDN 后刷新页面，字体样式与分片会使用同一套 CDN 地址。

无需新增环境变量、手工解压上传或单独配置字体域名。关闭静态资源 CDN 后刷新页面，字体会恢复使用站内资源。历史默认 jsDelivr 地址也会自动适配。

CDN 跨域使用时，woff2 响应应允许站点域名跨域访问（公开字体可设 `Access-Control-Allow-Origin: *`）。CSS 使用 `text/css`，woff2 使用 `font/woff2`。版本目录内的文件可设 `Cache-Control: public, max-age=31536000, immutable`，升级时另建版本目录。

## 注意

- 不要只上传 `lxgwwenkai-bold-subset-119.woff2`：它仅包含粗体字的一部分字符。
- 不要把几百份分片逐个导入站点的“本地字体”数据库；浏览器通过 CSS 的 unicode-range 按需请求即可。
- 不要修改分片文件名；字重 CSS 通过相对路径引用它们。
- 随资源保留 `OFL.txt` 和 `LICENSE`。
