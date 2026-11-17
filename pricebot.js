/*
 * 比价机器人 · AutoX.js 脚本
 * ------------------------------------------------------------
 * 作用：在安卓手机上自动/半自动读取淘宝、京东、拼多多、得物的商品搜索结果，
 *      把「标题 + 价格」整理成 JSON 放进剪贴板，再粘贴到 compare.html 里自动填表。
 *
 * 运行环境：AutoX.js（Auto.js 的开源分支）
 *   - 需要开启「无障碍服务」
 *   - 悬浮球模式还需要「悬浮窗权限」
 *   - 安卓 7.0 以上
 *
 * 两种模式：
 *   1) 全自动：自动依次打开四个 App 搜索关键词并抓取（依赖各 App 的 deeplink，
 *      版本更新后可能失效，失效时脚本会记录并在日志里提示）。
 *   2) 悬浮抓取（推荐，最稳）：用户自己打开 App 搜到结果页，点一下悬浮球，
 *      脚本读取当前屏幕上的文字，抓出价格。四个 App 各点一次即可。
 *
 * 注意：脚本只能读取当前屏幕上已经渲染出来的文字，不做任何登录、不改数据。
 *      各 App 有反爬和广告位，价格可能夹杂「券后」「起」等字样，结果请自己再确认。
 * ------------------------------------------------------------
 */

"ui";

// ================= 配置 =================
var CONFIG = {
  waitAfterOpen: 6500,   // 打开 App 后等待加载
  scrollTimes: 2,        // 每个平台下滑几次以加载更多商品
  scrollWait: 1200,
  maxItems: 8,           // 每个平台最多保留几个候选
  platforms: [
    {
      name: "淘宝",
      pkg: "com.taobao.taobao",
      url: function (kw) { return "taobao://s.taobao.com/search?q=" + encodeURIComponent(kw); }
    },
    {
      name: "京东",
      pkg: "com.jingdong.app.mall",
      url: function (kw) {
        var p = { des: "productList", keyWord: kw };
        return "openapp.jdmobile://virtual?params=" + encodeURIComponent(JSON.stringify(p));
      }
    },
    {
      name: "拼多多",
      pkg: "com.xunmeng.pinduoduo",
      url: function (kw) {
        return "pinduoduo://com.xunmeng.pinduoduo/search_result.html?search_key=" + encodeURIComponent(kw);
      }
    },
    {
      name: "得物",
      pkg: "com.shizhuang.duapp",
      url: function (kw) { return "dewu://search?keyword=" + encodeURIComponent(kw); }
    }
  ]
};

var RESULT = {};   // { 平台名: [{title, price, raw}] }

// ================= 界面 =================
ui.layout(
  <scroll>
    <vertical padding="16">
      <text text="比价机器人" textSize="22sp" textStyle="bold" textColor="#111111"/>
      <text text="读取四个 App 的搜索结果，生成可粘贴的比价数据" textSize="12sp" textColor="#777777" marginTop="4"/>

      <input id="kw" hint="想买什么？例如 罗技 G304" marginTop="16" textSize="16sp"/>

      <horizontal marginTop="12">
        <button id="runAll" text="全自动跑四个 App" layout_weight="1" textSize="14sp"/>
        <button id="floatBtn" text="悬浮抓取" layout_weight="1" textSize="14sp" marginLeft="8"/>
      </horizontal>

      <button id="copyBtn" text="复制结果 JSON" marginTop="8" textSize="14sp"/>
      <button id="clearBtn" text="清空结果" marginTop="8" textSize="13sp"/>

      <text text="日志" textSize="13sp" textColor="#999999" marginTop="16"/>
      <text id="log" textSize="12sp" textColor="#333333" marginTop="4"/>
    </vertical>
  </scroll>
);

var LOG_LINES = [];
function log(msg) {
  var line = "[" + new Date().toTimeString().slice(0, 8) + "] " + msg;
  LOG_LINES.push(line);
  if (LOG_LINES.length > 200) LOG_LINES.shift();
  ui.run(function () { ui.log.setText(LOG_LINES.join("\n")); });
}

// ================= 抓取逻辑 =================

// 价格文本判定：「¥129」「￥129.00」「129元」「券后129」
function isPriceText(t) {
  if (!t) return false;
  if (t.length > 18) return false;
  return /([¥￥]\s?\d+(\.\d{1,2})?)|(\d+(\.\d{1,2})?\s?元)|(券后\s?\d+)/.test(t);
}

function priceValue(t) {
  var m = String(t).match(/\d+(\.\d{1,2})?/);
  return m ? parseFloat(m[0]) : null;
}

// 读取当前屏幕所有文本节点
function screenTexts() {
  var out = [];
  var nodes = className("android.widget.TextView").find();
  for (var i = 0; i < nodes.length; i++) {
    try {
      var t = nodes[i].text();
      if (t && t.trim()) out.push(t.trim());
    } catch (e) {}
  }
  return out;
}

