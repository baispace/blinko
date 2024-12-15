import { RootStore } from '@/store';
import { PromiseState } from '@/store/standard/PromiseState';
import { helper } from '@/lib/helper';
import { FileType, OnSendContentType } from './type';
import { BlinkoStore } from '@/store/blinkoStore';
import { eventBus } from '@/lib/event';
import { _ } from '@/lib/lodash';
import { api } from '@/lib/trpc';
import { IsTagSelectVisible, showTagSelectPop } from '../PopoverFloat/tagSelectPop';
import { showAiWriteSuggestions } from '../PopoverFloat/aiWritePop';
import { AiStore } from '@/store/aiStore';
import { getEditorElements, ViewMode } from './editorUtils';
import { makeAutoObservable } from 'mobx';
import Vditor from 'vditor';

export class EditorStore {
  files: FileType[] = []
  lastRange: Range | null = null
  lastRangeText: string = ''
  viewMode: "wysiwyg" | "sv" | "ir" = "wysiwyg"
  lastSelection: Selection | null = null
  vditor: Vditor | null = null
  onChange: ((markdown: string) => void) | null = null
  mode: 'edit' | 'create' = 'edit'
  references: number[] = []
  isShowSearch: boolean = false
  onSend: (args: OnSendContentType) => Promise<any>

  get canSend() {
    return this.files?.every(i => !i?.uploadPromise?.loading?.value) && (this.files?.length != 0 || this.vditor?.getValue() != '')
  }

  get blinko() {
    return RootStore.Get(BlinkoStore)
  }

  handleIOSFocus() {
    try {
      if (helper.env.isIOS() && this.mode == 'edit') {
        this.focus()
      }
    } catch (error) { }
  }


  replaceMarkdownTag = (text: string, forceFocus = false) => {
    if (this.vditor) {
      if (this.lastRange) {
        const currentTextBeforeRange = this.lastRangeText ?? ''
        const currentText = this.vditor?.getValue().replace(/\\/g, '')
        const tag = currentTextBeforeRange.replace(helper.regex.isEndsWithHashTag, "#" + text + ' ')
        const MyContent = currentText?.replace(currentTextBeforeRange, tag)
        this.vditor?.setValue(MyContent ?? '')
        this.focus('end')
      }
    }
  }

  insertMarkdown = (text) => {
    this.vditor?.insertValue(text)
    this.focus()
  }

  focus = (position: 'last' | 'end' = 'end') => {
    const editorElements = getEditorElements()
    if (editorElements.length > 0) {
      editorElements.forEach(editorElement => {
        requestAnimationFrame(() => {
          const range = document.createRange()
          const selection = window.getSelection()

          if (position === 'last' && this.lastRange) {
            selection?.removeAllRanges()
            selection?.addRange(this.lastRange)
            editorElement.focus()
            return
          }

          const walker = document.createTreeWalker(
            editorElement,
            NodeFilter.SHOW_TEXT,
            null
          )
          let lastNode: any = null
          while (walker.nextNode()) {
            lastNode = walker.currentNode
          }
          if (lastNode) {
            range.setStart(lastNode, lastNode?.length)
            range.setEnd(lastNode, lastNode?.length)
            selection?.removeAllRanges()
            selection?.addRange(range)
            editorElement.focus()
          }
        })
      })
    }
  }

  clearMarkdown = () => {
    this.vditor?.setValue('')
    this.onChange?.('')
    this.focus()
  }

  inertHash = () => {
    if (!this.vditor) return
    this.vditor?.insertValue("#")
    this.focus()
    this.handlePopTag()
  }

  speechToText = async (filePath) => {
    if (!this.blinko.showAi) {
      return
    }
    if (filePath.endsWith('.webm') || filePath.endsWith('.mp3') || filePath.endsWith('.wav')) {
      try {
        const doc = await api.ai.speechToText.mutate({ filePath })
        this.insertMarkdown(doc[0]?.pageContent)
      } catch (error) { }
    }
  }

  uploadFiles = (acceptedFiles) => {
    const _acceptedFiles = acceptedFiles.map(file => {
      const extension = helper.getFileExtension(file.name)
      const previewType = helper.getFileType(file.type, file.name)
      return {
        name: file.name,
        size: file.size,
        previewType,
        extension: extension ?? '',
        preview: URL.createObjectURL(file),
        uploadPromise: new PromiseState({
          function: async () => {
            const formData = new FormData();
            formData.append('file', file)
            const response = await fetch('/api/file/upload', {
              method: 'POST',
              body: formData,
            });
            const data = await response.json();
            this.speechToText(data.filePath)
            if (data.filePath) {
              return data.filePath
            }
          }
        }),
        type: file.type
      }
    })
    this.files.push(..._acceptedFiles)
    Promise.all(_acceptedFiles.map(i => i.uploadPromise.call()))
  }

