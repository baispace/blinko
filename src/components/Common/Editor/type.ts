import { PromiseState } from "@/store/standard/PromiseState";

export type OnSendContentType = {
  content: string;
  files: (FileType & { uploadPath: string })[]
  references: number[]
}

export type FileType = {
  name: string
  size: number
  previewType: 'image' | 'audio' | 'video' | 'other'
  extension: string
  preview: any
  uploadPromise: PromiseState<any>
  type: string // audio/webm
}
