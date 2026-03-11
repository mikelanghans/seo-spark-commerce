import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";

interface SocialPost {
  id: string;
  platform: string;
  caption: string;
  scheduled_date: string | null;
  image_url: string | null;
  product_id: string;
  created_at: string;
}

interface Product {
  id: string;
  title: string;
}

const PLATFORM_META: Record<string, { icon: string; color: string }> = {
  instagram: { icon: "📸", color: "bg-pink-500/20 text-pink-700 dark:text-pink-300" },
  tiktok: { icon: "🎵", color: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300" },
  x: { icon: "𝕏", color: "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300" },
  facebook: { icon: "📘", color: "bg-blue-500/20 text-blue-700 dark:text-blue-300" },
};

export function ContentCalendar({
  organizationId,
  products,
}: {
  organizationId: string;
  products: Product[];
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("social_posts")
        .select("id, platform, caption, scheduled_date, image_url, product_id, created_at")
        .eq("organization_id", organizationId)
        .order("scheduled_date", { ascending: true });

      if (error) throw error;
      setPosts((data as any[]) || []);
      setLoaded(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  if (!loaded && !loading) loadPosts();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const postsByDate = useMemo(() => {
    const map: Record<string, SocialPost[]> = {};
    for (const post of posts) {
      const key = post.scheduled_date || format(new Date(post.created_at), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return map;
  }, [posts]);

  const getProductTitle = (productId: string) =>
    products.find((p) => p.id === productId)?.title || "Unknown";

  const schedulePost = async (postId: string, date: Date) => {
    setScheduling(postId);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const { error } = await supabase
        .from("social_posts")
        .update({ scheduled_date: dateStr } as any)
        .eq("id", postId);
      if (error) throw error;
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, scheduled_date: dateStr } : p))
      );
      toast.success(`Scheduled for ${format(date, "MMM d, yyyy")}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to schedule");
    } finally {
      setScheduling(null);
    }
  };

  const unscheduledPosts = posts.filter((p) => !p.scheduled_date);
  const selectedDayPosts = selectedDay
    ? postsByDate[format(selectedDay, "yyyy-MM-dd")] || []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Content Calendar
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/50">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayPosts = postsByDate[key] || [];
                const inMonth = isSameMonth(day, currentMonth);
                const selected = selectedDay && isSameDay(day, selectedDay);

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`relative min-h-[72px] border-t border-r border-border p-1 text-left transition-colors hover:bg-accent/50 ${
                      !inMonth ? "bg-muted/30 text-muted-foreground/50" : ""
                    } ${selected ? "ring-2 ring-primary ring-inset bg-primary/5" : ""}`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday(day) ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : ""
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayPosts.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        {dayPosts.slice(0, 3).map((p) => {
                          const meta = PLATFORM_META[p.platform] || PLATFORM_META.instagram;
                          return (
                            <span key={p.id} className={`text-[10px] rounded px-1 ${meta.color}`}>
                              {meta.icon}
                            </span>
                          );
                        })}
                        {dayPosts.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{dayPosts.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="font-semibold text-sm">{format(selectedDay, "EEEE, MMMM d, yyyy")}</h4>
              {selectedDayPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No posts scheduled for this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayPosts.map((post) => {
                    const meta = PLATFORM_META[post.platform] || PLATFORM_META.instagram;
                    return (
                      <div key={post.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                        {post.image_url && (
                          <img src={post.image_url} alt="" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className={`text-xs ${meta.color}`}>
                              {meta.icon} {post.platform}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              {getProductTitle(post.product_id)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{post.caption}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Unscheduled posts */}
          {unscheduledPosts.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="font-semibold text-sm">Unscheduled Posts ({unscheduledPosts.length})</h4>
              <p className="text-xs text-muted-foreground">Click a day above, then schedule a post to it.</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {unscheduledPosts.map((post) => {
                  const meta = PLATFORM_META[post.platform] || PLATFORM_META.instagram;
                  return (
                    <div key={post.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      {post.image_url && (
                        <img src={post.image_url} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-xs ${meta.color}`}>
                            {meta.icon} {post.platform}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {getProductTitle(post.product_id)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.caption}</p>
                      </div>
                      {selectedDay && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs flex-shrink-0"
                          disabled={scheduling === post.id}
                          onClick={() => schedulePost(post.id, selectedDay)}
                        >
                          {scheduling === post.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            `→ ${format(selectedDay, "MMM d")}`
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
