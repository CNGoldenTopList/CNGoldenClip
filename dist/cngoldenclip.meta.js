// ==UserScript==
// @name         CN 金榜 · B站搜索补录
// @namespace    https://cngist.com/
// @version      1.0.2
// @updateURL    https://raw.githubusercontent.com/Diving-Fish/CNGoldenClip/main/dist/cngoldenclip.meta.js
// @downloadURL  https://raw.githubusercontent.com/Diving-Fish/CNGoldenClip/main/dist/cngoldenclip.user.js
// @homepageURL  https://github.com/Diving-Fish/CNGoldenClip
// @supportURL   https://github.com/Diving-Fish/CNGoldenClip/issues
// @description  搜索页匹配金榜玩家、预填视频和发布日期，提示已有记录，复用管理员补录接口。
// @match        https://search.bilibili.com/*
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
// ==/UserScript==
