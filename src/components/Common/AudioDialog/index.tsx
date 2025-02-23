import { RootStore } from "@/store"
import { DialogStore } from "@/store/module/Dialog"
import { observer } from "mobx-react-lite"
import { useCallback, useRef, useState, Suspense } from "react"
import useAudioRecorder from "../AudioRecorder/hook"
import { LiveAudioVisualizer } from "react-audio-visualize"
import { Icon } from "@iconify/react"
import { Button } from "@heroui/react"
import { SendIcon } from "../Icons"
import { DialogStandaloneStore } from "@/store/module/DialogStandalone"

interface MyAudioRecorderProps {
  onComplete?: (file: File) => void;
}

export const MyAudioRecorder = ({ onComplete }: MyAudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [lastRecordingBlob, setLastRecordingBlob] = useState<Blob | null>(null);

  const {
    startRecording,
    stopRecording,
    recordingBlob,
    mediaRecorder,
  } = useAudioRecorder();

  const handleMouseDown = useCallback(() => {
    const timer = setTimeout(() => {
      setIsRecording(true);
      startRecording();
    }, 500);
    setPressTimer(timer);
  }, [startRecording]);

  const handleMouseUp = useCallback(() => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }

    if (isRecording) {
      setIsRecording(false);
      stopRecording();
    }
  }, [pressTimer, isRecording, stopRecording]);

  const handleComplete = useCallback(() => {
    if (recordingBlob) {
      const isMP4 = recordingBlob.type === 'audio/mp4';
      const extension = isMP4 ? 'mp4' : 'webm';
      const mimeType = isMP4 ? 'audio/mp4' : 'audio/webm';
      const file = new File([recordingBlob], `audio_${Date.now()}.${extension}`, {
        type: mimeType
      });
      onComplete?.(file);
    }
  }, [recordingBlob, onComplete]);

  return (
    <div className="relative w-full h-screen flex flex-col items-center overflow-hidden">
      <div className="w-full h-full flex items-center justify-center">
        {isRecording && mediaRecorder && (
          <Suspense fallback={<div className="text-white">Loading...</div>}>
            <LiveAudioVisualizer
              mediaRecorder={mediaRecorder}
              width={300}
              height={150}
              barWidth={2}
              gap={1}
              barColor="#7A1CAC"
              fftSize={2048}
              maxDecibels={0}
              minDecibels={-90}
              smoothingTimeConstant={0.8}
            />
          </Suspense>
        )}
      </div>

      <div className="fixed bottom-10 left-0 right-0 flex justify-center items-center gap-5">
        <Button
          isIconOnly
          className="absolute left-10 backdrop-blur-sm rounded-full"
          onPress={() => RootStore.Get(DialogStandaloneStore).close()}
        >
          <Icon icon="iconamoon:close-thin" width="24" height="24" />
        </Button>

        {recordingBlob && !isRecording && (
          <Button isIconOnly onPress={handleComplete} radius='lg' className={`absolute right-10 group w-fit`} color='primary' >
            <Icon icon="mynaui:upload" width="24" height="24" />
          </Button>
        )}

        <div className="relative select-none">
          <div className={`absolute inset-0 -m-2 rounded-full bg-white/20 backdrop-blur-sm ${isRecording ? "animate-ping" : ""
            }`}></div>
          <button
            className={`w-16 h-16 rounded-full border-4 ${isRecording
              ? "border-red-500 bg-red-500 animate-pulse scale-110 transition-transform duration-1000"
              : "border-white bg-white"
              } flex items-center justify-center transition-colors duration-200 relative z-10`}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchEnd={handleMouseUp}
          >
            <span className={`${isRecording ? "text-white" : "text-black"
              } text-sm select-none`}>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const ShowAudioDialog = ((onComplete: (file: File) => void) => {
  return RootStore.Get(DialogStandaloneStore).setData({
    size: 'full',
    isOpen: true,
    transparent: true,
    content: <MyAudioRecorder onComplete={(file) => {
      onComplete(file)
      RootStore.Get(DialogStandaloneStore).close();
    }} />
  })
})
