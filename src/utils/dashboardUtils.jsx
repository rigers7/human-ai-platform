import {
    LuLayoutGrid, LuCode, LuPenTool, LuBriefcase, LuGraduationCap
} from "react-icons/lu";

// Updated category mapping: Coding, Writing, Work, Education, Other
export const getCategoryIcon = (catName) => {
    if (!catName || typeof catName !== 'string') return <LuLayoutGrid size={16} />;
    const name = catName.toLowerCase();
    if (name.includes('cod')) return <LuCode size={16} />;
    if (name.includes('writ')) return <LuPenTool size={16} />;
    if (name.includes('work')) return <LuBriefcase size={16} />;
    if (name.includes('edu')) return <LuGraduationCap size={16} />;
    return <LuLayoutGrid size={16} />;
};

export const getTimeFilteredData = (dataToFilter, timeFilter, selectedDateRange) => {
    // Check if custom date range is selected
    if (selectedDateRange.start && selectedDateRange.end) {
        return dataToFilter.filter(item => {
            if (!item.created_at) return true;
            const itemDate = new Date(item.created_at);
            const startDate = new Date(selectedDateRange.start);
            const endDate = new Date(selectedDateRange.end);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            return itemDate >= startDate && itemDate <= endDate;
        });
    }

    // Use preset time filter
    if (!timeFilter) return dataToFilter;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeFilter);

    return dataToFilter.filter(item => {
        if (!item.created_at) return true;
        const itemDate = new Date(item.created_at);
        return itemDate >= cutoffDate;
    });
};

export const downsampleDataByDay = (data) => {
    const groupedData = {};

    data.forEach(item => {
        const date = new Date(item.created_at);
        const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

        if (!groupedData[key]) {
            groupedData[key] = { ...item, count: 0 };
        }
        groupedData[key].count += 1;
    });

    return Object.values(groupedData);
};

export const isDayInRange = (fullDateISO, selectedDateRange) => {
    if (!selectedDateRange || !selectedDateRange.start) return false;
    const dayDate = new Date(fullDateISO);
    dayDate.setHours(0, 0, 0, 0);
    const startDate = new Date(selectedDateRange.start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = selectedDateRange.end ? new Date(selectedDateRange.end) : new Date(selectedDateRange.start);
    endDate.setHours(0, 0, 0, 0);
    return dayDate >= startDate && dayDate <= endDate;
};

export const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
