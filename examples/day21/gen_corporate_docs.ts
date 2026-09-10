/**
 * 生成 100 份企业规章制度测试语料。
 *
 * 输出：tests/fixtures/corporate-docs/
 * 分类：人事 / 行政 / 财务 / IT / 法务 各 20 份 = 100 份
 * 格式：PDF(30 文本+扫描) / MD(20) / DOCX(15) / XLSX(10) / PPTX(5) / PNG(5) / HTML+CSV+TXT(15)
 *
 * 内容"有真有假"：条款标题、编号、责任部门、版本号看起来真实；
 * 金额、日期、政策内容是构造的；少数文件故意埋前后矛盾的"陷阱条款"
 * 方便后续做 RAG ground-truth 评测。
 *
 * 运行：pnpm exec tsx examples/day21/gen_corporate_docs.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// @ts-expect-error pdfkit 无 d.ts，但运行时正常
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel } from 'docx';
import PPTXGenMod from 'pptxgenjs';
const PPTXGen = (PPTXGenMod as unknown as { default?: typeof PPTXGenMod }).default ?? PPTXGenMod;
import sharp from 'sharp';

// ── 路径与目录 ────────────────────────────────────────────────
// Windows 下重跑时旧目录可能被锁，改写到带时间戳的子目录避免冲突
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ROOT = `tests/fixtures/corporate-docs-${TIMESTAMP}`;

// ── 5 大主题 × 20 份 ───────────────────────────────────────────
type Category = '人事' | '行政' | '财务' | 'IT' | '法务';

type DocSpec = {
  category: Category;
  title: string;
  /** 政策正文，多段 */
  sections: { heading: string; body: string }[];
  /** 是否埋"陷阱条款"——和正文中某条相反 */
  trapClause?: string;
  version: string;
  effectiveDate: string;
  owner: string;
};

const DEPT_BY_CAT: Record<Category, string> = {
  人事: '人力资源部',
  行政: '行政运营部',
  财务: '财务部',
  IT: '信息技术部',
  法务: '法务合规部',
};

const CATEGORIES: Category[] = ['人事', '行政', '财务', 'IT', '法务'];

const TITLES: Record<Category, string[]> = {
  人事: [
    '考勤管理办法',
    '员工休假管理制度',
    '招聘与录用流程',
    '绩效考核管理办法',
    '员工培训管理制度',
    '薪酬与晋升管理办法',
    '入职离职交接细则',
    '社会保险与公积金管理',
    '员工手册总则',
    '加班与调休管理细则',
    '员工申诉处理流程',
    '考勤异常申诉流程',
    '远程办公考勤细则',
    '员工健康体检管理',
    '内部竞聘管理办法',
    '实习生管理办法',
    '员工股权激励计划',
    '离职证明开具流程',
    '考勤与门禁联动管理',
    '工会会员管理办法',
  ],
  行政: [
    '印章使用管理办法',
    '公务用车管理办法',
    '会议室预约与使用规范',
    '办公用品领用细则',
    '公司通讯录管理制度',
    '访客接待与登记办法',
    '差旅预订与报销指引',
    '前台接待服务规范',
    '固定资产盘点细则',
    '档案归档与借阅管理',
    '食堂运营管理办法',
    '宿舍分配与管理办法',
    '快递收发管理细则',
    '名片印制申领指引',
    '饮用水与绿植管理',
    '办公室节电管理办法',
    '工位调整与分配规则',
    '节假日值班安排',
    '办公区吸烟管理',
    '会议室设备使用规范',
  ],
  财务: [
    '费用报销管理办法',
    '对外付款审批流程',
    '发票开具与收取规范',
    '年度预算编制与执行',
    '员工借款管理办法',
    '差旅补贴与报销标准',
    '固定资产折旧管理办法',
    '税务申报与缴纳流程',
    '内部审计工作细则',
    '费用审批权限表',
    '采购付款管理办法',
    '员工福利费使用规范',
    '境外付款与外汇管理',
    '现金与银行账户管理',
    '财务档案管理办法',
    '往来账款对账细则',
    '资本性支出审批',
    '员工报销时限规定',
    '财务印章使用管理',
    '食堂收支核算办法',
  ],
  IT: [
    '员工账号与权限管理',
    '密码策略与定期更换',
    'IT设备领用与归还',
    '办公网络使用规范',
    '数据分类分级管理',
    '软件采购与正版化',
    '远程办公接入指引',
    '数据备份与恢复流程',
    '信息安全事件响应',
    'AI 工具使用合规指引',
    'VPN 使用管理办法',
    'USB 与移动存储管理',
    '邮件使用与归档',
    '办公电脑日常维护',
    '打印机使用管理',
    '代码仓库权限管理',
    '生产数据访问审批',
    '离职员工账号回收',
    '云盘使用管理办法',
    '终端杀毒与补丁管理',
  ],
  法务: [
    '保密与商业秘密保护',
    '员工保密协议（NDA）模板',
    '竞业限制管理办法',
    '合同审批与签署流程',
    '个人信息与隐私合规',
    '知识产权归属管理',
    '反舞弊与举报机制',
    '数据出境合规指引',
    '印章使用与法律效力',
    '诉讼与仲裁处理流程',
    '反洗钱合规细则',
    '客户合同台账制度',
    '供应商合规调查',
    '广告与宣传合规审查',
    '劳动争议处理细则',
    '境外投资法律审查',
    '反垄断合规指引',
    'ESG 报告与披露管理',
    '授权委托书管理办法',
    '关联交易识别与披露',
  ],
};

