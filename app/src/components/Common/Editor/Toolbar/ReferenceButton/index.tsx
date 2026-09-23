import { observer } from 'mobx-react-lite'
import { BlinkoStore } from '@/store/blinkoStore'
import { RootStore } from '@/store'
import { EditorStore } from '../../editorStore'
import { useEffect } from 'react'
import { BlinkoSelectNote } from '@/components/Common/BlinkoSelectNote'

interface Props {
  store: EditorStore
  iconButton?: React.ReactNode
}

export const ReferenceButton = observer(({ store, iconButton }: Props) => {
  const blinko = RootStore.Get(BlinkoStore)
  useEffect(() => {
    blinko.referenceSearchList.resetAndCall({ searchText: ' ' })
  }, [])
  return (
    <BlinkoSelectNote
      iconButton={iconButton}
      onSelect={(item) => {
        if (store.references?.includes(item.id)) return;
        store.addReference(item.id);
      }}
      blackList={store.references}
    />
  )
}) 