  handlePopTag = () => {
    const selection = window.getSelection();
    if (selection!.rangeCount > 0) {
      let lastRange = selection!.getRangeAt(0);
      this.lastRange = lastRange
      this.lastRangeText = lastRange.endContainer.textContent?.slice(0, lastRange.endOffset) ?? ''
      this.lastSelection = selection
      const hasHashTagRegex = /#[^\s#]+/g
      const endsWithBankRegex = /\s$/g
      const currentText = this.lastRange?.startContainer.textContent?.slice(0, this.lastRange?.endOffset) ?? ''
      const isEndsWithBank = endsWithBankRegex.test(currentText)
      const isEndsWithHashTag = helper.regex.isEndsWithHashTag.test(currentText)
      if (currentText == '' || !isEndsWithHashTag) {
        setTimeout(() => eventBus.emit('tagselect:hidden'))
        return
      }
      if (isEndsWithHashTag && currentText != '' && !isEndsWithBank) {
        const match = currentText.match(hasHashTagRegex)
        let searchText = match?.[match?.length - 1] ?? ''
        if (currentText.endsWith("#")) {
          searchText = ''
        }
        showTagSelectPop(searchText.toLowerCase())
      }
    }
  }

  handlePopAiWrite = () => {
    if (!this.blinko.showAi) {
      return
    }
    const selection = window.getSelection();
    if (selection!.rangeCount > 0) {
      const lastRange = selection!.getRangeAt(0);
      const currentText = lastRange.startContainer.textContent?.slice(0, lastRange.endOffset) ?? '';
      const isEndsWithSlash = /[^\s]?\/$/.test(currentText);
      if (currentText === '' || !isEndsWithSlash) {
        setTimeout(() => eventBus.emit('aiwrite:hidden'));
        return;
      }
      if (isEndsWithSlash) {
        showAiWriteSuggestions();
      }
    }
  }

  deleteLastChar = () => {
    const v = this.vditor?.getValue()
    this.vditor?.setValue(v?.slice(0, -1) ?? '')
    this.focus()
  }

  // ************************************* reference logic  start ************************************************************************************
  get currentReferences() {
    return this.noteListByIds.value?.slice()?.sort((a, b) => this.references.indexOf(a.id) - this.references.indexOf(b.id))
  }

  noteListByIds = new PromiseState({
    function: async ({ ids }) => {
      return await api.notes.listByIds.mutate({ ids })
    }
  })

  deleteReference = (id: number) => {
    this.references = this.references.filter(i => i != id)
  }

  addReference = (id: number) => {
    if (!this.references.includes(id)) {
      console.log('addReference', id)
      this.references.push(id)
      this.noteListByIds.call({ ids: this.references })
      console.log('addReference', this.references)
    }
  }

  setIsShowSearch = (show: boolean) => {
    this.isShowSearch = show
  }


  private throttleSearch = _.throttle((searchText: string) => {
    const blinko = RootStore.Get(BlinkoStore);
    blinko.referenceSearchList.resetAndCall({ searchText });
  }, 500, { trailing: true, leading: false });

  handleSearch = (searchText: string) => {
    this.throttleSearch(searchText);
  }
  // ************************************* reference logic  end ************************************************************************************

  handleSend = async () => {
    if (!this.canSend) return;
    console.log('handleSend', this.vditor?.getValue())
    try {
      await this.onSend?.({
        content: this.vditor?.getValue() ?? '',
        files: this.files.map(i => ({ ...i, uploadPath: i.uploadPromise.value })),
        references: this.references
      });
      this.clearEditor();
      RootStore.Get(AiStore).isWriting = false;
    } catch (error) {
      console.error('Failed to send content:', error);
    }
  }

  clearEditor = () => {
    this.vditor?.setValue('')
    this.files = [];
    this.references = []
    this.noteListByIds.value = []
    // eventBus.emit('editor:setViewMode', 'rich-text');
  }

  constructor() {
    makeAutoObservable(this)
  }

  init = (args: Partial<EditorStore>) => {
    Object.assign(this, args)
  }

  isShowEditorToolbar(isPc: boolean) {
    const blinko = RootStore.Get(BlinkoStore)
    let showToolbar = true
    if (blinko.config.value?.toolbarVisibility) {
      showToolbar = blinko.config.value?.toolbarVisibility == 'always-show-toolbar' ? true : (
        blinko.config.value?.toolbarVisibility == 'hide-toolbar-on-mobile' ?
          (isPc ? true : false)
          : false
      )
    }
    return showToolbar
  }

}