// 写条款内容生成器（每份文件用一致的真实感模板）
function makeBody(spec: DocSpec, idx: number): string {
  const lines: string[] = [];
  lines.push(`【${spec.title}】`);
  lines.push(
    `版本号：${spec.version}    生效日期：${spec.effectiveDate}    责任部门：${spec.owner}`,
  );
  lines.push(`文档编号：${spec.category}-${String(idx).padStart(3, '0')}`);
  lines.push('');
  for (const s of spec.sections) {
    lines.push(`## ${s.heading}`);
    lines.push(s.body);
    lines.push('');
  }
  if (spec.trapClause) {
    lines.push('## 附则（补充说明）');
    lines.push(spec.trapClause);
    lines.push('');
  }
  lines.push(`—— ${spec.owner} 制定并解释`);
  return lines.join('\n');
}

// 部门下设组别表（用于职责分工段补充"组织架构"事实，散落在多份文件互补出现）
const ORG_STRUCTURE: Record<Category, { full: string[]; partial: string[] }> = {
  人事: {
    full: ['招聘组', '培训组', '薪酬组', '绩效组', '员工关系组', '组织发展组'],
    partial: [
      '招聘组',
      '培训组',
      '薪酬组',
      '绩效组',
      '招聘组、培训组、员工关系组',
      '薪酬组、绩效组',
      '培训组、组织发展组',
      '招聘组、员工关系组',
    ],
  },
  行政: {
    full: ['前台组', '差旅组', '印章与证照组', '固定资产组', '档案与后勤组', '安保组'],
    partial: [
      '前台组、差旅组',
      '印章与证照组、档案与后勤组',
      '固定资产组、安保组',
      '差旅组、固定资产组',
      '前台组、印章与证照组',
    ],
  },
  财务: {
    full: ['应付组', '应收组', '总账组', '预算组', '税务组', '资金管理组', '审计对接组'],
    partial: [
      '应付组、应收组',
      '总账组、预算组',
      '税务组、资金管理组',
      '预算组、审计对接组',
      '应付组、总账组',
    ],
  },
  IT: {
    full: ['运维组', '安全组', '应用开发组', '桌面支持组', '数据平台组', 'AI 平台组'],
    partial: [
      '运维组、安全组',
      '应用开发组、数据平台组',
      '桌面支持组、AI 平台组',
      '运维组、桌面支持组',
      '安全组、数据平台组',
    ],
  },
  法务: {
    full: ['合规组', '合同组', '诉讼组', '知识产权组', '数据合规组', '反舞弊组'],
    partial: [
      '合规组、合同组',
      '诉讼组、知识产权组',
      '数据合规组、反舞弊组',
      '合同组、知识产权组',
      '合规组、数据合规组',
    ],
  },
};

// 顶层组织架构（董事会→CEO→CXO→部门），散落在少数高级别制度里
const TOP_LEVEL_FACTS = [
  '公司采用董事会领导下的 CEO 负责制，下设 CTO、CFO、COO、CHO、CIO、CLO 六大 CXO 岗位。',
  '公司组织架构共四层：董事会 → CXO 办公室 → 职能部门 → 一线团队；CXO 办公室由 CEO 直接领导。',
  '各 CXO 对应归口部门：CHO 负责人力资源部、行政运营部；CFO 负责财务部；CIO 负责信息技术部；CLO 负责法务合规部。',
];

