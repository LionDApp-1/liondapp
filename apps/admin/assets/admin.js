const API = "/api";
const ADMIN_URL = "https://admin.liondapp.1ion.top";
const SUPPORTED_VIEWS = ["overview", "works", "content", "reports", "people", "promotions", "system"];
const store = {
  view: "overview",
  contentType: "needs",
  language: localStorage.getItem("liondapp-admin-language") === "zh" ? "zh" : "en",
  works: [], needs: [], comments: [], reports: [], users: [], promotions: [],
  announcements: [], moderation: [], audit: [],
};

const I18N = {
  en: {
    "system.tips": "Project tips", "action.checkTips": "Check connection",
    "system.tipScope": "Checks Mainnet and the SKR Mint only. Does not enable tipping or transfer funds.",
    "system.tipReady": "Mainnet connection and SKR Mint verified. Tip switch: {state}. Wallet acceptance and regional eligibility still require separate verification.",
    "system.tipOn": "on", "system.tipOff": "off",
    "brand.overview": "LionDApp overview", "brand.console": "Operator Console", "language.label": "Console language",
    "nav.label": "Console navigation", "nav.overview": "Overview", "nav.works": "Work review", "nav.content": "Content",
    "nav.reports": "Reports", "nav.people": "People", "nav.promotions": "Promotions", "nav.system": "System",
    "status.connecting": "Connecting", "status.protected": "Administrator session protected", "status.pending": "Pending",
    "status.all": "All statuses", "status.published": "Published", "status.rejected": "Rejected", "status.open": "Open",
    "status.resolved": "Resolved", "status.dismissed": "Dismissed", "status.active": "Active", "status.blocked": "Blocked",
    "status.deleted": "Deleted", "status.confirmed": "Confirmed", "status.quoted": "Quoted", "status.failed": "Failed",
    "status.expired": "Expired", "section.operations": "OPERATIONS", "section.moderation": "MODERATION",
    "section.community": "COMMUNITY", "section.safety": "SAFETY", "section.identities": "IDENTITIES",
    "section.recommendations": "RECOMMENDATIONS", "section.control": "CONTROL",
    "auth.title": "Administrator sign-in required", "auth.message": "Sign in with your LionDApp administrator account.",
    "auth.action": "Sign in again", "auth.error": "Administrator session expired. Sign in again.",
    "overview.metrics": "Platform metrics", "overview.attention": "Needs attention", "overview.platform": "Platform status",
    "overview.updated": "Updated {time}", "overview.environment": "Environment", "overview.payments": "Payments",
    "overview.api": "API", "overview.healthy": "Healthy", "overview.adminAccess": "Admin access",
    "overview.protected": "Protected", "overview.work": "Work", "overview.report": "Report",
    "metric.activeUsers": "Active identities", "metric.needs": "Needs", "metric.publishedWorks": "Published works",
    "metric.pendingWorks": "Pending review", "metric.openReports": "Open reports", "metric.comments": "Comments",
    "metric.activePromotions": "Active promotions", "metric.catalogApps": "Store catalog",
    "metric.blockedUsers": "Blocked identities", "metric.moderation24h": "Blocked in 24h",
    "works.search": "Search name, creator, or category", "works.status": "Work status", "works.review": "WORK REVIEW",
    "works.introduction": "Introduction", "works.features": "Features", "works.openDemo": "Open demo video",
    "works.imageAlt": "Work image", "content.type": "Content type", "content.needs": "Needs",
    "content.comments": "Comments", "content.works": "Works", "content.search": "Search content or .skr",
    "content.needCount": "{count} need", "content.commentCount": "{count} comments", "content.likeCount": "{count} likes",
    "reports.search": "Search report, target, or reporter", "reports.status": "Report status",
    "reports.reportedBy": "Reported by {identity}", "people.search": "Search .skr identity",
    "people.status": "Identity status", "people.joined": "Joined {time}", "people.counts": "{needs} needs · {works} works · {comments} comments",
    "promotions.search": "Search work or buyer", "promotions.status": "Promotion status", "promotions.ends": "Ends {time}",
    "system.price": "Recommendation price", "system.wholeSkr": "Whole SKR", "system.catalog": "Store catalog",
    "system.announcement": "Publish announcement", "system.moderationEvents": "Moderation events", "system.audit": "Audit log",
    "system.duration": "{days} days · {environment} · {mode}", "system.activeApps": "Active apps",
    "system.totalRecords": "Total records", "system.translatedApps": "LionDApp Chinese results", "system.lastSync": "Last sync", "system.pinned": "Pinned",
    "form.titleEn": "English title", "form.titleZh": "Chinese title", "form.bodyEn": "English body",
    "form.bodyZh": "Chinese body", "form.pin": "Pin announcement", "confirm.title": "Confirm action",
    "confirm.note": "Review note", "action.refresh": "Refresh current view", "action.openQueue": "Open queue",
    "action.open": "Open", "action.inspect": "Inspect", "action.approve": "Approve", "action.reject": "Reject",
    "action.remove": "Remove", "action.dismiss": "Dismiss", "action.resolve": "Resolve", "action.removeTarget": "Remove target",
    "action.block": "Block", "action.unblock": "Unblock", "action.updatePrice": "Update price", "action.sync": "Sync now", "action.translate": "Generate next 3",
    "action.publish": "Publish", "action.delete": "Delete", "action.cancel": "Cancel", "action.confirm": "Confirm",
    "action.close": "Close", "count.of": "{shown} of {total}", "count.records": "{count} records", "count.recent": "{count} recent",
    "empty.records": "No records", "toast.complete": "{action} complete", "toast.price": "Price updated to {price} SKR",
    "toast.announcement": "Announcement published", "dialog.approveTitle": "Approve work",
    "dialog.rejectTitle": "Reject work", "dialog.reviewMessage": "{action} {name}?",
    "dialog.removeTitle": "Remove content", "dialog.removeMessage": "Remove this content from LionDApp? The action is recorded in the audit log.",
    "dialog.resolveTitle": "Resolve report", "dialog.dismissTitle": "Dismiss report",
    "dialog.reportMessage": "Update this report status?", "dialog.blockTitle": "Block identity",
    "dialog.unblockTitle": "Unblock identity", "dialog.identityMessage": "{action} {identity}?",
    "dialog.syncTitle": "Sync Store catalog", "dialog.syncMessage": "Start one bounded catalog synchronization batch?", "dialog.translateTitle": "Generate LionDApp Chinese results", "dialog.translateMessage": "Create Chinese display text for the next 3 imported results inside LionDApp? The official Store is not changed.",
    "dialog.deleteAnnouncementTitle": "Delete announcement", "dialog.deleteAnnouncementMessage": "Remove this announcement from the app?",
    "table.identity": "Identity", "table.surface": "Surface", "table.category": "Category", "table.time": "Time",
    "table.actor": "Actor", "table.action": "Action", "table.target": "Target", "error.request": "Request failed. Try again.",
  },
  zh: {
    "system.tips": "项目打赏", "action.checkTips": "检查连接",
    "system.tipScope": "仅检查主网连接和 SKR Mint，不开启打赏，不产生转账。",
    "system.tipReady": "主网连接及 SKR Mint 校验通过。打赏开关：{state}。实机付款与地区适用性仍需单独核实。",
    "system.tipOn": "已开启", "system.tipOff": "已关闭",
    "brand.overview": "LionDApp 后台概览", "brand.console": "运营管理后台", "language.label": "后台语言",
    "nav.label": "后台导航", "nav.overview": "概览", "nav.works": "作品审核", "nav.content": "内容管理",
    "nav.reports": "举报处理", "nav.people": "用户管理", "nav.promotions": "推荐记录", "nav.system": "系统设置",
    "status.connecting": "正在连接", "status.protected": "管理员会话保护", "status.pending": "待审核",
    "status.all": "全部状态", "status.published": "已发布", "status.rejected": "已拒绝", "status.open": "待处理",
    "status.resolved": "已解决", "status.dismissed": "已驳回", "status.active": "正常", "status.blocked": "已封禁",
    "status.deleted": "已删除", "status.confirmed": "已确认", "status.quoted": "待支付", "status.failed": "失败",
    "status.expired": "已过期", "section.operations": "运营", "section.moderation": "审核",
    "section.community": "社区", "section.safety": "安全", "section.identities": "用户",
    "section.recommendations": "推荐", "section.control": "控制",
    "auth.title": "需要管理员登录", "auth.message": "请使用你设置的 LionDApp 管理员账号登录。",
    "auth.action": "重新登录", "auth.error": "管理员登录已过期，请重新登录。",
    "overview.metrics": "平台指标", "overview.attention": "待处理事项", "overview.platform": "平台状态",
    "overview.updated": "更新时间：{time}", "overview.environment": "运行环境", "overview.payments": "支付模式",
    "overview.api": "接口服务", "overview.healthy": "正常", "overview.adminAccess": "后台访问",
    "overview.protected": "已保护", "overview.work": "作品", "overview.report": "举报",
    "metric.activeUsers": "正常用户", "metric.needs": "需求总数", "metric.publishedWorks": "已发布作品",
    "metric.pendingWorks": "待审核作品", "metric.openReports": "待处理举报", "metric.comments": "评论总数",
    "metric.activePromotions": "推荐中作品", "metric.catalogApps": "商店应用",
    "metric.blockedUsers": "封禁用户", "metric.moderation24h": "24 小时拦截",
    "works.search": "搜索作品名、开发者或分类", "works.status": "作品状态", "works.review": "作品审核",
    "works.introduction": "一句话介绍", "works.features": "详细功能", "works.openDemo": "打开演示视频",
    "works.imageAlt": "作品图片", "content.type": "内容类型", "content.needs": "需求",
    "content.comments": "评论", "content.works": "作品", "content.search": "搜索内容或 .skr 域名",
    "content.needCount": "{count} 个需要", "content.commentCount": "{count} 条评论", "content.likeCount": "{count} 个赞",
    "reports.search": "搜索举报、目标或举报人", "reports.status": "举报状态",
    "reports.reportedBy": "举报人：{identity}", "people.search": "搜索 .skr 用户",
    "people.status": "用户状态", "people.joined": "加入时间：{time}", "people.counts": "{needs} 个需求 · {works} 个作品 · {comments} 条评论",
    "promotions.search": "搜索作品或购买人", "promotions.status": "推荐状态", "promotions.ends": "结束于 {time}",
    "system.price": "推荐价格", "system.wholeSkr": "整数 SKR", "system.catalog": "商店目录",
    "system.announcement": "发布公告", "system.moderationEvents": "内容拦截记录", "system.audit": "后台操作日志",
    "system.duration": "{days} 天 · {environment} · {mode}", "system.activeApps": "有效应用",
    "system.totalRecords": "全部记录", "system.translatedApps": "LionDApp 已有中文结果", "system.lastSync": "最近同步", "system.pinned": "置顶",
    "form.titleEn": "英文标题", "form.titleZh": "中文标题", "form.bodyEn": "英文正文",
    "form.bodyZh": "中文正文", "form.pin": "置顶公告", "confirm.title": "确认操作",
    "confirm.note": "审核备注", "action.refresh": "刷新当前页面", "action.openQueue": "打开审核队列",
    "action.open": "打开", "action.inspect": "查看", "action.approve": "通过", "action.reject": "拒绝",
    "action.remove": "删除", "action.dismiss": "驳回", "action.resolve": "解决", "action.removeTarget": "删除被举报内容",
    "action.block": "封禁", "action.unblock": "解封", "action.updatePrice": "更新价格", "action.sync": "立即同步", "action.translate": "生成下 3 个",
    "action.publish": "发布", "action.delete": "删除", "action.cancel": "取消", "action.confirm": "确认",
    "action.close": "关闭", "count.of": "{shown}/{total}", "count.records": "{count} 条记录", "count.recent": "最近 {count} 条",
    "empty.records": "暂无记录", "toast.complete": "{action}完成", "toast.price": "推荐价格已更新为 {price} SKR",
    "toast.announcement": "公告已发布", "dialog.approveTitle": "通过作品",
    "dialog.rejectTitle": "拒绝作品", "dialog.reviewMessage": "确认{action}“{name}”吗？",
    "dialog.removeTitle": "删除内容", "dialog.removeMessage": "确认从 LionDApp 删除此内容吗？该操作会记录在后台日志中。",
    "dialog.resolveTitle": "解决举报", "dialog.dismissTitle": "驳回举报",
    "dialog.reportMessage": "确认更新这条举报的状态吗？", "dialog.blockTitle": "封禁用户",
    "dialog.unblockTitle": "解封用户", "dialog.identityMessage": "确认{action} {identity} 吗？",
    "dialog.syncTitle": "同步商店目录", "dialog.syncMessage": "确认启动一次有限批量的商店目录同步吗？", "dialog.translateTitle": "生成 LionDApp 中文搜索结果", "dialog.translateMessage": "为下 3 条已导入结果生成 LionDApp 内的中文展示文本吗？这不会修改官方 dApp 商店。",
    "dialog.deleteAnnouncementTitle": "删除公告", "dialog.deleteAnnouncementMessage": "确认从应用中删除这条公告吗？",
    "table.identity": "用户", "table.surface": "内容区域", "table.category": "分类", "table.time": "时间",
    "table.actor": "操作者", "table.action": "操作", "table.target": "目标", "error.request": "请求失败，请重试。",
  },
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const lower = (value) => String(value ?? "").toLowerCase();
const t = (key, values = {}) => {
  const template = I18N[store.language][key] ?? I18N.en[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};
const dateTime = (value) => value ? new Intl.DateTimeFormat(store.language === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const statusLabel = (value) => I18N[store.language][`status.${lower(value)}`] ?? String(value);
const badge = (value) => `<span class="badge ${escapeHtml(lower(value))}">${escapeHtml(statusLabel(value))}</span>`;
const emptyMarkup = () => `<div class="empty-state">${escapeHtml(t("empty.records"))}</div>`;
const safeExternalUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch (_) {
    return null;
  }
};
const mediaUrl = (key) => `/api/media/${String(key).split("/").map(encodeURIComponent).join("/")}`;

function applyLanguage() {
  document.documentElement.lang = store.language === "zh" ? "zh-CN" : "en";
  document.title = store.language === "zh" ? "LionDApp 运营管理后台" : "LionDApp Console";
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => { node.title = t(node.dataset.i18nTitle); });
  document.querySelectorAll("[data-language]").forEach((button) => {
    const active = button.dataset.language === store.language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderTipReadiness();
}

function renderTipReadiness() {
  byId("tip-readiness").textContent = store.tipReadiness ? t("system.tipReady", { state: t(store.tipReadiness.enabled ? "system.tipOn" : "system.tipOff") }) : "";
}

function apiErrorMessage(code) {
  if (["admin_authentication_required", "admin_assertion_invalid", "admin_forbidden"].includes(code)) return t("auth.error");
  const known = {
    positive_integer_required: store.language === "zh" ? "请输入大于 0 的整数。" : "Enter a positive whole number.",
    invalid_review_decision: store.language === "zh" ? "审核结果无效。" : "The review decision is invalid.",
    not_found: store.language === "zh" ? "目标记录不存在或已被删除。" : "The record was not found or was removed.",
  };
  return known[code] ?? (code && !String(code).includes(" ") ? `${t("error.request")} (${code})` : code || t("error.request"));
}

async function request(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { "content-type": "application/json", "x-liondapp-admin": "1", ...(options.headers || {}) } });
  const type = response.headers.get("content-type") || "";
  const accessRedirect = response.redirected && response.url.includes("cloudflareaccess.com");
  if (accessRedirect || response.status === 401 || response.status === 403 || (!type.includes("application/json") && response.ok)) {
    byId("auth-required").classList.remove("hidden");
    const error = new Error(t("auth.error"));
    error.code = "admin_authentication_required";
    throw error;
  }
  const body = response.status === 204 ? null : type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const code = body?.error || body || `HTTP ${response.status}`;
    const error = new Error(apiErrorMessage(code));
    error.code = code;
    throw error;
  }
  byId("auth-required").classList.add("hidden");
  return body;
}

