import '@/styles/editor.css';
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


export class EditorStore {
  files: FileType[] = []
  lastRange: Range | null = null
  lastRangeText: string = ''
  viewMode: ViewMode = "rich-text"
  lastSelection: Selection | null = null
  mdxEditorRef: any | null = null
  onChange: ((markdown: string) => void) | null = null
  mode: 'edit' | 'create' = 'edit'
  references: number[] = []
  isShowSearch: boolean = false
  onSend: ((args: OnSendContentType) => Promise<any>) | null = null

  get canSend() {
    return this.files?.every(i => !i?.uploadPromise?.loading?.value) && (this.files?.length != 0 || this.mdxEditorRef?.current?.getMarkdown() != '')
  }

  get blinko() {
    return RootStore.Get(BlinkoStore)
  }

  handleIOSFocus() {
    try {
      if (helper.env.isIOS() && this.mode == 'edit') {
        this.focus(true)
      }
    } catch (error) { }
  }

  replaceMarkdownTag = (text: string, forceFocus = false) => {
    console.log('replaceMarkdownTag', this.mdxEditorRef)
    if (this.mdxEditorRef?.current) {
      if (this.lastRange) {
        console.log('replaceMarkdownTag', JSON.parse(JSON.stringify(this.lastRange)))
        const currentTextBeforeRange = this.lastRangeText.replace(/&#x20;/g, " ") ?? ''
        console.log('currentTextBeforeRange', currentTextBeforeRange)
        const currentText = this.mdxEditorRef?.current!.getMarkdown().replace(/\\/g, '').replace(/&#x20;/g, " ")
        console.log('currentText', currentText)
        const tag = currentTextBeforeRange.replace(helper.regex.isEndsWithHashTag, "#" + text + '&#x20;')
        const MyContent = currentText.replace(currentTextBeforeRange, tag)
        this.mdxEditorRef?.current.setMarkdown(MyContent)
        this.focus(forceFocus)
      }
    }
  }

  insertMarkdown = (text) => {
    const Mycontent = this.mdxEditorRef?.current!.getMarkdown()
    this.mdxEditorRef?.current!.setMarkdown(Mycontent + text)
    this.mdxEditorRef?.current!.focus(() => {
      this.onChange?.(Mycontent + text)
    }, {
      defaultSelection: 'rootEnd'
    })
  }

  insertMarkdownByEvent = (text) => {
    this.mdxEditorRef?.current!.insertMarkdown(text)
    this.focus()
  }

  focus = (force = false) => {
    if (force && this.lastRange) {
      const editorElements = getEditorElements()
      if (editorElements.length > 0) {
        editorElements.forEach(editorElement => {
          requestAnimationFrame(() => {
            const range = document.createRange()
            const selection = window.getSelection()
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
      this.onChange?.(this.mdxEditorRef?.current!.getMarkdown())
    } else {
      this.mdxEditorRef?.current!.focus(() => {
        this.onChange?.(this.mdxEditorRef?.current!.getMarkdown())
      }, {
        defaultSelection: 'rootEnd'
      })
    }
  }

  clearMarkdown = () => {
    if (this.mdxEditorRef?.current) {
      this.mdxEditorRef?.current.setMarkdown("")
      this.focus()
    }
  }

  inertHash = () => {
    this.mdxEditorRef?.current!.insertMarkdown("&#x20;#")
    this.mdxEditorRef?.current!.focus()
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
      // if (!IsTagSelectVisible()) {
      let lastRange = selection!.getRangeAt(0);
      this.lastRange = lastRange
      this.lastRangeText = lastRange.endContainer.textContent?.slice(0, lastRange.endOffset) ?? ''
      // console.log('this.lastRangeText', this.lastRangeText)
      this.lastSelection = selection
      // }
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
    const content = this.mdxEditorRef?.current!.getMarkdown()
    this.mdxEditorRef?.current!.setMarkdown(content.slice(0, -1))
  }

  setMarkdownLoading = (loading: boolean) => {
    if (loading) {
      this.mdxEditorRef?.current!.insertMarkdown("Thinking...")
      this.focus()
    } else {
      const content = this.mdxEditorRef?.current!.getMarkdown()
      const newContent = content.replace(/Thinking.../g, '')
      this.mdxEditorRef?.current!.setMarkdown(newContent)
      this.focus()
    }
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
    console.log('handleSend', this.references)
    if (!this.canSend) return;
    try {
      await this.onSend?.({
        content: this.mdxEditorRef?.current?.getMarkdown() ?? '',
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
    this.mdxEditorRef?.current?.setMarkdown('')
    this.onChange?.('');
    this.files = [];
    this.references = []
    this.noteListByIds.value = []
    eventBus.emit('editor:setViewMode', 'rich-text');
  }

  constructor() {
    makeAutoObservable(this)
  }

  init = (args: Partial<EditorStore>) => {
    Object.assign(this, args)
  }

}