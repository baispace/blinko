import React from "react";
import Provider from "./Provider";
import { ModalSlots, SlotsToClasses } from "@heroui/react";
import { Store } from "@/store/standard/base";
import { RootStore } from "@/store/root";
import { makeAutoObservable } from "mobx";
import { resolvePresentation } from "./presentation";

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
      // 关闭状态下还要清掉内容与标题，避免重开时闪现上一次的残影
      Object.assign(this, { title: "", content: "" });
    }
    // 未显式指定的表现层字段一律回到默认值（嵌套弹窗继承外层标志的根因）；
    // 调用点显式传了的以调用点为准
    Object.assign(this, resolvePresentation(v));
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
