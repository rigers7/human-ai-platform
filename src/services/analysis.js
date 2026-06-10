import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "../context/AuthProvider";

export function useUserAnalysis() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    setLoading(true);

    (async () => {
      // Fetch all analyses
      const { data, error } = await supabase
        .from("chat_analysis")
        .select("type, categories")
        .eq("user_id", user.id);

      if (error) return console.error(error);

      if (!isMounted) return;

      // Flatten categories
      const flattened = [];
      data.forEach(item => {
        const cats = item.categories || [];
        cats.forEach(c => {
          flattened.push({
            type: item.type,
            category: c.category,
            score: c.score
          });
        });
      });

      setAnalysis(flattened);
      setLoading(false);
    })();

    return () => { isMounted = false; };
  }, [user]);

  return { analysis, loading };
}
