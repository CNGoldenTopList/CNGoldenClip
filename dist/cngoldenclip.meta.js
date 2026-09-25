// ==UserScript==
// @name         CN 金榜 · B站搜索补录
// @namespace    https://cngist.com/
// @version      1.1.1
// @updateURL    https://raw.githubusercontent.com/CNGoldenTopList/CNGoldenClip/main/dist/cngoldenclip.meta.js
// @downloadURL  https://raw.githubusercontent.com/CNGoldenTopList/CNGoldenClip/main/dist/cngoldenclip.user.js
// @homepageURL  https://github.com/CNGoldenTopList/CNGoldenClip
// @supportURL   https://github.com/CNGoldenTopList/CNGoldenClip/issues
// @description  搜索页匹配金榜玩家、预填视频和发布日期，提示已有记录，复用管理员补录接口。
// @match        https://search.bilibili.com/*
// @match        https://www.bilibili.com/video/*
// @match        https://cngist.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      www.bilibili.com
// @connect      cngist.com
// ==/UserScript==
