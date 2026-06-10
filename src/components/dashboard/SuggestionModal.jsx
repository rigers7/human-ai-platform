import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { LuX, LuLoader, LuPenTool } from 'react-icons/lu';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SuggestionModal = ({ analysis, onClose }) => {
    const [promptText, setPromptText] = useState("");
    const [loading, setLoading] = useState(true);

    // Helper to normalize scores - handles both 0-1 and 0-100 formats
    const normalizeScore = (score) => {
        if (score === undefined || score === null) return 0;
        return score <= 1 ? score * 100 : score;
    };

    const radarData = analysis?.rating_metrics ? [
        { subject: 'Clarity', A: normalizeScore(analysis.rating_metrics.specification), fullMark: 100 },
        { subject: 'Structure', A: normalizeScore(analysis.rating_metrics.grammar), fullMark: 100 },
        { subject: 'Constraints', A: normalizeScore(analysis.rating_metrics.length), fullMark: 100 },
        { subject: 'Anchoring', A: normalizeScore(analysis.rating_metrics.token_performance), fullMark: 100 },
        { subject: 'Pattern', A: normalizeScore(analysis.rating_metrics.llm_response_fitting), fullMark: 100 },
    ] : [];

    useEffect(() => {
        const fetchPrompt = async () => {
            // If userPrompt is already available from the analysis object, use it
            if (analysis?.userPrompt) {
                setPromptText(analysis.userPrompt);
                setLoading(false);
                return;
            }

            // Otherwise, fetch the user prompt from the database
            if (!analysis?.message_id || !analysis?.session_id) {
                setLoading(false);
                return;
            }

            try {
                // Get the user message from the same session, just before the bot message
                const { data } = await supabase
                    .from('chat_messages')
                    .select('content')
                    .eq('session_id', analysis.session_id)
                    .eq('role', 'user')
                    .lt('id', analysis.message_id)
                    .order('id', { ascending: false })
                    .limit(1)
                    .single();

                if (data) setPromptText(data.content);
            } catch (error) {
                console.error('Error fetching user prompt:', error);
                setPromptText("Error loading prompt.");
            }
            setLoading(false);
        };
        fetchPrompt();
    }, [analysis]);

    if (!analysis) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
                {/* LEFT: Analysis & Scores */}
                <div className="w-full md:w-1/3 bg-gray-50 p-6 border-r border-gray-100 flex flex-col gap-6">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-lg text-gray-900">Analysis Details</h3>
                    </div>

                    {/* Scores */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm text-center">
                            <span className="block text-2xl font-black text-gray-900">{analysis.prompt_quality_score}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Prompt Score</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm text-center">
                            <span className="block text-2xl font-black text-green-600">{analysis.response_match_score || 0}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Match Score</span>
                        </div>
                    </div>

                    {/* Radar Chart */}
                    <div className="flex-1 min-h-[200px] bg-white rounded-xl border border-gray-200 shadow-sm p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                <PolarGrid stroke="#E5E7EB" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6B7280', fontSize: 10 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar dataKey="A" stroke="#000000" strokeWidth={2} fill="#000000" fillOpacity={0.1} />
                                <Tooltip />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* RIGHT: Text Content */}
                <div className="w-full md:w-2/3 p-6 flex flex-col relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10"
                    >
                        <LuX size={20} />
                    </button>

                    <div className="space-y-6 overflow-y-auto pr-2 max-h-full">
                        {/* Prompt */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Prompt</h4>
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                                {loading ? (
                                    <div className="flex items-center gap-2 text-blue-400"><LuLoader className="animate-spin" /> Loading original prompt...</div>
                                ) : (
                                    promptText || "Prompt text not available."
                                )}
                            </div>
                        </div>

                        {/* Suggestion */}
                        {analysis.prompt_improvement_suggestion && (
                          <div className="mb-4">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">AI Suggestion</h4>
                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-sm text-gray-800 leading-relaxed flex gap-3">
                              <LuPenTool className="shrink-0 text-amber-500 mt-0.5" size={16} />

                              {/* Markdown Container */}
                              <div className="flex-1 prose prose-sm max-w-none text-gray-800 prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-strong:text-gray-900">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {analysis.prompt_improvement_suggestion}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Hallucination Info (if any) */}
                        {analysis.hallucination_check !== "Pass" && (
                          <div className="mb-4">
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Hallucination Check</h4>
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-sm text-red-800 leading-relaxed">

                              <div className="font-bold mb-1 opacity-90">{analysis.hallucination_check}:</div>

                              {/* Markdown Container */}
                              <div className="prose prose-sm max-w-none text-red-800 prose-p:my-1 prose-ul:my-1 prose-a:text-red-900 prose-strong:text-red-900">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {analysis.hallucination_details}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SuggestionModal;
