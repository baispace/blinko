import React from "react";
import Provider from "./Provider";
import { ModalSlots, SlotsToClasses } from "@heroui/react";
import { Store } from "@/store/standard/base";
import { RootStore } from "@/store/root";
import { makeAutoObservable } from "mobx";

export class DialogStore implements Store {
  sid = "DialogStore";
  provider = () => <Provider />;
  isOpen = false;
  preventClose = false;
  animated = false;
  hideCloseButton = false;
  /** Timestamp of the last close(); used to defer the next setData until the
   *  exit animation (dialogMotion: 0.12s + margin) has finished playing. */
  closedAt = 0;
  placement!: "center" | "auto" | "top" | "bottom" | "top-center" | "bottom-center";
  title = "";
  noPadding = false;
  size: "sm" | "md" | "lg" | "xl" | "2xl" | "full" | "xs" | "3xl" | "4xl" | "5xl" | 'full' = "md";
  onlyContent = false;
  showOnlyContentCloseButton = false;
  className: string = "";
  transparent = false;
  classNames?: SlotsToClasses<ModalSlots>;
  theme = "default";
  content: React.ReactNode | ((props: any) => React.ReactNode) = "";
  isDismissable = true;

  constructor(args?: Partial<DialogStore>) {
    const classNames = {
      ...args?.classNames
    }
    Object.assign(this, args, { classNames });
    makeAutoObservable(this)
  }


  setData(v: Partial<DialogStore>) {
    // Exit animation in progress: applying the reset right now would blank
    // the exiting modal mid-transition (content="" + size="md" width jump),
    // which is the "flash" seen when a button closes one dialog and opens
    // another in the same tick. Defer until the animation finishes.
    if (!this.isOpen && this.closedAt > 0 && Date.now() - this.closedAt < 150 && (v as any).isOpen) {
      const wait = 150 - (Date.now() - this.closedAt);
      setTimeout(() => this.setData(v), wait);
      return;
    }
    if (!this.isOpen) {
      // Reset before opening, never during the closing animation.
      Object.assign(this, { preventClose: false, animated:false, hideCloseButton:false, noPadding: false,
        transparent: false, className: "", classNames: undefined,
        placement: "auto", theme: "default", title: "", content: "",
        size: "md", isDismissable: true, onlyContent: false });
    }
    this.showOnlyContentCloseButton = false
    Object.assign(this, v);
  }

  close() {
    this.closedAt = Date.now();
    this.isOpen = false;
    this.preventClose = false;
    // Keep the rendered snapshot intact until the exit transition completes.
  }

  static show(v: Partial<DialogStore>) {
    const classNames = {
      ...v?.classNames
    }
    RootStore.Get(DialogStore).setData({
      ...v,
      classNames,
      isOpen: true,
    });
  }

  static close() {
    RootStore.Get(DialogStore).close();
  }
}
