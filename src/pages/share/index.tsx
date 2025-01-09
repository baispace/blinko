import { observer } from "mobx-react-lite";
import Hub from "../hub";
import { ScrollArea } from "@/components/Common/ScrollArea";

const Share = observer(() => {
  return <ScrollArea className="flex flex-col h-[100vh] w-full bg-sencondbackground" onBottom={() => {}}>
    <Hub />
  </ScrollArea>
});

export default Share