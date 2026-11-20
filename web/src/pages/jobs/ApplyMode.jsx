// 投递模式：一次只出现一家，投完自动下一家。
// 目的很简单——投递的时候别在列表里来回找，也不用每次点开详情改状态。
import { useEffect, useState } from "react";
import { Check, ChevronRight, ExternalLink, FileText, X, SkipForward, MapPin, PartyPopper } from "lucide-react";
import { Button } from "../../components/ui";
import { PublishTag, TierChip } from "./bits";

export default function ApplyMode({ queue, today, resumes, onApplied, onSkip, onClose }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const total = queue.length;
  const a = queue[i];

  const finish = () => {
    setI((n) => n + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (!queue[i]) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onApplied(queue[i]);
        setDone((d) => [...d, queue[i].id]);
        finish();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onSkip(queue[i]);
        setSkipped((s) => [...s, queue[i].id]);
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, queue, onApplied, onSkip, onClose]);

  if (!queue.length) return null;
  const resume = a ? resumes.find((r) => r.id === Number(a.resume_id)) : null;
  const ended = i >= total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4">
      {/* 手机上全屏贴底，按钮够大且离拇指近；桌面保持居中卡片 */}
      <div className="flex h-full w-full flex-col rounded-none bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:h-auto sm:max-w-lg sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-slate-400">投递模式</span>
          <span className="text-xs font-medium text-slate-600">{Math.min(i + 1, total)} / {total}</span>
          <div className="ml-2 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-terracotta" style={{ width: `${(Math.min(i, total) / total) * 100}%` }} />
          </div>
          <button onClick={onClose} className="ml-auto rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500" title="退出（Esc）">
            <X className="h-4 w-4" />
          </button>
        </div>

        {ended ? (
          <div className="py-8 text-center">
            <PartyPopper className="mx-auto mb-3 h-8 w-8 text-terracotta" />
            <p className="text-base font-medium text-slate-900">这一轮过完了</p>
            <p className="mt-1 text-sm text-slate-500">
              投了 {done.length} 家{skipped.length ? `，跳过 ${skipped.length} 家` : ""}。
              {skipped.length ? "跳过的还留在候选池里。" : ""}
            </p>
            <Button className="mt-5" onClick={onClose}>回看板</Button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-slate-900">{a.company}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{a.position || "岗位未填"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <TierChip tier={a.tier} />
              {a.city || a.location ? (
                <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{a.city || a.location}</span>
              ) : null}
              <PublishTag a={a} today={today} />
              {resume ? <span className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" />{resume.name}</span> : null}
              {a.source ? <span>{a.source}</span> : null}
            </div>
            {a.note ? <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">{a.note}</p> : null}

            {a.link ? (
              <a
                href={a.link}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-3 text-sm text-terracotta-600 hover:bg-terracotta-50"
              >
                打开岗位页 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">这家没有存链接，投的时候要自己找一下入口。</p>
            )}

            <div className="mt-auto grid grid-cols-2 gap-2 pt-4 sm:mt-4 sm:pt-0">
              <Button
                onClick={() => {
                  onApplied(a);
                  setDone((d) => [...d, a.id]);
                  finish();
                }}
                className="h-11"
              >
                <Check className="h-4 w-4" /> 已投（Enter）
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  onSkip(a);
                  setSkipped((s) => [...s, a.id]);
                  finish();
                }}
              >
                <SkipForward className="h-4 w-4" /> 跳过（→）
              </Button>
            </div>
            <button onClick={onClose} className="mt-3 flex w-full items-center justify-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
              先不投了，退出 <ChevronRight className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