// 把「价格」和它前面最近的、不像价格的文本配对成一条商品
function pairItems(texts) {
  var items = [];
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    if (!isPriceText(t)) continue;
    var title = "";
    for (var j = i - 1; j >= 0 && j >= i - 3; j--) {
      var prev = texts[j];
      if (!prev) continue;
      if (isPriceText(prev)) continue;
      if (/^(包邮|已售|广告|直播|新品|券|领券|分期|官方|旗舰店)/.test(prev) && prev.length < 6) continue;
      title = prev;
      break;
    }
    var p = priceValue(t);
    if (p === null || p <= 0) continue;
    items.push({ title: title.slice(0, 40), price: p, raw: t });
  }
  return items;
}

// 抓一次当前屏幕
function grabOnce() {
  var texts = screenTexts();
  return pairItems(texts);
}

function addResult(platform, items) {
  if (!items || !items.length) return 0;
  if (!RESULT[platform]) RESULT[platform] = [];
  RESULT[platform] = RESULT[platform].concat(items);
  // 按价格升序，只留前 N 条
  RESULT[platform].sort(function (a, b) { return a.price - b.price; });
  RESULT[platform] = RESULT[platform].slice(0, CONFIG.maxItems);
  return items.length;
}

// 自动模式：打开 deeplink → 等待 → 抓 → 下滑再抓
function autoRun(keyword) {
  RESULT = {};
  CONFIG.platforms.forEach(function (pf) {
    try {
      log("打开 " + pf.name + " …");
      app.openUrl(pf.url(keyword));
      sleep(CONFIG.waitAfterOpen);

      var total = 0;
      total += addResult(pf.name, grabOnce());

      for (var s = 0; s < CONFIG.scrollTimes; s++) {
        swipe(device.width / 2, device.height * 0.75, device.width / 2, device.height * 0.3, 400);
        sleep(CONFIG.scrollWait);
        total += addResult(pf.name, grabOnce());
      }

      log(pf.name + "：" + (RESULT[pf.name] ? RESULT[pf.name].length : 0) + " 条候选（本次新增 " + total + "）");
      back();
      sleep(800);
    } catch (e) {
      log(pf.name + " 失败：" + e);
    }
  });
  finishAuto();
}

function finishAuto() {
  var payload = buildPayload();
  setClip(JSON.stringify(payload, null, 2));
  log("已完成，JSON 已复制到剪贴板（共 " + countAll() + " 条），去 compare.html 点「粘贴机器人结果」");
  toast("已复制，去网页粘贴");
}

function buildPayload() {
  var out = { tool: "pricebot", version: 1, time: new Date().toISOString(), keyword: ui.kw.text(), data: {} };
  Object.keys(RESULT).forEach(function (k) {
    out.data[k] = RESULT[k].map(function (it) {
      return { title: it.title, price: it.price };
    });
  });
  return out;
}

function countAll() {
  var n = 0;
  Object.keys(RESULT).forEach(function (k) { n += RESULT[k].length; });
  return n;
}

// ================= 悬浮抓取模式 =================
var floatWin = null;

function toggleFloat() {
  if (floatWin) {
    floatWin.close();
    floatWin = null;
    log("悬浮球已关闭");
    return;
  }
  if (!floaty.checkPermission()) {
    toast("请先授予悬浮窗权限");
    floaty.requestPermission();
    return;
  }
  floatWin = floaty.rawWindow(
    <frame gravity="center">
      <button id="ball" text="抓" w="64" h="64" textSize="16sp" bg="#3DD68C" textColor="#04240f"/>
    </frame>
  );
  floatWin.setPosition(40, 420);
  floatWin.setTouchable(true);

  floatWin.ball.on("click", function () {
    threads.start(function () {
      var items = grabOnce();
      if (!items.length) {
        toast("这一屏没读到价格，滑动一下再点");
        return;
      }
      var appName = currentPackage();
      var name = platformNameOf(appName) || ("未知(" + appName + ")");
      var n = addResult(name, items);
      toast(name + " 抓到 " + n + " 条，最低 ¥" + RESULT[name][0].price);
      log(name + " 新增 " + n + " 条，累计 " + RESULT[name].length);
      var payload = buildPayload();
      setClip(JSON.stringify(payload, null, 2));
    });
  });
  log("悬浮球已开启：切到 App 搜索结果页，点一下「抓」，四个 App 各点一次");
}

function platformNameOf(pkg) {
  for (var i = 0; i < CONFIG.platforms.length; i++) {
    if (CONFIG.platforms[i].pkg === pkg) return CONFIG.platforms[i].name;
  }
  return null;
}

// ================= 事件 =================
ui.runAll.click(function () {
  var kw = ui.kw.text().trim();
  if (!kw) { toast("先输入想买的东西"); return; }
  if (!auto.waitFor()) { toast("请先开启无障碍服务"); return; }
  threads.start(function () { autoRun(kw); });
});

ui.floatBtn.click(function () {
  if (!auto.waitFor()) { toast("请先开启无障碍服务"); return; }
  toggleFloat();
});

ui.copyBtn.click(function () {
  if (!countAll()) { toast("还没有结果"); return; }
  setClip(JSON.stringify(buildPayload(), null, 2));
  toast("JSON 已复制");
});

ui.clearBtn.click(function () {
  RESULT = {};
  LOG_LINES = [];
  ui.log.setText("");
  toast("已清空");
});

// 启动检查
if (!auto.waitFor()) {
  toast("请先开启无障碍服务再运行");
}
log("就绪。输入关键词后点「全自动」，或者用「悬浮抓取」手动逐个抓。");
