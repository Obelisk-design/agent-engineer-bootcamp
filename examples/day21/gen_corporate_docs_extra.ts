/**
 * 补充生成 100 份新型式企业规章语料（追加到 tests/fixtures/corporate-docs/）。
 *
 * 新增格式（每种 10 份）：
 *   - EML    邮件存档（含 headers + 正文 + 附件引用）
 *   - ZIP    制度汇编包（内含多个 MD/TXT）
 *   - JPG    真实照片风（用 sharp 生成自然图片）
 *   - WebP   现代图片格式（sharp 输出）
 *   - TIFF   多页扫描件（utif2 输出）
 *   - JSON   结构化制度数据（API 风格）
 *   - YAML   结构化元数据（K8s manifest 风格）
 *   - MD.FM  带 YAML frontmatter 的 Markdown
 *   - MD.WIKI Wiki 链接 Markdown（[[link]] 语法）
 *
 * 文件命名：101_xxx.eml 起，与原 100 份编号续上。
 *
 * 运行：pnpm exec tsx examples/day21/gen_corporate_docs_extra.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
// utif2 在 sharp-rendered PNG 上识别失败（IFD 为空），改用 sharp 原生 TIFF 输出
import * as utifNs from 'utif2';
// utif2 保留作为未来 import: 本次不用，避免误判
void utifNs;

// ── 路径 ──────────────────────────────────────────────────────
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ROOT = `tests/fixtures/corporate-docs-extra-${TIMESTAMP}`;

type Category = '人事' | '行政' | '财务' | 'IT' | '法务';

const DEPT: Record<Category, string> = {
  人事: '人力资源部',
  行政: '行政运营部',
  财务: '财务部',
  IT: '信息技术部',
  法务: '法务合规部',
};

// 10 套主题（人事 / 行政 / 财务 / IT / 法务 各 2 份）
const TOPICS: { cat: Category; title: string; sender: string }[] = [
  { cat: '人事', title: '远程办公考勤异常提醒', sender: '考勤管理员 <attendance@corp.example>' },
  { cat: '人事', title: '绩效复核结果通知', sender: '绩效组 <perf@corp.example>' },
  { cat: '行政', title: '会议室设备维护公告', sender: '行政运营 <admin@corp.example>' },
  { cat: '行政', title: '节前办公区安全检查通知', sender: '安保组 <security@corp.example>' },
  { cat: '财务', title: 'Q3 报销集中处理通知', sender: '财务共享中心 <finance@corp.example>' },
  { cat: '财务', title: '年度预算编制启动会通知', sender: '财务部预算组 <budget@corp.example>' },
  { cat: 'IT', title: 'VPN 升级维护窗口公告', sender: 'IT 运维 <it-ops@corp.example>' },
  { cat: 'IT', title: '全员密码策略更新通知', sender: '信息安全 <infosec@corp.example>' },
  { cat: '法务', title: '保密协议年度续签通知', sender: '法务合规 <legal@corp.example>' },
  { cat: '法务', title: '反舞弊举报渠道更新公告', sender: '监察组 <audit@corp.example>' },
];

const ORG_PARTIAL: Record<Category, string[]> = {
  人事: [
    '招聘组、培训组、薪酬组、绩效组',
    '招聘组、培训组、员工关系组',
    '薪酬组、绩效组',
    '培训组、组织发展组',
  ],
  行政: ['前台组、差旅组', '印章与证照组、档案与后勤组', '固定资产组、安保组'],
  财务: ['应付组、应收组', '总账组、预算组', '税务组、资金管理组', '预算组、审计对接组'],
  IT: ['运维组、安全组', '应用开发组、数据平台组', '桌面支持组、AI 平台组', '安全组、数据平台组'],
  法务: ['合规组、合同组', '诉讼组、知识产权组', '数据合规组、反舞弊组', '合同组、知识产权组'],
};

function mkBody(title: string, cat: Category): string {
  const d = DEPT[cat];
  // 部分通知也注入组织架构事实
  const orgPartial = ORG_PARTIAL[cat];
  const orgLine = `本部门内部下设 ${orgPartial[Math.abs(title.length) % orgPartial.length]} 等职能组，分别负责本部门不同业务条线的具体执行工作。`;
  const topLine = `本通知涉及部门隶属公司 CXO 办公室：${cat === '人事' ? 'CHO' : cat === '财务' ? 'CFO' : cat === 'IT' ? 'CIO' : cat === '法务' ? 'CLO' : 'CHO'} 归口管理，跨 CXO 协同事项由 CEO 办公室统筹。`;
  // 仅在标题含"全员"/"年度"/"渠道"/"策略"等关键词时追加（避免每份都加）
  const orgInjection = /全员|年度|策略|渠道|合规/.test(title) ? `\n\n补充说明：${orgLine}` : '';
  const topInjection = /年度|全员|合规/.test(title) ? `\n\n${topLine}` : '';
  return `【${title}】

各位同事：

依据《${cat}管理细则》及相关内控要求，现将有关事项通知如下：

一、背景说明
近期通过 OA 数据巡检，发现部分同事在相关流程执行上存在不规范情况。通过对 2025 年 Q1-Q3 的工单数据进行分析，我们识别出以下高频问题：(1) 申请材料不完整，约占 23%；(2) 审批节点超期，约占 18%；(3) 紧急事项未及时补办，约占 12%。为加强合规管理，提升工作效率，特此进行统一说明与提醒。${orgInjection}${topInjection}

二、适用对象
本通知适用于公司全体正式员工、实习生、外包人员，以及通过公司 OA 系统、企微、邮件等方式发起相关流程的内部用户。

三、具体要求
1. 相关流程须在 OA 系统中按权限逐级提交，紧急事项可先口头/邮件申请，并于 3 个工作日内补办系统流程；
2. 涉及资金、合规等事项，须由 ${d} 同步会签；
3. 任何例外情况须报备 ${d} 备案，并提供书面说明；
4. 单据金额超过 ¥10,000 的，须额外附合同/协议扫描件；
5. 涉及对外付款的，须在系统中录入对方账户完整信息（开户行、账号、户名）。

四、审批权限与 SLA

| 金额区间 | 审批人 | SLA（工作日） |
|---|---|---|
| ≤ ¥3,000 | 部门负责人 | 1 |
| ¥3,001 ~ ¥10,000 | 部门负责人 + ${d} 主管 | 2 |
| > ¥10,000 | 部门负责人 + ${d} 主管 + 法务合规 | 3 |
| 紧急申请 | 直接主管 + ${d} | 1 + 3 日内补办 |

五、常见问题
- 审批节点超时：默认 48 小时未处理自动转交上级；
- 单据缺失附件：系统将自动驳回，请按模板上传；
- 跨部门协作：建议先在企微建群对齐再走流程；
- 报销发票遗失：可使用"发票重开申请"模板，由供应商补开；
- 流程被驳回后如何修改：在原流程基础上点"修订"按钮，无需重新发起。

六、违规处理
对于未按本通知执行的部门或个人，将按《${cat}管理细则》"附则"章节进行处理：(1) 首次违规：通报批评 + 责令整改；(2) 12 个月内累计 2 次：扣减绩效系数 0.1；(3) 严重违规：扣减当月 1-3 倍日工资 + 书面警告；(4) 涉嫌违法：移送司法机关。

七、生效与解释
本通知自发布之日起生效，原有同类通知同时废止。本通知由 ${d} 负责解释。如有疑问，请联系 ${d}（内线 8000）或回复本邮件。

—— ${d}
`;
}

// ── EML 邮件 ──────────────────────────────────────────────────
async function genEml(file: string, topic: (typeof TOPICS)[number], idx: number) {
  const body = mkBody(topic.title, topic.cat);
  const eml = [
    `From: ${topic.sender}`,
    `To: all-staff@corp.example`,
    `Subject: [${topic.cat}公告] ${topic.title}`,
    `Date: ${new Date(2025, 8, (idx % 28) + 1).toUTCString()}`,
    `Message-ID: <${Date.now()}-${idx}@corp.example>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `X-Mailer: Corporate-Mailer/1.0`,
    ``,
    body,
    ``,
    `-- `,
    `${DEPT[topic.cat]} | 内线 8000 | 本邮件可能包含敏感信息，请勿外传`,
  ].join('\r\n');
  await writeFile(file, eml, 'utf8');
}

// ── ZIP 制度汇编包 ────────────────────────────────────────────
async function genZip(file: string, topic: (typeof TOPICS)[number], idx: number) {
  const zip = new JSZip();
  const folder = zip.folder(`policy-pack-${idx}`);
  if (!folder) throw new Error('zip folder null');
  // 包含：主规章 + 1 份配套表单 + 1 份 FAQ
  folder.file('main.md', mkBody(topic.title, topic.cat));
  folder.file(
    'form.md',
    `${topic.title}——配套申请表\n\n姓名：________  部门：________  日期：________\n\n事项说明：\n\n\n审批意见：\n`,
  );
  folder.file(
    'faq.md',
    `【FAQ】关于《${topic.title}》的常见问题\n\n` +
      `Q1：流程被驳回怎么办？\nA：按系统提示补正后重新提交。\n\n` +
      `Q2：紧急情况能否先执行？\nA：可先口头/邮件申请，3 个工作日内补办系统流程。\n\n` +
      `Q3：跨部门协作如何处理？\nA：建议先在企微建群对齐，再走 OA 流程。\n`,
  );
  folder.file(
    'README.md',
    `制度汇编包：${topic.title}\n编号：${idx}\n责任部门：${DEPT[topic.cat]}\n`,
  );
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(file, buf);
}

// ── JPG / WebP 图片（自然照片风：办公场景、印章、会议等） ────
async function genJpg(file: string, topic: (typeof TOPICS)[number]) {
  // 生成一张 1200×800 的"会议场景"图（带部门标签）
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3a4a5c"/>
        <stop offset="100%" stop-color="#1a2333"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <!-- 桌面 -->
    <rect x="100" y="500" width="1000" height="20" fill="#8b6f47"/>
    <!-- 笔记本 -->
    <rect x="200" y="430" width="180" height="80" fill="#222" rx="4"/>
    <rect x="210" y="440" width="160" height="60" fill="#4a9eff"/>
    <!-- 文件 -->
    <rect x="500" y="440" width="120" height="80" fill="#f0f0f0" stroke="#999"/>
    <text x="510" y="460" font-family="sans-serif" font-size="10" fill="#333">${escapeXml(topic.title)}</text>
    <!-- 茶杯 -->
    <circle cx="800" cy="480" r="35" fill="#fff" stroke="#888" stroke-width="2"/>
    <text x="800" y="487" text-anchor="middle" font-size="22">☕</text>
    <!-- 标题 -->
    <text x="600" y="120" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#fff" font-weight="bold">${escapeXml(topic.title)}</text>
    <text x="600" y="170" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#aaa">${escapeXml(DEPT[topic.cat])} · 制度公告</text>
    <!-- 水印 -->
    <text x="600" y="760" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#666">CORP-${Date.now().toString(36).toUpperCase()}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(file);
}

async function genWebp(file: string, topic: (typeof TOPICS)[number]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2563eb"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="500" y="200" text-anchor="middle" font-family="sans-serif" font-size="42" fill="#fff" font-weight="bold">${escapeXml(topic.title)}</text>
    <text x="500" y="260" text-anchor="middle" font-family="sans-serif" font-size="22" fill="rgba(255,255,255,0.85)">${escapeXml(DEPT[topic.cat])}</text>
    <rect x="100" y="380" width="800" height="200" fill="rgba(255,255,255,0.1)" rx="12"/>
    <text x="500" y="470" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#fff">企业制度公告 · 内线 8000</text>
    <text x="500" y="510" text-anchor="middle" font-family="sans-serif" font-size="14" fill="rgba(255,255,255,0.7)">CONFIDENTIAL</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(file);
}

// ── TIFF 单页扫描件（sharp 原生输出 TIFF） ──────────────────────
async function genTiff(file: string, topic: (typeof TOPICS)[number], idx: number) {
  // 单页 TIFF 含完整正文（不分页）
  const body = mkBody(topic.title, topic.cat);
  const allLines = body.split('\n').filter((l) => l.trim());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754">
    <rect width="100%" height="100%" fill="#fafaf5"/>
    <rect x="40" y="40" width="1160" height="1674" fill="none" stroke="#999" stroke-width="2"/>
    <text x="620" y="100" text-anchor="middle" font-family="serif" font-size="32" fill="#222">${escapeXml(topic.title)}</text>
    <text x="620" y="140" text-anchor="middle" font-family="serif" font-size="16" fill="#555">${escapeXml(DEPT[topic.cat])} · 扫描件</text>
    <line x1="100" y1="180" x2="1140" y2="180" stroke="#ccc"/>
    ${allLines
      .map(
        (line, i) =>
          `<text x="100" y="${230 + i * 40}" font-family="serif" font-size="18" fill="#222">${escapeXml(line).slice(0, 60)}</text>`,
      )
      .join('')}
    <circle cx="1100" cy="1700" r="60" fill="none" stroke="#cc0000" stroke-width="4"/>
    <text x="1100" y="1710" text-anchor="middle" font-family="serif" font-size="18" fill="#cc0000">已 盖 章</text>
    <text x="100" y="1740" font-family="serif" font-size="12" fill="#888">编号: ${idx} · 机密等级: 内部 · 扫描归档</text>
  </svg>`;
  const tiffBuf = await sharp(Buffer.from(svg)).tiff({ compression: 'lzw' }).toBuffer();
  await writeFile(file, tiffBuf);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── JSON 结构化制度数据 ───────────────────────────────────────
async function genJson(file: string, topic: (typeof TOPICS)[number], idx: number) {
  const data = {
    id: `POLICY-${String(idx).padStart(4, '0')}`,
    title: topic.title,
    category: topic.cat,
    owner: DEPT[topic.cat],
    version: `V${(idx % 4) + 1}.${(idx % 7) + 1}`,
    effectiveDate: `2025-${String((idx % 12) + 1).padStart(2, '0')}-${String(((idx * 3) % 28) + 1).padStart(2, '0')}`,
    tags: [topic.cat, '制度', '合规', DEPT[topic.cat]],
    sections: [
      {
        id: 'purpose',
        title: '目的与适用范围',
        content: `规范${topic.title}相关工作，明确职责与流程。`,
      },
      {
        id: 'roles',
        title: '职责分工',
        content: `${DEPT[topic.cat]}为归口管理部门；各业务部门配合执行；财务、法务合规审核监督。`,
      },
      { id: 'workflow', title: '流程说明', content: '相关申请在 OA 系统提交，按权限逐级审批。' },
      {
        id: 'faq',
        title: '常见问题',
        content: '紧急事项可先口头/邮件申请，3 个工作日内补办系统流程。',
      },
    ],
    approvers: [
      { role: '部门负责人', required: true },
      { role: DEPT[topic.cat] + '主管', required: true },
      { role: '法务合规审核', required: topic.cat === '法务' || topic.cat === '财务' },
    ],
    relatedDocs: [
      `POLICY-${String(Math.max(1, idx - 1)).padStart(4, '0')}`,
      `POLICY-${String(idx + 1).padStart(4, '0')}`,
    ],
    createdAt: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── YAML 结构化元数据 ─────────────────────────────────────────
async function genYaml(file: string, topic: (typeof TOPICS)[number], idx: number) {
  const data = [
    `apiVersion: policy.corp.example/v1`,
    `kind: ${topic.cat}Regulation`,
    `metadata:`,
    `  id: POLICY-${String(idx).padStart(4, '0')}`,
    `  name: ${topic.title}`,
    `  labels:`,
    `    category: ${topic.cat}`,
    `    owner: ${DEPT[topic.cat]}`,
    `    confidential: ${topic.cat === '法务' ? 'internal' : 'public'}`,
    `spec:`,
    `  version: ${(idx % 4) + 1}.${(idx % 7) + 1}`,
    `  effectiveDate: 2025-${String((idx % 12) + 1).padStart(2, '0')}-${String(((idx * 3) % 28) + 1).padStart(2, '0')}`,
    `  workflow:`,
    `    - name: 申请`,
    `      system: OA`,
    `      sla: 24h`,
    `    - name: 部门审核`,
    `      required: true`,
    `    - name: ${DEPT[topic.cat]}会签`,
    `      required: true`,
    `    - name: 法务合规审核`,
    `      required: ${topic.cat === '法务' || topic.cat === '财务'}`,
    `  tags:`,
    `    - 制度`,
    `    - 合规`,
    `    - ${topic.cat}`,
    `  related:`,
    `    - POLICY-${String(Math.max(1, idx - 1)).padStart(4, '0')}`,
    ``,
  ].join('\n');
  await writeFile(file, data, 'utf8');
}

// ── Markdown + YAML frontmatter ────────────────────────────────
async function genMdFm(file: string, topic: (typeof TOPICS)[number], idx: number) {
  const fm = [
    '---',
    `id: POLICY-${String(idx).padStart(4, '0')}`,
    `title: ${topic.title}`,
    `category: ${topic.cat}`,
    `owner: ${DEPT[topic.cat]}`,
    `version: ${(idx % 4) + 1}.${(idx % 7) + 1}`,
    `effective_date: 2025-${String((idx % 12) + 1).padStart(2, '0')}-${String(((idx * 3) % 28) + 1).padStart(2, '0')}`,
    `tags: [${topic.cat}, 制度, 合规]`,
    `confidential: ${topic.cat === '法务' ? 'internal' : 'public'}`,
    `related: [POLICY-${String(Math.max(1, idx - 1)).padStart(4, '0')}, POLICY-${String(idx + 1).padStart(4, '0')}]`,
    '---',
    '',
  ].join('\n');
  const body = mkBody(topic.title, topic.cat).replace(/^【.*】$/, ''); // frontmatter 已含 title，正文不再重复
  await writeFile(file, fm + `## 制度正文\n\n${body}`, 'utf8');
}

// ── Markdown + Wiki 链接 ──────────────────────────────────────
async function genMdWiki(file: string, topic: (typeof TOPICS)[number], idx: number) {
  const prev = `[[POLICY-${String(Math.max(1, idx - 1)).padStart(4, '0')}|前序制度]]`;
  const next = `[[POLICY-${String(idx + 1).padStart(4, '0')}|后续制度]]`;
  const wikiBody = `# ${topic.title}

> 分类：${topic.cat} | 责任部门：${DEPT[topic.cat]} | 编号：POLICY-${String(idx).padStart(4, '0')}

## 1. 制度概述

本制度旨在规范「${topic.title}」相关工作，明确 ${DEPT[topic.cat]} 与各业务部门的职责分工与执行流程。

## 2. 职责分工

详见 ${prev} 中关于职责分工的约定，以及 ${next} 中关于跨部门协作的补充。

## 3. 流程要点

- 相关申请通过 OA 系统逐级审批；
- 紧急事项可先口头/邮件申请，3 个工作日内补办系统流程；
- 涉及资金、合规事项须由 ${DEPT[topic.cat]} 会签。

## 4. 关联制度

- ${prev}
- ${next}
- [[POLICY-FAQ-${String(idx).padStart(4, '0')}|常见问题 FAQ]]

## 5. 变更记录

| 版本 | 日期 | 修改人 | 说明 |
|---|---|---|---|
| V${(idx % 4) + 1}.${(idx % 7) + 1} | 2025-${String((idx % 12) + 1).padStart(2, '0')} | ${DEPT[topic.cat]} | 首次发布 |
`;
  await writeFile(file, wikiBody, 'utf8');
}

// ── 主流程 ────────────────────────────────────────────────────
async function main() {
  const outDir = join(process.cwd(), ROOT);
  await mkdir(outDir, { recursive: true });

  const summary: Record<string, number> = {};
  let idx = 101;

  // 10 种格式 × 10 份 = 100 份
  // 但 TOPICS 只有 10 个——按格式循环，每格式 10 份，每份用 TOPICS[idx % 10]
  const formatMap: {
    ext: string;
    handler: (file: string, t: (typeof TOPICS)[number], idx: number) => Promise<void>;
  }[] = [
    { ext: 'eml', handler: genEml },
    { ext: 'zip', handler: genZip },
    { ext: 'jpg', handler: genJpg },
    { ext: 'webp', handler: genWebp },
    { ext: 'tiff', handler: genTiff },
    { ext: 'json', handler: genJson },
    { ext: 'yaml', handler: genYaml },
    { ext: 'md', handler: genMdFm }, // md 但内容是 frontmatter 风格（与原 .md 区别在于头部 yaml block）
    { ext: 'wiki.md', handler: genMdWiki }, // 双后缀 wiki.md
  ];

  // 每格式 10 份，共 9 × 10 = 90，加 10 份 frontmatter 的 md = 100
  for (const { ext, handler } of formatMap) {
    for (let i = 0; i < 10; i++) {
      const topic = TOPICS[(idx + i) % TOPICS.length];
      if (!topic) continue;
      const fileName = `${String(idx).padStart(3, '0')}_${topic.cat}_${topic.title}.${ext}`;
      const file = join(outDir, fileName);
      try {
        await handler(file, topic, idx);
      } catch (e) {
        console.error(`失败 ${fileName}:`, e);
        throw e;
      }
      summary[ext] = (summary[ext] ?? 0) + 1;
      idx++;
    }
  }
  // frontmatter md 单独再 10 份（让 .md 总数不破坏原 20 份）
  for (let i = 0; i < 10; i++) {
    const topic = TOPICS[i % TOPICS.length];
    if (!topic) continue;
    const fileName = `${String(idx).padStart(3, '0')}_${topic.cat}_${topic.title}.md`;
    const file = join(outDir, fileName);
    await genMdFm(file, topic, idx);
    summary['md.fm'] = (summary['md.fm'] ?? 0) + 1;
    idx++;
  }

  console.log(`✅ 已生成 ${idx - 101} 份新型式语料到 ${outDir}`);
  console.log('格式分布：');
  for (const [ext, n] of Object.entries(summary).sort()) {
    console.log(`  .${ext.padEnd(8)} × ${n}`);
  }
  console.log(
    `\n下一步：手动把这些文件 mv/cp 到 tests/fixtures/corporate-docs/ 合并；或直接保留这个独立目录。`,
  );
}

main().catch((e) => {
  console.error('生成失败：', e);
  process.exit(1);
});