// 给每个标题配 8~10 段正文 + 偶尔埋陷阱 + 部分文件注入组织架构事实
function buildSpec(category: Category, title: string, idx: number): DocSpec {
  const dept = DEPT_BY_CAT[category];
  const version = `V${(idx % 5) + 1}.${(idx % 9) + 1}`;
  const year = 2024 + (idx % 3);
  const month = String((idx % 12) + 1).padStart(2, '0');
  const day = String(((idx * 3) % 28) + 1).padStart(2, '0');
  const effectiveDate = `${year}-${month}-${day}`;

  // 期限 / 金额 / 比例用 idx 派生，让每份数字不一样
  const applyDays = (idx % 5) + 2; // 2~6 个工作日
  const auditDays = (idx % 7) + 3; // 3~9 个工作日
  // const maxAmount = ((idx % 8) + 1) * 5000; // 5k~40k（预留生成金额条款）
  const penaltyDay = (idx % 3) + 1; // 1~3 倍日工资
  const approvalLimit = ((idx % 6) + 1) * 10000; // 1w~6w

  // 审批权限表（markdown 表格）
  const approvalTable = `
| 申请金额 | 审批人 | SLA（工作日） |
|---|---|---|
| ≤ ${approvalLimit / 2} 元 | 部门负责人 | 1 |
| ${approvalLimit / 2 + 1} ~ ${approvalLimit} 元 | 部门负责人 + ${dept}主管 | 2 |
| > ${approvalLimit} 元 | 部门负责人 + ${dept}主管 + 法务合规 | ${applyDays} |
| 紧急申请（口头/邮件） | 直接主管 + ${dept} | 1 + ${auditDays} 日内补办 |
`.trim();

  // 违规处理表
  const penaltyTable = `
| 违规等级 | 情形 | 处理 |
|---|---|---|
| 轻微 | 首次违规、金额 ≤ 1000 元 | 通报批评 + 责令整改 |
| 一般 | 12 个月内累计 2 次轻微违规 | 扣减绩效系数 0.1 |
| 严重 | 虚假报销 / 伪造凭证 / 金额 > 10000 元 | 扣减当月 ${penaltyDay} 倍日工资 + 书面警告 |
| 重大 | 触犯法律 / 涉及刑事 | 立即解除劳动合同 + 移送司法机关 |
`.trim();

  // 8~10 段骨架（贴近真实规章）
  const baseSections = [
    {
      heading: '一、目的与适用范围',
      body: `为规范${title}相关工作，明确职责与流程，提升运营效率与合规水平，特制定本办法。本办法适用于公司全体员工及相关部门，自 ${effectiveDate} 起施行，原有规定与本办法不一致的，以本办法为准。`,
    },
    {
      heading: '二、术语与定义',
      body: `本办法所称"${title}"，是指公司内部依据本制度开展的申请、审批、执行、归档等全流程活动的统称。所称"申请人"为发起相关流程的公司员工；"审批人"为依据权限表对申请进行审核的主管或部门负责人；"归口管理部门"为${dept}。`,
    },
    {
      heading: '三、职责分工',
      body: (() => {
        let b = `${dept}为${title}的归口管理部门，负责政策制定、流程优化与日常答疑；各业务部门负责人负责本部门内的执行与监督检查；财务部、法务合规部在涉及资金、合规事项时承担审核与监督职责。涉及跨部门协作的，由${dept}牵头组织联席会议协商解决。`;
        // ~30% 概率注入组织架构（让多份文件互补形成完整图）
        if (idx % 7 === 0 || idx % 11 === 0) {
          const partial =
            ORG_STRUCTURE[category].partial[idx % ORG_STRUCTURE[category].partial.length];
          b += `本部门内部下设 ${partial} 等职能组，分别负责本部门不同业务条线的具体执行工作。`;
        }
        // 高级别制度 + 顶层架构（约 3 份）
        if (
          (title.includes('员工手册') ||
            title.includes('印章') ||
            title.includes('高管') ||
            title.includes('汇报') ||
            title.includes('合规')) &&
          idx % 23 === 0
        ) {
          b += ` ${TOP_LEVEL_FACTS[idx % TOP_LEVEL_FACTS.length]}`;
        }
        return b;
      })(),
    },
    {
      heading: '四、申请条件与材料',
      body: `申请人须为公司正式在职员工，且在提交申请时满足以下条件：(1) 已完成入职培训并通过合规考核；(2) 申请事项真实、合理、符合本制度第七条所列情形；(3) 所需材料齐全，包括但不限于申请书、相关凭证、说明说明文件。申请材料须真实有效，不得伪造、变造。`,
    },
    {
      heading: '五、审批权限与流程',
      body: `相关申请应在公司内部 OA 系统中提交，按权限逐级审批。具体权限与 SLA 如下：\n\n${approvalTable}\n\n审批通过后由${dept}备案。紧急事项可先口头或邮件申请，并于 ${applyDays} 个工作日内补办系统流程；超期未补办视为放弃申请，已发生的费用由申请人自行承担。`,
    },
    {
      heading: '六、执行与归档',
      body: `审批通过后，申请人应在 ${applyDays} 个工作日内完成相关事项的执行；执行过程如需调整，须重新发起审批。完成后须在 ${auditDays} 个工作日内向${dept}提交执行报告（含凭证、票据、影像资料），由${dept}审核后归档。归档材料保存期限不少于 5 年，电子档案与纸质档案具有同等效力。`,
    },
    {
      heading: '七、禁止性规定',
      body: `从事${title}相关活动时，严禁出现以下行为：(1) 拆分金额规避审批权限；(2) 使用虚假发票、阴阳合同或与事实不符的说明材料；(3) 同一事项重复申请；(4) 私自向外部第三方提供制度副本、数据或影像资料；(5) 与外部供应商存在利益关联未主动申报；(6) 其他违反法律法规及公司制度的行为。`,
    },
    {
      heading: '八、违规处理',
      body: `${dept}与法务合规部对${title}执行情况开展定期与不定期抽查。违规情节认定与处理如下：\n\n${penaltyTable}\n\n涉嫌违法犯罪的，依法移送司法机关处理。`,
    },
    {
      heading: '九、附则',
      body: `本办法由${dept}负责解释，自颁布之日起执行。公司将根据业务发展与监管要求适时修订，修订后另行公告。`,
    },
    {
      heading: '十、附件清单',
      body: `本制度相关附件包括但不限于：(1) 附件 1：${title}标准申请表；(2) 附件 2：审批权限一览表；(3) 附件 3：常见问题 FAQ；(4) 附件 4：执行报告模板。附件与正文具有同等效力，附件由${dept}另行发布并动态维护。`,
    },
  ];

  // 5%~10% 概率埋陷阱：前后不一致
  const trap =
    idx % 11 === 0
      ? `注意：本办法与 ${category}-${String(Math.max(1, idx - 1)).padStart(3, '0')} 号文相关规定存在差异，以旧文为准；如有疑问，请联系${dept}。`
      : undefined;

  return {
    category,
    title,
    version,
    effectiveDate,
    owner: dept,
    sections: baseSections,
    ...(trap ? { trapClause: trap } : {}),
  };
}