let toastTimer;
function showStatus(message, error = false) {
  const node = byId("status");
  node.textContent = message;
  node.classList.toggle("error", error);
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 5200);
}

async function run(task, success) {
  try {
    const result = await task();
    if (success) showStatus(success);
    return result;
  } catch (error) {
    showStatus(error.message || t("error.request"), true);
    throw error;
  }
}

async function withBusy(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await action();
  } catch (_) {
    // run() already shows a localized error.
  } finally {
    button.disabled = false;
  }
}

function openView(view) {
  store.view = view;
  document.querySelectorAll(".sidebar [data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("hidden", section.id !== view));
  history.replaceState(null, "", `#${view}`);
  void loadView(view).catch(() => {});
}

async function loadView(view) {
  if (view === "overview") return loadOverview();
  if (view === "works") return loadWorks();
  if (view === "content") return loadContent();
  if (view === "reports") return loadReports();
  if (view === "people") return loadPeople();
  if (view === "promotions") return loadPromotions();
  if (view === "system") return loadSystem();
}

async function loadOverview() {
  const [overview, works, reports] = await run(() => Promise.all([request("/admin/overview"), request("/admin/works"), request("/admin/reports")]));
  store.overview = overview;
  store.works = works.items;
  store.reports = reports.items;
  const metrics = overview.metrics;
  const cards = [
    ["metric.activeUsers", metrics.activeUsers, "accent"], ["metric.needs", metrics.needs, ""],
    ["metric.publishedWorks", metrics.publishedWorks, ""], ["metric.pendingWorks", metrics.pendingWorks, metrics.pendingWorks ? "attention" : ""],
    ["metric.openReports", metrics.openReports, metrics.openReports ? "attention" : ""], ["metric.comments", metrics.comments, ""],
    ["metric.activePromotions", metrics.activePromotions, "accent"], ["metric.catalogApps", metrics.catalogApps, ""],
    ["metric.blockedUsers", metrics.blockedUsers, ""], ["metric.moderation24h", metrics.moderation24h, metrics.moderation24h ? "attention" : ""],
  ];
  byId("metric-grid").innerHTML = cards.map(([key, value, tone]) => `<article class="metric ${tone}"><span>${escapeHtml(t(key))}</span><strong>${Number(value).toLocaleString()}</strong></article>`).join("");
  byId("overview-time").textContent = t("overview.updated", { time: dateTime(overview.generatedAt) });
  byId("environment").textContent = `${overview.environment} · ${overview.paymentMode}`;
  byId("pending-nav").textContent = metrics.pendingWorks;
  byId("reports-nav").textContent = metrics.openReports;
  const attention = [
    ...store.works.filter((item) => item.moderation_status === "pending").slice(0, 4).map((item) => ({ title: item.name, meta: `${t("overview.work")} · ${item.author_skr}`, view: "works" })),
    ...store.reports.filter((item) => item.status === "open").slice(0, 4).map((item) => ({ title: item.reason, meta: `${t("overview.report")} · ${item.target_label || item.target_id}`, view: "reports" })),
  ].slice(0, 6);
  byId("attention-list").innerHTML = attention.length ? attention.map((item) => `<button class="compact-row link-button" data-open-view="${item.view}"><span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></span><span>${escapeHtml(t("action.open"))}</span></button>`).join("") : emptyMarkup();
  byId("platform-status").innerHTML = `<div><dt>${t("overview.environment")}</dt><dd>${escapeHtml(overview.environment)}</dd></div><div><dt>${t("overview.payments")}</dt><dd>${escapeHtml(overview.paymentMode)}</dd></div><div><dt>${t("overview.api")}</dt><dd>${t("overview.healthy")}</dd></div><div><dt>${t("overview.adminAccess")}</dt><dd>${t("overview.protected")}</dd></div>`;
  bindOpenView();
}

async function loadWorks() {
  const data = await run(() => request("/admin/works"));
  store.works = data.items;
  renderWorks();
}

function renderWorks() {
  const query = lower(byId("work-search").value);
  const status = byId("work-filter").value;
  const items = store.works.filter((item) => (status === "all" || item.moderation_status === status) && lower(`${item.name} ${item.author_skr} ${item.category} ${item.summary}`).includes(query));
  byId("work-count").textContent = t("count.of", { shown: items.length, total: store.works.length });
  byId("work-list").innerHTML = items.length ? items.map((item) => `<article class="record"><div class="record-main"><h2 class="record-title">${escapeHtml(item.name)} ${badge(item.moderation_status)} ${item.policy_violation ? `<span class="badge rejected">${escapeHtml(store.language === "zh" ? "已屏蔽 · 规则命中" : "Hidden · policy match")}</span>` : ""}</h2><p class="record-meta">${escapeHtml(item.author_skr)} · ${escapeHtml(item.category)} · ${dateTime(item.created_at)}</p><p class="record-copy">${escapeHtml(item.summary)}</p></div><div class="record-actions"><button data-work-detail="${escapeHtml(item.id)}">${t("action.inspect")}</button>${item.moderation_status !== "published" && !item.policy_violation ? `<button class="primary" ${item.policy_violation ? "disabled" : ""} data-review="${escapeHtml(item.id)}" data-decision="published">${t("action.approve")}</button>` : ""}${item.moderation_status === "pending" ? `<button class="danger" data-review="${escapeHtml(item.id)}" data-decision="rejected">${t("action.reject")}</button>` : ""}${item.moderation_status === "published" ? `<button class="danger" data-remove="works" data-id="${escapeHtml(item.id)}">${t("action.remove")}</button>` : ""}</div></article>`).join("") : emptyMarkup();
  bindWorkActions();
}

function openWork(item) {
  if (!item) return;
  byId("detail-eyebrow").textContent = t("works.review");
  byId("detail-title").textContent = item.name;
  const images = [item.icon_key, ...(item.screenshots || [])].filter(Boolean);
  const demoUrl = safeExternalUrl(item.demo_url);
  byId("detail-body").innerHTML = `<p class="record-meta">${escapeHtml(item.author_skr)} · ${escapeHtml(item.category)} · ${dateTime(item.created_at)}</p><h3>${t("works.introduction")}</h3><p>${escapeHtml(item.summary)}</p><h3>${t("works.features")}</h3><p>${escapeHtml(item.description)}</p>${demoUrl ? `<p><a href="${escapeHtml(demoUrl)}" target="_blank" rel="noopener noreferrer">${t("works.openDemo")}</a></p>` : ""}<div class="media-strip">${images.map((key) => `<img src="${mediaUrl(key)}" alt="${escapeHtml(t("works.imageAlt"))}" loading="lazy">`).join("")}</div>`;
  byId("detail-actions").innerHTML = item.moderation_status === "pending" ? `<button class="danger" data-review="${escapeHtml(item.id)}" data-decision="rejected">${t("action.reject")}</button><button class="primary" ${item.policy_violation ? "disabled" : ""} data-review="${escapeHtml(item.id)}" data-decision="published">${t("action.approve")}</button>` : "";
  bindWorkActions();
  byId("detail-dialog").showModal();
}

function bindWorkActions() {
  document.querySelectorAll("[data-work-detail]").forEach((button) => { button.onclick = () => openWork(store.works.find((item) => item.id === button.dataset.workDetail)); });
  document.querySelectorAll("[data-review]").forEach((button) => {
    button.onclick = () => {
      const item = store.works.find((work) => work.id === button.dataset.review);
      const approve = button.dataset.decision === "published";
      const action = approve ? t("action.approve") : t("action.reject");
      askConfirm({
        title: approve ? t("dialog.approveTitle") : t("dialog.rejectTitle"),
        message: t("dialog.reviewMessage", { action, name: item?.name || "" }),
        label: action, danger: !approve, note: true,
        action: async (note) => {
          await request(`/admin/works/${button.dataset.review}/review`, { method: "POST", body: JSON.stringify({ decision: button.dataset.decision, note }) });
          byId("detail-dialog").close();
          await loadWorks();
          await refreshCounts();
        },
      });
    };
  });
  bindRemoveActions();
}

async function loadContent() {
  const [needs, comments, works] = await run(() => Promise.all([request("/admin/needs"), request("/admin/comments"), request("/admin/works")]));
  store.needs = needs.items; store.comments = comments.items; store.works = works.items;
  renderContent();
}

function renderContent() {
  const query = lower(byId("content-search").value);
  let items;
  if (store.contentType === "needs") {
    items = store.needs.filter((item) => lower(`${item.title} ${item.problem} ${item.author_skr} ${item.category}`).includes(query)).map((item) => ({ id: item.id, type: "needs", title: item.title, author: item.author_skr, meta: `${item.category} · ${t("content.needCount", { count: item.need_count })} · ${t("content.commentCount", { count: item.comment_count })}`, body: item.problem, created: item.created_at }));
  } else if (store.contentType === "comments") {
    items = store.comments.filter((item) => lower(`${item.body} ${item.author_skr}`).includes(query)).map((item) => ({ id: item.id, type: "comments", title: item.body.slice(0, 90), author: item.author_skr, meta: `${item.target_type} · ${t("content.likeCount", { count: item.like_count })}`, body: item.body, created: item.created_at }));
  } else {
    items = store.works.filter((item) => item.moderation_status === "published" && lower(`${item.name} ${item.summary} ${item.author_skr}`).includes(query)).map((item) => ({ id: item.id, type: "works", title: item.name, author: item.author_skr, meta: `${item.category} · ${t("content.likeCount", { count: item.like_count })}`, body: item.summary, created: item.created_at }));
  }
  byId("content-count").textContent = t("count.records", { count: items.length });
  byId("content-list").innerHTML = items.length ? items.map((item) => `<article class="record"><div class="record-main"><h2 class="record-title">${escapeHtml(item.title)}</h2><p class="record-meta">${escapeHtml(item.author)} · ${escapeHtml(item.meta)} · ${dateTime(item.created)}</p><p class="record-copy">${escapeHtml(item.body)}</p></div><div class="record-actions"><button class="danger" data-remove="${item.type}" data-id="${escapeHtml(item.id)}">${t("action.remove")}</button></div></article>`).join("") : emptyMarkup();
  bindRemoveActions();
}

function bindRemoveActions() {
  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => askConfirm({
      title: t("dialog.removeTitle"), message: t("dialog.removeMessage"), label: t("action.remove"), danger: true,
      action: async () => {
        await request(`/admin/${button.dataset.remove}/${button.dataset.id}/remove`, { method: "POST", body: "{}" });
        await loadView(store.view);
        await refreshCounts();
      },
    });
  });
}

