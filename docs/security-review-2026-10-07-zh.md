# 2026-10-07 安全报告复核与修复

本次已修复 JavaScript 依赖告警，并加固后台 HTML 渲染与退款账户约束。132 项 Node 测试、8 项 Python 测试、API/网站类型检查、SBF 编译及 16 项隔离链上运行测试通过。此文是开发者对报告的逐项复核，不是第三方审计认证，也不代表真实 SKR 支付已经可以上线。

## 报告范围与结论边界

- 原报告审查公开仓库提交 `c3151af6e839e9448e10484819000178cf3f0730`，共 64 项：45 项自有代码待复核、15 个依赖包、4 项信息提示。
- 报告原文明确写着 **“Nothing was confirmed as a defect in the code that was reviewed.”** 不能把 29 项 High 解读成 29 个已经证实的可利用漏洞。
- 门户说明该模块只是参考性安全检查，并提示检查不完整、没有安全评分。本次复核没有再次运行该外部服务；其旧提交上的报告不会自动变成新代码的审计结果。
- 原报告保存在本地 `artifacts/security-review-20261007/original-report.md`，SHA-256：`15cb0b0c642fcd1012f9f8cfc9107b4b0f4a5ffc8f37c67e96eb163d6b531b44`。
- 评审 APK 保持 1.2.1 / versionCode 4；本轮没有修改 Android 发布代码或替换 APK。链上源码仍是未部署的开发程序。

## 已完成的修改

| 修改 | 原因与验证 |
| --- | --- |
| Wrangler 升至 4.148.0，间接使用 undici 7.29.1 | 处理报告的 HTTP 客户端依赖告警；Worker 打包与部署通过 |
| Miniflare 的 sharp 固定为 0.35.5 | 报告建议 0.35.4，但当前公告又增加 librsvg 漏洞；0.35.4 不足以清除当前告警 |
| web3.js 升至 1.99.0；显式将 Jayson 覆盖为 5.0.0 | Jayson 5 移除旧 stream-json / uuid 依赖；对实际使用的 browser client 比较了源码，并测试 RPC 成功、错误、通知、批量、坏 JSON 及未签名交易序列化。没有强行覆盖为不兼容的 stream-json 3.x |
| 主网 genesis hash 改为完整值 | 额外发现的真实可用性 bug，报告没有列出。旧常量错误地使用截短的链引用，正确 Mainnet RPC 会被拒绝；同时更新测试夹具，增加完整 hash 通过、截短 hash 拒绝的回归 |
| 后台项目 `data-project-type` 属性转义、阶段计数数值化、用户计数文案整体转义 | 原 API 的项目类型是 SQL 常量、计数是聚合数值，未证实普通用户能够攻击这些字段；仍消除渲染层对上游类型保证的依赖 |
| 退款目标增加 `destination.key() != vault.key()` | 原有不同 token authority 已拒绝同账户退款；显式约束防止后续维护时遗漏这个关系 |
| 增加 10 项 Node 回归与 3 项链上攻击回归 | 执行真实渲染函数并解析 HTML，覆盖中英文后台多种恶意文本、属性与 URL；同时验证账户伪造、账户重复和 CPI 目标替换 |

`npm audit` 原先为 **10 个依赖节点告警（4 High / 6 Moderate）**，升级后为 **0**。这与外部报告的“15 个包”不是同一计数范围，后者包含 Rust 依赖。**不能称所有语言的依赖告警全部清零。** 两个 overrides 是有意的兼容性措施；升级上游时须重跑 RPC 与打包检查。

## 自有代码：逐项结论

编号与位置对应原报告的旧提交。`innerHTML` 本身不等于 XSS；需要证明攻击者可控内容能够越过文本、属性或 URL 的处理后变成可执行内容。后台还已有 CSP 禁止内联脚本，但这里的判断并不只依赖 CSP。

