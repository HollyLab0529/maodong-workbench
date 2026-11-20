// 批量导入：把投递清单一次性搬进看板，不用一条条手敲。
// 支持三种粘贴格式：JSON 数组、CSV（带表头）、Markdown 表格（投递清单.md 直接粘）。
// 解析只是预填：逐行校验、可以取消勾选，确认了才写库——宁可不填也不填错。
import { useMemo, useState } from "react";
import { Modal, Button, Textarea, Checkbox, toast } from "../../components/ui";
import { FileUp, TriangleAlert, CheckCircle2, Link2 } from "lucide-react";
import { bulkInsertRows, parseJobLink } from "../../api";
import { parseCity, pad } from "../../jobs";

// 中英文表头都能认，投递清单里常写的是中文
const HEADER_MAP = {
  公司: "company", company: "company", 公司名: "company",
  岗位: "position", 职位: "position", position: "position",
  城市: "city", city: "city",
  地点: "location", 工作地点: "location", location: "location",
  链接: "link", url: "link", 网址: "link", link: "link",
  状态: "status", status: "status",
  档位: "tier", tier: "tier",
  来源: "source", 渠道: "source", source: "source",
  批次: "batch", batch: "batch",
  计划日期: "plan_date", 计划投递: "plan_date", plan: "plan_date", plan_date: "plan_date",
  已投日期: "applied_date", 投递日期: "applied_date", applied: "applied_date", applied_date: "applied_date",
  发布时间: "publish_date", 发布日期: "publish_date", publish: "publish_date", publish_date: "publish_date",
  备注: "note", note: "note",
  业务: "business", 业务线: "business", business: "business",
  公司类型: "company_type", 类型: "company_type", company_type: "company_type",
  下一步: "next_action", next_action: "next_action",
};

// 日期尽量收成 YYYY-MM-DD：认 2026/11/20、2026.11.20、2026年11月20日，认不出就原样留着让校验提示
function normDate(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return s;
}

// 三种格式拆成二维表：统一返回 { headers: [], rows: [][] }，认不出返回 null
function parseTable(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  // 1) JSON 数组
  if (/^[[{]/.test(text)) {
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : [data];
      const headers = Array.from(new Set(list.flatMap((o) => Object.keys(o || {}))));
      return { headers, rows: list.map((o) => headers.map((h) => o?.[h] ?? "")) };
    } catch {
      return null;
    }
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // 2) Markdown 表格：| a | b |，第二行是 |---|---|
  if (lines[0].startsWith("|")) {
    const cells = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const headers = cells(lines[0]);
    const rows = lines.slice(1).filter((l) => !/^:?-{3,}/.test(l.replace(/\s/g, ""))).map(cells);
    return { headers, rows };
  }
  // 3) CSV：第一行是表头（逗号或制表符，谁多听谁的）
  const sep = (lines[0].match(/\t/g) || []).length >= (lines[0].match(/,/g) || []).length ? "\t" : ",";
  const split = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]);
  return { headers, rows: lines.slice(1).map(split) };
}

