import { Plugin } from "obsidian";
import { ColaView, VIEW_TYPE_COLA } from "./ColaView";
import { ColaGateway } from "./ColaGateway";

export default class ColaPlugin extends Plugin {
  gateway!: ColaGateway;

  async onload() {
    this.gateway = new ColaGateway(this);

    // Register the sidebar view
    this.registerView(VIEW_TYPE_COLA, (leaf) => new ColaView(leaf, this));

    // Add ribbon icon
    this.addRibbonIcon("message-circle", "Open Cola", () => {
      this.activateView();
    });

    // Add command
    this.addCommand({
      id: "open-cola-chat",
      name: "Open Cola Chat",
      callback: () => this.activateView(),
    });

    // Connect to Cola
    this.gateway.connect();
  }

  async onunload() {
    this.gateway.disconnect();
  }

  async activateView() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_COLA);

    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      const leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_COLA, active: true });
        workspace.revealLeaf(leaf);
      }
    }
  }
}
