import { configure } from "mobx";
import { RootStore } from "./root";

export const rootStore = RootStore.init();
configure({
  enforceActions: 'never' 
});
export { RootStore };
