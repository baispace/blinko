import { _ } from "@/lib/lodash";
import { observer } from "mobx-react-lite";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";

type IProps = {
  style?: any;
  className?: any;
  onBottom: () => void;
  children: any;
};

export type ScrollAreaHandles = {
  scrollToBottom: () => void;
}

export const ScrollArea = observer(forwardRef<ScrollAreaHandles, IProps>(({ style, className, children, onBottom }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPc = useMediaQuery('(min-width: 768px)');
  let debounceBottom
  if (onBottom) {
    debounceBottom = _.debounce(onBottom!, 500, { leading: true, trailing: false });
  }

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
    },
  }));

  const handleScroll = (e) => {
    const target = e.target;
    const bottom = (target.scrollHeight - target.scrollTop) <= target.clientHeight + 100;
    if (bottom) {
      debounceBottom?.();
    }
  };

  useEffect(() => {
    const divElement = scrollRef.current;
    divElement!.addEventListener("scroll", handleScroll);
    return () => {
      divElement!.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      style={style}
      className={`${className} overflow-y-scroll overflow-x-hidden  ${isPc ? '' : 'scrollbar-hide'} scroll-smooth`}
    >
      {children}
    </div>
  );
}))