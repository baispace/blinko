import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import PublicBlogApp from "./PublicBlogApp";
import { initializeBlogDevice } from "./lib/blogDevice";
import "./styles/globals.css";

// Device identity is optional for reading and must not delay the first render.
void initializeBlogDevice().catch(() => undefined);
function BlogClient() {
  useEffect(() => {
    const shell = document.querySelector("[data-ink-reading-shell]");
    const root = document.getElementById("root");
    if (!shell || !root) return;
    const finish = () => {
      if (
        root.querySelector(
          '.markdown-body, [data-home-ready="true"], [data-topic-ready="true"], .ink-doc-overview',
        )
      ) {
        shell.remove();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(finish);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-home-ready"],
    });
    finish();
    return () => observer.disconnect();
  }, []);
  return <PublicBlogApp />;
}
createRoot(document.getElementById("root")!).render(<BlogClient />);
