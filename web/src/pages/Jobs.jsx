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
      {tab === "board" ? <Board /> : null}
      {tab === "interviews" ? <Interviews /> : null}
      {tab === "resumes" ? <Resumes /> : null}
      {tab === "offers" ? <Offers /> : null}
    </Layout>
  );
}
