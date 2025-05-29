import i18n from "@/lib/i18n";
import { _ } from "@/lib/lodash";
import { observer } from "mobx-react-lite";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";

type IProps = {
  style?: any;
  className?: any;
  onBottom: () => void;
  onRefresh?: () => Promise<any>;
  children: any;
  pullDownThreshold?: number;
  maxPullDownDistance?: number;
};

export type ScrollAreaHandles = {
  scrollToBottom: () => void;
}

export const ScrollArea = observer(forwardRef<ScrollAreaHandles, IProps>(({ 
  style, 
  className, 
  children, 
  onBottom,
  onRefresh,
  pullDownThreshold = 60,
  maxPullDownDistance = 100
}, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPc = useMediaQuery('(min-width: 768px)');
  
  // Pull to refresh states
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Touch tracking
  const startYRef = useRef(0);
  const canPullRef = useRef(true); // Initialize as true for initial state
  
  let debounceBottom;
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
    
    // Update can pull state
    canPullRef.current = target.scrollTop === 0;
  };

  const handleTouchStart = (e: TouchEvent | MouseEvent) => {
    if (!onRefresh || isRefreshing) return;
    
    // Check if at top position
    const scrollElement = scrollRef.current;
    if (scrollElement && scrollElement.scrollTop > 0) return;
    
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent | MouseEvent) => {
    if (!isDragging || !onRefresh || isRefreshing) return;
    
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startYRef.current;
    
    if (deltaY > 0) {
      e.preventDefault();
      const distance = Math.min(deltaY * 0.5, maxPullDownDistance);
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = async () => {
    if (!isDragging || !onRefresh) return;
    
    setIsDragging(false);
    
    if (pullDistance >= pullDownThreshold) {
      setIsRefreshing(true);
      
      try {
        console.log('onRefresh');
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  useEffect(() => {
    const divElement = scrollRef.current;
    if (!divElement) return;
    
    // Initialize canPull state
    canPullRef.current = divElement.scrollTop === 0;
    
    divElement.addEventListener("scroll", handleScroll);
    
    // Add pull-to-refresh listeners only if onRefresh exists
    if (onRefresh) {
      divElement.addEventListener('touchstart', handleTouchStart, { passive: false });
      divElement.addEventListener('touchmove', handleTouchMove, { passive: false });
      divElement.addEventListener('touchend', handleTouchEnd, { passive: true });
      divElement.addEventListener('mousedown', handleTouchStart);
      divElement.addEventListener('mousemove', handleTouchMove);
      divElement.addEventListener('mouseup', handleTouchEnd);
      divElement.addEventListener('mouseleave', handleTouchEnd);
    }
    
    return () => {
      divElement.removeEventListener("scroll", handleScroll);
      if (onRefresh) {
        divElement.removeEventListener('touchstart', handleTouchStart);
        divElement.removeEventListener('touchmove', handleTouchMove);
        divElement.removeEventListener('touchend', handleTouchEnd);
        divElement.removeEventListener('mousedown', handleTouchStart);
        divElement.removeEventListener('mousemove', handleTouchMove);
        divElement.removeEventListener('mouseup', handleTouchEnd);
        divElement.removeEventListener('mouseleave', handleTouchEnd);
      }
    };
  }, [onRefresh, isRefreshing, isDragging, pullDistance, pullDownThreshold]);

  const showRefreshIndicator = onRefresh && (pullDistance > 0 || isRefreshing);
  const refreshText = isRefreshing ? i18n.t('common.refreshing') : pullDistance >= pullDownThreshold ? i18n.t('common.releaseToRefresh') : i18n.t('common.pullToRefresh');

  return (
    <div
      ref={scrollRef}
      style={{
        ...style,
        paddingTop: showRefreshIndicator ? `${Math.max(pullDistance, isRefreshing ? pullDownThreshold : 0)}px` : undefined,
        transition: isDragging ? 'none' : 'padding-top 0.3s ease-out'
      }}
      className={`${className} overflow-y-scroll overflow-x-hidden ${isPc ? '' : 'scrollbar-hide'} scroll-smooth`}
    >
      {/* Pull to refresh indicator */}
      {showRefreshIndicator && (
        <div 
          className="flex items-center justify-center text-gray-600 bg-gray-50"
          style={{
            height: `${Math.max(pullDistance, isRefreshing ? pullDownThreshold : 0)}px`,
            marginTop: `-${Math.max(pullDistance, isRefreshing ? pullDownThreshold : 0)}px`,
            opacity: isRefreshing ? 1 : Math.min(pullDistance / pullDownThreshold, 1)
          }}
        >
          <div className="flex items-center gap-2">
            {isRefreshing && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            )}
            <span className="text-sm">{refreshText}</span>
          </div>
        </div>
      )}
      
      {children}
    </div>
  );
}))