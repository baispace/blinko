import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isInTauri } from '@/lib/tauriHelper';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';

export const useQuickaiHotkey = () => {
  const navigate = useNavigate();
  const aiStore = RootStore.Get(AiStore);

  useEffect(() => {
    if (!isInTauri()) return;

    let unlistenQuickai: any;
    let unlistenNavigation: any;
    let isProcessing = false; // Prevent duplicate processing

    const setupEventListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // Listen for quick AI events (legacy support)
        unlistenQuickai = await listen('quickai-triggered', () => {
          try {
            // Navigate to AI page to continue the conversation
            navigate('/ai');
            console.log('Quick AI triggered - navigating to AI page');
          } catch (error) {
            console.error('Error handling quickai event:', error);
          }
        });

        // Listen for navigation events from quickai window with prompt
        unlistenNavigation = await listen<string>('navigate-to-ai-with-prompt', async (event) => {
          const prompt = event.payload;
          console.log('Received navigation event with prompt:', prompt);
          
          // Prevent duplicate processing
          if (isProcessing) {
            console.log('Already processing, ignoring duplicate event');
            return;
          }
          
          isProcessing = true;
          
          try {
            // Start AI chat with the prompt
            await aiStore.newChatWithSuggestion(prompt);
            
            // Navigate to AI page
            navigate('/ai');
          } catch (error) {
            console.error('Failed to process AI navigation:', error);
          } finally {
            // Reset processing flag after a short delay
            setTimeout(() => {
              isProcessing = false;
            }, 1000);
          }
        });

      } catch (error) {
        console.error('Failed to setup Tauri event listeners:', error);
      }
    };

    setupEventListeners();

    // Cleanup function
    return () => {
      if (unlistenQuickai) {
        unlistenQuickai().catch(console.error);
      }
      if (unlistenNavigation) {
        unlistenNavigation().catch(console.error);
      }
    };
  }, [navigate, aiStore]);
};