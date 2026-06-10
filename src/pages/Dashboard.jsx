import { useEffect, useState, useMemo } from "react";
import { useAuth } from '../context/AuthProvider';
import { supabase } from '../services/supabaseClient';
import { Link } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell, PieChart, Pie,
    CartesianGrid, AreaChart, Area, Legend, Label
} from "recharts";
import {
    LuMessageSquare, LuGhost, LuUser, LuMaximize2, LuGraduationCap, LuInfo, LuX
} from "react-icons/lu";
import { getCategoryIcon, getTimeFilteredData, isDayInRange, COLORS } from '../utils/dashboardUtils.jsx';
import MiniRadar from '../components/dashboard/MiniRadar';
import SuggestionModal from '../components/dashboard/SuggestionModal';


export default function Dashboard() {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Overview');
    const [monthOffset, setMonthOffset] = useState(0);
    const [visibleKpis, setVisibleKpis] = useState(['clarity']);
    const [selectedSuggestion, setSelectedSuggestion] = useState(null);
    const [timeFilter, setTimeFilter] = useState(null); // null = all time, or number of days
    const [selectedDateRange, setSelectedDateRange] = useState({ start: null, end: null });
    const [isSelectingRange, setIsSelectingRange] = useState(false);
    const [topPromptText, setTopPromptText] = useState('');
    const [infoModal, setInfoModal] = useState({ isOpen: false, metric: '', definition: '', position: { top: 0, left: 0 } });
    const [suggestionFilter, setSuggestionFilter] = useState('recent'); // 'recent', 'best', 'worst'
    const [suggestionsWithPrompts, setSuggestionsWithPrompts] = useState([]);

    // --- LOGIC ---
    const toggleKpi = (kpiName) => {
        setVisibleKpis(prev => prev.includes(kpiName) ? prev.filter(k => k !== kpiName) : [...prev, kpiName]);
    };

    // Handle day click in calendar
    const handleDayClick = (fullDateISO) => {
        const clickedDate = new Date(fullDateISO);
        clickedDate.setHours(0, 0, 0, 0);

        if (!isSelectingRange) {
            setSelectedDateRange({ start: clickedDate.toISOString(), end: clickedDate.toISOString() });
            setIsSelectingRange(true);
            setTimeFilter(null);
        } else {
            const startDate = new Date(selectedDateRange.start);
            if (clickedDate < startDate) {
                setSelectedDateRange({ start: clickedDate.toISOString(), end: selectedDateRange.start });
            } else {
                setSelectedDateRange({ start: selectedDateRange.start, end: clickedDate.toISOString() });
            }
            setIsSelectingRange(false);
        }
    };

    // Clear date range selection
    const clearDateRange = () => {
        setSelectedDateRange({ start: null, end: null });
        setIsSelectingRange(false);
        setTimeFilter(null);
    };

    const categories = useMemo(() => {
        const cats = new Set(['Overview']);
        data.forEach(item => {
            if (item.categories && Array.isArray(item.categories)) {
                item.categories.forEach(c => {
                    if (typeof c === 'string') cats.add(c);
                    else if (typeof c === 'object' && c !== null && c.tag) cats.add(c.tag);
                });
            }
        });
        return Array.from(cats);
    }, [data]);

    const filteredData = useMemo(() => {
        let categoryFiltered = activeTab === 'Overview' ? data : data.filter(item => {
            if (!item.categories) return false;
            return item.categories.some(c => {
                if (typeof c === 'string') return c === activeTab;
                if (typeof c === 'object' && c.tag) return c.tag === activeTab;
                return false;
            });
        });

        // Only apply time filter if not currently selecting a range
        const effectiveDateRange = isSelectingRange ? { start: null, end: null } : selectedDateRange;
        return getTimeFilteredData(categoryFiltered, timeFilter, effectiveDateRange);
    }, [data, activeTab, timeFilter, selectedDateRange, isSelectingRange]);

    const metrics = useMemo(() => {
        if (filteredData.length === 0 && activeTab !== 'Overview') return null;
        const safeData = filteredData || [];

        // Averages
        const totalPromptScore = safeData.reduce((acc, curr) => acc + (curr.prompt_quality_score || 0), 0);
        const avgPromptScore = safeData.length > 0 ? Math.round(totalPromptScore / safeData.length) : 0;
        const totalMatchScore = safeData.reduce((acc, curr) => acc + (curr.response_match_score || 0), 0);
        const avgMatchScore = safeData.length > 0 ? Math.round(totalMatchScore / safeData.length) : 0;
        // Success Rate = weighted average of prompt quality and output match (each 50%)
        const successRate = safeData.length > 0
            ? Math.round((avgPromptScore * 0.5) + (avgMatchScore * 0.5))
            : 0;
        const hallucinations = safeData.filter(i => i.hallucination_check === "Fail" || i.hallucination_check === "Warning").length;
        const hallucinationRate = safeData.length > 0 ? ((hallucinations / safeData.length) * 100).toFixed(1) : 0;

        // Radar & Token
        const radarAccumulator = { specification: 0, grammar: 0, length: 0, token_performance: 0, llm_response_fitting: 0, count: 0 };
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        // Helper to normalize scores - handles both 0-1 and 0-100 formats
        const normalizeScore = (score) => {
            if (score === undefined || score === null) return 0;
            return score <= 1 ? score * 100 : score;
        };

        safeData.forEach(item => {
            if (item.rating_metrics) {
                radarAccumulator.specification += normalizeScore(item.rating_metrics.specification);
                radarAccumulator.grammar += normalizeScore(item.rating_metrics.grammar);
                radarAccumulator.length += normalizeScore(item.rating_metrics.length);
                radarAccumulator.token_performance += normalizeScore(item.rating_metrics.token_performance);
                radarAccumulator.llm_response_fitting += normalizeScore(item.rating_metrics.llm_response_fitting);
                totalInputTokens += (item.rating_metrics.input_tokens || 0);
                totalOutputTokens += (item.rating_metrics.output_tokens || 0);
                radarAccumulator.count++;
            }
        });

        const radarData = radarAccumulator.count > 0 ? [
            { subject: 'Clarity', A: (radarAccumulator.specification / radarAccumulator.count), fullMark: 100 },
            { subject: 'Structure', A: (radarAccumulator.grammar / radarAccumulator.count), fullMark: 100 },
            { subject: 'Constraints', A: (radarAccumulator.length / radarAccumulator.count), fullMark: 100 },
            { subject: 'Anchoring', A: (radarAccumulator.token_performance / radarAccumulator.count), fullMark: 100 },
            { subject: 'Pattern', A: (radarAccumulator.llm_response_fitting / radarAccumulator.count), fullMark: 100 },
        ] : [];

        const historyData = activeTab === 'Overview' ? (() => {
            // Show all individual prompts with number labels
            return safeData
                .slice(-30) // Show last 30 prompts
                .map((item, index) => {
                    const quality = item.prompt_quality_score || 0;
                    const match = item.response_match_score || 0;
                    return {
                        index: index + 1,
                        name: `${index + 1}`,
                        // Success = weighted average of quality and match (each 50%)
                        success: (quality * 0.5) + (match * 0.5),
                        quality: quality,
                        match: match
                    };
                });
        })() : (() => {
            // Group by day for category dashboards
            const dayGroups = {};
            safeData.forEach(item => {
                if (item.created_at) {
                    const date = new Date(item.created_at).toISOString().split('T')[0]; // YYYY-MM-DD
                    if (!dayGroups[date]) {
                        dayGroups[date] = { quality: [], match: [] };
                    }
                    dayGroups[date].quality.push(item.prompt_quality_score || 0);
                    dayGroups[date].match.push(item.response_match_score || 0);
                }
            });

            // Get last 15 days
            const sortedDays = Object.keys(dayGroups).sort().slice(-15);
            return sortedDays.map((date, index) => {
                const avgQuality = dayGroups[date].quality.length > 0 ? dayGroups[date].quality.reduce((a, b) => a + b, 0) / dayGroups[date].quality.length : 0;
                const avgMatch = dayGroups[date].match.length > 0 ? dayGroups[date].match.reduce((a, b) => a + b, 0) / dayGroups[date].match.length : 0;
                return {
                    index: index + 1,
                    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    fullDate: date, // Keep full date for drill-down
                    quality: avgQuality,
                    match: avgMatch,
                    success: (avgQuality * 0.5) + (avgMatch * 0.5)
                };
            });
        })();

        const tokenHistoryData = safeData.slice(-10).map((item, index) => ({
            name: `Chat ${index + 1}`,
            Input: item.rating_metrics?.input_tokens || 0,
            Output: item.rating_metrics?.output_tokens || 0
        }));
        const totalTokens = totalInputTokens + totalOutputTokens;

        const catTokenStats = {};
        safeData.forEach(item => {
            const input = item.rating_metrics?.input_tokens || 0;
            const output = item.rating_metrics?.output_tokens || 0;
            if (item.categories) {
                item.categories.forEach(cRaw => {
                    let cat = typeof cRaw === 'string' ? cRaw : cRaw.tag;
                    if (!catTokenStats[cat]) catTokenStats[cat] = { inputSum: 0, outputSum: 0, count: 0 };
                    catTokenStats[cat].inputSum += input;
                    catTokenStats[cat].outputSum += output;
                    catTokenStats[cat].count += 1;
                });
            }
        });
        const tokenTableData = Object.keys(catTokenStats).map(cat => ({
            category: cat,
            avgInput: Math.round(catTokenStats[cat].inputSum / catTokenStats[cat].count),
            avgOutput: Math.round(catTokenStats[cat].outputSum / catTokenStats[cat].count),
            avgTotal: Math.round((catTokenStats[cat].inputSum + catTokenStats[cat].outputSum) / catTokenStats[cat].count)
        })).sort((a, b) => b.avgTotal - a.avgTotal);

        const sourceForTopics = safeData;
        const topicMap = {};
        // Topic Distribution using weighted portions (each prompt contributes 1.0 split among its categories)
        sourceForTopics.forEach(item => {
            if (item.categories && Array.isArray(item.categories) && item.categories.length > 0) {
                const numCategories = item.categories.length;
                const portionPerCategory = 1.0 / numCategories;

                item.categories.forEach(c => {
                    let name = "Unknown";
                    if (typeof c === 'string') name = c;
                    else if (typeof c === 'object' && c.tag) name = c.tag;
                    topicMap[name] = (topicMap[name] || 0) + portionPerCategory;
                });
            }
        });
        // Convert weighted portions to percentages (sum of all portions = number of prompts with categories)
        const totalPortions = Object.values(topicMap).reduce((sum, val) => sum + val, 0);
        const topicData = Object.keys(topicMap).map(k => ({
            name: k,
            value: totalPortions > 0 ? (topicMap[k] / totalPortions) * 100 : 0
        }));

        // Day Data (for calendar heatmap)
        const dayMap = {};
        safeData.forEach(item => {
            if (item.created_at) {
                const dateKey = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dayMap[dateKey] = (dayMap[dateKey] || 0) + 1;
            }
        });
        const dayData = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

        // KPI Trend Data (grouped by day with averages)
        const kpiTimeMap = {};
        safeData.forEach(item => {
            if (item.created_at && item.rating_metrics) {
                const dateKey = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (!kpiTimeMap[dateKey]) {
                    kpiTimeMap[dateKey] = {
                        clarity: [],
                        structure: [],
                        constraints: [],
                        anchoring: [],
                        pattern: []
                    };
                }
                kpiTimeMap[dateKey].clarity.push(normalizeScore(item.rating_metrics.specification));
                kpiTimeMap[dateKey].structure.push(normalizeScore(item.rating_metrics.grammar));
                kpiTimeMap[dateKey].constraints.push(normalizeScore(item.rating_metrics.length));
                kpiTimeMap[dateKey].anchoring.push(normalizeScore(item.rating_metrics.token_performance));
                kpiTimeMap[dateKey].pattern.push(normalizeScore(item.rating_metrics.llm_response_fitting));
            }
        });
        const kpiTrendData = Object.entries(kpiTimeMap)
            .map(([date, metrics]) => ({
                date,
                clarity: metrics.clarity.length > 0 ? metrics.clarity.reduce((a, b) => a + b, 0) / metrics.clarity.length : 0,
                structure: metrics.structure.length > 0 ? metrics.structure.reduce((a, b) => a + b, 0) / metrics.structure.length : 0,
                constraints: metrics.constraints.length > 0 ? metrics.constraints.reduce((a, b) => a + b, 0) / metrics.constraints.length : 0,
                anchoring: metrics.anchoring.length > 0 ? metrics.anchoring.reduce((a, b) => a + b, 0) / metrics.anchoring.length : 0,
                pattern: metrics.pattern.length > 0 ? metrics.pattern.reduce((a, b) => a + b, 0) / metrics.pattern.length : 0
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-14); // Last 14 days

        const suggestions = (() => {
            const itemsWithSuggestions = safeData.filter(i => i.prompt_improvement_suggestion);

            switch (suggestionFilter) {
                case 'best':
                    return itemsWithSuggestions
                        .sort((a, b) => (b.prompt_quality_score || 0) - (a.prompt_quality_score || 0))
                        .slice(0, 3);
                case 'worst':
                    return itemsWithSuggestions
                        .sort((a, b) => (a.prompt_quality_score || 0) - (b.prompt_quality_score || 0))
                        .slice(0, 3);
                case 'recent':
                default:
                    return itemsWithSuggestions
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, 3);
            }
        })();

        // Token Usage Over Time
        const tokenTimeMap = {};
        safeData.forEach(item => {
            if (item.created_at && item.rating_metrics) {
                const dateKey = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (!tokenTimeMap[dateKey]) {
                    tokenTimeMap[dateKey] = { input: 0, output: 0 };
                }
                tokenTimeMap[dateKey].input += item.rating_metrics.input_tokens || 0;
                tokenTimeMap[dateKey].output += item.rating_metrics.output_tokens || 0;
            }
        });
        const tokenTimeData = Object.entries(tokenTimeMap)
            .map(([date, tokens]) => ({
                date,
                input: tokens.input,
                output: tokens.output,
                total: tokens.input + tokens.output
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-14); // Last 14 days

        // Calculate Category Share using weighted portions (each prompt contributes 1.0 split among its categories)
        // This ensures all category shares sum to exactly 100%
        const effectiveDateRange = isSelectingRange ? { start: null, end: null } : selectedDateRange;
        const timeFilteredAllData = getTimeFilteredData(data, timeFilter, effectiveDateRange);

        let categoryPortionSum = 0;
        const totalPrompts = timeFilteredAllData.length;

        timeFilteredAllData.forEach(item => {
            if (item.categories && Array.isArray(item.categories) && item.categories.length > 0) {
                const numCategories = item.categories.length;
                const portionPerCategory = 1.0 / numCategories; // Each prompt contributes 1.0 total, split among categories

                item.categories.forEach(c => {
                    const catName = typeof c === 'string' ? c : (c.tag || '');
                    if (catName === activeTab) {
                        categoryPortionSum += portionPerCategory;
                    }
                });
            }
        });

        // Category share as percentage of total prompts (weighted by portion)
        const categoryShare = totalPrompts > 0
            ? ((categoryPortionSum / totalPrompts) * 100).toFixed(1)
            : 0;

        return {
            avgPromptScore, avgMatchScore, successRate, hallucinationRate,
            radarData, historyData, topicData, suggestions,
            totalTokens, tokenHistoryData, tokenTableData, dayData, kpiTrendData, tokenTimeData,
            categoryShare, categoryPortionSum, totalPrompts
        };
    }, [filteredData, data, activeTab, suggestionFilter, timeFilter, selectedDateRange, isSelectingRange]);

    // Fetch user prompts for suggestions
    useEffect(() => {
        const fetchSuggestionPrompts = async () => {
            if (!metrics?.suggestions || metrics.suggestions.length === 0) {
                setSuggestionsWithPrompts([]);
                return;
            }

            const promises = metrics.suggestions.map(async (suggestion) => {
                try {
                    // Get the user message from the same session, just before the bot message
                    const { data } = await supabase
                        .from('chat_messages')
                        .select('content')
                        .eq('session_id', suggestion.session_id)
                        .eq('role', 'user')
                        .lt('id', suggestion.message_id)
                        .order('id', { ascending: false })
                        .limit(1)
                        .single();

                    return {
                        ...suggestion,
                        userPrompt: data?.content || 'Prompt not found'
                    };
                } catch (error) {
                    console.error('Error fetching user prompt:', error);
                    return {
                        ...suggestion,
                        userPrompt: 'Error loading prompt'
                    };
                }
            });

            const results = await Promise.all(promises);
            setSuggestionsWithPrompts(results);
        };

        fetchSuggestionPrompts();
    }, [metrics?.suggestions, suggestionFilter]);

    const topPrompt = useMemo(() => {
        return filteredData.length > 0 ? filteredData.reduce((maxItem, item) =>
            (item.prompt_quality_score > (maxItem.prompt_quality_score || 0)) ? item : maxItem
        ) : null;
    }, [filteredData]);

    useEffect(() => {
        const fetchTopPromptText = async () => {
            if (!topPrompt?.message_id || !topPrompt?.session_id) {
                setTopPromptText('');
                return;
            }
            // Get the user message (prompt) from the same session, just before the bot message
            const { data } = await supabase
                .from('chat_messages')
                .select('content')
                .eq('session_id', topPrompt.session_id)
                .eq('role', 'user')
                .lt('id', topPrompt.message_id)
                .order('id', { ascending: false })
                .limit(1)
                .single();
            if (data) setTopPromptText(data.content);
        };
        fetchTopPromptText();
    }, [topPrompt]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (infoModal.isOpen && !event.target.closest('.info-modal') && !event.target.closest('.info-button')) {
                setInfoModal({ isOpen: false, metric: '', definition: '', position: { top: 0, left: 0 } });
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape' && infoModal.isOpen) {
                setInfoModal({ isOpen: false, metric: '', definition: '', position: { top: 0, left: 0 } });
            }
        };

        if (infoModal.isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [infoModal.isOpen]);

    useEffect(() => {
        if (!user) return;
        const loadData = async () => {
            const { data: dbData } = await supabase.from('chat_analysis').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
            if (dbData) setData(dbData);
            setLoading(false);
        };
        loadData();
        const channel = supabase.channel('dashboard-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_analysis' }, () => loadData())
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [user]);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Loading Intelligence...</div>;

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900">
            {/* --- MODAL --- */}
            {selectedSuggestion && (
                <SuggestionModal
                    analysis={selectedSuggestion}
                    onClose={() => setSelectedSuggestion(null)}
                />
            )}

            <div className="max-w-7xl mx-auto">

                {/* --- STICKY HEADER --- */}
                <div className="sticky top-0 z-50 bg-gray-50/95 backdrop-blur-md px-6 md:px-10 pt-6 md:pt-10 pb-2 border-b border-gray-200/50 transition-all">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
                        <div>
                            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">AI Performance</h1>
                            <p className="text-gray-500 mt-1">Analyze your interaction patterns and prompt quality.</p>
                        </div>
                        <div className="flex gap-3">
                            <Link to="/profile" className="px-5 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-full font-medium text-sm hover:bg-gray-100 transition-all shadow-sm flex items-center gap-2">
                                <LuUser size={16} /> Profile
                            </Link>
                            <Link to="/chat" className="px-5 py-2.5 bg-black text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-all shadow-sm flex items-center gap-2">
                                <LuMessageSquare size={16} /> Chat
                            </Link>
                        </div>
                    </div>
                    <div className="flex overflow-x-auto pb-1 scrollbar-hide gap-6">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setActiveTab(cat)} className={`flex items-center gap-2 pb-3 px-1 text-sm font-semibold transition-all whitespace-nowrap border-b-2 ${activeTab === cat ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"}`}>
                                {getCategoryIcon(cat)}
                                {cat}
                                {activeTab === cat && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] ml-1">{filteredData.length}</span>}
                            </button>
                        ))}
                    </div>

                    {/* Time Filter Buttons */}
                    <div className="flex gap-2 mt-3 pb-2">
                        <span className="text-xs text-gray-400 uppercase font-bold tracking-wider flex items-center">Filter:</span>
                        {selectedDateRange.start && (
                            <button
                                onClick={clearDateRange}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap bg-blue-100 text-blue-700 border border-blue-300 flex items-center gap-2"
                            >
                                {selectedDateRange.start === selectedDateRange.end
                                    ? new Date(selectedDateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : `${new Date(selectedDateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(selectedDateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                }
                                <span className="text-blue-500">✕</span>
                            </button>
                        )}
                        {!selectedDateRange.start && (
                            <>
                                <button
                                    onClick={() => { setTimeFilter(null); setSelectedDateRange({ start: null, end: null }); }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${timeFilter === null ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-150 border border-transparent'}`}
                                >
                                    All Time
                                </button>
                                <button
                                    onClick={() => { setTimeFilter(1); setSelectedDateRange({ start: null, end: null }); }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${timeFilter === 1 ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-150 border border-transparent'}`}
                                >
                                    1D
                                </button>
                                <button
                                    onClick={() => { setTimeFilter(10); setSelectedDateRange({ start: null, end: null }); }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${timeFilter === 10 ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-150 border border-transparent'}`}
                                >
                                    10D
                                </button>
                                <button
                                    onClick={() => { setTimeFilter(30); setSelectedDateRange({ start: null, end: null }); }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${timeFilter === 30 ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-150 border border-transparent'}`}
                                >
                                    30D
                                </button>
                            </>
                        )}
                        {isSelectingRange && (
                            <span className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
                                Click another day to complete range selection
                            </span>
                        )}
                    </div>
                </div>

                {/* --- CONTENT --- */}
                <div className="px-6 md:px-10 py-8 space-y-8">
                    {/* KPI GRID */}
                    {metrics ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Success Rate</p>
                                    <button
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setInfoModal({
                                                isOpen: true,
                                                metric: 'Success Rate',
                                                definition: 'Weighted average of Prompt Quality (50%) and Output Match (50%). This represents overall interaction effectiveness.',
                                                position: { top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX }
                                            });
                                        }}
                                        className="text-gray-400 hover:text-gray-600 transition-colors info-button"
                                    >
                                        <LuInfo size={14} />
                                    </button>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-black text-gray-900">{metrics.successRate}%</span>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Prompt Quality</p>
                                    <button
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setInfoModal({
                                                isOpen: true,
                                                metric: 'Prompt Quality',
                                                definition: 'The average score of prompt quality across all analyzed prompts. This measures how well prompts are structured, clear, and effective at eliciting good responses.',
                                                position: { top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX }
                                            });
                                        }}
                                        className="text-gray-400 hover:text-gray-600 transition-colors info-button"
                                    >
                                        <LuInfo size={14} />
                                    </button>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-black text-gray-900">{metrics.avgPromptScore}%</span>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{activeTab === 'Overview' ? 'Prompt Count' : 'Category Share'}</p>
                                    <button
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setInfoModal({
                                                isOpen: true,
                                                metric: activeTab === 'Overview' ? 'Prompt Count' : 'Category Share',
                                                definition: activeTab === 'Overview'
                                                    ? 'Total number of prompts analyzed in your dashboard.'
                                                    : `Percentage of category assignments that belong to ${activeTab}.`,
                                                position: { top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX }
                                            });
                                        }}
                                        className="text-gray-400 hover:text-gray-600 transition-colors info-button"
                                    >
                                        <LuInfo size={14} />
                                    </button>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    {activeTab === 'Overview' ? (
                                        <>
                                            <span className="text-4xl font-black text-gray-900">{filteredData.length}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-4xl font-black text-gray-900">{metrics.categoryShare}%</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Hallucination Rate</p>
                                    <button
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setInfoModal({
                                                isOpen: true,
                                                metric: 'Hallucination Rate',
                                                definition: 'Percentage of responses that contain fabricated or incorrect information.',
                                                position: { top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX }
                                            });
                                        }}
                                        className="text-gray-400 hover:text-gray-600 transition-colors info-button"
                                    >
                                        <LuInfo size={14} />
                                    </button>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-black text-gray-900">{metrics.hallucinationRate}%</span>
                                </div>
                            </div>
                        </div>
                    ) : <div className="p-10 text-center text-gray-400">No data available for this category.</div>}

                    {metrics && (
                        <div className={`grid grid-cols-1 gap-6 ${activeTab === 'Overview' ? 'lg:grid-cols-3' : 'lg:grid-cols-3'}`}>
                            {/* LEFT COLUMN */}
                            <div className={`space-y-6 ${activeTab === 'Overview' ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                                {/* CALENDAR HEATMAP - Only show on Overview */}
                                {activeTab === 'Overview' && (
                                    <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm min-w-0">
                                        <div className="mb-6 flex justify-between items-center">
                                            <div>
                                                <h3 className="font-bold text-xl text-gray-950 tracking-tight">Prompt Activity</h3>
                                                <p className="text-sm text-gray-400 mt-1">Click squares to filter all dashboard charts by date</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setMonthOffset(monthOffset + 3)}
                                                    className="px-3 py-1 text-sm font-medium text-gray-700 hover:text-gray-950 hover:bg-gray-100 rounded-lg transition-colors"
                                                >
                                                    ← Older
                                                </button>
                                                <button
                                                    onClick={() => setMonthOffset(Math.max(monthOffset - 3, 0))}
                                                    disabled={monthOffset === 0}
                                                    className="px-3 py-1 text-sm font-medium text-gray-700 hover:text-gray-950 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    Newer →
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 rounded-2xl">
                                            {(() => {
                                                if (!metrics.dayData || metrics.dayData.length === 0) {
                                                    return <div className="text-gray-400 text-sm py-8">No activity data yet. Keep chatting to build your activity history!</div>;
                                                }

                                                const dateMap = {};
                                                metrics.dayData.forEach(item => {
                                                    dateMap[item.date] = item.count;
                                                });

                                                const maxCount = Math.max(...metrics.dayData.map(d => d.count), 1);

                                                return (
                                                    <div className="flex gap-6 justify-between">
                                                        {/* Day labels on left */}
                                                        <div className="flex flex-col gap-1 pr-1">
                                                            <div className="h-5"></div>
                                                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((dayName, idx) => (
                                                                <div key={idx} className="h-4 text-xs font-semibold text-gray-600 w-14">
                                                                    {(idx === 0 || idx === 2 || idx === 4) ? dayName : ''}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Three months grid */}
                                                        <div className="grid grid-cols-3 gap-4 flex-1">
                                                            {[monthOffset + 2, monthOffset + 1, monthOffset].map((offset) => {
                                                                const baseDate = new Date();
                                                                baseDate.setMonth(baseDate.getMonth() - offset);
                                                                const year = baseDate.getFullYear();
                                                                const month = baseDate.getMonth();

                                                                const firstDay = new Date(year, month, 1);
                                                                const lastDay = new Date(year, month + 1, 0);
                                                                const daysInMonth = lastDay.getDate();
                                                                let startingDayOfWeek = firstDay.getDay() - 1;
                                                                if (startingDayOfWeek < 0) startingDayOfWeek = 6;

                                                                const weeks = [];
                                                                let currentWeek = Array(startingDayOfWeek).fill(null);

                                                                for (let day = 1; day <= daysInMonth; day++) {
                                                                    const d = new Date(year, month, day);
                                                                    const dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                                    const count = dateMap[dateKey] || 0;
                                                                    currentWeek.push({ day, count, dateKey, fullDate: d.toISOString() });

                                                                    if (currentWeek.length === 7) {
                                                                        weeks.push(currentWeek);
                                                                        currentWeek = [];
                                                                    }
                                                                }
                                                                if (currentWeek.length > 0) {
                                                                    currentWeek.push(...Array(7 - currentWeek.length).fill(null));
                                                                    weeks.push(currentWeek);
                                                                }

                                                                const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                                                                return (
                                                                    <div key={`${year}-${month}`}>
                                                                        <h4 className="font-semibold text-sm text-gray-800 mb-3">{monthName}</h4>

                                                                        <div className="space-y-1">
                                                                            {weeks.map((week, wIdx) => (
                                                                                <div key={wIdx} className="flex gap-1">
                                                                                    {week.map((day, dIdx) => {
                                                                                        if (!day) {
                                                                                            return <div key={dIdx} className="w-4 h-4"></div>;
                                                                                        }
                                                                                        const intensity = day.count / maxCount;
                                                                                        const greenShades = [
                                                                                            '#F0FDF4',
                                                                                            '#DCFCE7',
                                                                                            '#86EFAC',
                                                                                            '#22C55E',
                                                                                            '#15803D'
                                                                                        ];
                                                                                        const shadeIndex = intensity === 0 ? 0 : Math.ceil(intensity * 4);
                                                                                        const color = greenShades[Math.min(shadeIndex, 4)];
                                                                                        const isInRange = isDayInRange(day.fullDate, selectedDateRange);
                                                                                        const isSingleSelection = selectedDateRange?.start === selectedDateRange?.end;
                                                                                        return (
                                                                                            <div
                                                                                                key={day.dateKey}
                                                                                                onClick={() => handleDayClick(day.fullDate)}
                                                                                                className={`w-4 h-4 rounded cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-125 hover:z-10 border-2 ${isInRange ? 'border-gray-400' : 'border-gray-300'}`}
                                                                                                style={{ backgroundColor: (isInRange && !isSingleSelection) ? '#D1D5DB' : color }}
                                                                                                title={`${day.dateKey}: ${day.count} prompt${day.count !== 1 ? 's' : ''} - Click to ${isSelectingRange ? 'complete range' : 'select'}`}
                                                                                            />
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-600">
                                            <span className="font-medium">Less</span>
                                            <div className="flex gap-1">
                                                {['#F0FDF4', '#DCFCE7', '#86EFAC', '#22C55E', '#15803D'].map((color, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="w-3 h-3 rounded border border-gray-400"
                                                        style={{ backgroundColor: color }}
                                                    ></div>
                                                ))}
                                            </div>
                                            <span className="font-medium">More</span>
                                        </div>
                                    </div>
                                )}

                                {/* QUALITY & MATCH CHART */}
                                <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80 min-w-0 ${activeTab !== 'Overview' ? 'lg:col-span-3' : ''}`}>
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="font-bold text-gray-800">
                                            {activeTab === 'Overview' ? 'Success Rate by Prompt' : 'Prompt Quality & Match Over Time'}
                                        </h3>
                                        <div className="flex gap-4 text-xs">
                                            {activeTab === 'Overview' ? (
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span>Success Rate</div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-black"></span>Quality</div>
                                                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span>Match</div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-full h-60">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={metrics.historyData} margin={{ left: 0, right: 10, top: 10, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                <XAxis
                                                    dataKey={activeTab === 'Overview' ? 'name' : 'date'}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                                    angle={-45}
                                                    textAnchor="end"
                                                    height={40}
                                                    interval={activeTab === 'Overview' ? 4 : 'preserveStartEnd'} // Show every 5th label for Overview
                                                >
                                                    <Label value={activeTab === 'Overview' ? 'Prompt' : 'Date'} position="bottom" offset={0} style={{ textAnchor: 'middle', fontStyle: 'normal' }} />
                                                </XAxis>
                                                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} width={40} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                                                    formatter={(value) => `${value.toFixed(1)}`}
                                                />
                                                {activeTab === 'Overview' ? (
                                                    <Line
                                                        type="monotone"
                                                        dataKey="success"
                                                        stroke="#10B981"
                                                        strokeWidth={3}
                                                        dot={{ fill: '#10B981', r: 4 }}
                                                        activeDot={{ r: 6 }}
                                                        name="Success Rate"
                                                    />
                                                ) : (
                                                    <>
                                                        <Line
                                                            type="monotone"
                                                            dataKey="quality"
                                                            stroke="#000"
                                                            strokeWidth={3}
                                                            dot={{ fill: '#000', r: 4 }}
                                                            activeDot={{ r: 6 }}
                                                            name="Prompt Quality"
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="match"
                                                            stroke="#10B981"
                                                            strokeWidth={2}
                                                            strokeDasharray="5 5"
                                                            dot={{ fill: '#10B981', r: 4 }}
                                                            activeDot={{ r: 6 }}
                                                            name="Response Match"
                                                        />
                                                    </>
                                                )}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* KPI TREND AND SKILL PROFILE - Same Row */}
                                {activeTab !== 'Overview' && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        {/* SKILL RADAR - Left side */}
                                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center min-w-0 lg:col-span-1">
                                            <h3 className="font-bold text-gray-800 mb-2 w-full text-left">Skill Profile</h3>
                                            <p className="text-xs text-gray-400 w-full text-left mb-4">Analysis based on {filteredData.length} prompts in <strong>{activeTab}</strong>.</p>
                                            <div className="h-40 w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={metrics.radarData}>
                                                        <PolarGrid stroke="#E5E7EB" />
                                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6B7280', fontSize: 10 }} />
                                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                        <Radar name={activeTab} dataKey="A" stroke="#000000" strokeWidth={2} fill="#000000" fillOpacity={0.1} />
                                                        <Tooltip />
                                                    </RadarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* KPI TREND LINE CHART - Right side */}
                                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2">
                                            <h3 className="font-bold text-gray-800 mb-4">KPI Trends Over Time</h3>

                                            {/* KPI Filter Buttons */}
                                            <div className="mb-6 flex flex-wrap gap-3">
                                                {[
                                                    { key: 'clarity', label: 'Clarity', color: 'bg-black' },
                                                    { key: 'structure', label: 'Structure', color: 'bg-gray-800' },
                                                    { key: 'constraints', label: 'Constraints', color: 'bg-gray-500' },
                                                    { key: 'anchoring', label: 'Anchoring', color: 'bg-green-600' },
                                                    { key: 'pattern', label: 'Pattern', color: 'bg-green-500' }
                                                ].map(kpi => (
                                                    <button
                                                        key={kpi.key}
                                                        onClick={() => toggleKpi(kpi.key)}
                                                        className={`text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${visibleKpis.includes(kpi.key)
                                                            ? `${kpi.color} text-white shadow-md`
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                            }`}
                                                    >
                                                        {kpi.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="h-40 w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={metrics.kpiTrendData || []} margin={{ left: 0, right: 20, top: 20, bottom: 30 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={60} />
                                                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} width={35} />
                                                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: 'rgba(255,255,255,0.95)' }} formatter={(value) => `${value.toFixed(1)}%`} />
                                                        {visibleKpis.includes('clarity') && <Line type="linear" dataKey="clarity" stroke="#000000" strokeWidth={3} dot={false} activeDot={false} name="Clarity" />}
                                                        {visibleKpis.includes('structure') && <Line type="linear" dataKey="structure" stroke="#1F2937" strokeWidth={3} dot={false} activeDot={false} name="Structure" />}
                                                        {visibleKpis.includes('constraints') && <Line type="linear" dataKey="constraints" stroke="#6B7280" strokeWidth={3} dot={false} activeDot={false} name="Constraints" />}
                                                        {visibleKpis.includes('anchoring') && <Line type="linear" dataKey="anchoring" stroke="#059669" strokeWidth={3} dot={false} activeDot={false} name="Anchoring" />}
                                                        {visibleKpis.includes('pattern') && <Line type="linear" dataKey="pattern" stroke="#10B981" strokeWidth={3} dot={false} activeDot={false} name="Pattern" />}
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                    </div>
                                )}

                                {/* --- RECENT TIPS WITH MINI RADAR (CLICKABLE) - Only show on category dashboards --- */}
                                {activeTab !== 'Overview' && (
                                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="font-bold text-gray-800">Improvement Suggestions ({activeTab})</h3>
                                            <span className="text-[10px] text-gray-400 uppercase tracking-widest">Click for Details</span>
                                        </div>

                                        {/* Filter Buttons */}
                                        <div className="mb-4 flex flex-wrap gap-2">
                                            {[
                                                { key: 'recent', label: 'Recent', color: 'bg-gray-800' },
                                                { key: 'best', label: 'Top 3 Best', color: 'bg-green-600' },
                                                { key: 'worst', label: 'Top 3 Worst', color: 'bg-red-600' }
                                            ].map(filter => (
                                                <button
                                                    key={filter.key}
                                                    onClick={() => setSuggestionFilter(filter.key)}
                                                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${suggestionFilter === filter.key
                                                        ? `${filter.color} text-white shadow-sm`
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    {filter.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="space-y-3">
                                            {suggestionsWithPrompts.length > 0 ? (
                                                suggestionsWithPrompts.map((item, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedSuggestion(item)}
                                                        className="w-full text-left bg-gray-50 hover:bg-blue-50/50 p-2 rounded-xl text-sm text-gray-600 border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all flex items-center gap-4 group"
                                                    >
                                                        {/* Mini Radar */}
                                                        <div className="shrink-0 bg-white rounded-lg p-1 border border-gray-200">
                                                            <MiniRadar metrics={item.rating_metrics} />
                                                        </div>

                                                        {/* Text */}
                                                        <div className="flex-1 min-w-0 py-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="bg-white text-gray-900 font-bold px-2 py-0.5 rounded shadow-sm text-[10px] border border-gray-200">
                                                                    {item.prompt_quality_score} Score
                                                                </span>
                                                                <span className="text-[10px] text-gray-400">
                                                                    {new Date(item.created_at).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                            <p className="truncate text-gray-700 font-medium group-hover:text-blue-700">
                                                                {item.userPrompt || item.prompt_improvement_suggestion}
                                                            </p>
                                                        </div>

                                                        {/* Icon */}
                                                        <LuMaximize2 className="text-gray-300 group-hover:text-blue-400 shrink-0 mr-2" size={16} />
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="text-gray-400 text-sm italic text-center py-4">No suggestions yet. Keep chatting!</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TOKEN USAGE OVER TIME - Category Level - At the end */}
                                {activeTab !== 'Overview' && metrics && (
                                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                        <div className="flex justify-between items-center mb-6">
                                            <div><h3 className="font-bold text-gray-800">Token Usage Over Time</h3><p className="text-xs text-gray-400">Input and output tokens across the last 14 days</p></div>
                                            <div className="text-right"><span className="block text-2xl font-black text-gray-900">{metrics.totalTokens.toLocaleString()}</span><span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Total Tokens</span></div>
                                        </div>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={metrics.tokenTimeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                    <XAxis
                                                        dataKey="date"
                                                        tick={{ fontSize: 10, fill: '#6B7280' }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                        angle={-45}
                                                        textAnchor="end"
                                                        height={60}
                                                    />
                                                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                                                    <Tooltip
                                                        cursor={{ fill: '#F3F4F6' }}
                                                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                                                        formatter={(value, name) => [value, name === 'input' ? 'Input Tokens' : 'Output Tokens']}
                                                    />
                                                    <Legend />
                                                    <Bar dataKey="input" fill="#000000" name="Input Tokens" radius={[2, 2, 0, 0]} />
                                                    <Bar dataKey="output" fill="#10B981" name="Output Tokens" radius={[2, 2, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* RIGHT COLUMN */}
                            <div className="lg:col-span-1 space-y-6">
                                {/* PIE CHART - TOPIC DISTRIBUTION - Only show on Overview, at top */}
                                {activeTab === 'Overview' && (
                                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center min-w-0">
                                        <h3 className="font-bold text-gray-800 mb-2 w-full text-left">Topic Distribution</h3>
                                        <div className="h-56 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                {metrics.topicData && metrics.topicData.length > 0 ? (
                                                    <PieChart margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                                                        <Pie
                                                            data={metrics.topicData}
                                                            cx="50%"
                                                            cy="50%"
                                                            labelLine={false}
                                                            label={({ name }) => `${name}`}
                                                            labelStyle={{ fill: '#4B5563', fontSize: 11, fontWeight: 'bold' }}
                                                            outerRadius={70}
                                                            innerRadius={35}
                                                            fill="#8884d8"
                                                            dataKey="value"
                                                        >
                                                            {metrics.topicData.map((entry, index) => {
                                                                const grayShades = ['#000000', '#020617', '#0F172A', '#111827', '#1F2937', '#374151', '#4B5563', '#6B7280'];
                                                                const maxValue = Math.max(...metrics.topicData.map(d => d.value));
                                                                const shadeIndex = Math.round((entry.value / maxValue) * (grayShades.length - 1));
                                                                return <Cell key={`cell-${index}`} fill={grayShades[Math.min(shadeIndex, grayShades.length - 1)]} />;
                                                            })}
                                                        </Pie>
                                                        <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                                                    </PieChart>
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-gray-400 text-sm text-center px-4">
                                                        No topic data available
                                                    </div>
                                                )}
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* TOP PERFORMANCE - Only show on Overview */}
                                {activeTab === 'Overview' && (
                                    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg text-white h-[420px] flex flex-col">
                                        <div className="flex justify-between items-start mb-4 flex-shrink-0">
                                            <h3 className="font-bold">Top Performance</h3>
                                            {topPrompt && getCategoryIcon(topPrompt.categories?.[0]?.tag || topPrompt.categories?.[0] || 'Other')}
                                        </div>
                                        {metrics.historyData.length > 0 ? (
                                            <div className="flex flex-col justify-between space-y-4 flex-1 overflow-y-auto min-h-0">
                                                {(() => {
                                                    const avgScore = metrics.avgPromptScore;
                                                    const topScore = topPrompt?.prompt_quality_score || 0;
                                                    const diff = topScore - avgScore;
                                                    const diffPercent = avgScore > 0 ? ((diff / avgScore) * 100).toFixed(0) : 0;
                                                    const sign = diff > 0 ? '+' : '';

                                                    return topPrompt ? (
                                                        <>
                                                            <div className="text-center flex-shrink-0">
                                                                <div className="flex items-baseline justify-center gap-2">
                                                                    <div className="text-3xl font-black">{topScore}</div>
                                                                    <div className={`text-sm font-semibold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                        {sign}{diffPercent}%
                                                                    </div>
                                                                </div>
                                                                <div className="text-xs text-gray-400 uppercase tracking-widest mb-3">vs Average ({avgScore})</div>
                                                                <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                                                    <div className="bg-green-400 h-full rounded-full transition-all duration-1000" style={{ width: `${topScore}%` }}></div>
                                                                </div>
                                                            </div>
                                                            <div className="text-center flex-1 flex items-center">
                                                                <div
                                                                    className="text-sm font-medium text-gray-200 leading-relaxed px-4 py-3 bg-gray-700 bg-opacity-50 rounded-lg cursor-pointer hover:text-white hover:bg-gray-600 transition-colors max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-600 w-full"
                                                                    onClick={() => setSelectedSuggestion(topPrompt)}
                                                                >
                                                                    "{topPromptText || topPrompt.user_prompt || topPrompt.prompt_improvement_suggestion || "Top performing prompt"}"
                                                                </div>
                                                            </div>
                                                            {topPrompt.rating_metrics && (
                                                                <div className="grid grid-cols-5 gap-1 text-center text-xs flex-shrink-0">
                                                                    <div className="bg-gray-800 bg-opacity-50 p-2 rounded">
                                                                        <p className="text-gray-400 font-semibold text-[9px]">Clarity</p>
                                                                        <p className="text-green-400 font-black text-xs">{Math.round((topPrompt.rating_metrics.specification || 0) <= 1 ? (topPrompt.rating_metrics.specification || 0) * 100 : (topPrompt.rating_metrics.specification || 0))}</p>
                                                                    </div>
                                                                    <div className="bg-gray-800 bg-opacity-50 p-2 rounded">
                                                                        <p className="text-gray-400 font-semibold text-[9px]">Structure</p>
                                                                        <p className="text-green-400 font-black text-xs">{Math.round((topPrompt.rating_metrics.grammar || 0) <= 1 ? (topPrompt.rating_metrics.grammar || 0) * 100 : (topPrompt.rating_metrics.grammar || 0))}</p>
                                                                    </div>
                                                                    <div className="bg-gray-800 bg-opacity-50 p-2 rounded">
                                                                        <p className="text-gray-400 font-semibold text-[9px]">Constraints</p>
                                                                        <p className="text-green-400 font-black text-xs">{Math.round((topPrompt.rating_metrics.length || 0) <= 1 ? (topPrompt.rating_metrics.length || 0) * 100 : (topPrompt.rating_metrics.length || 0))}</p>
                                                                    </div>
                                                                    <div className="bg-gray-800 bg-opacity-50 p-2 rounded">
                                                                        <p className="text-gray-400 font-semibold text-[9px]">Anchoring</p>
                                                                        <p className="text-green-400 font-black text-xs">{Math.round((topPrompt.rating_metrics.token_performance || 0) <= 1 ? (topPrompt.rating_metrics.token_performance || 0) * 100 : (topPrompt.rating_metrics.token_performance || 0))}</p>
                                                                    </div>
                                                                    <div className="bg-gray-800 bg-opacity-50 p-2 rounded">
                                                                        <p className="text-gray-400 font-semibold text-[9px]">Pattern</p>
                                                                        <p className="text-green-400 font-black text-xs">{Math.round((topPrompt.rating_metrics.llm_response_fitting || 0) <= 1 ? (topPrompt.rating_metrics.llm_response_fitting || 0) * 100 : (topPrompt.rating_metrics.llm_response_fitting || 0))}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <p className="text-sm text-gray-400">No data available</p>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-400">No data available.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* CATEGORY OVERVIEW CARDS - Only show on Overview */}
                    {activeTab === 'Overview' && metrics && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800">Category Performance</h3>
                                <span className="text-xs text-gray-400 flex items-center gap-1.5 cursor-pointer" onClick={() => document.getElementById('category-scroll')?.scrollBy({ left: 300, behavior: 'smooth' })}>
                                    <span>Scroll to explore</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </span>
                            </div>
                            <div className="relative">
                                {/* Right fade gradient */}
                                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-50/100 to-transparent pointer-events-none z-10 rounded-2xl"></div>
                                <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory" id="category-scroll">
                                    {categories.filter(cat => cat !== 'Overview').map(category => {
                                        // Calculate metrics for this specific category (using filtered data)
                                        const categoryData = filteredData.filter(item => {
                                            if (!item.categories) return false;
                                            return item.categories.some(c => {
                                                if (typeof c === 'string') return c === category;
                                                if (typeof c === 'object' && c.tag) return c.tag === category;
                                                return false;
                                            });
                                        });

                                        if (categoryData.length === 0) return null;

                                        // Calculate averages for this category
                                        const avgPromptScore = Math.round(
                                            categoryData.reduce((acc, item) => acc + (item.prompt_quality_score || 0), 0) / categoryData.length
                                        );
                                        // Calculate radar data for this category
                                        const radarAcc = { specification: 0, grammar: 0, length: 0, token_performance: 0, llm_response_fitting: 0, count: 0 };
                                        const catNormalize = (score) => (score === undefined || score === null) ? 0 : (score <= 1 ? score * 100 : score);
                                        categoryData.forEach(item => {
                                            if (item.rating_metrics) {
                                                radarAcc.specification += catNormalize(item.rating_metrics.specification);
                                                radarAcc.grammar += catNormalize(item.rating_metrics.grammar);
                                                radarAcc.length += catNormalize(item.rating_metrics.length);
                                                radarAcc.token_performance += catNormalize(item.rating_metrics.token_performance);
                                                radarAcc.llm_response_fitting += catNormalize(item.rating_metrics.llm_response_fitting);
                                                radarAcc.count++;
                                            }
                                        });

                                        const categoryRadarData = radarAcc.count > 0 ? [
                                            { subject: 'Clarity', A: radarAcc.specification / radarAcc.count, fullMark: 100 },
                                            { subject: 'Structure', A: radarAcc.grammar / radarAcc.count, fullMark: 100 },
                                            { subject: 'Constraints', A: radarAcc.length / radarAcc.count, fullMark: 100 },
                                            { subject: 'Anchoring', A: radarAcc.token_performance / radarAcc.count, fullMark: 100 },
                                            { subject: 'Pattern', A: radarAcc.llm_response_fitting / radarAcc.count, fullMark: 100 },
                                        ] : [];

                                        return (
                                            <button
                                                key={category}
                                                onClick={() => setActiveTab(category)}
                                                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all text-left group flex-shrink-0 w-[calc((100%-3rem)/3)] min-w-[280px] snap-start"
                                            >
                                                {/* Category Name */}
                                                <div className="flex items-center gap-2 mb-4">
                                                    {getCategoryIcon(category)}
                                                    <span className="font-bold text-gray-800 text-base group-hover:text-black">{category}</span>
                                                    <span className="ml-auto text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">{categoryData.length}</span>
                                                </div>

                                                {/* Spider Chart */}
                                                <div className="h-40 w-full mb-4">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={categoryRadarData}>
                                                            <PolarGrid stroke="#E5E7EB" />
                                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                                                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                            <Radar name={category} dataKey="A" stroke="#000000" strokeWidth={2} fill="#000000" fillOpacity={0.2} />
                                                        </RadarChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                {/* Scores */}
                                                <div className="flex justify-center items-center pt-3 border-t border-gray-100">
                                                    <div className="text-center">
                                                        <span className="block text-2xl font-black text-green-600">{avgPromptScore}</span>
                                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Prompt Quality</span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TOKEN EFFICIENCY ACROSS CATEGORIES */}
                    {activeTab === 'Overview' && metrics && (
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="font-bold text-gray-800">Token Usage by Category</h3>
                                    <p className="text-xs text-gray-400">Input and output token consumption across categories</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-2xl font-black text-gray-900">{metrics.totalTokens.toLocaleString()}</span>
                                    <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Total Tokens</span>
                                </div>
                            </div>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={metrics.tokenTableData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                        <XAxis
                                            dataKey="category"
                                            tick={{ fontSize: 11, fill: '#6B7280' }}
                                            axisLine={false}
                                            tickLine={false}
                                            height={40}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                            axisLine={false}
                                            tickLine={false}
                                            label={{ value: 'Tokens', angle: -90, position: 'insideLeft', style: { fontStyle: 'normal' } }}
                                        />
                                        <Tooltip
                                            cursor={{ fill: '#F3F4F6' }}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                                            formatter={(value, name) => [value, name === 'avgInput' ? 'Input Tokens' : 'Output Tokens']}
                                        />
                                        <Legend />
                                        <Bar dataKey="avgInput" fill="#000000" name="Input Tokens" radius={[2, 2, 0, 0]} />
                                        <Bar dataKey="avgOutput" fill="#10B981" name="Output Tokens" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODALS */}
            {selectedSuggestion && (
                <SuggestionModal
                    analysis={selectedSuggestion}
                    onClose={() => setSelectedSuggestion(null)}
                />
            )}

            {infoModal.isOpen && (
                <div
                    className="fixed z-[100] bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-xs animate-in fade-in slide-in-from-top-2 duration-200 info-modal"
                    style={{
                        top: infoModal.position.top,
                        left: infoModal.position.left,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-sm text-gray-900">{infoModal.metric}</h4>
                        <button
                            onClick={() => setInfoModal({ isOpen: false, metric: '', definition: '', position: { top: 0, left: 0 } })}
                            className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                        >
                            <LuX size={16} />
                        </button>
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{infoModal.definition}</p>
                </div>
            )}
        </div>
    );
}
