import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

// Helper to normalize scores - handles both 0-1 and 0-100 formats
const normalizeScore = (score) => {
    if (score === undefined || score === null) return 0;
    // If score is <= 1, it's in 0-1 format, multiply by 100
    return score <= 1 ? score * 100 : score;
};

const MiniRadar = ({ metrics }) => {
    if (!metrics) return null;

    // New 5 KPIs: Clarity, Structure, Constraints, Anchoring, Pattern
    const data = [
        { subject: 'Clarity', A: normalizeScore(metrics.specification), fullMark: 100 },
        { subject: 'Structure', A: normalizeScore(metrics.grammar), fullMark: 100 },
        { subject: 'Constraints', A: normalizeScore(metrics.length), fullMark: 100 },
        { subject: 'Anchoring', A: normalizeScore(metrics.token_performance), fullMark: 100 },
        { subject: 'Pattern', A: normalizeScore(metrics.llm_response_fitting), fullMark: 100 },
    ];

    return (
        <div className="h-16 w-16 opacity-70">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid gridType="circle" stroke="#E5E7EB" />
                    <PolarAngleAxis dataKey="subject" tick={false} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Mini" dataKey="A" stroke="#000000" strokeWidth={1} fill="#000000" fillOpacity={0.3} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default MiniRadar;
