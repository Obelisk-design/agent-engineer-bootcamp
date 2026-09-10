/**
 * Manifest 元数据索引：扫描 200 份文件，按文件名约定解析出
 * {id, category, title, format, size, dept, owner, version, effective_date, keywords}。
 *
 * 命名约定：`NNN_<category>_<title>.<ext>`（前 100 份主脚本 + 后 100 份 extra 脚本）
 */
import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type ManifestEntry = {
  id: string;
  filename: string;
  category: string;
  title: string;
  format: string;
  size_bytes: number;
  dept: string;
  version: string;
  effective_date: string;
  doc_id: string;
  keywords: string[];
};

// 文件名格式：NNN_<category>_<title>.<ext>
const FILE_RE = /^(\d{3,})_([^_]+)_(.+)\.([^.]+)$/;
const FILE_RE_WIKI = /^(\d{3,})_([^_]+)_(.+)\.(wiki\.md)$/;

const DEPT_BY_CAT: Record<string, string> = {
  人事: '人力资源部',
  行政: '行政运营部',
  财务: '财务部',
  IT: '信息技术部',
  法务: '法务合规部',
};

// 标题 → 关键词（基于 200 份文件出现频率较高的词）
const KEYWORDS_BY_TITLE: Record<string, string[]> = {
  考勤管理: ['考勤', '打卡', '迟到', '旷工'],
  休假: ['休假', '年假', '病假', '事假'],
  招聘: ['招聘', '录用', 'offer', '背调'],
  绩效: ['绩效', 'KPI', 'OKR', '考核'],
  培训: ['培训', '内训', '外训', '讲师'],
  薪酬: ['薪酬', '工资', '奖金', '调薪'],
  离职: ['离职', '交接', '工作交接', '离职证明'],
  印章: ['印章', '公章', '合同章', '法人章'],
  报销: ['报销', '差旅', '发票', '凭证'],
  合同: ['合同', '审批', '签署', '法务'],
  保密: ['保密', '商业秘密', 'NDA', '竞业'],
  AI: ['AI', '人工智能', '大模型', '合规'],
  VPN: ['VPN', '远程接入', '加密', '网络安全'],
  密码: ['密码', '口令', '复杂度', '定期更换'],
  数据备份: ['备份', '恢复', '容灾', 'RPO'],
  事件响应: ['事件', '应急', '响应', 'SLA'],
  举报: ['举报', '反舞弊', '匿名', '合规'],
  ESG: ['ESG', '环境', '社会', '治理'],
};

function extractKeywords(title: string): string[] {
  const set = new Set<string>();
  for (const [k, words] of Object.entries(KEYWORDS_BY_TITLE)) {
    if (title.includes(k)) words.forEach((w) => set.add(w));
  }
  return Array.from(set);
}

export async function buildManifest(corpusDir: string): Promise<ManifestEntry[]> {
  const files = await readdir(corpusDir);
  const entries: ManifestEntry[] = [];

  for (const filename of files) {
    if (filename.startsWith('.')) continue;
    // 顺序匹配：先 wiki.md 再普通 .ext
    const mWiki = FILE_RE_WIKI.exec(filename);
    const mStd = mWiki ?? FILE_RE.exec(filename);
    if (mStd === null) continue;

    // mStd 已是 RegExpExecArray，但解构出来的子组类型是 string | undefined
    // 用显式 fallback 收窄（exactOptionalPropertyTypes=true 要求非可选字段不能 undefined）
    const id = mStd[1] ?? '';
    const category = mStd[2] ?? '';
    const title = mStd[3] ?? '';
    const format = mStd[4] ?? '';
    if (!id || !category || !title || !format) continue;

    const st = await stat(join(corpusDir, filename));

    // 从文件名派生版本/日期（生成器确定的）
    const n = parseInt(id, 10);
    const year = 2024 + (n % 3);
    const month = String((n % 12) + 1).padStart(2, '0');
    const day = String(((n * 3) % 28) + 1).padStart(2, '0');
    const effectiveDate = `${year}-${month}-${day}`;

    entries.push({
      id,
      filename,
      category,
      title,
      format,
      size_bytes: st.size,
      dept: DEPT_BY_CAT[category] ?? '未知',
      version: `V${(n % 5) + 1}.${(n % 9) + 1}`,
      effective_date: effectiveDate,
      doc_id: `${category}-${id}`,
      keywords: extractKeywords(title),
    });
  }
  return entries.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
}
