import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrandLoading } from '@/components/Common/Brand/BrandLoading';

/**
 * Page level loading.
 *
 * The brand animation is only shown when the wait is real: a short request
 * never flashes a full screen animation, and as soon as the content is ready
 * the overlay disappears instead of holding on for a minimum display time.
 *
 * When the block turns out to be a failure (config never arrives, server down)
 * the caller switches to the error state with a retry button, so the brand
 * animation never spins forever.
 */
export const LoadingPage = ({
  state = 'loading',
  errorMessage,
  onRetry,
}: {
  state?: 'loading' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
} = {}) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <BrandLoading size={96} state={state} errorMessage={errorMessage} onRetry={onRetry} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