async function loadReports() {
  const [data, messages] = await run(() => Promise.all([request("/admin/reports"), request("/admin/message-reports")]));
  store.reports = [...data.items, ...messages.items.map(item => ({ ...item, target_type: "message", target_id: item.message_id, target_label: item.body, target_author: item.sender_skr, status: item.status === "removed" ? "resolved" : item.status }))];
  renderReports();
}

function renderReports() {
  const query = lower(byId("report-search").value);
  const status = byId("report-filter").value;
  const items = store.reports.filter((item) => (status === "all" || item.status === status) && lower(`${item.reason} ${item.details} ${item.reporter_skr} ${item.target_label} ${item.target_author}`).includes(query));
  byId("report-count").textContent = t("count.of", { shown: items.length, total: store.reports.length });
  byId("report-list").innerHTML = items.length ? items.map((item) => `<article class="record"><div class="record-main"><h2 class="record-title">${escapeHtml(item.reason)} ${badge(item.status)}</h2><p class="record-meta">${escapeHtml(t("reports.reportedBy", { identity: item.reporter_skr }))} · ${escapeHtml(item.target_type)} · ${dateTime(item.created_at)}</p><p class="record-copy"><strong>${escapeHtml(item.target_label || item.target_id)}</strong>${item.details ? ` · ${escapeHtml(item.details)}` : ""}</p></div><div class="record-actions">${item.status === "open" ? `<button data-report="${escapeHtml(item.id)}" data-report-action="dismiss">${t("action.dismiss")}</button><button class="primary" data-report="${escapeHtml(item.id)}" data-report-action="resolve">${item.target_type === "message" ? t("action.removeTarget") : t("action.resolve")}</button>${["need", "work", "comment"].includes(item.target_type) ? `<button class="danger" data-remove="${item.target_type}s" data-id="${escapeHtml(item.target_id)}">${t("action.removeTarget")}</button>` : ""}` : ""}</div></article>`).join("") : emptyMarkup();
  document.querySelectorAll("[data-report]").forEach((button) => {
    button.onclick = () => {
      const resolve = button.dataset.reportAction === "resolve";
      askConfirm({
        title: resolve ? t("dialog.resolveTitle") : t("dialog.dismissTitle"),
        message: t("dialog.reportMessage"), label: resolve ? t("action.resolve") : t("action.dismiss"),
        action: async () => {
          const item = store.reports.find(item => item.id === button.dataset.report);
          if (item?.target_type === "message") await request(`/admin/message-reports/${item.id}`, { method: "POST", body: JSON.stringify({ decision: resolve ? "removed" : "dismissed" }) });
          else await request(`/admin/reports/${button.dataset.report}/resolve`, { method: "POST", body: JSON.stringify({ dismiss: !resolve }) });
          await loadReports();
          await refreshCounts();
        },
      });
    };
  });
  bindRemoveActions();
}

