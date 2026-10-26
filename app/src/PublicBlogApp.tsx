import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BlogShell } from "./components/BlinkoBlog/public/BlogShell";
import { publicBasename } from "./lib/blogPublicBase";
import BlogHome from "./pages/blog/index";
const Article = lazy(() => import("./pages/blog/[id]"));
const Topics = lazy(() => import("./pages/blog/topics"));
const Topic = lazy(() => import("./pages/blog/t/[slug]"));
const About = lazy(() => import("./pages/blog/about"));
const Friends = lazy(() => import("./pages/blog/friends"));
const Moments = lazy(() => import("./pages/blog/moments"));
const Subscribe = lazy(() => import("./pages/blog/subscribe"));
const Stats = lazy(() => import("./pages/blog/stats"));
export default function PublicBlogApp() {
  // 公开域名可以把博客挂在根路径上，basename 决定公开地址的形状。
  return (
    <BrowserRouter basename={publicBasename()}>
      <Suspense
        fallback={
          <div className="ink-empty" role="status">
            正在加载…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<BlogShell />}>
            <Route index element={<BlogHome />} />
            <Route path="topics" element={<Topics />} />
            <Route path="t/:slug" element={<Topic />} />
            <Route path="about" element={<About />} />
            <Route path="friends" element={<Friends />} />
            <Route path="moments" element={<Moments />} />
            <Route path="subscribe" element={<Subscribe />} />
            <Route path="stats" element={<Stats />} />
            <Route path=":id" element={<Article />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
