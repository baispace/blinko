import { Button } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { STUDIO_NAV, type StudioSection } from "./studioNav";

type Props = {
  section: StudioSection;
  onSelect: (key: StudioSection) => void;
  collapsed: boolean;
  postCount: number;
  topicCount: number;
  onBack: () => void;
};

export function BlogStudioNav({
  section,
  onSelect,
  collapsed,
  postCount,
  topicCount,
  onBack,
}: Props) {
  return (
    <aside
      className={`flex flex-col h-full overflow-y-auto border-r border-default-200 bg-background py-3 px-2
        transition-all duration-200 ${collapsed ? "w-[76px] items-center" : "w-[240px]"}`}
      aria-label="博客管理导航"
    >
      <nav className="flex flex-col gap-3 flex-1 w-full">
        {STUDIO_NAV.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11.5px] font-medium tracking-[0.04em] uppercase text-default-600">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const isActive = section === item.key;
              return (
                <Button
                  key={item.key}
                  type="button"
                  variant="light"
                  className={`justify-start gap-3 rounded-xl h-10 px-3 text-sm font-medium
                    ${isActive
                      ? "bg-default-100 text-foreground"
                      : "text-default-500 hover:bg-hover"
                    }
                    ${collapsed ? "w-10 px-0 justify-center mx-auto" : "w-full"}
                  `}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : item.hint}
                  onPress={() => onSelect(item.key)}
                >
                  <Icon icon={item.icon} width={18} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      {item.key === "posts" && (
                        <span className="text-xs text-default-400 shrink-0">{postCount}</span>
                      )}
                      {item.key === "topics" && (
                        <span className="text-xs text-default-400 shrink-0">{topicCount}</span>
                      )}
                    </>
                  )}
                </Button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-2 pt-2 border-t border-default-200 w-full">
        <Button
          type="button"
          variant="light"
          className={`justify-start gap-3 rounded-xl h-10 px-3 text-sm font-medium text-default-500 hover:bg-hover
            ${collapsed ? "w-10 px-0 justify-center mx-auto" : "w-full"}
          `}
          onPress={onBack}
          title="返回工作区"
        >
          <Icon icon="tabler:arrow-left" width={18} className="shrink-0" />
          {!collapsed && <span className="truncate">返回工作区</span>}
        </Button>
      </div>
    </aside>
  );
}
