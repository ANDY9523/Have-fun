// ============================================================
// 比价机器人 · 加载器（只粘这一段，不用再复制长脚本）
// 作用：联网拉取最新版 pricebot.js 并启动它
// ============================================================

var SRC = "https://andy9523.github.io/valorant-wheel/pricebot.js";

toastLog("正在获取比价脚本…");
var res = http.get(SRC);

if (!res || res.statusCode !== 200) {
  toastLog("下载失败，状态码：" + (res ? res.statusCode : "无响应"));
  toastLog("请确认手机能打开 andy9523.github.io");
  exit();
}

var code = res.body.string();
toastLog("已获取 " + code.length + " 字节");

var path = files.join(files.getSdcardPath(), "pricebot_main.js");
try {
  files.write(path, code);
  toastLog("已保存到 " + path + "，正在启动…");
  engines.execScriptFile(path);
} catch (e) {
  toastLog("落盘失败，改用内存方式：" + e);
  engines.execScript("比价机器人", code);
}