| 编号 | 原位置 / 内容 | 复核结果与依据 |
| --- | --- | --- |
| 1 | admin.js:441 指标卡 | 数值通过 `Number` / `num`；标题和说明经过 `escapeHtml`；未证实 XSS |
| 2 | :443 待审核计数 | 固定翻译文案与数值格式化；未证实 XSS |
| 3 | :445 阶段面板 | 阶段名称来自固定数组；补上 progress 的计数数值化，属于防御性加固 |
| 4 | :452 优先事项 | 标题、颜色来自固定映射，说明转义、计数数值化；未证实 XSS |
| 5 | :455 项目概览 | `projectRows` 已转义标题、ID、作者与负责人；补齐类型属性转义。原类型来自 SQL 视图的常量 |
| 6 | :459 趋势图 | 日期由 Date 转为 ISO，数量和图形坐标为数值；未证实 XSS |
| 7 | :460 负责人 | 姓名、首字母转义，数量数值化；未证实 XSS |
| 8 | :461 平台状态 | 所有 label/value 经过转义；未证实 XSS |
| 9 | :483 项目列表 | 同 #5，复用加固后的 `projectRows` |
| 10 | :496 项目事实 | 状态经过安全 badge，时间转义，反应和预算数值化；未证实 XSS |
| 11 | :520 作品列表 | 名称、简介、作者、分类、ID、状态转义；未证实 XSS |
| 12 | :530 作品详情 | 简介与正文转义；外链限 http/https 且转义；图片路径逐段编码；未证实 XSS |
| 13 | :531 审核按钮 | ID 转义，动作与文字来自固定映射；未证实 XSS |
| 14 | :583 内容列表 | 标题、元信息与正文转义；内容类型由内部映射生成；未证实 XSS |
| 15 | :611 举报列表 | 举报者、原因、详情、对象类型和 ID 转义，删除类型有枚举限制；未证实 XSS |
| 16 | :634 测试争议 | 条件、报告与双方理由转义，证据 URL 有协议限制；恶意报告和 data URL 回归通过 |
| 17 | :658 用户列表 | 身份与语言已转义；额外转义计数插值文案。原计数来自 SQL `COUNT(*)`，不是用户提交的字符串 |
| 18 | :688 推荐订单 | 名称、身份、网络与状态转义，金额数值化；未证实 XSS |
| 19 | :697 目录状态 | 数值转换与格式化；日期由 Intl 格式化；未证实 XSS |
| 20 | :700 翻译预算 | 计数数值化，说明为固定文案，日期格式化；未证实 XSS |
| 21 | :702 公告 | 公告标题、ID 转义；未证实 XSS |
| 22 | :713 审核日志 | `table()` 对每个单元格转义；未证实 XSS |
| 23 | :715 操作日志 | 同 #22，包括作者、动作、对象及 ID |
| 24 | lifecycle.rs:166 随机公钥 | 仅隔离 VM 的测试 Mint/账户夹具。不是生产程序随机指定权限，扫描器误判执行范围 |
| 25 | lifecycle.rs:374 unpack | 仅测试 `balance()` 读取虚拟 token 余额，不是可被调用的合约指令或修改账户的授权入口 |
| 26 | backup-project.py:26 SQL 拼接 | 表名来自源码中固定的五项列表，没有外部输入；SQL 参数不能绑定表名。没有所述 SQL 注入路径 |
| 27 | admin-password-runtime.test.mjs:15 密钥 | 是明确标注 synthetic 的 SQLite 测试 pepper；非 Cloudflare 或生产凭据。该条不证明真实密钥泄漏，无需轮换不存在的凭据 |
| 28 | CampaignAcceptanceTest 截图 | androidTest 中的合成 UI 证据，不打包进入发布 APK，不写钱包密钥或登录 token |
| 29 | DiscussionAcceptanceTest 截图 | 同 #28；`getExternalFilesDir` 是应用专属外部目录，也不是任意公共共享根目录 |
| 30 | PostDetailAcceptanceTest 截图 | 同 #28；不能把该告警当成发布包的敏感信息泄漏 |
| 31 | ScreenLayoutAcceptanceTest 截图 | 同 #28；未来若改成拍摄真实账户，必须重新审查截图内容与保存方式 |
| 32 | TestingJourneyAcceptanceTest 截图 | 同 #28；现有 fixture 使用独立 QA 包、合成身份和 mock API |
| 33 | AndroidManifest.xml:15 exported | 标准 MAIN/LAUNCHER Activity 必须可被启动。MainActivity 不根据 Intent 自动签名、付款或处理任意 deep link；改为不可导出会破坏正常启动 |
| 34 | lifecycle.rs:2 算术 | 测试夹具，不是生产合约算术；常量界限可核对，未证实运行期溢出 |
| 35 | lifecycle.rs:239 算术 | 同 #34；不可据此推断真实奖励金额未检查溢出 |
| 36 | lifecycle.rs:28 算术 | 同 #34；生产费用、存入总额、占位数、未结算数与付款数使用 checked 运算 |
| 37 | lifecycle.rs:786 算术 | 同 #34，期限边界测试中的固定时间偏移 |
| 38 | settle CPI 后不 reload | CPI 目标由 `Program<Token>` 固定；SPL Token 不能修改 escrow-owned Campaign。没有使用 CPI 前缓存的 vault 余额进行后续结算。原程序攻击回归拒绝替换 CPI 目标，部分付款失败原子回滚用例通过 |
| 39 | refund CPI 后不 reload | 同 #38；本程序在 CPI 后只更新自己的 refunded 标志。报告的“如果 CPI 修改账户”前提在这里不成立 |
| 40 | refund 重复可写账户 | 原 vault 的 token authority 是 campaign PDA，destination 的 authority 是 creator Signer，同一个 token 账户不能同时满足。原 SBF 已拒绝伪造；再补显式不相同约束 |
| 41 | auth.ts web3 v1 | SDK 迁移建议，不是已经发现的漏洞。更新至 v1.99.0，依赖安全告警已处理；保留适配现有 TldParser 的接口 |
| 42 | donations.ts web3 v1 | 同 #41；后续独立迁移到 Kit，需验证交易 wire format 与 RPC 行为 |
| 43 | index.ts web3 v1 | 同 #41；不能仅把 import 改名就宣称完成迁移 |
| 44 | lifecycle.rs:201 重初始化 | 命中的是测试构造指令；实际 config/campaign 使用 `init`，已有重复初始化拒绝运行测试。`init_if_needed` 只用于受约束的收款 ATA |
| 45 | InitializeConfig 缺所有者检查 | `Account<ProgramData>` 由 Anchor 校验 upgradeable loader 所有者及账户类型；程序绑定对应 ProgramData，handler 核对 upgrade authority Signer。原程序的伪造所有者测试也被拒绝 |