// ── 文件生成器 ────────────────────────────────────────────────
async function genText(file: string, body: string) {
  await writeFile(file, body, 'utf8');
}

async function genMd(file: string, body: string) {
  await writeFile(file, body, 'utf8');
}

async function genHtml(file: string, body: string) {
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${(body.split('\n')[0] ?? '').replace(/[【】]/g, '')}</title></head>
<body><pre style="font-family: 'Microsoft YaHei', sans-serif; line-height: 1.7">${escapeHtml(body)}</pre></body></html>`;
  await writeFile(file, html, 'utf8');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function genCsv(file: string, body: string) {
  // 简单把正文转成"键,值"两列：标题/版本/日期/部门 + sections
  const lines = body.split('\n').filter(Boolean);
  const rows = [['字段', '内容']];
  rows.push(['文档标题', lines[0]?.replace(/[【】]/g, '') ?? '']);
  rows.push(['版本', 'V1.0']);
  rows.push(['所属类别', '规章制度']);
  for (const ln of lines.slice(1)) {
    rows.push([ln.slice(0, 12), ln]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  await writeFile(file, '﻿' + csv, 'utf8'); // 加 BOM 让 Excel 能识别中文
}

async function genPdf(file: string, body: string, scanned: boolean) {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    // PDFKit 默认 Helvetica 只编码 Latin-1，会丢中文
    // 注册 SimHei（系统自带 TTF，PDFKit 子集化嵌入）
    doc.registerFont('cjk', 'C:/Windows/Fonts/simhei.ttf');
    doc.font('cjk');
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', async () => {
      try {
        const buf = Buffer.concat(chunks);
        await writeFile(file, buf);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    doc.on('error', reject);

    if (scanned) {
      // 扫描型 PDF：插一张"扫描"图片占位（用 sharp 生成一张带文字的 PNG 后再嵌入）
      // 这里直接绘制"扫描件"风——大段灰底文字 + 印章圆圈
      doc
        .rect(40, 40, doc.page.width - 80, doc.page.height - 80)
        .fillColor('#f5f5f5')
        .fill();
      doc.fillColor('#222');
      doc.fontSize(20).text('【扫描件·原件归档】', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(body, { align: 'left' });
      // 假印章
      doc
        .circle(doc.page.width - 100, 100, 40)
        .lineWidth(2)
        .strokeColor('#cc0000')
        .stroke();
      doc
        .fillColor('#cc0000')
        .fontSize(10)
        .text('已 盖 章', doc.page.width - 130, 92);
    } else {
      // 文本型 PDF：标题 + 正文
      const firstLine = body.split('\n')[0];
      doc.fontSize(18).text(firstLine, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(body.split('\n').slice(1).join('\n'), { align: 'left' });
    }
    doc.end();
  });
}

async function genDocx(file: string, body: string) {
  const lines = body.split('\n');
  const children: Paragraph[] = [];
  for (const ln of lines) {
    if (/^## /.test(ln)) {
      children.push(
        new Paragraph({ text: ln.replace(/^## /, ''), heading: HeadingLevel.HEADING_2 }),
      );
    } else if (ln.startsWith('【') && ln.endsWith('】')) {
      children.push(new Paragraph({ text: ln, heading: HeadingLevel.HEADING_1 }));
    } else if (ln.trim()) {
      children.push(new Paragraph({ text: ln }));
    } else {
      children.push(new Paragraph({ text: '' }));
    }
  }
  const doc = new DocxDocument({ sections: [{ properties: {}, children }] });
  const buf = await Packer.toBuffer(doc);
  await writeFile(file, buf);
}

async function genXlsx(file: string, spec: DocSpec) {
  const wb = new ExcelJS.Workbook();
  wb.creator = DEPT_BY_CAT[spec.category];
  wb.created = new Date(spec.effectiveDate);

  const ws = wb.addWorksheet(spec.title.slice(0, 30));
  ws.columns = [
    { header: '条目', key: 'item', width: 24 },
    { header: '内容', key: 'value', width: 70 },
  ];
  ws.addRow({ item: '文档标题', value: spec.title });
  ws.addRow({ item: '版本号', value: spec.version });
  ws.addRow({ item: '生效日期', value: spec.effectiveDate });
  ws.addRow({ item: '责任部门', value: spec.owner });
  ws.addRow({ item: '文档编号', value: `${spec.category}-${spec.title}` });
  ws.addRow({ item: '', value: '' });
  for (const s of spec.sections) {
    ws.addRow({ item: s.heading, value: s.body });
  }
  if (spec.trapClause) ws.addRow({ item: '附则（陷阱条款）', value: spec.trapClause });

  await wb.xlsx.writeFile(file);
}

async function genPptx(file: string, spec: DocSpec) {
  // pptxgenjs 类型定义不识别 default export；运行时正常
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pptx = new (PPTXGen as any)();
  pptx.author = DEPT_BY_CAT[spec.category];
  pptx.title = spec.title;

  // 封面
  let s = pptx.addSlide();
  s.addText(spec.title, { x: 0.5, y: 1.5, w: 9, h: 1, fontSize: 32, bold: true, align: 'center' });
  s.addText(`${spec.owner}   |   ${spec.version}   |   ${spec.effectiveDate}`, {
    x: 0.5,
    y: 3,
    w: 9,
    h: 0.5,
    fontSize: 14,
    align: 'center',
    color: '666666',
  });

  // 内容页
  for (const sec of spec.sections) {
    s = pptx.addSlide();
    s.addText(sec.heading, { x: 0.5, y: 0.5, w: 9, h: 0.7, fontSize: 24, bold: true });
    s.addText(sec.body, { x: 0.5, y: 1.4, w: 9, h: 5.2, fontSize: 14, valign: 'top' });
  }
  // 陷阱条款页（若有）
  if (spec.trapClause) {
    s = pptx.addSlide();
    s.addText('附则（补充说明）', { x: 0.5, y: 0.5, w: 9, h: 0.7, fontSize: 24, bold: true });
    s.addText(spec.trapClause, { x: 0.5, y: 1.4, w: 9, h: 5.2, fontSize: 14, valign: 'top' });
  }

  await pptx.writeFile({ fileName: file });
}

async function genPng(file: string, body: string) {
  // 用 sharp 把正文渲染成 PNG（白底黑字，扫描件风格）
  const titleLine = body.split('\n')[0] ?? '';
  const content = body.split('\n').slice(1).join('\n');

  // 简化：用 SVG 转 PNG 拿到一张像样的"扫描件"
  // librsvg 不支持 TTC，必须用 TTF；用 Windows 自带 NotoSansSC-VF.ttf
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754">
  <defs>
    <style>
      text { font-family: 'Noto Sans SC', sans-serif; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#f8f5ee"/>
  <text x="620" y="100" font-size="48" fill="#222" text-anchor="middle">${escapeXml(titleLine)}</text>
  ${content
    .split('\n')
    .map(
      (line, i) =>
        `<text x="80" y="${180 + i * 50}" font-size="28" fill="#222">${escapeXml(line).slice(0, 40)}</text>`,
    )
    .join('\n')}
  <circle cx="1080" cy="220" r="120" fill="none" stroke="#cc0000" stroke-width="6"/>
  <text x="1080" y="230" font-size="32" fill="#cc0000" text-anchor="middle">已 盖 章</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(file);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 主流程：分配 100 份到各格式 ────────────────────────────────
async function main() {
  const outDir = join(process.cwd(), ROOT);
  await mkdir(outDir, { recursive: true });

  // 1. 先把所有 100 份的 spec 拍平
  const specs: { spec: DocSpec; idx: number }[] = [];
  let idx = 1;
  for (const cat of CATEGORIES) {
    for (const t of TITLES[cat]) {
      specs.push({ spec: buildSpec(cat, t, idx), idx });
      idx++;
    }
  }
  if (specs.length !== 100) throw new Error(`spec 数量不对：${specs.length}`);

  // 2. 格式分配规则
  const assignments: { ext: string; scanned?: boolean }[] = [];
  // PDF: 30（其中 5 个 scanned）
  for (let i = 0; i < 30; i++) assignments.push({ ext: 'pdf', scanned: i < 5 });
  // MD: 20
  for (let i = 0; i < 20; i++) assignments.push({ ext: 'md' });
  // DOCX: 15
  for (let i = 0; i < 15; i++) assignments.push({ ext: 'docx' });
  // XLSX: 10
  for (let i = 0; i < 10; i++) assignments.push({ ext: 'xlsx' });
  // PPTX: 5
  for (let i = 0; i < 5; i++) assignments.push({ ext: 'pptx' });
  // PNG: 5
  for (let i = 0; i < 5; i++) assignments.push({ ext: 'png' });
  // 混合填剩余
  const remain = 100 - assignments.length; // = 15
  for (let i = 0; i < remain; i++) {
    const pick = (['html', 'csv', 'txt'] as const)[i % 3] ?? 'txt';
    assignments.push({ ext: pick });
  }
  if (assignments.length !== 100) throw new Error(`assignments 数量不对：${assignments.length}`);

  // 3. 真正写文件
  const summary: Record<string, number> = {};
  for (let i = 0; i < specs.length; i++) {
    const specEntry = specs[i];
    if (!specEntry) continue;
    const assignEntry = assignments[i];
    if (!assignEntry) continue;
    const { spec, idx: specIdx } = specEntry;
    const { ext, scanned = false } = assignEntry;
    const file = join(
      outDir,
      `${specIdx.toString().padStart(3, '0')}_${spec.category}_${spec.title}.${ext}`,
    );
    const body = makeBody(spec, specIdx);

    switch (ext) {
      case 'pdf':
        await genPdf(file, body, !!scanned);
        break;
      case 'md':
        await genMd(file, body);
        break;
      case 'docx':
        await genDocx(file, body);
        break;
      case 'xlsx':
        await genXlsx(file, spec);
        break;
      case 'pptx':
        await genPptx(file, spec);
        break;
      case 'png':
        await genPng(file, body);
        break;
      case 'html':
        await genHtml(file, body);
        break;
      case 'csv':
        await genCsv(file, body);
        break;
      case 'txt':
        await genText(file, body);
        break;
      default:
        throw new Error(`未知格式：${ext}`);
    }
    summary[ext] = (summary[ext] ?? 0) + 1;
  }

  // 4. 输出摘要
  console.log(`✅ 已生成 100 份企业规章制度语料到 ${outDir}`);
  console.log('格式分布：');
  for (const [ext, n] of Object.entries(summary).sort()) {
    console.log(`  .${ext.padEnd(4)} × ${n}`);
  }
}

main().catch((e) => {
  console.error('生成失败：', e);
  process.exit(1);
});
