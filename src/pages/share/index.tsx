import { observer } from "mobx-react-lite";
import Hub from "../hub";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { Icon } from "@iconify/react";
import { useEffect } from "react";
import Avatar from "boring-avatars";
import { GradientBackground } from "@/components/Common/GradientBackground";

const Share = observer(() => {
  useEffect(() => {

  }, [])

  return <div className="flex flex-col h-[100vh] w-full bg-sencondbackground" >
    <Hub />
  </div>
});

export default Share