async function loadPeople() {
  const data = await run(() => request("/admin/users"));
  store.users = data.items;
  renderPeople();
}

function renderPeople() {
  const query = lower(byId("people-search").value);
  const status = byId("people-filter").value;
  const items = store.users.filter((item) => (status === "all" || item.status === status) && lower(item.skr_domain).includes(query));
  byId("people-count").textContent = t("count.of", { shown: items.length, total: store.users.length });
  byId("people-list").innerHTML = items.length ? items.map((item) => `<article class="record"><div class="record-main"><h2 class="record-title">${escapeHtml(item.skr_domain)} ${badge(item.status)}</h2><p class="record-meta">${escapeHtml(item.locale.toUpperCase())} · ${escapeHtml(t("people.joined", { time: dateTime(item.created_at) }))}</p><p class="record-copy">${t("people.counts", { needs: item.need_count, works: item.work_count, comments: item.comment_count })}</p></div><div class="record-actions">${item.status === "active" ? `<button class="danger" data-identity="${escapeHtml(item.skr_domain)}" data-identity-action="block">${t("action.block")}</button>` : item.status === "blocked" ? `<button data-identity="${escapeHtml(item.skr_domain)}" data-identity-action="unblock">${t("action.unblock")}</button>` : ""}</div></article>`).join("") : emptyMarkup();
  document.querySelectorAll("[data-identity]").forEach((button) => {
    button.onclick = () => {
      const block = button.dataset.identityAction === "block";
      const action = block ? t("action.block") : t("action.unblock");
      askConfirm({
        title: block ? t("dialog.blockTitle") : t("dialog.unblockTitle"),
        message: t("dialog.identityMessage", { action, identity: button.dataset.identity }),
        label: action, danger: block,
        action: async () => {
          await request(`/admin/identities/${encodeURIComponent(button.dataset.identity)}/${button.dataset.identityAction}`, { method: "POST", body: "{}" });
          await loadPeople();
          await refreshCounts();
        },
      });
    };
  });
}