上述防御性修改不等于证明旧版本存在普通用户可利用的 XSS 或资金盗取路径。浏览器函数测试覆盖真实渲染逻辑与生成 HTML，但不是完整浏览器渲染或人工渗透测试。

## 依赖：15 个包的处理与剩余事项

使用两个 locked Cargo manifest 的依赖树，并额外按 **`sbf-solana-solana` 编译目标**检查。报告将多个 Rust 包笼统称作“direct / ships to users”，这不准确：它们多数是上游传递依赖，有些仅主机工具/测试使用；Rust crate 也不会打包到 Kotlin APK。

| 包编号 | 包 | 处理 / 暴露范围 |
| --- | --- | --- |
| P1 | sharp 0.35.2 | 已升级到 0.35.5，开发工具依赖；处理更晚的 [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| P2 | undici 7.29.0 | Wrangler 带入 7.29.1，当前 npm audit 无告警 |
| P3 | stream-json 1.9.1 | Jayson 5 不再依赖该包，锁文件已移除。报告建议的 3.5.0 也受当前新公告影响，没有照搬过期修复目标 |
| P4 | uuid 8.3.2 | Jayson 5 移除旧依赖；rpc-websockets 使用的 uuid 14.0.2 保留，当前无告警 |
| P5 | rand 0.7.3 | 仍在 host/测试传递依赖中，SBF 目标不存在。两棵 feature tree 未启用该版本的 log feature，不满足 [RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097.html) 的全部触发条件；版本告警保留，未假称升级 |
| P6 | bincode 1.3.3 | SBF 与 host/测试传递依赖仍有；[RUSTSEC-2025-0141](https://rustsec.org/advisories/RUSTSEC-2025-0141.html) 是停止维护提示，没有可直接升到的修复版本。应随兼容的 Anchor/Solana 迁移处理，不替换协议序列化实现 |
| P7 | borsh 0.10.4 | **版本误报**：[RustSec 官方公告](https://github.com/RustSec/advisory-db/blob/main/crates/borsh/RUSTSEC-2023-0033.md) 的 patched 包含 `^0.10.4`。GitHub/OSV 某条数据把固定范围笼统写到 1.0.0-alpha.1，引起匹配差异；不能无视已修复的 0.10 分支 |
| P8 | derivative 2.2.0 | 仅 runtime-tests 的 proc-macro 依赖；停止维护提示，非部署 SBF / APK 依赖；随测试工具链迁移 |
| P9 | ed25519-dalek 1.0.1 | 仅测试依赖；签名 oracle 公告真实存在。测试只用生成的合成 Keypair，不提供攻击者选择公钥的签名服务，也不读取真实钱包私钥；升级 LiteSVM/Solana host 工具链列为待办 |
| P10 | libsecp256k1 0.6.0 | host/测试传递依赖，SBF 目标不存在；停止维护提示，保留迁移待办 |
| P11 | memmap2 0.5.10 | 仅测试工具链；公告真实，修复跨到 0.9.11。本项目不直接调用公告中的 advise/flush_range 函数；不凭这点抹去上游风险，随运行工具链升级验证 |
| P12 | paste 1.0.15 | 仅 runtime-tests 的 proc-macro 依赖；停止维护提示，随测试工具链迁移 |
| P13 | ansi_term 0.12.1 | 仅测试工具链；停止维护提示，随工具链迁移 |
| P14 | atty 0.2.14 | 仅测试工具链；维护与 Windows 对齐问题仍保留，当前验证平台 macOS。非 APK / SBF 用户入口 |
| P15 | curve25519-dalek 3.2.0 | 旧版本仅在测试树，时间侧信道公告真实存在；当前测试无真实秘密和对外签名服务。host 程序树另有 4.1.3，SBF 目标没有该库。工具链迁移仍需处理 |

这些范围判断不是对上游包的安全背书。**未修复的 Rust 版本/维护事项仍是登记的技术债**，没有使用 ignore 列表、伪造 lockfile 或兼容性未经验证的跨大版本替换来让扫描变绿。将来增加真实私钥、对外输入或换 SDK/features 时，必须重新判断暴露范围。链上资金开放前仍应做针对实际部署程序与配置的完整复核。

## 四项信息提示

三项 license 信息都指向同一个 escrow crate 缺少 SPDX license；另有一项重复 crate 版本。它们是维护/授权信息，报告自己也说不需要作为漏洞修复。公开源码不自动等于授予 MIT/Apache 商业使用权；本轮没有替作者选择许可证。重复版本来自 Anchor/Solana 工具链，不能只为消除数量而强行统一不兼容类型。

## 验证与部署

| 检查 | 结果 |
| --- | --- |
| `npm test` | 132/132，无跳过 |
| `python3 -m unittest discover -s tests -p '*_test.py'` | 8/8 |
| API / site TypeScript | 通过 |
| `npm audit --json` | 0 个 JavaScript 告警 |
| Worker dry-run | 编译成功 |
| 新增攻击用例对原 SBF | 16/16；原源码 hash 与被审提交一致，先验证原有约束，再加入显式约束 |
| `scripts/verify-escrow.sh` | SBF 编译、host 2 项、runtime 16 项通过；没有 RPC、部署或真实 token |
| API 更新 | 已部署；最终版本 `0f3ba998-5601-47c1-93ca-2b3c67e32b48` |
| 后台更新 | Pages 已部署；`https://b09c33e0.liondapp-admin.pages.dev` |

新 SBF SHA-256：`2dd6baefec0e891b4f0c1cc4daa2d7a1dfdb4421edcedfb2dd95ed10bafce475`。构建仍有双 crate-type / LTO 与空 syscall allowlist 警告；运行测试通过，不称其为零警告构建。技能 preflight 的 Expo 检查不适用于本项目的原生 Kotlin 架构：它因找不到 app.json 报失败；并非 Android 配置被删除。签名文件和运行期 .env 跟踪检查通过。

本地详细输出在 `artifacts/security-review-20261007/`。Chrome 原生页面读取线上 health 确认真实支付开关均关闭。HTTP 工具收到 403、内置浏览器被阻止，没有削弱 WAF/鉴权去绕过；目录与后台源文件的自动线上检查未成功，不宣称它们已经通过。门户刷新仍为 In Review。不得把本地测试当作真实钱包、全新登录或线上付款验证。

## 为什么商店上架后仍不能直接开启真实 SKR 悬赏

应用分发与资金安全是两项独立条件。目前没有部署实际 program ID/config，也没有接通真实预存、链上验收结算、手续费、退款的 unsigned transaction API、钱包签名和确认恢复。单改 `BOUNTY_MODE` 不会完成这些功能；`onchain` 路径会 fail closed。

正确的下一步是：固定部署/升级权限及 Mainnet SKR 配置，完成钱包交易接入和链上状态对账，先在安全测试环境验证完整 lifecycle，再由用户签名完成小额真实 SKR 的充值、奖励与手续费、退款以及取消/断网恢复验证。最后才能开启面向用户的资金功能。打赏与推荐购买要分别核对其独立流程，不能随悬赏开关一起默认开放。
