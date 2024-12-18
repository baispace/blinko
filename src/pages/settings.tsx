import { observer } from "mobx-react-lite";
import { BasicSetting } from "@/components/BlinkoSettings/BasicSetting";
import { AiSetting } from "@/components/BlinkoSettings/AiSetting";
import { PerferSetting } from "@/components/BlinkoSettings/PerferSetting";
import { TaskSetting } from "@/components/BlinkoSettings/TaskSetting";
import { ImportSetting } from "@/components/BlinkoSettings/ImportSetting";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { UserStore } from "@/store/user";
import { RootStore } from "@/store";
import { UserSetting } from "@/components/BlinkoSettings/UserSetting";
import { AboutSetting } from "@/components/BlinkoSettings/AboutSetting";
import { StorageSetting } from "@/components/BlinkoSettings/StorageSetting";
import { ExportSetting } from "@/components/BlinkoSettings/ExportSetting";
import { MusicSetting } from "@/components/BlinkoSettings/MusicSetting";

const Page = observer(() => {
  const user = RootStore.Get(UserStore)
  return <div className="h-mobile-full">
    <ScrollArea onBottom={() => { }} className="px-2 md:px-6 pt-2 pb-6">
      <div className="max-w-screen-lg mx-auto flex flex-col gap-8">
        <BasicSetting />
        <PerferSetting />
        {user.isSuperAdmin && <UserSetting />}
        {user.isSuperAdmin && <AiSetting />}
        {user.isSuperAdmin && <TaskSetting />}
        {user.isSuperAdmin && <StorageSetting />}
        {user.isSuperAdmin && <MusicSetting />}
        {user.isSuperAdmin && <ImportSetting />}
        {<ExportSetting />}
        <AboutSetting />
      </div>
    </ScrollArea >
  </div>
});

export default Page