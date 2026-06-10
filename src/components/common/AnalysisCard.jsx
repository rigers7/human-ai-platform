import React, { useState } from 'react';
import {
  LuCheck,
  LuCircleAlert,
  LuBrain,
  LuTarget,
  LuChevronDown,
  LuChevronUp,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// DEFINITION OF ALL CATEGORIES (ensures all are always displayed)
const ALL_CATEGORIES = ["Education", "Writing", "Coding", "Work", "Other"];

export default function AnalysisCard({ analysis }) {
  // --- STATE FOR COLLAPSIBILITY ---
  const [isOpen, setIsOpen] = useState(false);

  if (!analysis) return null;

  // 1. Calculate hallucination rate
  const matchScore = analysis.response_match_score || 0;
  const hallucinationRate = 100 - matchScore;

  // 2. Dynamic colors & status
  let textColor = "text-emerald-700";
  let barColor = "bg-emerald-500";
  let label = "Safe Response";
  let btnBg = "bg-emerald-50 hover:bg-emerald-100";
  let btnBorder = "border-emerald-200";

  if (hallucinationRate > 20) {
    textColor = "text-amber-700";
    barColor = "bg-amber-500";
    label = "Warning: Inaccuracies";
    btnBg = "bg-amber-50 hover:bg-amber-100";
    btnBorder = "border-amber-200";
  }
  if (hallucinationRate > 50) {
    textColor = "text-red-700";
    barColor = "bg-red-600";
    label = "Critical Hallucination Risk";
    btnBg = "bg-red-50 hover:bg-red-100";
    btnBorder = "border-red-200";
  }

  // Check hard status from the LLM
  const isFail = analysis.hallucination_check === "Fail";

  // --- 3. HELPER: NORMALIZE & SUM CATEGORIES ---
  const normalizedCategories = ALL_CATEGORIES.map(catName => {
    // A. Find all entries matching this name (not just the first!)
    // This fixes the issue when the LLM returns e.g. 2x "Coding".
    const matches = analysis.categories?.filter(c =>
      (c.tag === catName) || (c.category === catName)
    ) || [];

    // B. Sum scores
    const totalScore = matches.reduce((acc, curr) => {
      const val = curr.score !== undefined ? curr.score : (curr.percentage || 0);
      // If value <= 1 (e.g. 0.85), multiply by 100; otherwise use as-is
      return acc + (val <= 1 ? val * 100 : val);
    }, 0);

    return { name: catName, percentage: Math.round(totalScore) };
  });

  // C. Safety check for visual 100% (catch rounding errors)
  // e.g. 33.3 + 33.3 + 33.3 = 99.9 -> pad to 100 on the largest value.
  const currentTotal = normalizedCategories.reduce((sum, item) => sum + item.percentage, 0);
  if (currentTotal > 0 && currentTotal !== 100) {
    const largest = normalizedCategories.reduce((prev, current) => (prev.percentage > current.percentage) ? prev : current);
    largest.percentage += (100 - currentTotal);
  }

  // D. Sort: highest percentage first
  normalizedCategories.sort((a, b) => b.percentage - a.percentage);


  // --- 4. VIEW: COLLAPSED STATE (SMALL BUTTON) ---
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`mt-2 mb-1 flex items-center gap-2 px-3 py-1.5 rounded-full border ${btnBorder} ${btnBg} transition-all duration-200 group animate-in fade-in slide-in-from-top-1`}
      >
        {isFail || hallucinationRate > 50 ? (
          <LuCircleAlert className="text-red-500" size={14} />
        ) : (
          <LuCheck className="text-emerald-600" size={14} />
        )}
        <span className={`text-xs font-semibold ${isFail ? 'text-red-700' : 'text-gray-700'}`}>
          AI Analysis ({analysis.prompt_quality_score || 0}%)
        </span>
        <LuChevronDown className={`ml-1 opacity-50 group-hover:opacity-100 ${isFail ? 'text-red-700' : 'text-gray-700'}`} size={14} />
      </button>
    );
  }

  // --- 5. VIEW: EXPANDED STATE (FULL CARD) ---
  return (
    <div className={`mt-4 mb-2 rounded-xl border ${isFail ? 'border-red-300' : 'border-gray-200'} overflow-hidden shadow-sm font-sans bg-white animate-in zoom-in-95 duration-200`}>

      {/* HEADER */}
      <div
        className={`px-4 py-3 border-b border-gray-100 flex justify-between items-center cursor-pointer ${isFail ? 'bg-red-50' : 'bg-white'}`}
        onClick={() => setIsOpen(false)}
      >
        <div className="flex items-center gap-2">
          {isFail || hallucinationRate > 50 ? (
            <LuCircleAlert className="text-red-500" size={18} />
          ) : (
            <LuCheck className="text-emerald-500" size={18} />
          )}
          <span className={`text-xs font-bold uppercase tracking-wider ${isFail ? 'text-red-600' : 'text-gray-500'}`}>
            AI Audit Report
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className={`text-xs font-mono font-bold px-2 py-1 rounded-md border ${isFail ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
            Match: {matchScore}%
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors"
          >
            <LuChevronUp size={18} />
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="p-4 space-y-5">

        {/* HALLUCINATION METER */}
        <div>
          <div className="flex justify-between items-end mb-1.5">
            <span className={`text-xs font-bold ${textColor} flex items-center gap-1.5`}>
              {label}
              {isFail && <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded uppercase tracking-widest">Fail</span>}
            </span>
            <span className="text-xs font-medium text-gray-400">
              {hallucinationRate}% Divergence
            </span>
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor} ${hallucinationRate > 50 ? 'animate-pulse' : ''}`}
              style={{ width: `${hallucinationRate}%` }}
            />
          </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Prompt Quality */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <LuTarget size={14} /> Prompt Quality
              </div>
              <span className="text-slate-800 font-bold text-sm">{analysis.prompt_quality_score}%</span>
            </div>

            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mb-3 shrink-0">
              <div className="h-full bg-slate-800 rounded-full" style={{ width: `${analysis.prompt_quality_score}%` }}></div>
            </div>

            {analysis.rating_metrics && (
              <div className="space-y-1.5 flex-1">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">KPI Breakdown</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Clarity:</span>
                    <span className="font-mono font-medium text-slate-700">{Math.round((analysis.rating_metrics.specification || 0) <= 1 ? (analysis.rating_metrics.specification || 0) * 100 : (analysis.rating_metrics.specification || 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Structure:</span>
                    <span className="font-mono font-medium text-slate-700">{Math.round((analysis.rating_metrics.grammar || 0) <= 1 ? (analysis.rating_metrics.grammar || 0) * 100 : (analysis.rating_metrics.grammar || 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Constraints:</span>
                    <span className="font-mono font-medium text-slate-700">{Math.round((analysis.rating_metrics.length || 0) <= 1 ? (analysis.rating_metrics.length || 0) * 100 : (analysis.rating_metrics.length || 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Anchoring:</span>
                    <span className="font-mono font-medium text-slate-700">{Math.round((analysis.rating_metrics.token_performance || 0) <= 1 ? (analysis.rating_metrics.token_performance || 0) * 100 : (analysis.rating_metrics.token_performance || 0))}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-slate-500">Pattern:</span>
                    <span className="font-mono font-medium text-slate-700">{Math.round((analysis.rating_metrics.llm_response_fitting || 0) <= 1 ? (analysis.rating_metrics.llm_response_fitting || 0) * 100 : (analysis.rating_metrics.llm_response_fitting || 0))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Categories - Complete & Summed */}
          <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm ring-1 ring-gray-400/5 flex flex-col h-full">
            <div className="flex items-center gap-1.5 text-gray-400 mb-3 text-[10px] uppercase tracking-wider font-semibold">
              <LuBrain size={14} /> Topic Distribution
            </div>
            <div className="space-y-2.5 flex-1">
              {normalizedCategories.map((cat, idx) => (
                <div key={idx} className="flex items-center gap-2 group">
                  <div className="w-20 shrink-0 text-[11px] font-medium text-gray-600 truncate group-hover:text-black transition-colors">
                    {cat.name}
                  </div>
                  <div className="flex-1 h-1.5 bg-gray-50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-opacity ${cat.percentage > 0 ? 'bg-blue-500 opacity-80 group-hover:opacity-100' : 'bg-transparent'}`}
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                  <div className={`w-8 shrink-0 text-[10px] text-right font-mono ${cat.percentage === 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                    {cat.percentage}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Prompt Improvement Suggestions */}
        <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm ring-1 ring-gray-400/5">
          <div className="flex items-center gap-1.5 text-gray-400 mb-3 text-[10px] uppercase tracking-wider font-semibold">
            Prompt Optimization
          </div>

          <div className="max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent pr-2">
            <div className="prose prose-sm prose-gray max-w-none text-xs leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {analysis.prompt_improvement_suggestion || "*No suggestions available*"}
              </ReactMarkdown>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