async function loadPromotions() {
  const data = await run(() => request("/admin/promotions"));
  store.promotions = data.items;
  renderPromotions();
}

function renderPromotions() {
  const query = lower(byId("promotion-search").value);
  const status = byId("promotion-filter").value;
  const items = store.promotions.filter((item) => (status === "all" || item.status === status) && lower(`${item.work_name} ${item.buyer_skr} ${item.work_id}`).includes(query));
  byId("promotion-count").textContent = t("count.of", { shown: items.length, total: store.promotions.length });
  byId("promotion-list").innerHTML = items.length ? items.map((item) => `<article class="record"><div class="record-main"><h2 class="record-title">${escapeHtml(item.work_name || item.work_id)} ${badge(item.status)}</h2><p class="record-meta">${escapeHtml(item.buyer_skr)} · ${escapeHtml(item.network)} · ${dateTime(item.quoted_at)}</p><p class="record-copy">${Number(item.token_amount).toLocaleString()} SKR${item.promotion_ends_at ? ` · ${escapeHtml(t("promotions.ends", { time: dateTime(item.promotion_ends_at) }))}` : ""}</p></div></article>`).join("") : emptyMarkup();
}

async function loadSystem() {
  const [config, catalog, announcements, moderation, audit] = await run(() => Promise.all([request("/admin/config"), request("/admin/store-catalog/status"), request("/admin/announcements"), request("/admin/moderation-events"), request("/admin/audit")]));
  byId("translation-toggle").textContent = catalog.translation_enabled ? (store.language === "zh" ? "暂停自动翻译" : "Pause auto translation") : (store.language === "zh" ? "开启自动翻译" : "Resume auto translation");
  store.config = config; store.catalog = catalog; store.announcements = announcements.items; store.moderation = moderation.items; store.audit = audit.items;
  byId("price").value = config.priceSkr;
  byId("price-meta").textContent = t("system.duration", { days: config.durationDays, environment: config.environment, mode: config.paymentMode });
  byId("catalog-status").innerHTML = `<div><dt>${store.language === "zh" ? "待翻译 / 失败待重试" : "Remaining / Failed"}</dt><dd>${Number(catalog.active || 0) - Number(catalog.translated || 0)} / ${Number(catalog.translation_failed || 0)}</dd></div><div><dt>${t("system.activeApps")}</dt><dd>${Number(catalog.active || 0).toLocaleString()}</dd></div><div><dt>${t("system.totalRecords")}</dt><dd>${Number(catalog.total || 0).toLocaleString()}</dd></div><div><dt>${t("system.translatedApps")}</dt><dd>${Number(catalog.translated || 0).toLocaleString()}</dd></div><div><dt>${t("system.lastSync")}</dt><dd>${dateTime(catalog.last_synced_at)}</dd></div>`;
  if (catalog.translation_budget) {
    const budget = catalog.translation_budget;
    byId("catalog-status").innerHTML += `<div><dt>${store.language === "zh" ? "今日翻译调用 / 上限" : "Translation calls today / cap"}</dt><dd>${Number(budget.calls)} / ${Number(budget.limit)}</dd></div><div><dt>${store.language === "zh" ? "每日预算" : "Daily budget"}</dt><dd>${budget.paused ? (store.language === "zh" ? "已暂停，等待额度刷新" : "Paused until daily reset") : (store.language === "zh" ? "可继续" : "Available")} · ${dateTime(budget.resets_at)}</dd></div><div><dt>${store.language === "zh" ? "费用说明" : "Billing note"}</dt><dd>${store.language === "zh" ? "本地调用上限，不是 Cloudflare 账单；账户额度与审核共用。" : "Local request cap, not a Cloudflare invoice; account quota is shared with moderation."}</dd></div>`;
  }
  byId("announcement-list").innerHTML = store.announcements.length ? store.announcements.map((item) => {
    const title = store.language === "zh" ? item.title_zh : item.title_en;
    return `<div class="compact-row"><span><strong>${escapeHtml(title)}</strong><span>${item.pinned ? `${t("system.pinned")} · ` : ""}${dateTime(item.published_at)}</span></span><button class="danger" data-announcement-delete="${escapeHtml(item.id)}">${t("action.delete")}</button></div>`;
  }).join("") : emptyMarkup();
  document.querySelectorAll("[data-announcement-delete]").forEach((button) => {
    button.onclick = () => askConfirm({
      title: t("dialog.deleteAnnouncementTitle"), message: t("dialog.deleteAnnouncementMessage"), label: t("action.delete"), danger: true,
      action: async () => { await request(`/admin/announcements/${button.dataset.announcementDelete}`, { method: "DELETE" }); await loadSystem(); },
    });
  });
  byId("moderation-count").textContent = t("count.recent", { count: store.moderation.length });
  byId("moderation-list").innerHTML = store.moderation.length ? table([t("table.identity"), t("table.surface"), t("table.category"), t("table.time")], store.moderation.map((item) => [item.identity_skr, item.surface, item.category, dateTime(item.created_at)])) : emptyMarkup();
  byId("audit-count").textContent = t("count.recent", { count: store.audit.length });
  byId("audit-list").innerHTML = store.audit.length ? table([t("table.actor"), t("table.action"), t("table.target"), t("table.time")], store.audit.map((item) => [item.actor, item.action, `${item.target_type || ""} ${item.target_id || ""}`, dateTime(item.created_at)])) : emptyMarkup();
}

