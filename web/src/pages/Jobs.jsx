import { useState } from "react";
import Layout from "../components/Layout";
import Board from "./jobs/Board";
import Interviews from "./jobs/Interviews";
import Resumes from "./jobs/Resumes";
import Offers from "./jobs/Offers";

const TABS = [
  { key: "board", label: "看板" },
  { key: "interviews", label: "面试复盘" },
  { key: "resumes", label: "简历库" },
  { key: "offers", label: "Offer 对比" },
];

export default function Jobs() {
  const [tab, setTab] = useState("board");
  // 简历库点「被 N 个岗位引用」时，把简历 id 交给看板，让全量视图直接筛出来
  const [resumeFocus, setResumeFocus] = useState(null);

  return (
    <Layout>
      <div className="mb-5 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? "bg-terracotta font-medium text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "board" ? <Board resumeFocus={resumeFocus} /> : null}
      {tab === "interviews" ? <Interviews /> : null}
      {tab === "resumes" ? (
        <Resumes
          onJumpToResume={(r) => {
            setResumeFocus({ id: r.id, name: r.name, at: Date.now() });
            setTab("board");
          }}
        />
      ) : null}
      {tab === "offers" ? <Offers /> : null}
    </Layout>
  );
}
