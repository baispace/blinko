import React, { useState, useEffect, ReactElement, Suspense } from "react";
import useAudioRecorder from "./hook";
import "./index.css";
import { Props } from "./interfaces";
import { RecordIcon, StopIcon } from "../Icons";

const LiveAudioVisualizer = React.lazy(async () => {
  const { LiveAudioVisualizer } = await import("react-audio-visualize");
  return { default: LiveAudioVisualizer };
});

/**
 * Usage: https://github.com/samhirtarif/react-audio-recorder#audiorecorder-component
 *
 *
 * @prop `onRecordingComplete` Method that gets called when save recording option is clicked
 * @prop `recorderControls` Externally initilize hook and pass the returned object to this param, this gives your control over the component from outside the component.
 * https://github.com/samhirtarif/react-audio-recorder#combine-the-useaudiorecorder-hook-and-the-audiorecorder-component
 * @prop `audioTrackConstraints`: Takes a {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings#instance_properties_of_audio_tracks subset} of `MediaTrackConstraints` that apply to the audio track
 * @prop `onNotAllowedOrFound`: A method that gets called when the getUserMedia promise is rejected. It receives the DOMException as its input.
 * @prop `downloadOnSavePress` If set to `true` the file gets downloaded when save recording is pressed. Defaults to `false`
 * @prop `downloadFileExtension` File extension for the audio filed that gets downloaded. Defaults to `mp3`. Allowed values are `mp3`, `wav` and `webm`
 * @prop `showVisualizer` Displays a waveform visualization for the audio when set to `true`. Defaults to `false`
 * @prop `classes` Is an object with attributes representing classes for different parts of the component
 */
const AudioRecorder: (props: Props) => ReactElement = ({
  onRecordingComplete,
  onNotAllowedOrFound,
  recorderControls,
  audioTrackConstraints,
  downloadOnSavePress = false,
  downloadFileExtension = "mp3",
  showVisualizer = false,
  mediaRecorderOptions,
  classes,
}: Props) => {
  const {
    startRecording,
    stopRecording,
    togglePauseResume,
    recordingBlob,
    isRecording,
    isPaused,
    recordingTime,
    mediaRecorder,
  } =
    recorderControls ??
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAudioRecorder(
      audioTrackConstraints,
      onNotAllowedOrFound,
      mediaRecorderOptions
    );

  const [shouldSave, setShouldSave] = useState(false);

  const stopAudioRecorder: (save?: boolean) => void = (
    save: boolean = true
  ) => {
    setShouldSave(save);
    stopRecording();
  };

  useEffect(() => {
    if (
      (shouldSave || recorderControls) &&
      recordingBlob != null &&
      onRecordingComplete != null
    ) {
      onRecordingComplete(recordingBlob);
      if (downloadOnSavePress) {
      }
    }
  }, [recordingBlob]);

  return (
    <div
      className={`audio-recorder ${isRecording ? "recording" : ""} ${classes?.AudioRecorderClass ?? ""
        }`}
      data-testid="audio_recorder"
    >

      {
        isRecording ?
          <div onClick={() => stopAudioRecorder()}><StopIcon data-testid="ar_mic" /> </div>
          :
          <div onClick={e => {
            startRecording()
          }} >
            <RecordIcon data-testid="ar_mic" />
          </div>
      }
      {/* <span
        className={` ${!isRecording ? "display-none" : ""
          } ${classes?.AudioRecorderTimerClass ?? ""}`}
        data-testid="ar_timer"
      >
        {Math.floor(recordingTime / 60)}:
        {String(recordingTime % 60).padStart(2, "0")}
      </span> */}
      {showVisualizer ? (
        <span
          className={`ml-1 ${!isRecording ? "display-none" : ""
            }`}
        >
          {mediaRecorder && (
            <Suspense fallback={<></>}>
              <LiveAudioVisualizer
                mediaRecorder={mediaRecorder}
                barWidth={2}
                gap={2}
                width={50}
                height={20}
                fftSize={512}
                maxDecibels={-10}
                minDecibels={-80}
                smoothingTimeConstant={0.4}
                barColor="#EAB30A"
              />
            </Suspense>
          )}
        </span>
      ) : (
        <span
          className={`audio-recorder-status ${!isRecording ? "display-none" : ""
            } ${classes?.AudioRecorderStatusClass ?? ""}`}
        >
          <span className="audio-recorder-status-dot"></span>
          Recording
        </span>
      )}
    </div>
  );
};

export default AudioRecorder;