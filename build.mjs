import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const releaseBase = 'https://raw.githubusercontent.com/Diving-Fish/CNGoldenClip/main/dist';
await mkdir(resolve(root, 'dist'), { recursive: true });
const header = `// ==UserScript==
// @name         CN 金榜 · B站搜索补录
// @namespace    https://cngist.com/
// @version      ${version}
// @updateURL    ${releaseBase}/cngoldenclip.meta.js
// @downloadURL  ${releaseBase}/cngoldenclip.user.js
// @homepageURL  https://github.com/Diving-Fish/CNGoldenClip
// @supportURL   https://github.com/Diving-Fish/CNGoldenClip/issues
// @description  搜索页匹配金榜玩家、预填视频和发布日期，提示已有记录，复用管理员补录接口。
// @match        https://search.bilibili.com/*
// @match        https://www.bilibili.com/video/*
// @match        https://cngist.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      www.bilibili.com
// ==/UserScript==`;
await build({ entryPoints: [resolve(root, 'src/entry.mjs')], outfile: resolve(root, 'dist/cngoldenclip.user.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'chrome110', charset: 'utf8', banner: { js: header }, legalComments: 'inline' });
await writeFile(resolve(root, 'dist/cngoldenclip.meta.js'), header + '\n');
console.log(`Built CNGoldenClip ${version}`);