function table(headers, rows) {
  return `<div class="table-row head">${headers.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>${rows.map((row) => `<div class="table-row">${row.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`).join("")}`;
}

function askConfirm({ title, message, label, danger = false, note = false, action }) {
  const dialog = byId("confirm-dialog");
  byId("confirm-title").textContent = title;
  byId("confirm-message").textContent = message;
  byId("confirm-note-wrap").classList.toggle("hidden", !note);
  byId("confirm-note").value = "";
  const button = byId("confirm-action");
  button.textContent = label;
  button.classList.toggle("danger", danger);
  button.classList.toggle("primary", !danger);
  button.onclick = () => withBusy(button, async () => {
    await run(() => action(byId("confirm-note").value.trim()), t("toast.complete", { action: label }));
    dialog.close();
  });
  dialog.showModal();
}

function bindOpenView() {
  document.querySelectorAll("[data-open-view]").forEach((button) => { button.onclick = () => openView(button.dataset.openView); });
}

async function refreshCounts() {
  try {
    const overview = await request("/admin/overview");
    byId("pending-nav").textContent = overview.metrics.pendingWorks;
    byId("reports-nav").textContent = overview.metrics.openReports;
  } catch (_) {
    // The active view displays the same localized request error.
  }
}

document.querySelectorAll(".sidebar [data-view]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view)));
document.querySelectorAll("[data-content]").forEach((button) => button.addEventListener("click", () => {
  store.contentType = button.dataset.content;
  document.querySelectorAll("[data-content]").forEach((item) => item.classList.toggle("active", item === button));
  renderContent();
}));
document.querySelectorAll("[data-language]").forEach((button) => button.addEventListener("click", () => {
  store.language = button.dataset.language === "zh" ? "zh" : "en";
  localStorage.setItem("liondapp-admin-language", store.language);
  applyLanguage();
  void loadView(store.view).catch(() => {});
}));
byId("work-search").addEventListener("input", renderWorks);
byId("work-filter").addEventListener("change", renderWorks);
byId("content-search").addEventListener("input", renderContent);
byId("report-search").addEventListener("input", renderReports);
byId("report-filter").addEventListener("change", renderReports);
byId("people-search").addEventListener("input", renderPeople);
byId("people-filter").addEventListener("change", renderPeople);
byId("promotion-search").addEventListener("input", renderPromotions);
byId("promotion-filter").addEventListener("change", renderPromotions);
byId("refresh").addEventListener("click", (event) => withBusy(event.currentTarget, () => loadView(store.view)));
byId("check-tip-readiness").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
  store.tipReadiness = null;
  renderTipReadiness();
  store.tipReadiness = await run(() => request("/admin/donations/readiness"));
  renderTipReadiness();
}));
byId("price-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  void withBusy(button, async () => {
    const priceSkr = Number(byId("price").value);
    await run(() => request("/admin/config/recommendation-price", { method: "PUT", body: JSON.stringify({ priceSkr }) }), t("toast.price", { price: priceSkr }));
    await loadSystem();
  });
});
byId("announcement-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const formNode = event.currentTarget;
  const button = formNode.querySelector('button[type="submit"]');
  void withBusy(button, async () => {
    const form = new FormData(formNode);
    const body = Object.fromEntries(form.entries());
    body.pinned = form.has("pinned");
    await run(() => request("/admin/announcements", { method: "POST", body: JSON.stringify(body) }), t("toast.announcement"));
    formNode.reset();
    await loadSystem();
  });
});
byId("sync-catalog").addEventListener("click", () => askConfirm({
  title: t("dialog.syncTitle"), message: t("dialog.syncMessage"), label: t("action.sync"),
  action: async () => { await request("/admin/store-catalog/sync", { method: "POST", body: "{}" }); await loadSystem(); },
}));
byId("translate-catalog").addEventListener("click", () => askConfirm({
  title: t("dialog.translateTitle"), message: t("dialog.translateMessage"), label: t("action.translate"),
  action: async () => { await request("/admin/store-catalog/translate", { method: "POST", body: "{}" }); await loadSystem(); },
}));
document.querySelectorAll("[data-close-dialog]").forEach((button) => { button.onclick = () => byId("detail-dialog").close(); });
document.querySelectorAll("[data-cancel-confirm]").forEach((button) => { button.onclick = () => byId("confirm-dialog").close(); });
byId("auth-required").querySelector("a").href = "/login.html";
byId("admin-logout").addEventListener("click", async () => {
  try { await request("/admin/auth/logout", { method: "POST", body: "{}" }); location.replace("/login.html"); } catch (error) { showStatus(error.message, true); }
});

applyLanguage();
bindOpenView();
const initialView = location.hash.slice(1);
fetch("/api/admin/auth/status").then(r => r.json()).then(status => {
  if (!status.authenticated) { location.replace("/login.html"); return; }
  openView(SUPPORTED_VIEWS.includes(initialView) ? initialView : "overview");
}).catch(() => { location.replace("/login.html"); });

byId("translation-toggle").addEventListener("click", event => withBusy(event.currentTarget, async () => {
  await request("/admin/store-catalog/translation-control", {method:"POST",body:JSON.stringify({enabled:!store.catalog?.translation_enabled})}); await loadSystem();
}));
byId("translation-retry").addEventListener("click", () => askConfirm({
  title:store.language === "zh" ? "重试失败的翻译" : "Retry failed translations",
  message:store.language === "zh" ? "重新排队并开启自动翻译？会使用 Workers AI 配额。" : "Requeue failed items and enable auto translation? This uses Workers AI quota.",
  action:async () => {await request("/admin/store-catalog/translation-control", {method:"POST",body:JSON.stringify({enabled:true,retryFailed:true})});await loadSystem();},
}));