export default function BulkImport({ open, existing, cfg, today, onClose, onDone }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null); // { rows: [{data, problems, include}] }
  const [busy, setBusy] = useState(false);
  const [singleUrl, setSingleUrl] = useState("");
  const [parsing, setParsing] = useState(false);

  const parse = () => {
    const t = parseTable(raw);
    if (!t || !t.rows.length) {
      toast.error("认不出这个格式。支持 JSON 数组、带表头的 CSV、Markdown 表格");
      return;
    }
    const seenLinks = new Set(existing.map((a) => a.link).filter(Boolean));
    const rows = t.rows.map((cells) => {
      const data = {};
      t.headers.forEach((h, i) => {
        const key = HEADER_MAP[String(h).trim().toLowerCase()] || HEADER_MAP[String(h).trim()];
        if (key && cells[i] !== undefined && String(cells[i]).trim() !== "") data[key] = String(cells[i]).trim();
      });
      if (data.plan_date) data.plan_date = normDate(data.plan_date);
      if (data.applied_date) data.applied_date = normDate(data.applied_date);
      if (data.publish_date) data.publish_date = normDate(data.publish_date);
      if (!data.city && data.location) data.city = parseCity(data.location).city;
      // 逐行校验：错误拦住，警告放行但说出来
      const problems = [];
      if (!data.company) problems.push({ level: "error", msg: "缺公司名" });
      if (!data.link) problems.push({ level: "warn", msg: "没有链接" });
      else if (seenLinks.has(data.link)) problems.push({ level: "warn", msg: "链接和已有岗位重复" });
      if (data.city && !["北京", "天津", "上海", "其他"].includes(data.city)) problems.push({ level: "warn", msg: `城市「${data.city}」不在常用列表，会归到其他` });
      if (data.status && !cfg.statuses.includes(data.status)) problems.push({ level: "warn", msg: `状态「${data.status}」不在状态表里，导入后按原样保留` });
      if (data.link) seenLinks.add(data.link);
      return { data, problems, include: !problems.some((p) => p.level === "error") };
    });
    setParsed(rows);
  };

  const included = (parsed || []).filter((r) => r.include && !r.problems.some((p) => p.level === "error"));

  const doImport = async () => {
    if (!included.length || busy) return;
    setBusy(true);
    try {
      const saved = await bulkInsertRows("job_apps", included.map((r) => r.data));
      const skipped = parsed.length - included.length;
      toast.success(`导入 ${saved.length} 条${skipped ? `，跳过 ${skipped} 条（校验没过或取消勾选）` : ""}`);
      setRaw(""); setParsed(null);
      onDone?.(saved);
      onClose();
    } catch (e) {
      toast.error("导入失败：" + e.message);
    } finally {
      setBusy(false);
    }
  };

  // 从链接导入单个：解析 → 预填表单（复用加岗位的表单，改起来顺手）
  const importSingle = async () => {
    const url = singleUrl.trim();
    if (!url || parsing) return;
    setParsing(true);
    try {
      const d = await parseJobLink(url);
      onDone?.([{ __single: true, ...d }]);
      setSingleUrl("");
      onClose();
    } catch (e) {
      toast.error("解析失败：" + e.message);
    } finally {
      setParsing(false);
    }
  };

  const dupLinks = useMemo(() => {
    const seen = new Set();
    let n = 0;
    (parsed || []).forEach((r) => {
      if (!r.data.link) return;
      if (seen.has(r.data.link)) n += 1;
      seen.add(r.data.link);
    });
    return n;
  }, [parsed]);

  return (
    <Modal open={open} onClose={onClose} title="批量导入岗位" wide>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          粘贴 JSON 数组、CSV（带表头）或 Markdown 表格都行，表头中文英文都能认。解析只是预填，确认前可以逐行取消。
        </p>
        <Textarea
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setParsed(null); }}
          rows={7}
          className="font-mono text-[12px]"
          placeholder={"公司,岗位,城市,链接,计划日期\n快手,策略产品经理,北京,https://...,2026-11-22\n小红书,社区产品实习,上海,https://...,"}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={parse} disabled={!raw.trim()}>
            <FileUp className="h-3.5 w-3.5" /> 解析预览
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-slate-300" />
            <input
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              placeholder="或粘一条链接单独导入"
              className="h-8 w-52 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-terracotta"
            />
            <Button size="sm" variant="ghost" onClick={importSingle} loading={parsing} disabled={!singleUrl.trim()}>
              解析
            </Button>
          </div>
        </div>

        {parsed ? (
          <div className="rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">
              <span>共 {parsed.length} 行</span>
              <span className="text-emerald-600">{included.length} 行可导入</span>
              {dupLinks ? <span className="text-amber-600">表内重复链接 {dupLinks} 条</span> : null}
              <button
                onClick={() => setParsed((list) => list.map((r) => ({ ...r, include: !r.problems.some((p) => p.level === "error") ? true : r.include })))}
                className="ml-auto text-terracotta-600 hover:underline"
              >
                全选
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {parsed.map((r, i) => (
                <div key={i} className={`flex items-start gap-2.5 border-b border-slate-50 px-3 py-2 last:border-0 ${r.problems.some((p) => p.level === "error") ? "opacity-60" : ""}`}>
                  <div className="pt-0.5">
                    <Checkbox
                      checked={r.include && !r.problems.some((p) => p.level === "error")}
                      onChange={() => !r.problems.some((p) => p.level === "error") && setParsed((list) => list.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-800">
                      <span className="font-medium">{r.data.company || "（缺公司名）"}</span>
                      <span className="text-slate-400"> · {r.data.position || "岗位未填"}</span>
                      {r.data.city ? <span className="ml-1.5 text-slate-400">{r.data.city}</span> : null}
                      {r.data.plan_date ? <span className="ml-1.5 text-slate-400">计划 {r.data.plan_date}</span> : null}
                    </p>
                    {r.problems.length ? (
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]">
                        {r.problems.map((p, k) => (
                          <span key={k} className={p.level === "error" ? "text-red-500" : "text-amber-500"}>
                            {p.level === "error" ? "✕" : "⚠"} {p.msg}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-500"><CheckCircle2 className="h-3 w-3" /> 没发现问题</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <p className="mr-auto flex items-center gap-1 text-[11px] text-slate-300">
            <TriangleAlert className="h-3 w-3" /> 缺公司名的行导不进去；其余警告只是提醒，不拦。
          </p>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={doImport} loading={busy} disabled={!included.length}>
            导入 {included.length} 条
          </Button>
        </div>
      </div>
    </Modal>
  );
}
